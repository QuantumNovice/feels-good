package com.brightideas.spotlane

import android.content.SharedPreferences
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/** Stable JSON bridge for the packaged frontend. UI work is marshalled to the main thread. */
internal class NativeBridge(
    private val activity: MainActivity,
    private val preferences: SharedPreferences,
) {
    private val repository = PlaceRepository(preferences)

    @JavascriptInterface
    fun navigationApps(raw: String): String = runCatching {
        NavigationApps.installed(activity, JSONObject(raw)).toString()
    }
        .getOrDefault("[]")

    @JavascriptInterface fun state(): String = repository.state()

    @JavascriptInterface fun nearby(view: String): String = repository.nearby(view)

    @JavascriptInterface fun savedPlaces(): String = repository.savedPlaces()

    @JavascriptInterface fun driving(): Boolean = activity.drivingState.driving

    @JavascriptInterface
    @Synchronized
    fun action(action: String, raw: String): Boolean = runCatching {
        val value = JSONTokener(raw).nextValue()
        when (action) {
            "save" -> toggleSave(value.toString())
            "note" -> saveNote(value as JSONObject)
            "curate" -> curate(value as JSONObject)
            "fetch" -> return activity.requestFetch(value.toString(), true)
            "osm" -> return activity.requestFetch("osm", true)
            "resetSource" -> activity.resetSource()
            "music" -> onMain { activity.requestMusic(value as JSONObject) }
            "locate" -> onMain(activity::locateOnce)
            "musicOff" -> onMain(activity::disableMusic)
            "share" -> onMain { activity.share(value.toString()) }
            "android",
            "pleos" -> onMain { activity.navigate(value as JSONObject, action == "pleos") }
            "navigateApp" -> onMain { activity.openNavigationApp(value as JSONObject) }
            else -> return false
        }
        true
    }
        .getOrDefault(false)

    private fun onMain(action: () -> Unit) = activity.runOnUiThread {
        if (activity.isDestroyed) return@runOnUiThread
        runCatching(action).onFailure { activity.report(false) }
    }

    private fun toggleSave(id: String) {
        val before = JSONArray(preferences.getString("saved", "[]") ?: "[]")
        val after = JSONArray()
        var found = false
        for (index in 0 until before.length()) {
            val saved = before.getString(index)
            if (saved == id) found = true else after.put(saved)
        }
        if (!found) after.put(id)
        preferences.edit().putString("saved", after.toString()).apply()
    }

    private fun saveNote(payload: JSONObject) {
        val note = payload.getString("note")
        require(note.length <= 4_000) { "note_too_large" }
        val notes =
            JSONObject(preferences.getString("notes", "{}") ?: "{}").put(payload.getString("id"), note).toString()
        require(notes.length <= 250_000) { "notes_too_large" }
        preferences.edit().putString("notes", notes).apply()
    }

    private fun curate(place: JSONObject) {
        place.put("source", "Personal curation").put("verified", false)
        place.remove("verifiedAt")
        place.remove("evidenceUrl")
        Dataset.validate(JSONArray().put(place).toString())
        val before = JSONArray(preferences.getString("curated", "[]") ?: "[]")
        val after = JSONArray()
        for (index in 0 until before.length()) {
            val previous = before.getJSONObject(index)
            if (previous.getString("id") != place.getString("id")) after.put(previous)
        }
        after.put(place)
        val curated = after.toString()
        require(after.length() <= 5_000 && curated.length <= 1_000_000) { "curation_too_large" }
        check(preferences.edit().putString("curated", curated).commit()) { "curation_save_failed" }
    }
}
