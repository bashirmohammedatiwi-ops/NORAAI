package com.rasid.rasid_auto

import android.content.Intent
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.hardware.CarHardwareManager
import androidx.car.app.hardware.common.CarValue
import androidx.car.app.hardware.info.CarInfo
import androidx.car.app.hardware.info.Speed
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.Executors

class RasidCarSession : Session() {
    private val executor = Executors.newSingleThreadExecutor()

    override fun onCreateScreen(intent: Intent): Screen {
        CarRouteService.init(carContext)
        CarMapRenderer.init(carContext)
        CarStatusHub.hazardContext = carContext.applicationContext
        CarFineStore.syncHub(carContext)
        CarHazardStore.syncHub(carContext)
        CarLocationTracker.start(carContext)
        CarStatusHub.refreshNearestHospitals()
        CarMapRenderer.warmCache(CarStatusHub.latitude, CarStatusHub.longitude, 16)
        tryListenVehicleSpeed()

        lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onDestroy(owner: LifecycleOwner) {
                    CarLocationTracker.stop(carContext)
                }
            },
        )
        return RasidCarScreen(carContext)
    }

    private fun tryListenVehicleSpeed() {
        try {
            val mgr = carContext.getCarService(CarHardwareManager::class.java)
            val info: CarInfo = mgr.carInfo
            info.addSpeedListener(executor) { speed: Speed ->
                val raw = speed.rawSpeedMetersPerSecond
                if (raw.status == CarValue.STATUS_SUCCESS) {
                    val mps = raw.value
                    if (mps != null && mps >= 0f) {
                        CarStatusHub.vehicleSpeedKmh = mps * 3.6
                        CarStatusHub.notifyVehicleSpeed()
                    }
                }
            }
        } catch (_: Exception) {
        }
    }
}
