package com.rasid.rasid_auto

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Persists speed fines on-device for the car screen (works without Flutter UI). */
object CarFineStore {
    private const val PREFS = "rasid_car_fines"
    private const val KEY = "fines"
    private const val AMOUNT = 200_000

    @Volatile private var cached: List<CarFineItem>? = null
    @Volatile private var lastMergeSig: Int = 0

    fun load(context: Context): List<CarFineItem> {
        cached?.let { return it }
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, "[]") ?: "[]"
        val out = try {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    add(
                        CarFineItem(
                            title = o.optString("title"),
                            subtitle = o.optString("subtitle"),
                            resolved = o.optBoolean("resolved", false),
                        ),
                    )
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
        cached = out
        return out
    }

    fun recordFine(
        context: Context,
        speedKmh: Double,
        limitKmh: Double,
    ): CarFineItem {
        val fmt = SimpleDateFormat("yyyy/MM/dd HH:mm", Locale.getDefault())
        val item = CarFineItem(
            title = "${speedKmh.toInt()} / ${limitKmh.toInt()} كم/س · $AMOUNT د.ع",
            subtitle = "مفتوحة · +${(speedKmh - limitKmh).toInt().coerceAtLeast(0)} فوق الحد · ${fmt.format(Date())}",
            resolved = false,
        )
        val list = load(context).toMutableList()
        list.add(0, item)
        save(context, list.take(30))
        syncHub(context)
        return item
    }

    /**
     * Merges phone-pushed fines into the native store so they survive
     * standalone car sessions. Dedupes by title, syncs resolved flags.
     */
    fun mergeExternal(context: Context, external: List<CarFineItem>) {
        if (external.isEmpty()) return
        val sig = external.fold(0) { acc, f -> 31 * acc + f.title.hashCode() + if (f.resolved) 1 else 0 }
        if (sig == lastMergeSig) return
        lastMergeSig = sig

        val list = load(context).toMutableList()
        var changed = false
        for (i in list.indices) {
            val match = external.firstOrNull { it.title == list[i].title }
            if (match != null && match.resolved != list[i].resolved) {
                list[i] = list[i].copy(resolved = match.resolved)
                changed = true
            }
        }
        external.forEach { e ->
            if (list.none { it.title == e.title }) {
                list.add(0, e)
                changed = true
            }
        }
        if (changed) save(context, list.take(30))
        syncHub(context)
    }

    fun syncHub(context: Context) {
        CarStatusHub.nativeFines = load(context)
    }

    private fun save(context: Context, list: List<CarFineItem>) {
        cached = list
        val arr = JSONArray()
        list.forEach { f ->
            arr.put(
                JSONObject()
                    .put("title", f.title)
                    .put("subtitle", f.subtitle)
                    .put("resolved", f.resolved),
            )
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, arr.toString())
            .apply()
    }
}
