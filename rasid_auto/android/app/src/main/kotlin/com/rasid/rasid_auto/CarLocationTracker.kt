package com.rasid.rasid_auto

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Looper
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * High-accuracy GPS with EMA smoothing — works when the phone app is closed.
 */
object CarLocationTracker {
    private var callback: LocationCallback? = null
    private var running = false
    private var appContext: Context? = null
    private var speedEma = 0.0
    private var headingEma = 0.0

    @SuppressLint("MissingPermission")
    fun start(context: Context) {
        appContext = context.applicationContext
        if (running) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        running = true
        val client = LocationServices.getFusedLocationProviderClient(context)
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 700L)
            .setMinUpdateIntervalMillis(350L)
            .setMinUpdateDistanceMeters(1.5f)
            .setWaitForAccurateLocation(false)
            .build()
        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val loc = result.lastLocation ?: return
                applyLocation(loc)
            }
        }
        callback = cb
        client.requestLocationUpdates(request, cb, Looper.getMainLooper())
        client.lastLocation.addOnSuccessListener { loc ->
            if (loc != null) applyLocation(loc)
        }
    }

    fun stop(context: Context) {
        if (!running) return
        callback?.let {
            LocationServices.getFusedLocationProviderClient(context)
                .removeLocationUpdates(it)
        }
        callback = null
        running = false
        speedEma = 0.0
        headingEma = 0.0
    }

    private fun applyLocation(loc: Location) {
        val ctx = appContext ?: return
        val rawKmh = (loc.speed.coerceAtLeast(0f) * 3.6f).toDouble()
        val acc = if (loc.hasSpeedAccuracy()) loc.speedAccuracyMetersPerSecond * 3.6 else 12.0
        val alpha = when {
            acc > 18 -> 0.22
            acc > 8 -> 0.38
            else -> 0.52
        }
        if (rawKmh >= 0) {
            speedEma += alpha * (rawKmh.coerceIn(0.0, 300.0) - speedEma)
        }
        if (speedEma < 2.0 && rawKmh < 2.0) speedEma = 0.0
        val calibrated = (speedEma * 1.05).coerceIn(0.0, 300.0)

        CarStatusHub.nativeSpeedKmh = calibrated
        CarStatusHub.lastNativeMs = System.currentTimeMillis()
        CarStatusHub.latitude = loc.latitude
        CarStatusHub.longitude = loc.longitude

        if (loc.hasBearing() && loc.bearing >= 0f && calibrated > 4) {
            headingEma = lerpAngle(headingEma, loc.bearing.toDouble(), 0.35)
            CarStatusHub.headingDeg = headingEma
        }

        if (System.currentTimeMillis() - CarStatusHub.lastFlutterMs > 2500) {
            val limit = CarSpeedLimit.lookup(loc.latitude, loc.longitude)
            CarStatusHub.limitKmh = limit.limitKmh
            CarStatusHub.zone = limit.zoneNameAr
        }

        CarStatusHub.refreshNearestHospitals()
        CarStatusHub.updateRouteProgress()
        CarStatusHub.updateNearestHazard()
        maybeBeepHazard()
        CarNativeViolation.tick(ctx, calibrated, CarStatusHub.limitKmh)
        CarStatusHub.notifyListeners()
    }

    private var lastHazardBeepKey: String? = null

    private fun maybeBeepHazard() {
        val key = CarStatusHub.nearestHazardKey
        val dist = CarStatusHub.nearestHazardDistM
        if (key != null && dist in 1..180 && key != lastHazardBeepKey) {
            lastHazardBeepKey = key
            CarAlarmPlayer.onHazardApproach()
        } else if (key == null) {
            lastHazardBeepKey = null
        }
    }

    private fun lerpAngle(from: Double, to: Double, t: Double): Double {
        var delta = (to - from) % 360.0
        if (delta > 180) delta -= 360.0
        if (delta < -180) delta += 360.0
        return (from + delta * t + 360.0) % 360.0
    }
}
