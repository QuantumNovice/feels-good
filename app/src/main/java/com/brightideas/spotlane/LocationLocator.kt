package com.brightideas.spotlane

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler

/** One foreground request with a timeout; cancellation also rejects queued duplicate fixes. */
internal class LocationLocator(context: Context, private val timer: Handler) {
    private val manager = context.getSystemService(LocationManager::class.java)
    private var activeListener: LocationListener? = null
    private var timeout: Runnable? = null

    @SuppressLint("MissingPermission") // The Activity requests permission; provider failures are handled below.
    fun locate(onSuccess: (Location) -> Unit, onFailure: () -> Unit) {
        cancel()
        val listener =
            object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    if (activeListener !== this) return
                    cancel()
                    onSuccess(location)
                }

                override fun onProviderEnabled(provider: String) = Unit

                override fun onProviderDisabled(provider: String) = Unit

                @Deprecated("Legacy provider callback")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
            }
        activeListener = listener
        var requested = false
        for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
            try {
                if (manager.isProviderEnabled(provider)) {
                    manager.requestLocationUpdates(provider, 0L, 0f, listener)
                    requested = true
                }
            } catch (_: SecurityException) {
                // Approximate permission may allow only the network provider.
            } catch (_: IllegalArgumentException) {
                // Some automotive devices do not expose both providers.
            }
        }
        if (!requested) {
            cancel()
            onFailure()
            return
        }
        val failRequest = Runnable {
            cancel()
            onFailure()
        }
        timeout = failRequest
        timer.postDelayed(failRequest, TIMEOUT_MS)
    }

    fun cancel() {
        timeout?.let(timer::removeCallbacks)
        activeListener?.let { listener ->
            try {
                manager.removeUpdates(listener)
            } catch (_: SecurityException) {}
        }
        activeListener = null
        timeout = null
    }

    companion object {
        private const val TIMEOUT_MS = 15_000L
    }
}
