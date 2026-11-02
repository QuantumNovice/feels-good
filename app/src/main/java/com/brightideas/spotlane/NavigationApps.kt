package com.brightideas.spotlane

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject

/** Provider URIs and package discovery stay outside the Activity and JavaScript bridge. */
object NavigationApps {
    private val providers = listOf("naver", "kakao", "google", "automotive", "geo")

    fun intent(place: JSONObject, provider: String): Intent {
        val latitude = place.getDouble("latitude")
        val longitude = place.getDouble("longitude")
        require(latitude.isFinite() && longitude.isFinite() && latitude in -90.0..90.0 && longitude in -180.0..180.0)
        val name = Uri.encode(place.getString("name"))
        val uri =
            when (provider) {
                "naver" ->
                    "nmap://navigation?dlat=$latitude&dlng=$longitude&dname=$name&appname=com.brightideas.spotlane"
                "kakao" -> "kakaomap://route?ep=$latitude,$longitude&by=car"
                "google" -> "google.navigation:q=$latitude,$longitude&mode=d"
                "automotive",
                "geo" -> "geo:$latitude,$longitude?q=$latitude,$longitude($name)"
                else -> error("unknown_navigator")
            }
        return Intent(
            if (provider == "automotive") "android.intent.action.NAVIGATE" else Intent.ACTION_VIEW,
            Uri.parse(uri),
        )
    }

    fun installed(context: Context, place: JSONObject): JSONArray {
        val result = JSONArray()
        val packages = HashSet<String>()
        val manager = context.packageManager
        for (provider in providers) {
            for (info in manager.queryIntentActivities(intent(place, provider), PackageManager.MATCH_DEFAULT_ONLY)) {
                val packageName = info.activityInfo.packageName
                if (packages.add(packageName)) {
                    result.put(
                        JSONObject()
                            .put("label", info.loadLabel(manager).toString())
                            .put("packageName", packageName)
                            .put("provider", provider)
                    )
                }
            }
        }
        return result
    }

    fun selected(context: Context, payload: JSONObject): Intent {
        val place = payload.getJSONObject("place")
        val packageName = payload.getString("packageName")
        val provider = payload.getString("provider")
        val available = installed(context, place)
        for (index in 0 until available.length()) {
            val app = available.getJSONObject(index)
            if (packageName == app.getString("packageName") && provider == app.getString("provider")) {
                return intent(place, provider).setPackage(packageName)
            }
        }
        throw ActivityNotFoundException()
    }
}
