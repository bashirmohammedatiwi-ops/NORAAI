package com.rasid.rasid_auto

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.car.app.navigation.model.MapController
import androidx.car.app.navigation.model.MapWithContentTemplate

class RasidHospitalsScreen(carContext: CarContext) : Screen(carContext) {
    override fun onGetTemplate(): Template {
        if (CarStatusHub.hospitals.isEmpty()) {
            CarStatusHub.refreshNearestHospitals()
        }
        val list = ItemList.Builder()
        val hospitals = CarStatusHub.hospitals

        if (CarStatusHub.navRouting) {
            list.addItem(
                Row.Builder()
                    .setTitle("⏳ جاري رسم المسار…")
                    .addText(CarStatusHub.navDestName)
                    .build(),
            )
        }

        if (CarStatusHub.navigating || CarStatusHub.navRouting) {
            list.addItem(
                Row.Builder()
                    .setTitle("✕ إلغاء المسار الحالي")
                    .addText(CarStatusHub.navDestName.ifBlank { "مسار نشط" })
                    .setOnClickListener {
                        CarStatusHub.requestCancelNavigation()
                        screenManager.popToRoot()
                    }
                    .build(),
            )
        }

        if (hospitals.isEmpty()) {
            list.addItem(
                Row.Builder()
                    .setTitle("فعّل GPS")
                    .addText("اسمح بالموقع لتطبيق RASID Auto على الهاتف")
                    .build(),
            )
        } else {
            hospitals.forEachIndexed { idx, h ->
                list.addItem(
                    Row.Builder()
                        .setTitle("${idx + 1}. ${h.nameAr}")
                        .addText("${h.subtitle} · اضغط للمسار")
                        .setOnClickListener {
                            CarStatusHub.requestNavigateHospital(h.id)
                            screenManager.popToRoot()
                        }
                        .build(),
                )
            }
        }

        val title = if (CarStatusHub.navigating) {
            "🏥 مستشفيات · مسار: ${CarStatusHub.navDestName.take(18)}"
        } else {
            "🏥 مستشفيات قريبة"
        }

        return MapWithContentTemplate.Builder()
            .setContentTemplate(
                ListTemplate.Builder()
                    .setTitle(title)
                    .setHeaderAction(Action.BACK)
                    .setActionStrip(
                        androidx.car.app.model.ActionStrip.Builder()
                            .addAction(
                                Action.Builder()
                                    .setTitle("↻")
                                    .setOnClickListener {
                                        CarStatusHub.refreshNearestHospitals()
                                        invalidate()
                                    }
                                    .build(),
                            )
                            .addAction(
                                Action.Builder()
                                    .setTitle("⚖")
                                    .setOnClickListener {
                                        screenManager.push(RasidFinesScreen(carContext))
                                    }
                                    .build(),
                            )
                            .build(),
                    )
                    .setSingleList(list.build())
                    .build(),
            )
            .setMapController(MapController.Builder().build())
            .build()
    }
}
