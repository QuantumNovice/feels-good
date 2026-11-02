package com.brightideas.spotlane

import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.api.model.area.DoorArea
import ai.pleos.playground.vehicle.constant.area.DoorValue
import ai.pleos.playground.vehicle.constant.area.TurnSignalValue
import ai.pleos.playground.vehicle.constant.control.LightState
import ai.pleos.playground.vehicle.listener.BrakePedalStatusListener
import ai.pleos.playground.vehicle.listener.DoorPositionListener
import ai.pleos.playground.vehicle.listener.LightStateListener
import ai.pleos.playground.vehicle.listener.TurnSignalStateListener
import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import org.json.JSONObject

/**
 * Streams passive cabin signals to the UI as one JSON snapshot: brake pedal, open doors, turn signal and low beams from
 * the Pleos Vehicle service, plus speed and acceleration derived from GPS because the SDK exposes no speed or
 * accelerator signal. Every signal is optional; a missing service or permission leaves its default in place.
 */
internal class VehicleSignals(context: Context, private val onChange: (String) -> Unit) {
    private val app = context.applicationContext
    private val vehicle = runCatching { Vehicle(app) }.getOrNull()
    private val locations = app.getSystemService(LocationManager::class.java)
    private var started = false

    private var brake = false
    private var turn = "off"
    private var lowBeam = false
    private var speedKph = 0.0
    private var acceleration = 0.0
    private val doors = linkedMapOf<String, Boolean>()
    private var lastFix: Location? = null
    private var lastSent = ""

    private val brakeListener =
        object : BrakePedalStatusListener {
            override fun onBrakePedalStatusUpdated(pressed: Boolean?) = set { brake = pressed == true }

            override fun onFailed(exception: Exception) = Unit
        }
    private val turnListener =
        object : TurnSignalStateListener {
            override fun onTurnSignalStateUpdated(value: TurnSignalValue?) = set {
                turn =
                    when (value) {
                        TurnSignalValue.LEFT -> "left"
                        TurnSignalValue.RIGHT -> "right"
                        else -> "off"
                    }
            }

            override fun onFailed(exception: Exception) = Unit
        }
    private val lowBeamListener =
        object : LightStateListener {
            override fun onLightStateUpdated(state: LightState?) = set { lowBeam = state == LightState.ON }

            override fun onFailed(exception: Exception) = Unit
        }
    private val doorListeners = DOORS.map { (name, value) ->
        DoorArea(value) to
            object : DoorPositionListener {
                override fun onPositionUpdated(position: Int?) = set { doors[name] = (position ?: 0) > 0 }

                override fun onFailed(exception: Exception) = Unit
            }
    }
    private val gps = LocationListener { fix -> onFix(fix) }

    fun start() {
        if (started) return
        started = true
        vehicle?.let { car ->
            runCatching { car.initialize() }
            runCatching { car.getBrake().registerBrakePedalStatus(brakeListener) }
            runCatching { car.getTurnSignal().registerTurnSignalState(turnListener) }
            runCatching { car.getLight().registerLowBeamLightState(lowBeamListener) }
            for ((area, listener) in doorListeners) {
                runCatching { car.getDoor().registerDoorPosition(area, listener) }
            }
        }
        if (app.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            runCatching {
                locations?.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1_000L, 0f, gps, Looper.getMainLooper())
            }
        }
    }

    fun stop() {
        if (!started) return
        started = false
        runCatching { locations?.removeUpdates(gps) }
        vehicle?.let { car ->
            runCatching { car.getBrake().unregisterBrakePedalStatus(brakeListener) }
            runCatching { car.getTurnSignal().unregisterTurnSignalState(turnListener) }
            runCatching { car.getLight().unregisterLowBeamLightState(lowBeamListener) }
            for ((area, listener) in doorListeners) {
                runCatching { car.getDoor().unregisterDoorPosition(area, listener) }
            }
            runCatching { car.release() }
        }
        lastFix = null
        lastSent = ""
    }

    fun snapshot(): String =
        JSONObject()
            .put("brake", brake)
            .put("turn", turn)
            .put("lowBeam", lowBeam)
            .put("speedKph", Math.round(speedKph * 10) / 10.0)
            .put("acceleration", Math.round(acceleration * 100) / 100.0)
            .put("doors", JSONObject(doors.filterValues { it }.mapValues { true }))
            .toString()

    private fun onFix(fix: Location) {
        val previous = lastFix
        lastFix = fix
        val seconds = previous?.let { (fix.elapsedRealtimeNanos - it.elapsedRealtimeNanos) / 1e9 } ?: 0.0
        // Emulator fixes carry no speed, so fall back to distance over time between fixes.
        val metersPerSecond =
            when {
                fix.hasSpeed() -> fix.speed.toDouble()
                previous != null && seconds > 0.2 -> previous.distanceTo(fix) / seconds
                else -> 0.0
            }
        set {
            val kph = metersPerSecond * 3.6
            if (seconds > 0.2) acceleration = (kph - speedKph) / 3.6 / seconds
            speedKph = kph
        }
    }

    /** Discrete signals go out immediately; GPS already limits speed updates to 1 Hz. */
    private inline fun set(change: () -> Unit) {
        val json =
            synchronized(this) {
                change()
                snapshot().takeIf { it != lastSent }?.also { lastSent = it }
            } ?: return
        onChange(json)
    }

    private companion object {
        val DOORS =
            listOf(
                "frontLeft" to DoorValue.ROW_1_LEFT,
                "frontRight" to DoorValue.ROW_1_RIGHT,
                "rearLeft" to DoorValue.ROW_2_LEFT,
                "rearRight" to DoorValue.ROW_2_RIGHT,
                "trunk" to DoorValue.REAR,
            )
    }
}
