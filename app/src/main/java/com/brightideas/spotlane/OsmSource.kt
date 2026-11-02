package com.brightideas.spotlane

import java.net.URLEncoder
import org.json.JSONArray
import org.json.JSONObject

/** Converts community OSM fields without interpreting absent facilities as confirmed facts. */
object OsmSource {
    @JvmStatic
    fun url(): String {
        val query = "[out:json][timeout:20];nwr(around:3000,37.5665,126.9780)[amenity=toilets];out center tags 150;"
        return "https://overpass-api.de/api/interpreter?data=${URLEncoder.encode(query, "UTF-8")}"
    }

    @JvmStatic
    fun normalize(raw: String): JSONArray {
        val elements = JSONObject(raw).getJSONArray("elements")
        val places = JSONArray()
        for (index in 0 until elements.length()) {
            val element = elements.getJSONObject(index)
            val tags = element.optJSONObject("tags") ?: continue
            val coordinate = if (element.has("lat")) element else element.optJSONObject("center") ?: continue
            val id = "${element.getString("type")}/${element.getLong("id")}"
            val facilities = JSONObject()
            for (key in listOf("opening_hours", "wheelchair", "fee", "access", "changing_table", "unisex")) {
                if (tags.has(key)) facilities.put(key, tags.getString(key))
            }
            places.put(
                JSONObject()
                    .put("id", "osm:$id")
                    .put("name", tags.optString("name", tags.optString("name:en", "WC")))
                    .put("category", "bathroom")
                    .put("latitude", coordinate.getDouble("lat"))
                    .put("longitude", coordinate.getDouble("lon"))
                    .put("source", "OpenStreetMap · ODbL")
                    .put("verified", false)
                    .put("evidenceUrl", "https://www.openstreetmap.org/$id")
                    .put("reviews", JSONArray())
                    .put("facilities", facilities)
            )
        }
        return Dataset.validate(places.toString())
    }
}
