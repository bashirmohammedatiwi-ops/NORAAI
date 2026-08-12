package com.rasid.rasid_auto

import androidx.car.app.CarContext
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarColor
import androidx.car.app.model.DateTimeWithZone
import androidx.car.app.model.Distance
import androidx.car.app.model.Template
import androidx.car.app.navigation.model.MessageInfo
import androidx.car.app.navigation.model.NavigationTemplate
import androidx.car.app.navigation.model.RoutingInfo
import androidx.car.app.navigation.model.Step
import androidx.car.app.navigation.model.TravelEstimate
import java.util.TimeZone
import java.util.concurrent.TimeUnit

class RasidCarScreen(carContext: CarContext) : CarMapScreen(carContext) {
    override fun onGetTemplate(): Template {
        val speed = CarStatusHub.displaySpeedKmh.toInt().coerceAtLeast(0)
        val limit = CarStatusHub.limitKmh.toInt().coerceAtLeast(1)
        val over = speed > limit + 3
        val cd = CarStatusHub.overSpeedCountdownSec
        val zone = CarStatusHub.zone.ifBlank { "طريق عام" }
        val turn = CarNavHelper.currentTurn()

        val navInfo = when {
            cd > 0 -> MessageInfo.Builder("⚠ $cd")
                .setText("مخالفة · 200,000 د.ع · $speed/$limit")
                .build()

            CarStatusHub.navRouting -> MessageInfo.Builder("رسم المسار…")
                .setText(CarStatusHub.navDestName)
                .build()

            CarStatusHub.navigating && turn != null -> {
                val rem = CarStatusHub.navRemainingM.coerceAtLeast(1.0)
                RoutingInfo.Builder()
                    .setCurrentStep(
                        Step.Builder("${turn.icon} ${turn.text}")
                            .setRoad(CarStatusHub.navDestName.take(32))
                            .build(),
                        Distance.create(
                            if (rem >= 1000) rem / 1000.0 else rem,
                            if (rem >= 1000) Distance.UNIT_KILOMETERS else Distance.UNIT_METERS,
                        ),
                    )
                    .build()
            }

            else -> MessageInfo.Builder("$speed كم/س")
                .setText("$zone · حد $limit · ${CarNavHelper.compassAr(CarStatusHub.headingDeg)}")
                .build()
        }

        val builder = NavigationTemplate.Builder()
            .setNavigationInfo(navInfo)
            .setBackgroundColor(
                when {
                    cd > 0 || over -> CarColor.RED
                    speed > limit - 8 && speed > 5 -> CarColor.YELLOW
                    else -> CarColor.DEFAULT
                },
            )
            .setActionStrip(buildActions())

        if (CarStatusHub.navigating && CarStatusHub.navRemainingM > 0 && !CarStatusHub.navRouting) {
            builder.setDestinationTravelEstimate(buildTravelEstimate())
        }
        return builder.build()
    }

    private fun buildActions(): ActionStrip {
        val b = ActionStrip.Builder()
            .addAction(
                Action.Builder().setTitle("＋").setOnClickListener {
                    CarStatusHub.zoomIn(); invalidate(); redraw()
                }.build(),
            )
        if (CarStatusHub.navigating || CarStatusHub.navRouting) {
            b.addAction(
                Action.Builder().setTitle("✕ إلغاء").setOnClickListener {
                    CarStatusHub.requestCancelNavigation()
                    invalidate(); redraw()
                }.build(),
            )
            b.addAction(
                Action.Builder().setTitle("🏥").setOnClickListener {
                    screenManager.push(RasidHospitalsScreen(carContext))
                }.build(),
            )
        } else {
            b.addAction(
                Action.Builder().setTitle("－").setOnClickListener {
                    CarStatusHub.zoomOut(); invalidate(); redraw()
                }.build(),
            )
            b.addAction(
                Action.Builder().setTitle("🏥").setOnClickListener {
                    screenManager.push(RasidHospitalsScreen(carContext))
                }.build(),
            )
        }
        b.addAction(
            Action.Builder().setTitle("🚨").setOnClickListener {
                screenManager.push(RasidEmergencyScreen(carContext))
            }.build(),
        )
        return b.build()
    }

    private fun buildTravelEstimate(): TravelEstimate {
        val rem = CarStatusHub.navRemainingM.coerceAtLeast(1.0)
        val etaMin = CarStatusHub.navEtaMin.coerceIn(1, 999)
        val distance = if (rem >= 1000) {
            Distance.create(rem / 1000.0, Distance.UNIT_KILOMETERS)
        } else {
            Distance.create(rem, Distance.UNIT_METERS)
        }
        val arrivalMs = System.currentTimeMillis() + TimeUnit.MINUTES.toMillis(etaMin.toLong())
        return TravelEstimate.Builder(distance, DateTimeWithZone.create(arrivalMs, TimeZone.getDefault()))
            .setRemainingTimeSeconds(TimeUnit.MINUTES.toSeconds(etaMin.toLong()))
            .setRemainingTimeColor(CarColor.GREEN)
            .setRemainingDistanceColor(CarColor.BLUE)
            .build()
    }
}
