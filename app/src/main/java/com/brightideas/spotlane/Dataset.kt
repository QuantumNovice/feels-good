package com.brightideas.spotlane

import java.time.Instant
import org.json.JSONArray

/** Validates the entire wire-format snapshot before persistence replaces existing data. */
object Dataset {
    private const val MAX_PLACES = 5_000
    private val categories = setOf("bathroom", "parking", "date", "tourism", "popup", "event")

    @JvmStatic
    fun validate(raw: String): JSONArray {
        val data = JSONArray(raw)
        require(data.length() <= MAX_PLACES) { "too_many_places" }
        val ids = HashSet<String>()
        for (index in 0 until data.length()) {
            val place = data.getJSONObject(index)
            val id = place.getString("id")
            require(id.isNotBlank() && ids.add(id)) { "invalid_id" }
            require(place.getString("name").isNotBlank() && place.getString("source").isNotBlank()) {
                "missing_provenance"
            }
            val latitude = place.getDouble("latitude")
            val longitude = place.getDouble("longitude")
            require(
                latitude.isFinite() && longitude.isFinite() && latitude in -90.0..90.0 && longitude in -180.0..180.0
            ) {
                "invalid_coordinates"
            }
            val category = place.getString("category")
            require(category in categories) { "invalid_category" }
            if (place.optBoolean("verified")) {
                Instant.parse(place.getString("verifiedAt"))
                require(place.getString("evidenceUrl").startsWith("https://")) { "missing_evidence" }
            }
            if (place.has("recurrence")) {
                require(category == "event") { "event_recurrence_only" }
                RecurringSchedule.validate(place.getJSONObject("recurrence"))
            } else if (category == "event" || category == "popup") {
                val end = Instant.parse(place.getString("endsAt"))
                require(!place.has("startsAt") || end.isAfter(Instant.parse(place.getString("startsAt")))) {
                    "invalid_date_range"
                }
            }
            require(!place.has("reviews") || place.get("reviews") is JSONArray) { "invalid_reviews" }
        }
        return data
    }
}
