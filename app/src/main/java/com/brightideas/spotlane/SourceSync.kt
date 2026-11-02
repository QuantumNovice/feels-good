package com.brightideas.spotlane

import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.URL
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.HttpsURLConnection

/** Single-flight, foreground-only imports. Validation always precedes snapshot replacement. */
internal class SourceSync(
    private val preferences: SharedPreferences,
    private val report: (success: Boolean, changed: Boolean) -> Unit,
) : AutoCloseable {
    private val worker = Executors.newSingleThreadExecutor()
    private val timer = Handler(Looper.getMainLooper())
    private val fetching = AtomicBoolean(false)
    private val generation = AtomicInteger()
    private val stateLock = Any()
    @Volatile private var foreground = false
    @Volatile private var destroyed = false
    @Volatile private var activeConnection: HttpsURLConnection? = null

    private val refresh =
        object : Runnable {
            override fun run() {
                if (!foreground) return
                val source = preferences.getString("url", "").orEmpty()
                if (source.isNotEmpty()) request(source, false)
                scheduleRefresh()
            }
        }

    fun resume() {
        foreground = true
        scheduleRefresh()
        val source = preferences.getString("url", "").orEmpty()
        if (source.isNotEmpty()) request(source, false)
    }

    private fun scheduleRefresh() {
        timer.removeCallbacks(refresh)
        if (!foreground || destroyed) return
        timer.postDelayed(refresh, RefreshPolicy.nextDelayMs(preferences.getString("checkedAt", ""), Instant.now()))
    }

    fun pause() {
        synchronized(stateLock) {
            foreground = false
            generation.incrementAndGet()
        }
        timer.removeCallbacks(refresh)
        activeConnection?.disconnect()
    }

    override fun close() {
        destroyed = true
        pause()
        worker.shutdownNow()
    }

    fun request(source: String, userInitiated: Boolean): Boolean {
        if (
            !userInitiated &&
                source == preferences.getString("url", "") &&
                !RefreshPolicy.isStale(preferences.getString("checkedAt", ""), Instant.now())
        )
            return false
        if (!foreground || destroyed || !fetching.compareAndSet(false, true)) return false
        val requestGeneration = generation.get()
        return try {
            worker.execute {
                try {
                    fetch(source, userInitiated, requestGeneration)
                } finally {
                    fetching.set(false)
                    timer.post { scheduleRefresh() }
                }
            }
            true
        } catch (_: RejectedExecutionException) {
            fetching.set(false)
            false
        }
    }

    fun clearSource() {
        synchronized(stateLock) {
            generation.incrementAndGet()
            activeConnection?.disconnect()
            preferences
                .edit()
                .remove("dataset")
                .remove("url")
                .remove("synced")
                .remove("checkedAt")
                .remove("etag")
                .remove("modified")
                .apply()
        }
    }

    private fun fetch(source: String, userInitiated: Boolean, requestGeneration: Int) {
        var connection: HttpsURLConnection? = null
        try {
            val normalized = if (source == "osm") "osm" else SourceUrl.normalize(source)
            val url = URL(if (normalized == "osm") OsmSource.url() else normalized)
            require(url.protocol == "https" && url.userInfo == null) { "https_required" }
            connection =
                (url.openConnection() as HttpsURLConnection).apply {
                    connectTimeout = 10_000
                    readTimeout = 30_000
                    instanceFollowRedirects = false
                    setRequestProperty(
                        "Accept",
                        if (url.host == "api.github.com") "application/vnd.github.raw+json" else "application/json",
                    )
                }
            activeConnection = connection
            if (!foreground || destroyed) return
            val sameSource = normalized == preferences.getString("url", "")
            if (sameSource) {
                preferences.getString("etag", "")?.takeIf(String::isNotEmpty)?.let {
                    connection.setRequestProperty("If-None-Match", it)
                }
                preferences.getLong("modified", 0).takeIf { it > 0 }?.let { connection.ifModifiedSince = it }
            }
            when (connection.responseCode) {
                HttpsURLConnection.HTTP_NOT_MODIFIED -> {
                    require(sameSource) { "unexpected_not_modified" }
                    synchronized(stateLock) {
                        if (!foreground || destroyed || generation.get() != requestGeneration) return
                        preferences.edit().putString("checkedAt", Instant.now().toString()).apply()
                    }
                    if (userInitiated) report(true, false)
                    return
                }
                HttpsURLConnection.HTTP_OK -> Unit
                else -> throw IOException("source_http_error")
            }
            val raw = readBody(connection)
            val validated = if (source == "osm") OsmSource.normalize(raw) else Dataset.validate(raw)
            val dataset = validated.toString()
            val changed: Boolean
            synchronized(stateLock) {
                if (!foreground || destroyed || generation.get() != requestGeneration) return
                changed = !sameSource || dataset != preferences.getString("dataset", "")
                val update =
                    preferences
                        .edit()
                        .putString("etag", connection.getHeaderField("ETag"))
                        .putLong("modified", connection.lastModified)
                        .putString("checkedAt", Instant.now().toString())
                if (changed)
                    update
                        .putString("dataset", dataset)
                        .putString("url", normalized)
                        .putString("synced", Instant.now().toString())
                update.apply()
            }
            if (changed || userInitiated) report(true, changed)
        } catch (_: Exception) {
            if (foreground && !destroyed && generation.get() == requestGeneration) report(false, true)
        } finally {
            connection?.disconnect()
            activeConnection = null
        }
    }

    private fun readBody(connection: HttpsURLConnection): String =
        connection.inputStream.use { input ->
            ByteArrayOutputStream().use { output ->
                val buffer = ByteArray(8_192)
                while (true) {
                    val count = input.read(buffer)
                    if (count == -1) break
                    if (output.size() + count > MAX_SOURCE_BYTES) throw IOException("source_too_large")
                    output.write(buffer, 0, count)
                }
                output.toString(Charsets.UTF_8.name())
            }
        }

    companion object {
        private const val MAX_SOURCE_BYTES = 2_000_000
    }
}
