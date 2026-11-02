package com.brightideas.spotlane

import android.content.SharedPreferences
import java.time.Instant
import kotlin.math.floor
import org.json.JSONArray
import org.json.JSONObject

/** Owns persisted user data and streams bounded queries over custom imports. */
internal class PlaceRepository(private val preferences: SharedPreferences) {
    fun state(): String = runCatching {
        JSONObject()
            .put("spots", JSONArray(preferences.getString("curated", "[]") ?: "[]"))
            .put("saved", JSONArray(preferences.getString("saved", "[]") ?: "[]"))
            .put("notes", JSONObject(preferences.getString("notes", "{}") ?: "{}"))
            .put("url", preferences.getString("url", ""))
            .put("synced", preferences.getString("synced", ""))
            .put("checkedAt", preferences.getString("checkedAt", ""))
            .toString()
    }
        .getOrDefault("""{"spots":[],"saved":[],"notes":{},"url":"","synced":""}""")

    fun nearby(raw: String): String = runCatching {
        val view = Viewport.fromJson(JSONObject(raw))
        val matches = ArrayList<JSONObject>()
        val byDistance = compareBy<JSONObject> { view.distanceTo(it) }
        val buckets = LinkedHashMap<String, MutableList<JSONObject>>()
        forEachMerged { place ->
            if (isAvailable(place) && view.matchesCategory(place) && view.contains(place)) {
                if (view.overview) {
                    val row =
                        floor(
                                12 * (place.optDouble("latitude") - view.south) /
                                    (view.north - view.south).coerceAtLeast(0.0001)
                            )
                            .toInt()
                            .coerceIn(0, 11)
                    val col =
                        floor(
                                20 * (place.optDouble("longitude") - view.west) /
                                    (view.east - view.west).coerceAtLeast(0.0001)
                            )
                            .toInt()
                            .coerceIn(0, 19)
                    buckets.getOrPut("$row:$col:${place.optString("category")}") { ArrayList() }.add(place)
                    return@forEachMerged
                }
                matches.add(place)
                if (matches.size > MAX_RESULTS) {
                    matches.sortWith(byDistance)
                    matches.removeAt(MAX_RESULTS)
                }
            }
        }
        if (view.overview) {
            var round = 0
            while (matches.size < MAX_RESULTS) {
                var added = false
                for (bucket in buckets.values) {
                    if (matches.size >= MAX_RESULTS) break
                    if (round < bucket.size) {
                        matches.add(bucket[round])
                        added = true
                    }
                }
                if (!added) break
                round++
            }
        }
        matches.sortWith(byDistance)
        JSONArray(matches).toString()
    }
        .getOrDefault("[]")

    fun savedPlaces(): String = runCatching {
        val saved = JSONArray(preferences.getString("saved", "[]") ?: "[]")
        val ids = (0 until saved.length()).mapTo(HashSet()) { saved.getString(it) }
        val result = JSONArray()
        forEachMerged { place ->
            if (place.optString("id") in ids && isAvailable(place)) result.put(place)
        }
        result.toString()
    }
        .getOrDefault("[]")

    private fun isAvailable(place: JSONObject): Boolean {
        val category = place.optString("category")
        val recurrence = place.optJSONObject("recurrence")
        if (category == "event" && recurrence != null) return RecurringSchedule.available(recurrence, Instant.now())
        if (category != "event" && category != "popup") return true
        return runCatching { Instant.parse(place.getString("endsAt")).isAfter(Instant.now()) }.getOrDefault(false)
    }

    private fun forEachMerged(consumer: (JSONObject) -> Unit) {
        val overrides = LinkedHashMap<String, JSONObject>()
        Nearby.stream(preferences.getString("curated", "[]") ?: "[]") { overrides[it.optString("id")] = it }
        Nearby.stream(preferences.getString("dataset", "[]") ?: "[]") { place ->
            if (place.optString("id") !in overrides) consumer(place)
        }
        overrides.values.forEach(consumer)
    }

    private data class Viewport(
        val latitude: Double,
        val longitude: Double,
        val south: Double,
        val north: Double,
        val west: Double,
        val east: Double,
        val category: String,
        val overview: Boolean,
    ) {
        fun distanceTo(place: JSONObject) =
            Nearby.distance(latitude, longitude, place.optDouble("latitude"), place.optDouble("longitude"))

        fun contains(place: JSONObject): Boolean =
            place.optDouble("latitude") in south..north &&
                place.optDouble("longitude") in west..east &&
                (overview || distanceTo(place) <= RADIUS_METERS)

        fun matchesCategory(place: JSONObject): Boolean {
            if (category == "all" || category == place.optString("category")) return true
            val layers = place.optJSONArray("layers") ?: return false
            return (0 until layers.length()).any { layers.optString(it) == category }
        }

        companion object {
            fun fromJson(json: JSONObject): Viewport {
                val latitude = json.getDouble("latitude")
                val longitude = json.getDouble("longitude")
                require(
                    latitude.isFinite() && longitude.isFinite() && latitude in -90.0..90.0 && longitude in -180.0..180.0
                )
                return Viewport(
                    latitude,
                    longitude,
                    json.getDouble("south"),
                    json.getDouble("north"),
                    json.getDouble("west"),
                    json.getDouble("east"),
                    json.optString("category", "all"),
                    json.has("zoom") && json.optDouble("zoom") <= 12,
                )
            }
        }
    }

    companion object {
        private const val MAX_RESULTS = 300
        private const val RADIUS_METERS = 3_000
    }
}
