package com.rasid.rasid_auto

import android.content.Context

/**
 * Persists the hazards payload (potholes/bumps/accidents) pushed from the
 * phone app, so the car map shows them even on standalone drives.
 */
object CarHazardStore {
    private const val PREFS = "rasid_car_hazards"
    private const val KEY = "hazards"

    fun save(context: Context, raw: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, raw.take(20_000))
            .apply()
    }

    /** Loads persisted hazards into the hub (call at car session start). */
    fun syncHub(context: Context) {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, "") ?: ""
        if (raw.isNotBlank()) {
            CarStatusHub.hazards = CarStatusHub.parseHazards(raw)
        }
    }
}
