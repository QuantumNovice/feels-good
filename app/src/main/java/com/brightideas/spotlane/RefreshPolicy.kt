package com.brightideas.spotlane

import java.time.Instant

object RefreshPolicy {
    const val INTERVAL_MS = 15 * 60 * 1000L

    @JvmStatic
    fun isStale(checkedAt: String?, now: Instant): Boolean = runCatching {
        checkedAt.isNullOrBlank() || now.toEpochMilli() - Instant.parse(checkedAt).toEpochMilli() >= INTERVAL_MS
    }
        .getOrDefault(true)

    /** A stale/failed source backs off for one interval; a fresh one keeps its original deadline. */
    @JvmStatic
    fun nextDelayMs(checkedAt: String?, now: Instant): Long = runCatching {
        val elapsed = now.toEpochMilli() - Instant.parse(checkedAt).toEpochMilli()
        if (elapsed >= INTERVAL_MS) INTERVAL_MS else (INTERVAL_MS - elapsed).coerceIn(1, INTERVAL_MS)
    }
        .getOrDefault(INTERVAL_MS)
}
