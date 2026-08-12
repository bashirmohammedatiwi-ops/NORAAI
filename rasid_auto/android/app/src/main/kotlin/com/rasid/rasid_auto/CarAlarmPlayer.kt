package com.rasid.rasid_auto

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper

/** Speed-violation alarm tones on the car head unit. */
object CarAlarmPlayer {
    private val main = Handler(Looper.getMainLooper())
    private var lastTickSec = -1

    fun onCountdownStart() {
        playTone(ToneGenerator.TONE_CDMA_ALERT_INCALL_LITE, 320)
    }

    fun onCountdownTick(context: Context, sec: Int) {
        if (sec <= 0) {
            lastTickSec = -1
            return
        }
        if (sec == lastTickSec) return
        lastTickSec = sec
        playTone(
            when (sec) {
                1 -> ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD
                2 -> ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD
                else -> ToneGenerator.TONE_PROP_BEEP
            },
            if (sec <= 2) 480 else 280,
        )
    }

    fun onFineRecorded(context: Context) {
        lastTickSec = -1
        playTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 520)
        main.postDelayed({ playTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 520) }, 560)
        main.postDelayed({ playTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 720) }, 1120)
    }

    /** Single short beep when a saved pothole/bump is ~180m ahead. */
    fun onHazardApproach() {
        playTone(ToneGenerator.TONE_PROP_BEEP, 220)
    }

    fun reset() {
        lastTickSec = -1
    }

    private fun playTone(tone: Int, ms: Int) {
        main.post {
            try {
                val tg = ToneGenerator(AudioManager.STREAM_ALARM, 95)
                tg.startTone(tone, ms)
                main.postDelayed({ tg.release() }, (ms + 100).toLong())
            } catch (_: Exception) {
            }
        }
    }
}
