package com.rasid.rasid_auto

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Offline speed zones for Android Auto when Flutter is not pushing data. */
object CarSpeedLimit {
    private data class Zone(
        val nameAr: String,
        val lat: Double,
        val lng: Double,
        val radiusKm: Double,
        val limitKmh: Int,
    )

    private val zones = listOf(
        Zone("طريق عام", 33.3152, 44.3661, 8.0, 40),
        Zone("شارع فلسطين", 33.3120, 44.3920, 2.5, 50),
        Zone("شارع السعدون", 33.3280, 44.3950, 2.0, 50),
        Zone("الكرادة", 33.2980, 44.3920, 2.5, 50),
        Zone("الجادرية", 33.2780, 44.3780, 2.5, 60),
        Zone("مدينة الطب", 33.3286, 44.3847, 1.5, 40),
        Zone("اليرموك", 33.3046, 44.3840, 2.0, 50),
        Zone("طريق المطار", 33.2600, 44.2340, 4.0, 100),
        Zone("طريق بغداد — الحلة", 33.2000, 44.3200, 6.0, 100),
        Zone("طريق بغداد — الموصل", 33.3800, 44.4200, 5.0, 120),
    )

    data class Result(val limitKmh: Double, val zoneNameAr: String)

    fun lookup(lat: Double, lng: Double): Result {
        var best: Zone? = null
        var bestD = Double.MAX_VALUE
        for (z in zones) {
            val d = haversineKm(lat, lng, z.lat, z.lng)
            if (d <= z.radiusKm && d < bestD) {
                best = z
                bestD = d
            }
        }
        return if (best != null) {
            Result(best.limitKmh.toDouble(), best.nameAr)
        } else {
            Result(40.0, "طريق عام")
        }
    }

    private fun haversineKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).pow(2)
        return r * 2 * atan2(sqrt(a), sqrt(1 - a))
    }
}
