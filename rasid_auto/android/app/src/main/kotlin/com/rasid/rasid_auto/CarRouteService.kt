package com.rasid.rasid_auto

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** OSRM routing with retries + dense fallback polyline. */
object CarRouteService {
    private val io = Executors.newSingleThreadExecutor()
    @Volatile private var appContext: Context? = null
    private const val UA = "RASID-Auto/1.5.2 (Android Auto Navigation)"

    private val ENDPOINTS = listOf(
        "https://router.project-osrm.org/route/v1/driving",
        "https://routing.openstreetmap.de/routed-car/route/v1/driving",
    )

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun navigateToHospital(hospitalId: String) {
        val h = CarHospitalData.byId(hospitalId) ?: return
        io.execute {
            CarStatusHub.navRouting = true
            CarStatusHub.navDestName = h.nameAr
            CarStatusHub.destLat = h.lat
            CarStatusHub.destLng = h.lng
            CarStatusHub.notifyListeners()
            val fromLat = CarStatusHub.latitude
            val fromLng = CarStatusHub.longitude
            var routed = false
            for (base in ENDPOINTS) {
                try {
                    val uri = "$base/$fromLng,$fromLat;${h.lng},${h.lat}" +
                        "?overview=full&geometries=geojson&steps=true"
                    val body = httpGet(uri) ?: continue
                    val json = JSONObject(body)
                    if (json.optString("code") != "Ok") continue
                    val routes = json.getJSONArray("routes")
                    if (routes.length() == 0) continue
                    val route = routes.getJSONObject(0)
                    val dist = route.getDouble("distance")
                    val dur = route.getDouble("duration")
                    val coords = route.getJSONObject("geometry").getJSONArray("coordinates")
                    val pts = ArrayList<Pair<Double, Double>>(coords.length())
                    for (i in 0 until coords.length()) {
                        val c = coords.getJSONArray(i)
                        pts.add(c.getDouble(1) to c.getDouble(0))
                    }
                    if (pts.size >= 2) {
                        CarStatusHub.applyRoute(h.nameAr, h.lat, h.lng, pts, dist, dur)
                        routed = true
                        break
                    }
                } catch (_: Exception) {
                }
            }
            if (!routed) {
                val distM = haversineM(fromLat, fromLng, h.lat, h.lng)
                val pts = densify(fromLat, fromLng, h.lat, h.lng, stepM = 35.0)
                CarStatusHub.applyRoute(h.nameAr, h.lat, h.lng, pts, distM, distM / 11.0)
            }
            CarStatusHub.navRouting = false
            CarStatusHub.notifyListeners()
            CarStatusHub.consumeCommand()
        }
    }

    private fun httpGet(uri: String): String? {
        return try {
            val conn = URL(uri).openConnection() as HttpURLConnection
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            conn.setRequestProperty("User-Agent", UA)
            conn.setRequestProperty("Accept", "application/json")
            if (conn.responseCode != 200) return null
            conn.inputStream.bufferedReader().readText()
        } catch (_: Exception) {
            null
        }
    }

    private fun densify(
        lat1: Double,
        lng1: Double,
        lat2: Double,
        lng2: Double,
        stepM: Double,
    ): List<Pair<Double, Double>> {
        val dist = haversineM(lat1, lng1, lat2, lng2)
        val steps = (dist / stepM).toInt().coerceIn(2, 120)
        return (0..steps).map { i ->
            val t = i.toDouble() / steps
            (lat1 + (lat2 - lat1) * t) to (lng1 + (lng2 - lng1) * t)
        }
    }

    private fun haversineM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).pow(2)
        return r * 2 * atan2(sqrt(a), sqrt(1 - a))
    }
}
