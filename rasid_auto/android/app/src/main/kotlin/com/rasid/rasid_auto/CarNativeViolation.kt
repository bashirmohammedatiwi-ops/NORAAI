package com.rasid.rasid_auto

import android.content.Context

/** 5-second grace → 200,000 IQD fine with audible countdown alarm. */
object CarNativeViolation {
    private const val GRACE_SEC = 5.0
    private const val TOLERANCE = 3.0
    private const val COOLDOWN_MS = 60_000L

    private var overSinceMs: Long? = null
    private var lastFineMs = 0L
    private var lastCd = 0

    fun tick(context: Context, speedKmh: Double, limitKmh: Double) {
        if (System.currentTimeMillis() - CarStatusHub.lastFlutterMs < 2500) return

        val threshold = limitKmh + TOLERANCE
        if (speedKmh <= threshold) {
            if (overSinceMs != null || lastCd > 0) CarAlarmPlayer.reset()
            overSinceMs = null
            lastCd = 0
            CarStatusHub.overSpeedCountdownSec = 0
            return
        }

        val now = System.currentTimeMillis()
        if (overSinceMs == null) {
            overSinceMs = now
            CarAlarmPlayer.onCountdownStart()
        }
        val elapsed = (now - overSinceMs!!) / 1000.0
        val cd = (GRACE_SEC - elapsed).toInt().coerceIn(0, 5)
        if (cd != lastCd) {
            CarAlarmPlayer.onCountdownTick(context, cd)
            lastCd = cd
        }
        CarStatusHub.overSpeedCountdownSec = cd

        if (elapsed < GRACE_SEC) return
        if (now - lastFineMs < COOLDOWN_MS) return

        lastFineMs = now
        overSinceMs = null
        lastCd = 0
        CarStatusHub.overSpeedCountdownSec = 0
        CarFineStore.recordFine(context, speedKmh, limitKmh)
        CarStatusHub.alertTitle = "مخالفة سرعة"
        CarStatusHub.alertBody = "200,000 دينار عراقي"
        CarAlarmPlayer.onFineRecorded(context)
    }
}
