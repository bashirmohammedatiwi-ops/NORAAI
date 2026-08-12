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

class RasidFinesScreen(carContext: CarContext) : Screen(carContext) {
    override fun onGetTemplate(): Template {
        CarFineStore.syncHub(carContext)
        val list = ItemList.Builder()
        val fines = CarStatusHub.fines
        val open = CarStatusHub.openFinesCount
        val cd = CarStatusHub.overSpeedCountdownSec

        if (cd > 0) {
            list.addItem(
                Row.Builder()
                    .setTitle("⚠ عدّ تنازلي: $cd ث")
                    .addText("200,000 د.ع · ${CarStatusHub.displaySpeedKmh.toInt()} / ${CarStatusHub.limitKmh.toInt()} كم/س")
                    .build(),
            )
        }

        if (fines.isEmpty()) {
            list.addItem(
                Row.Builder()
                    .setTitle("لا مخالفات مسجّلة")
                    .addText("5 ثوانٍ فوق الحد → 200,000 دينار عراقي")
                    .build(),
            )
        } else {
            fines.take(8).forEachIndexed { idx, f ->
                val icon = if (f.resolved) "✓" else "⚖"
                list.addItem(
                    Row.Builder()
                        .setTitle("$icon ${f.title}")
                        .addText(f.subtitle.ifBlank { "مخالفة سرعة" })
                        .build(),
                )
            }
        }

        return MapWithContentTemplate.Builder()
            .setContentTemplate(
                ListTemplate.Builder()
                    .setTitle("⚖ مخالفات · $open مفتوحة")
                    .setHeaderAction(Action.BACK)
                    .setSingleList(list.build())
                    .build(),
            )
            .setMapController(MapController.Builder().build())
            .build()
    }
}
