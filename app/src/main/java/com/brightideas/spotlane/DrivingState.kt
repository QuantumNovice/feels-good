package com.brightideas.spotlane

import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.constant.control.VehicleGear
import ai.pleos.playground.vehicle.listener.GearSelectionListener
import android.content.Context

/** Watches the Pleos gear selector so touch input can pause while the car is out of Park. */
internal class DrivingState(context: Context, private val onChange: (Boolean) -> Unit) {
    private val vehicle = runCatching { Vehicle(context.applicationContext) }.getOrNull()
    private var started = false
    @Volatile
    var driving = false
        private set

    private val listener =
        object : GearSelectionListener {
            override fun onSelected(gear: VehicleGear?) = update(gear)

            override fun onFailed(exception: Exception) = Unit
        }

    /** Phones and cars without the Vehicle service stay unlocked. */
    fun start() {
        if (started) return
        val car = vehicle ?: return
        started =
            runCatching {
                car.initialize()
                car.getGear().getCurrentGearSelectionState(::update) {}
                car.getGear().registerGearSelection(listener)
            }
                .isSuccess
    }

    fun stop() {
        if (!started) return
        runCatching {
            vehicle?.getGear()?.unregisterGearSelection(listener)
            vehicle?.release()
        }
        started = false
    }

    private fun update(gear: VehicleGear?) {
        val moving = isDriving(gear)
        if (moving == driving) return
        driving = moving
        onChange(moving)
    }

    companion object {
        /** Unknown gear is treated as parked so emulators and missing signals never lock the app. */
        @JvmStatic
        fun isDriving(gear: VehicleGear?) =
            gear != null && gear != VehicleGear.GEAR_PARK && gear != VehicleGear.GEAR_UNKNOWN
    }
}
