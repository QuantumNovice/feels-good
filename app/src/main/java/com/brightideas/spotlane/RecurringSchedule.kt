package com.brightideas.spotlane

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import org.json.JSONArray
import org.json.JSONObject

/** KST calendar rules are independent of the device timezone and individual occurrences. */
object RecurringSchedule {
    private val koreaTime = ZoneId.of("Asia/Seoul")
    private val timePattern = Regex("([01]\\d|2[0-3]):[0-5]\\d")

    @JvmStatic
    fun validate(schedule: JSONObject) {
        require(schedule.getString("timezone") == koreaTime.id) { "invalid_timezone" }
        val rules = schedule.getJSONArray("rules")
        require(rules.length() in 1..24) { "invalid_recurrence" }
        for (index in 0 until rules.length()) {
            val rule = rules.getJSONObject(index)
            validateRange(rule.getJSONArray("months"), 1, 12)
            if (rule.has("weekdays")) validateRange(rule.getJSONArray("weekdays"), 0, 6)
            val times = rule.getJSONArray("times")
            require(times.length() in 1..48) { "invalid_times" }
            for (slot in 0 until times.length()) require(timePattern.matches(times.getString(slot))) { "invalid_time" }
            if (rule.has("durationMinutes")) {
                val duration = rule.getDouble("durationMinutes")
                require(duration.isFinite() && duration > 0 && duration <= 1440) { "invalid_duration" }
            }
        }
        val start = schedule.optionalDate("validFrom")
        val end = schedule.optionalDate("validThrough")
        require(start == null || end == null || !start.isAfter(end)) { "invalid_range" }
        schedule.optJSONArray("excludedDates")?.let { excluded ->
            require(excluded.length() <= 1_000) { "too_many_exclusions" }
            for (index in 0 until excluded.length()) LocalDate.parse(excluded.getString(index))
        }
    }

    private fun validateRange(values: JSONArray, minimum: Int, maximum: Int) {
        require(values.length() in 1..(maximum - minimum + 1)) { "invalid_calendar" }
        for (index in 0 until values.length()) {
            val value = values.getDouble(index)
            require(value.isFinite() && value % 1.0 == 0.0 && value >= minimum && value <= maximum) {
                "invalid_calendar"
            }
        }
    }

    @JvmStatic
    fun available(schedule: JSONObject, now: Instant): Boolean =
        try {
            hasFutureOccurrence(schedule, now)
        } catch (_: Exception) {
            false
        }

    private fun hasFutureOccurrence(schedule: JSONObject, now: Instant): Boolean {
        val today = now.atZone(koreaTime).toLocalDate()
        val firstDate = schedule.optionalDate("validFrom")
        val finalDate = schedule.optionalDate("validThrough")
        val rules = schedule.getJSONArray("rules")
        val exclusions = schedule.optJSONArray("excludedDates")
        for (offset in -1L..370L) {
            val date = today.plusDays(offset)
            if (finalDate != null && date.isAfter(finalDate)) return false
            if ((firstDate != null && date.isBefore(firstDate)) || exclusions.hasString(date.toString())) continue
            for (index in 0 until rules.length()) {
                val rule = rules.getJSONObject(index)
                if (!rule.getJSONArray("months").hasInteger(date.monthValue)) continue
                val weekdays = rule.optJSONArray("weekdays")
                if (weekdays != null && !weekdays.hasInteger(date.dayOfWeek.value % 7)) continue
                val times = rule.getJSONArray("times")
                val duration = (rule.optDouble("durationMinutes", 0.0) * 60_000).toLong().coerceAtLeast(1)
                for (slot in 0 until times.length()) {
                    val end =
                        date
                            .atTime(LocalTime.parse(times.getString(slot)))
                            .atZone(koreaTime)
                            .toInstant()
                            .plusMillis(duration)
                    if (end.isAfter(now)) return true
                }
            }
        }
        return false
    }

    private fun JSONObject.optionalDate(key: String): LocalDate? =
        if (has(key)) LocalDate.parse(getString(key)) else null

    private fun JSONArray.hasInteger(value: Int) = (0 until length()).any { optInt(it, -1) == value }

    private fun JSONArray?.hasString(value: String) = this != null && (0 until length()).any { optString(it) == value }
}
