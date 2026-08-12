package com.rasid.rasid_auto

import android.os.Handler
import android.os.Looper
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

data class CarHospitalItem(
    val id: String,
    val nameAr: String,
    val subtitle: String,
)

data class CarFineItem(
    val title: String,
    val subtitle: String,
    val resolved: Boolean = false,
    val ts: Long = 0L,
    val speedKmh: Double = 0.0,
    val limitKmh: Double = 0.0,
)

/** A saved road hazard (pothole/bump/accident) drawn on the car map. */
data class CarHazard(
    val lat: Double,
    val lng: Double,
    val kind: String,
)

/** Shared in-memory status for the Android Auto car session. */
object CarStatusHub {
    @Volatile var speedKmh: Double = 0.0
    @Volatile var flutterSpeedKmh: Double = 0.0
    @Volatile var nativeSpeedKmh: Double = 0.0
    @Volatile var lastFlutterMs: Long = 0L
    @Volatile var lastNativeMs: Long = 0L
    @Volatile var vehicleSpeedKmh: Double = -1.0
    @Volatile var limitKmh: Double = 40.0
    @Volatile var zone: String = "طريق عام"
    @Volatile var alertTitle: String? = null
    @Volatile var alertBody: String? = null
    @Volatile var detecting: Boolean = false
    @Volatile var potholeCount: Int = 0
    @Volatile var bumpCount: Int = 0
    @Volatile var backendName: String = ""
    @Volatile var navigating: Boolean = false
    @Volatile var navRouting: Boolean = false
    @Volatile var navDestName: String = ""
    @Volatile var navRemainingM: Double = 0.0
    @Volatile var navEtaMin: Int = 0
    @Volatile var vibrationPercent: Int = 0
    @Volatile var headingDeg: Double = 0.0
    @Volatile var overSpeedCountdownSec: Int = 0
    @Volatile var latitude: Double = 33.3152
    @Volatile var longitude: Double = 44.3661
    @Volatile var destLat: Double = 0.0
    @Volatile var destLng: Double = 0.0
    @Volatile var routeNearestIndex: Int = 0
    @Volatile var hospitals: List<CarHospitalItem> = emptyList()
    /** Fines recorded natively on the car (standalone driving). */
    @Volatile var nativeFines: List<CarFineItem> = emptyList()
    /** Fines pushed from the phone app — merged view keeps both worlds. */
    @Volatile var flutterFines: List<CarFineItem> = emptyList()
    @Volatile var routePoints: List<Pair<Double, Double>> = emptyList()
    /** Saved potholes/bumps/accidents shown on the car map. */
    @Volatile var hazards: List<CarHazard> = emptyList()
    /** Nearest hazard ahead: label + distance, for the HUD proximity chip. */
    @Volatile var nearestHazardLabel: String? = null
    @Volatile var nearestHazardDistM: Int = 0
    @Volatile var nearestHazardKey: String? = null
    /** User pinch substitute: −3…+3 around auto zoom. */
    @Volatile var userZoomDelta: Int = 0
    @Volatile var routeFitZoom: Int? = null
    /** Set when the driver cancels nav on the car; blocks Flutter re-push briefly. */
    @Volatile var navCancelledAtMs: Long = 0L

    @Volatile private var pendingHospitalId: String? = null
    @Volatile private var pendingCancelNav: Boolean = false

    private val listeners = mutableSetOf<() -> Unit>()
    private val mainHandler = Handler(Looper.getMainLooper())

    /** App context for persisting hazards; set once from MainActivity/Session. */
    var hazardContext: android.content.Context? = null

    val displaySpeedKmh: Double
        get() {
            if (vehicleSpeedKmh >= 0) return vehicleSpeedKmh
            val now = System.currentTimeMillis()
            val nativeFresh = now - lastNativeMs < 2500
            val flutterFresh = now - lastFlutterMs < 2500
            // The car's own GPS tracker is authoritative: a stale/idle phone
            // app pushing 0 must never mask real motion.
            return when {
                nativeFresh -> nativeSpeedKmh
                flutterFresh -> flutterSpeedKmh
                else -> nativeSpeedKmh
            }
        }

    /** Phone + car fines merged (deduped by title) — one list everywhere. */
    val fines: List<CarFineItem>
        get() {
            val seen = HashSet<String>()
            val out = ArrayList<CarFineItem>()
            (flutterFines + nativeFines).forEach { f ->
                if (seen.add(f.title)) out.add(f)
            }
            return out.take(10)
        }

    val openFinesCount: Int
        get() = fines.count { !it.resolved }

    fun updateFromFlutter(args: Map<*, *>?) {
        if (args == null) return
        fun num(key: String, def: Double = 0.0): Double =
            (args[key] as? Number)?.toDouble() ?: def
        fun int(key: String, def: Int = 0): Int =
            (args[key] as? Number)?.toInt() ?: def
        fun str(key: String, def: String = ""): String =
            args[key] as? String ?: def
        fun bool(key: String, def: Boolean = false): Boolean =
            args[key] as? Boolean ?: def

        flutterSpeedKmh = num("speedKmh")
        speedKmh = flutterSpeedKmh
        lastFlutterMs = System.currentTimeMillis()
        limitKmh = num("limitKmh", 40.0)
        zone = str("zone", "طريق عام")
        alertTitle = args["alertTitle"] as? String
        alertBody = args["alertBody"] as? String
        detecting = bool("detecting")
        potholeCount = int("potholeCount")
        bumpCount = int("bumpCount")
        backendName = str("backendName")
        val cancelGuard = System.currentTimeMillis() - navCancelledAtMs < 4000
        navigating = if (cancelGuard && bool("navigating")) false else bool("navigating")
        navDestName = str("navDestName")
        navRemainingM = num("navRemainingM")
        navEtaMin = int("navEtaMin")
        vibrationPercent = int("vibrationPercent")
        headingDeg = num("headingDeg")
        overSpeedCountdownSec = int("overSpeedCountdownSec")
        val lat = num("latitude")
        val lng = num("longitude")
        if (lat != 0.0 || lng != 0.0) {
            latitude = lat
            longitude = lng
        }

        val hospRaw = args["hospitals"] as? List<*>
        if (hospRaw != null && hospRaw.isNotEmpty()) {
            hospitals = hospRaw.mapNotNull { item ->
                val m = item as? Map<*, *> ?: return@mapNotNull null
                val id = m["id"] as? String ?: return@mapNotNull null
                val name = m["nameAr"] as? String ?: return@mapNotNull null
                CarHospitalItem(id, name, m["subtitle"] as? String ?: "")
            }
        }

        val finesRaw = args["fines"] as? List<*>
        if (finesRaw != null) {
            flutterFines = finesRaw.mapNotNull { item ->
                val m = item as? Map<*, *> ?: return@mapNotNull null
                CarFineItem(
                    title = m["title"] as? String ?: "",
                    subtitle = m["subtitle"] as? String ?: "",
                    resolved = m["resolved"] as? Boolean ?: false,
                )
            }
        }

        val routeRaw = args["routePoints"] as? String
        if (!cancelGuard && routeRaw != null && routeRaw.isNotBlank()) {
            routePoints = routeRaw.split(';').mapNotNull { pair ->
                val parts = pair.split(',')
                if (parts.size != 2) return@mapNotNull null
                val la = parts[0].toDoubleOrNull() ?: return@mapNotNull null
                val ln = parts[1].toDoubleOrNull() ?: return@mapNotNull null
                la to ln
            }
            updateRouteProgress()
        }

        val hazRaw = args["hazards"] as? String
        if (hazRaw != null) {
            hazards = parseHazards(hazRaw)
            hazardContext?.let { CarHazardStore.save(it, hazRaw) }
        }

        notifyListeners()
    }

    fun parseHazards(raw: String): List<CarHazard> =
        raw.split(';').mapNotNull { item ->
            val parts = item.split(',')
            if (parts.size != 3) return@mapNotNull null
            val la = parts[0].toDoubleOrNull() ?: return@mapNotNull null
            val ln = parts[1].toDoubleOrNull() ?: return@mapNotNull null
            CarHazard(la, ln, parts[2])
        }

    /** Nearest hazard within 300m — drives the HUD proximity chip. */
    fun updateNearestHazard() {
        var best: CarHazard? = null
        var bestD = Double.MAX_VALUE
        for (hz in hazards) {
            val d = haversineM(latitude, longitude, hz.lat, hz.lng)
            if (d < bestD) {
                bestD = d
                best = hz
            }
        }
        if (best != null && bestD <= 300.0) {
            nearestHazardLabel = when (best.kind) {
                "p" -> "حفرة"
                "b" -> "مطب"
                "a" -> "حادث"
                "m" -> "فتحة مجاري"
                else -> "خطر"
            }
            nearestHazardDistM = bestD.toInt()
            nearestHazardKey = "${best.kind}:${(best.lat * 10000).toInt()}:${(best.lng * 10000).toInt()}"
        } else {
            nearestHazardLabel = null
            nearestHazardDistM = 0
            nearestHazardKey = null
        }
    }

    fun applyRoute(
        name: String,
        destLat: Double,
        destLng: Double,
        points: List<Pair<Double, Double>>,
        distanceM: Double,
        durationS: Double,
    ) {
        navCancelledAtMs = 0L
        navigating = true
        navDestName = name
        this.destLat = destLat
        this.destLng = destLng
        routePoints = points
        navRemainingM = distanceM
        navEtaMin = (durationS / 60.0).toInt().coerceIn(1, 999)
        routeNearestIndex = 0
        routeFitZoom = computeRouteFitZoom(points)
        updateRouteProgress()
    }

    fun zoomIn() {
        userZoomDelta = (userZoomDelta + 1).coerceAtMost(3)
        notifyListeners()
    }

    fun zoomOut() {
        userZoomDelta = (userZoomDelta - 1).coerceAtLeast(-3)
        notifyListeners()
    }

    fun effectiveMapZoom(): Int {
        val speed = displaySpeedKmh
        val auto = routeFitZoom ?: when {
            navigating -> 15
            speed > 90 -> 14
            speed > 60 -> 15
            else -> 16
        }
        return (auto + userZoomDelta).coerceIn(13, 18)
    }

    private fun computeRouteFitZoom(points: List<Pair<Double, Double>>): Int? {
        if (points.size < 2) return null
        var minLat = points[0].first
        var maxLat = minLat
        var minLng = points[0].second
        var maxLng = minLng
        for (p in points) {
            minLat = minOf(minLat, p.first)
            maxLat = maxOf(maxLat, p.first)
            minLng = minOf(minLng, p.second)
            maxLng = maxOf(maxLng, p.second)
        }
        val latSpan = (maxLat - minLat).coerceAtLeast(0.002)
        val lngSpan = (maxLng - minLng).coerceAtLeast(0.002)
        val span = maxOf(latSpan, lngSpan)
        return when {
            span > 0.25 -> 13
            span > 0.12 -> 14
            span > 0.06 -> 15
            span > 0.025 -> 16
            span > 0.01 -> 17
            else -> 18
        }
    }

    fun updateRouteProgress() {
        val pts = routePoints
        if (pts.size < 2) {
            routeNearestIndex = 0
            return
        }
        var bestI = 0
        var bestD = Double.MAX_VALUE
        for (i in pts.indices) {
            val d = haversineKm(latitude, longitude, pts[i].first, pts[i].second)
            if (d < bestD) {
                bestD = d
                bestI = i
            }
        }
        routeNearestIndex = bestI
        var remKm = 0.0
        for (i in bestI until pts.size - 1) {
            remKm += haversineKm(
                pts[i].first,
                pts[i].second,
                pts[i + 1].first,
                pts[i + 1].second,
            )
        }
        navRemainingM = remKm * 1000.0
        val spd = displaySpeedKmh.coerceAtLeast(18.0)
        navEtaMin = ((navRemainingM / (spd / 3.6)) / 60.0).toInt().coerceIn(1, 999)
    }

    fun refreshNearestHospitals() {
        hospitals = CarHospitalData.nearest(latitude, longitude).map { (h, d) ->
            CarHospitalItem(
                id = h.id,
                nameAr = h.nameAr,
                subtitle = String.format("%.1f كم · %s", d, h.typeAr),
            )
        }
    }

    fun clearAlert() {
        alertTitle = null
        alertBody = null
        notifyListeners()
    }

    fun requestNavigateHospital(id: String) {
        pendingHospitalId = id
        CarRouteService.navigateToHospital(id)
    }

    /** Driver pressed ✕ on the car: clear locally + tell Flutter to stop too. */
    fun requestCancelNavigation() {
        navigating = false
        navRouting = false
        navDestName = ""
        destLat = 0.0
        destLng = 0.0
        routePoints = emptyList()
        navRemainingM = 0.0
        navEtaMin = 0
        routeNearestIndex = 0
        routeFitZoom = null
        navCancelledAtMs = System.currentTimeMillis()
        pendingCancelNav = true
        notifyListeners()
    }

    fun consumeCommand(): Map<String, Any?>? {
        if (pendingCancelNav) {
            pendingCancelNav = false
            return mapOf("action" to "cancelNavigation")
        }
        val id = pendingHospitalId ?: return null
        pendingHospitalId = null
        return mapOf("action" to "navigateHospital", "hospitalId" to id)
    }

    fun addListener(l: () -> Unit) {
        listeners.add(l)
    }

    fun removeListener(l: () -> Unit) {
        listeners.remove(l)
    }

    fun notifyVehicleSpeed() {
        notifyListeners()
    }

    fun notifyListeners() {
        mainHandler.post {
            listeners.toList().forEach { it.invoke() }
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

    fun haversineM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double =
        haversineKm(lat1, lng1, lat2, lng2) * 1000.0
}
