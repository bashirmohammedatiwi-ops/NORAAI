package com.rasid.rasid_auto

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import kotlin.math.min

/** Full-screen car HUD: center fine countdown, turn-by-turn, speed/limit/vibration. */
object CarHudRenderer {
    fun draw(canvas: Canvas, width: Int, height: Int) {
        val cd = CarStatusHub.overSpeedCountdownSec
        val speed = CarStatusHub.displaySpeedKmh.toInt().coerceAtLeast(0)
        val limit = CarStatusHub.limitKmh.toInt().coerceAtLeast(1)
        val over = speed > limit + 3
        val vib = CarStatusHub.vibrationPercent.coerceIn(0, 100)
        val zone = CarStatusHub.zone.ifBlank { "طريق عام" }

        if (cd > 0) {
            drawCenterCountdown(canvas, width, height, cd, speed, limit)
        } else {
            drawCompass(canvas, width, CarStatusHub.headingDeg)
            val turn = CarNavHelper.currentTurn()
            val showTurn = CarStatusHub.navigating && turn != null
            var topAlertShown = false
            if (showTurn) {
                drawTurnPanel(canvas, width, turn!!.icon, turn.text)
            } else {
                val alert = CarStatusHub.alertTitle
                if (!alert.isNullOrBlank()) {
                    drawTopAlert(canvas, width, height, alert)
                    topAlertShown = true
                } else if (over) {
                    drawTopAlert(canvas, width, height, "تجاوز السرعة · $speed كم/س")
                    topAlertShown = true
                }
            }
            val hzLabel = CarStatusHub.nearestHazardLabel
            if (hzLabel != null && !topAlertShown) {
                drawHazardChip(
                    canvas, width, hzLabel,
                    CarStatusHub.nearestHazardDistM, showTurn,
                )
            }
        }

        drawZoneChip(canvas, zone)
        if (cd <= 0) drawSpeedPanel(canvas, width, height, speed, over)
        drawLimitSign(canvas, width, height, limit)
        drawVibrationBar(canvas, width, height, vib)
        drawZoomBadge(canvas, width)
        drawStatsChip(canvas, width)
        if (CarStatusHub.navigating && cd <= 0) drawNavChip(canvas, width)
    }

    private fun drawCenterCountdown(c: Canvas, w: Int, h: Int, sec: Int, speed: Int, limit: Int) {
        c.drawRect(0f, 0f, w.toFloat(), h.toFloat(), Paint().apply {
            color = Color.parseColor("#B3000000")
        })

        val cx = w / 2f
        val cy = h * 0.44f
        val pulse = 1f + (5 - sec) * 0.08f
        val outerR = min(w, h) * 0.24f * pulse
        val innerR = outerR * 0.78f

        // Pulsing rings
        for (i in 0..2) {
            c.drawCircle(cx, cy, outerR * (1.08f + i * 0.08f), Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.parseColor(if (sec <= 2) "#66FF1744" else "#44E53935")
                style = Paint.Style.STROKE
                strokeWidth = (5 - i).toFloat() * 2f
            })
        }
        c.drawCircle(cx, cy, outerR, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.DANGER; style = Paint.Style.STROKE; strokeWidth = 12f
        })
        c.drawCircle(cx, cy, innerR, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor(if (sec <= 2) "#F0B71C1C" else "#E6E53935")
        })

        c.drawText("⚠ مخالفة سرعة", cx, cy - outerR - 28f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE; textAlign = Paint.Align.CENTER; textSize = 30f
            typeface = Typeface.DEFAULT_BOLD
        })
        c.drawText("$sec", cx, cy + innerR * 0.2f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE; textAlign = Paint.Align.CENTER
            textSize = innerR * 1.15f; typeface = Typeface.DEFAULT_BOLD
        })
        c.drawText("ثانية", cx, cy + innerR * 0.72f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#FFCDD2"); textAlign = Paint.Align.CENTER
            textSize = innerR * 0.26f; typeface = Typeface.DEFAULT_BOLD
        })
        c.drawText("200,000 دينار عراقي", cx, cy + outerR + 42f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.AMBER; textAlign = Paint.Align.CENTER; textSize = 28f
            typeface = Typeface.DEFAULT_BOLD
        })
        c.drawText("$speed كم/س · الحد $limit", cx, cy + outerR + 78f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.MIST; textAlign = Paint.Align.CENTER; textSize = 20f
        })
    }

    private fun drawHazardChip(c: Canvas, w: Int, label: String, distM: Int, belowTurn: Boolean) {
        val text = "⚠ $label بعد $distM م"
        val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#1A1400"); textSize = 21f
            textAlign = Paint.Align.CENTER; typeface = Typeface.DEFAULT_BOLD
        }
        val tw = tp.measureText(text)
        val top = if (belowTurn) 126f else 58f
        val rect = RectF(w / 2f - tw / 2f - 20f, top, w / 2f + tw / 2f + 20f, top + 42f)
        c.drawRoundRect(rect, 16f, 16f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.WARNING
        })
        c.drawText(text, w / 2f, rect.centerY() + 7f, tp)
    }

    private fun drawTurnPanel(c: Canvas, w: Int, icon: String, text: String) {
        val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.WHITE; textSize = 22f; typeface = Typeface.DEFAULT_BOLD
        }
        val rect = RectF(16f, 58f, w - 16f, 118f)
        c.drawRoundRect(rect, 20f, 20f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#E628323E")
        })
        c.drawText(icon, 44f, 98f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.AMBER; textSize = 36f; typeface = Typeface.DEFAULT_BOLD
        })
        c.drawText(text.take(48), 90f, 98f, tp)
    }

    private fun drawCompass(c: Canvas, w: Int, heading: Double) {
        val label = CarNavHelper.compassAr(heading)
        c.drawText("🧭 $label", w - 18f, 52f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.MIST_DIM; textSize = 17f; textAlign = Paint.Align.RIGHT
        })
    }

    private fun drawTopAlert(c: Canvas, w: Int, h: Int, text: String) {
        val rect = RectF(w * 0.08f, h * 0.04f, w * 0.92f, h * 0.12f)
        c.drawRoundRect(rect, 16f, 16f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = CarColors.WARNING })
        c.drawText(text.take(44), w / 2f, rect.centerY() + 8f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#1A1400"); textAlign = Paint.Align.CENTER
            textSize = 21f; typeface = Typeface.DEFAULT_BOLD
        })
    }

    private fun drawZoneChip(c: Canvas, zone: String) {
        val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.WHITE; textSize = 19f; typeface = Typeface.DEFAULT_BOLD
        }
        val rect = RectF(14f, 14f, 14f + tp.measureText(zone) + 34f, 50f)
        c.drawRoundRect(rect, 16f, 16f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#CC1A222D")
        })
        c.drawText(zone, rect.left + 16f, rect.centerY() + 7f, tp)
    }

    private fun drawSpeedPanel(c: Canvas, w: Int, h: Int, speed: Int, over: Boolean) {
        val pw = w * 0.26f
        val ph = h * 0.20f
        val rect = RectF(14f, h - ph - 22f, 14f + pw, h - 22f)
        c.drawRoundRect(
            RectF(rect.left + 2f, rect.top + 5f, rect.right + 2f, rect.bottom + 5f),
            20f, 20f, Paint().apply { color = Color.parseColor("#66000000") },
        )
        c.drawRoundRect(rect, 20f, 20f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#E6121822")
        })
        c.drawRoundRect(
            RectF(rect.left, rect.top + 8f, rect.left + 7f, rect.bottom - 8f),
            4f, 4f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = if (over) CarColors.DANGER else CarColors.SAFETY
            },
        )
        c.drawText("$speed", rect.centerX() + 4f, rect.centerY() + 8f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = if (over) CarColors.DANGER else CarColors.WHITE
            textAlign = Paint.Align.CENTER; textSize = ph * 0.55f; typeface = Typeface.DEFAULT_BOLD
        })
        c.drawText("كم/س", rect.centerX() + 4f, rect.bottom - 10f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.MIST_DIM; textSize = 15f; textAlign = Paint.Align.CENTER
        })
    }

    private fun drawLimitSign(c: Canvas, w: Int, h: Int, limit: Int) {
        val rr = min(w, h) * 0.068f
        val cx = w - rr - 22f
        val cy = h - rr - 42f
        c.drawCircle(cx + 2f, cy + 4f, rr, Paint().apply {
            color = Color.parseColor("#66000000")
        })
        c.drawCircle(cx, cy, rr, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE })
        c.drawCircle(cx, cy, rr, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.DANGER; style = Paint.Style.STROKE; strokeWidth = rr * 0.14f
        })
        c.drawText("$limit", cx, cy + rr * 0.28f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK; textAlign = Paint.Align.CENTER
            textSize = rr * 0.88f; typeface = Typeface.DEFAULT_BOLD
        })
    }

    private fun drawVibrationBar(c: Canvas, w: Int, h: Int, vib: Int) {
        val l = w * 0.30f
        val r = w * 0.90f
        val t = h - 36f
        val bh = 12f
        c.drawRoundRect(RectF(l, t, r, t + bh), bh / 2, bh / 2, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.LANE
        })
        val col = when {
            vib >= 40 -> CarColors.DANGER
            vib >= 20 -> CarColors.WARNING
            else -> CarColors.SAFETY
        }
        c.drawRoundRect(RectF(l, t, l + (r - l) * (vib / 100f), t + bh), bh / 2, bh / 2,
            Paint(Paint.ANTI_ALIAS_FLAG).apply { color = col })
        c.drawText("اهتزاز $vib%", l, t - 6f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.MIST; textSize = 14f; typeface = Typeface.DEFAULT_BOLD
        })
    }

    private fun drawZoomBadge(c: Canvas, w: Int) {
        val z = CarStatusHub.effectiveMapZoom()
        val d = CarStatusHub.userZoomDelta
        val s = if (d == 0) "Z$z" else "Z$z (${if (d > 0) "+" else ""}$d)"
        c.drawText("🔍 $s", w - 16f, 78f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.MIST_DIM; textSize = 15f; textAlign = Paint.Align.RIGHT
        })
        drawGpsDot(c, w)
    }

    private fun drawGpsDot(c: Canvas, w: Int) {
        val fresh = System.currentTimeMillis() - CarStatusHub.lastNativeMs < 3000
        val col = if (fresh) CarColors.SAFETY else CarColors.MIST_DIM
        c.drawCircle(w - 16f, 94f, 5f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = col })
        c.drawText("GPS", w - 26f, 99f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = col; textSize = 12f; textAlign = Paint.Align.RIGHT
            typeface = Typeface.DEFAULT_BOLD
        })
    }

    private fun drawStatsChip(c: Canvas, w: Int) {
        if (CarStatusHub.potholeCount <= 0 && CarStatusHub.bumpCount <= 0 && CarStatusHub.openFinesCount <= 0) return
        val text = buildString {
            if (CarStatusHub.potholeCount > 0) append("حفر ${CarStatusHub.potholeCount} ")
            if (CarStatusHub.bumpCount > 0) append("مطب ${CarStatusHub.bumpCount} ")
            if (CarStatusHub.openFinesCount > 0) append("⚖ ${CarStatusHub.openFinesCount}")
        }.trim()
        c.drawText(text, 16f, 78f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.AMBER; textSize = 15f; typeface = Typeface.DEFAULT_BOLD
        })
    }

    private fun drawNavChip(c: Canvas, w: Int) {
        val rem = CarStatusHub.navRemainingM
        val remL = if (rem >= 1000) String.format("%.1f كم", rem / 1000.0) else "${rem.toInt()} م"
        val text = "→ ${CarStatusHub.navDestName.take(20)} · $remL · ${CarStatusHub.navEtaMin} د"
        val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.WHITE; textSize = 18f; typeface = Typeface.DEFAULT_BOLD
        }
        val tw = tp.measureText(text)
        val rect = RectF(w / 2f - tw / 2f - 12f, 124f, w / 2f + tw / 2f + 12f, 154f)
        c.drawRoundRect(rect, 14f, 14f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#CC2563EB")
        })
        c.drawText(text, w / 2f, 144f, tp.apply { textAlign = Paint.Align.CENTER })
    }
}
