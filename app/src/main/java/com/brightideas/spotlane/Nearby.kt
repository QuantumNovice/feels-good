package com.brightideas.spotlane

import java.util.function.Consumer
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import org.json.JSONException
import org.json.JSONObject
import org.json.JSONTokener

/** Streams imported records without retaining another complete dataset in memory. */
object Nearby {
    @JvmStatic
    @Throws(JSONException::class)
    fun stream(raw: String, consumer: Consumer<JSONObject>) {
        val tokens = JSONTokener(raw)
        if (tokens.nextClean() != '[') throw JSONException("array_required")
        if (tokens.nextClean() == ']') return
        tokens.back()
        while (true) {
            val value = tokens.nextValue() as? JSONObject ?: throw JSONException("object_required")
            consumer.accept(value)
            when (tokens.nextClean()) {
                ']' -> return
                ',' -> Unit
                else -> throw JSONException("separator_required")
            }
        }
    }

    @JvmStatic
    fun distance(latitude: Double, longitude: Double, otherLatitude: Double, otherLongitude: Double): Double {
        val radians = Math.PI / 180
        val latitudeDelta = (otherLatitude - latitude) * radians
        val longitudeDelta = (otherLongitude - longitude) * radians
        val haversine =
            sin(latitudeDelta / 2).pow(2) +
                cos(latitude * radians) * cos(otherLatitude * radians) * sin(longitudeDelta / 2).pow(2)
        return 6_371_000 * 2 * asin(sqrt(min(1.0, haversine)))
    }
}
