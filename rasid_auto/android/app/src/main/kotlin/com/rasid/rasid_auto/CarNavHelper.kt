package com.rasid.rasid_auto

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.roundToInt

/** Turn-by-turn cues from route polyline (works with Flutter + native OSRM). */
object CarNavHelper {
    data class Turn(val icon: String, val text: String, val distanceM: Double)

    fun currentTurn(): Turn? {
        if (!CarStatusHub.navigating || CarStatusHub.routePoints.size < 3) return null
        val pts = CarStatusHub.routePoints
        val from = CarStatusHub.routeNearestIndex.coerceIn(0, pts.size - 2)
        val lat = CarStatusHub.latitude
        val lng = CarStatusHub.longitude

        // Scan ahead for meaningful bearing change (>28°).
        var best: Turn? = null
        var carry = 0.0
        for (i in from until pts.size - 2) {
            carry += CarStatusHub.haversineM(
                if (i == from) lat else pts[i].first,
                if (i == from) lng else pts[i].second,
                pts[i + 1].first,
                pts[i + 1].second,
            )
            val b1 = bearing(
                if (i == from) lat else pts[i].first,
                if (i == from) lng else pts[i].second,
                pts[i + 1].first,
                pts[i + 1].second,
            )
            val b2 = bearing(
                pts[i + 1].first,
                pts[i + 1].second,
                pts[i + 2].first,
                pts[i + 2].second,
            )
            val delta = angleDelta(b1, b2)
            if (abs(delta) >= 28) {
                best = Turn(
                    icon = turnIcon(delta),
                    text = turnText(delta, carry),
                    distanceM = carry,
                )
                break
            }
        }
        if (best != null) return best
        val rem = CarStatusHub.navRemainingM
        return Turn("↑", "واصل على المسار", rem)
    }

    fun compassAr(deg: Double): String {
        val dirs = arrayOf(
            "شمال", "شمال شرق", "شرق", "جنوب شرق",
            "جنوب", "جنوب غرب", "غرب", "شمال غرب",
        )
        val idx = (((deg % 360 + 360) % 360) / 45.0 + 0.5).toInt() % 8
        return dirs[idx]
    }

    private fun bearing(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val dLng = Math.toRadians(lng2 - lng1)
        val y = sin(dLng) * cos(Math.toRadians(lat2))
        val x = cos(Math.toRadians(lat1)) * sin(Math.toRadians(lat2)) -
            sin(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * cos(dLng)
        return (Math.toDegrees(atan2(y, x)) + 360) % 360
    }

    private fun angleDelta(from: Double, to: Double): Double {
        var d = (to - from) % 360
        if (d > 180) d -= 360
        if (d < -180) d += 360
        return d
    }

    private fun turnIcon(delta: Double): String = when {
        delta > 135 -> "↩"
        delta > 45 -> "↗"
        delta > 15 -> "→"
        delta < -135 -> "↪"
        delta < -45 -> "↖"
        delta < -15 -> "←"
        else -> "↑"
    }

    private fun turnText(delta: Double, distM: Double): String {
        val d = if (distM >= 1000) {
            String.format("%.1f كم", distM / 1000.0)
        } else {
            "${distM.roundToInt()} م"
        }
        val action = when {
            delta > 135 -> "استدر للخلف"
            delta > 45 -> "انعطف يميناً"
            delta > 15 -> "ميل يميناً"
            delta < -135 -> "استدر"
            delta < -45 -> "انعطف يساراً"
            delta < -15 -> "ميل يساراً"
            else -> "واصل"
        }
        return "$action · بعد $d"
    }

    private fun sin(d: Double) = kotlin.math.sin(d)
    private fun cos(d: Double) = kotlin.math.cos(d)
}
