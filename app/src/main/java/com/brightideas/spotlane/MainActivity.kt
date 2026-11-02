package com.brightideas.spotlane

import ai.pleos.playground.navi.constants.RouteOption
import ai.pleos.playground.navi.data.RouteInfo
import ai.pleos.playground.navi.helper.NaviHelper
import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebView
import org.json.JSONObject

/** Activity composition root. Persistence, network, navigation, location and audio have separate owners. */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var preferences: SharedPreferences
    private lateinit var sources: SourceSync
    private lateinit var music: ArrivalMusic
    internal lateinit var drivingState: DrivingState
    private lateinit var vehicleSignals: VehicleSignals
    private lateinit var carBridge: CarBridgeFeed
    private var navigator: NaviHelper? = null
    private var locator: LocationLocator? = null
    private var pendingMusic: JSONObject? = null
    private val timer = Handler(Looper.getMainLooper())
    @Volatile private var destroyed = false
    @Volatile private var foreground = false

    @SuppressLint("SetJavaScriptEnabled") // Only packaged content receives the JavaScript bridge.
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        preferences = getSharedPreferences("spotlane", MODE_PRIVATE)
        sources = SourceSync(preferences, ::report)
        music = ArrivalMusic(this, preferences) { report(false) }
        drivingState =
            DrivingState(this) { moving ->
                if (!carBridge.connected) runOnUiThread { evaluate("window.spotlaneDriving?.($moving)") }
            }
        vehicleSignals =
            VehicleSignals(this) { json ->
                if (!carBridge.connected) runOnUiThread { evaluate("window.spotlaneVehicle?.($json)") }
            }
        carBridge =
            CarBridgeFeed(
                this,
                onDriving = { moving -> runOnUiThread { evaluate("window.spotlaneDriving?.($moving)") } },
                onSignals = { json -> runOnUiThread { evaluate("window.spotlaneVehicle?.($json)") } },
            )
        web =
            WebView(this).apply {
                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    useWideViewPort = true
                    loadWithOverviewMode = true
                    allowFileAccess = false
                    allowContentAccess = false
                    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                }
                addJavascriptInterface(NativeBridge(this@MainActivity, preferences), "Spotlane")
                webViewClient = PackagedWebViewClient(assets)
            }
        setContentView(web)
        web.loadUrl(PackagedWebViewClient.START_URL)
    }

    internal fun requestFetch(source: String, userInitiated: Boolean): Boolean = sources.request(source, userInitiated)

    internal fun resetSource() {
        sources.clearSource()
        report(true)
    }

    internal fun navigate(place: JSONObject, pleos: Boolean) {
        runCatching {
            if (!pleos) {
                startActivity(NavigationApps.intent(place, "geo"))
                return
            }
            val helper =
                navigator
                    ?: NaviHelper(this).also {
                        it.initialize()
                        navigator = it
                    }
            helper.requestRoute(
                RouteInfo(
                    place.getDouble("latitude"),
                    place.getDouble("longitude"),
                    null,
                    null,
                    place.getString("name"),
                    "",
                    place.optString("address"),
                    "0",
                    RouteOption.RECOMMENDED,
                    "",
                    false,
                )
            )
        }
            .onFailure { report(false) }
    }

    internal fun openNavigationApp(payload: JSONObject) {
        runCatching { startActivity(NavigationApps.selected(this, payload)) }.onFailure { report(false) }
    }

    internal fun share(text: String) {
        runCatching {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
            startActivity(Intent.createChooser(send, null))
        }
            .onFailure { report(false) }
    }

    internal fun requestMusic(place: JSONObject) {
        runCatching {
            pendingMusic =
                JSONObject().put("latitude", place.getDouble("latitude")).put("longitude", place.getDouble("longitude"))
            if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) {
                requestPermissions(LOCATION_PERMISSIONS, MUSIC_PERMISSION_REQUEST)
            } else chooseAudio()
        }
            .onFailure { report(false) }
    }

    internal fun disableMusic() {
        preferences.edit().remove("music").apply()
        music.stopMusic()
    }

    private fun chooseAudio() {
        runCatching {
            val choose =
                Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .setType("audio/*")
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            startActivityForResult(choose, AUDIO_DOCUMENT_REQUEST)
        }
            .onFailure { report(false) }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            LOCATION_PERMISSION_REQUEST ->
                if (hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) locateOnce() else locationError()
            MUSIC_PERMISSION_REQUEST ->
                if (hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) chooseAudio() else report(false)
        }
    }

    @Deprecated("Activity result API is retained to avoid adding a UI framework dependency")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != AUDIO_DOCUMENT_REQUEST || resultCode != RESULT_OK) return
        val rule = pendingMusic ?: return
        val uri = data?.data ?: return
        runCatching {
            contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            preferences
                .edit()
                .putString("music", rule.put("uri", uri.toString()).toString())
                .putBoolean("musicPlayed", false)
                .apply()
            pendingMusic = null
            music.reset()
        }
            .onFailure { report(false) }
    }

    internal fun locateOnce() {
        if (!hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
            requestPermissions(LOCATION_PERMISSIONS, LOCATION_PERMISSION_REQUEST)
            return
        }
        val request = locator ?: LocationLocator(this, timer).also { locator = it }
        request.locate(
            onSuccess = { fix ->
                evaluate("window.spotlaneLocation?.(${fix.latitude},${fix.longitude})")
            },
            onFailure = ::locationError,
        )
    }

    private fun hasPermission(permission: String) = checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun locationError() = evaluate("window.spotlaneLocationError?.()")

    internal fun report(success: Boolean, changed: Boolean = true) {
        runOnUiThread { evaluate("window.spotlaneResult?.($success,$changed)") }
    }

    private fun evaluate(script: String) {
        if (!destroyed && foreground) web.evaluateJavascript(script, null)
    }

    override fun onResume() {
        super.onResume()
        foreground = true
        web.onResume()
        sources.resume()
        music.startMusic()
        drivingState.start()
        evaluate("window.spotlaneDriving?.(${drivingState.driving})")
        vehicleSignals.start()
        evaluate("window.spotlaneVehicle?.(${vehicleSignals.snapshot()})")
        carBridge.start()
    }

    override fun onPause() {
        foreground = false
        locator?.cancel()
        sources.pause()
        music.stopMusic()
        drivingState.stop()
        vehicleSignals.stop()
        carBridge.stop()
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        destroyed = true
        locator?.cancel()
        sources.close()
        music.stopMusic()
        runCatching { navigator?.release() }
        web.removeJavascriptInterface("Spotlane")
        (web.parent as? ViewGroup)?.removeView(web)
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val MUSIC_PERMISSION_REQUEST = 42
        private const val AUDIO_DOCUMENT_REQUEST = 43
        private const val LOCATION_PERMISSION_REQUEST = 44
        private val LOCATION_PERMISSIONS =
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    }
}
