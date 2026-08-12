package com.rasid.rasid_auto

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Baghdad hospitals available on the car screen without opening the phone app. */
object CarHospitalData {
    data class Hospital(
        val id: String,
        val nameAr: String,
        val lat: Double,
        val lng: Double,
        val typeAr: String,
    )

    val all = listOf(
        Hospital("medical_city_surgical", "مدينة الطب — الجراحات", 33.3286, 44.3847, "تعليمي"),
        Hospital("yarmouk", "مستشفى اليرموك التعليمي", 33.3046, 44.3840, "تعليمي"),
        Hospital("kindi", "مستشفى الكندي", 33.3131, 44.3658, "حكومي"),
        Hospital("imam_ali", "مستشفى الإمام علي", 33.3400, 44.4000, "حكومي"),
        Hospital("sheikh_zayed", "مستشفى الشيخ زayed", 33.3520, 44.3680, "حكومي"),
        Hospital("ibn_al_nafees", "مستشفى ابن النفيس", 33.2890, 44.3710, "تخصصي"),
        Hospital("al_kadhimiya", "مستشفى الكاظمية", 33.3810, 44.3400, "حكومي"),
        Hospital("rusafa", "مستشفى الرصافة", 33.3380, 44.4120, "حكومي"),
    )

    fun nearest(lat: Double, lng: Double, count: Int = 6): List<Pair<Hospital, Double>> {
        return all.map { h ->
            h to haversineKm(lat, lng, h.lat, h.lng)
        }.sortedBy { it.second }.take(count)
    }

    fun byId(id: String): Hospital? = all.firstOrNull { it.id == id }

    private fun haversineKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).pow(2)
        return r * 2 * atan2(sqrt(a), sqrt(1 - a))
    }
}
