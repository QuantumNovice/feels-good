package com.brightideas.spotlane

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import org.json.JSONObject

/** Owns one opt-in arrival rule. Listeners, player and audio focus are released together. */
internal class ArrivalMusic(
    private val context: Context,
    private val preferences: SharedPreferences,
    private val onFailure: () -> Unit,
) {
    private val locations = context.getSystemService(LocationManager::class.java)
    private val audio = context.getSystemService(AudioManager::class.java)
    private var player: MediaPlayer? = null
    private var focus: AudioFocusRequest? = null
    private var played = preferences.getBoolean("musicPlayed", false)
    private var rule: ArrivalRule? = null
    private val arrivalDistance = FloatArray(1)

    private val listener =
        object : LocationListener {
            override fun onLocationChanged(location: Location) {
                val destination = rule ?: return
                if (played || location.accuracy > ARRIVAL_RADIUS_METERS) return
                Location.distanceBetween(
                    location.latitude,
                    location.longitude,
                    destination.latitude,
                    destination.longitude,
                    arrivalDistance,
                )
                if (arrivalDistance[0] <= ARRIVAL_RADIUS_METERS) play(destination)
            }

            override fun onProviderEnabled(provider: String) = Unit

            override fun onProviderDisabled(provider: String) = Unit

            @Deprecated("Legacy provider callback")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        }

    fun reset() {
        stopMusic()
        played = false
        startMusic()
    }

    @SuppressLint("MissingPermission") // Fine permission is explicitly checked before registering.
    fun startMusic() {
        if (
            played ||
                !preferences.contains("music") ||
                context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) !=
                    PackageManager.PERMISSION_GRANTED
        )
            return
        try {
            val json = JSONObject(preferences.getString("music", "{}") ?: "{}")
            rule =
                ArrivalRule(json.getDouble("latitude"), json.getDouble("longitude"), Uri.parse(json.getString("uri")))
            locations.removeUpdates(listener)
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5_000L, 25f, listener)
        } catch (_: Exception) {
            stopMusic()
            onFailure()
        }
    }

    private fun play(destination: ArrivalRule) {
        try {
            val attributes =
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            val request =
                AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener { change -> if (change < 0) stopMusic() }
                    .build()
            focus = request
            if (audio.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return
            played = true
            locations.removeUpdates(listener)
            preferences.edit().putBoolean("musicPlayed", true).apply()
            val mediaPlayer = MediaPlayer()
            player = mediaPlayer
            mediaPlayer.apply {
                setAudioAttributes(attributes)
                setDataSource(context, destination.uri)
                setOnPreparedListener { it.start() }
                setOnCompletionListener { stopMusic() }
                setOnErrorListener { _, _, _ ->
                    stopMusic()
                    onFailure()
                    true
                }
                prepareAsync()
            }
        } catch (_: Exception) {
            stopMusic()
            onFailure()
        }
    }

    fun stopMusic() {
        try {
            locations.removeUpdates(listener)
        } catch (_: SecurityException) {}
        player?.release()
        player = null
        focus?.let(audio::abandonAudioFocusRequest)
        focus = null
    }

    private data class ArrivalRule(val latitude: Double, val longitude: Double, val uri: Uri)

    companion object {
        private const val ARRIVAL_RADIUS_METERS = 150f
    }
}
