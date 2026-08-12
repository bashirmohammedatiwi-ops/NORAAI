package com.rasid.rasid_auto

import android.content.Intent
import android.net.Uri
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.car.app.navigation.model.MapController
import androidx.car.app.navigation.model.MapWithContentTemplate

/** Iraq emergency numbers with one-tap dialing through the car's phone UI. */
class RasidEmergencyScreen(carContext: CarContext) : Screen(carContext) {
    override fun onGetTemplate(): Template {
        val list = ItemList.Builder()
        NUMBERS.forEach { (title, sub, number) ->
            list.addItem(
                Row.Builder()
                    .setTitle(title)
                    .addText(sub)
                    .setOnClickListener { dial(number) }
                    .build(),
            )
        }
        list.addItem(
            Row.Builder()
                .setTitle("⚖ سجل المخالفات")
                .addText("${CarStatusHub.openFinesCount} مفتوحة · اضغط للعرض")
                .setOnClickListener {
                    screenManager.push(RasidFinesScreen(carContext))
                }
                .build(),
        )
        return MapWithContentTemplate.Builder()
            .setContentTemplate(
                ListTemplate.Builder()
                    .setTitle("🚨 طوارئ العراق")
                    .setHeaderAction(Action.BACK)
                    .setSingleList(list.build())
                    .build(),
            )
            .setMapController(MapController.Builder().build())
            .build()
    }

    private fun dial(number: String) {
        try {
            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number"))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            carContext.startActivity(intent)
        } catch (_: Exception) {
        }
    }

    companion object {
        private val NUMBERS = listOf(
            Triple("🚨 الطوارئ الموحدة", "911 · كل الطوارئ · ٢٤ ساعة", "911"),
            Triple("🚓 شرطة النجدة", "104 · الحالات الأمنية الطارئة", "104"),
            Triple("🚑 الإسعاف الفوري", "122 · الحالات الصحية والحوادث", "122"),
            Triple("🚒 الدفاع المدني", "115 · الحرائق والإنقاذ", "115"),
            Triple("🛡 العمليات المشتركة", "130 · البلاغات الأمنية", "130"),
        )
    }
}
