package com.brightideas.spotlane

import android.content.Context
import android.content.pm.ApplicationInfo
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * Debug builds only: follows the simulated car from `pnpm car` (scripts/car-bridge.mjs, reached through `adb reverse
 * tcp:5199`). Used on the emulator, where the Pleos vehicle service never reports gear or pedals. While the bridge is
 * connected its events replace the vehicle SDK's, so the two never fight over the UI.
 */
internal class CarBridgeFeed(
    context: Context,
    private val onDriving: (Boolean) -> Unit,
    private val onSignals: (String) -> Unit,
) {
    private val enabled = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    @Volatile private var worker: Thread? = null
    @Volatile private var connection: HttpURLConnection? = null
    @Volatile
    var connected = false
        private set

    fun start() {
        if (!enabled || worker != null) return
        // Assign before starting so the new thread sees itself as the current worker.
        val thread = Thread(::follow, "car-bridge").apply { isDaemon = true }
        worker = thread
        thread.start()
    }

    fun stop() {
        worker?.interrupt()
        worker = null
        connected = false
        // A blocked read only ends when the socket closes.
        connection?.disconnect()
    }

    private fun follow() {
        val self = Thread.currentThread()
        try {
            while (worker === self) {
                runCatching { read(self) }
                connected = false
                // No bridge running is the normal case; check again now and then without busy looping.
                Thread.sleep(RETRY_MS)
            }
        } catch (_: InterruptedException) {
            // stopped
        }
    }

    private fun read(self: Thread) {
        val open = URL(EVENTS).openConnection() as HttpURLConnection
        connection = open
        open.connectTimeout = 2000
        open.readTimeout = 0
        try {
            open.inputStream.bufferedReader().useLines { lines ->
                for (line in lines) {
                    if (worker !== self) return
                    if (!line.startsWith("data:")) continue
                    val event = JSONObject(line.removePrefix("data:").trim())
                    connected = true
                    onDriving(event.optBoolean("driving"))
                    event.optJSONObject("signals")?.let { onSignals(it.toString()) }
                }
            }
        } finally {
            open.disconnect()
        }
    }

    private companion object {
        const val EVENTS = "http://127.0.0.1:5199/events"
        const val RETRY_MS = 3000L
    }
}
