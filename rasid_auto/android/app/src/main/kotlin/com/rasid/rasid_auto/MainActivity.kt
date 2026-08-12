package com.rasid.rasid_auto

import android.os.Handler
import android.os.Looper
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val carChannel = "com.rasid.auto/car"
    private val main = Handler(Looper.getMainLooper())

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, carChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "pushStatus" -> {
                        val prevCd = CarStatusHub.overSpeedCountdownSec
                        CarStatusHub.hazardContext = applicationContext
                        CarStatusHub.updateFromFlutter(call.arguments as? Map<*, *>)
                        val cd = CarStatusHub.overSpeedCountdownSec
                        if (cd != prevCd) {
                            if (cd > 0) {
                                if (prevCd == 0) CarAlarmPlayer.onCountdownStart()
                                CarAlarmPlayer.onCountdownTick(applicationContext, cd)
                            } else {
                                CarAlarmPlayer.reset()
                            }
                        }
                        CarFineStore.mergeExternal(applicationContext, CarStatusHub.flutterFines)
                        result.success(true)
                    }
                    "playCountdownAlarm" -> {
                        val sec = (call.argument<Number>("sec") ?: 0).toInt()
                        if (sec > 0) {
                            CarAlarmPlayer.onCountdownTick(applicationContext, sec)
                        } else {
                            CarAlarmPlayer.reset()
                        }
                        result.success(true)
                    }
                    "clearAlert" -> {
                        CarStatusHub.clearAlert()
                        result.success(true)
                    }
                    "pollCarCommand" -> {
                        result.success(CarStatusHub.consumeCommand())
                    }
                    "getVehicleSpeed" -> {
                        result.success(CarStatusHub.displaySpeedKmh)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
