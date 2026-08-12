package com.rasid.rasid_auto

import android.os.Handler
import android.os.Looper
import android.view.Surface
import androidx.car.app.AppManager
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.SurfaceCallback
import androidx.car.app.SurfaceContainer
import androidx.car.app.navigation.model.MapController
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

abstract class CarMapScreen(carContext: CarContext) : Screen(carContext), SurfaceCallback {
    protected var surface: Surface? = null
    protected var surfaceW = 0
    protected var surfaceH = 0

    private val hubListener: () -> Unit = {
        redraw()
        invalidate()
    }
    private val main = Handler(Looper.getMainLooper())
    private var refreshTicks = 0
    private var refreshRunning = false
    private val refreshLoop = object : Runnable {
        override fun run() {
            if (!refreshRunning) return
            redraw()
            invalidate()
            refreshTicks++
            // Fast while tiles stream in, then a slow pulse for ETA/animation.
            val delay = if (refreshTicks < 34) 350L else 1000L
            main.postDelayed(this, delay)
        }
    }

    init {
        CarStatusHub.addListener(hubListener)
        try {
            carContext.getCarService(AppManager::class.java).setSurfaceCallback(this)
        } catch (_: Exception) {
        }
        lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onDestroy(owner: LifecycleOwner) {
                    CarStatusHub.removeListener(hubListener)
                    main.removeCallbacks(refreshLoop)
                }
            },
        )
    }

    protected fun mapController(): MapController = MapController.Builder().build()

    protected fun startRefreshLoop() {
        refreshTicks = 0
        refreshRunning = true
        main.removeCallbacks(refreshLoop)
        main.post(refreshLoop)
    }

    protected fun redraw() {
        val s = surface ?: return
        if (surfaceW <= 0 || surfaceH <= 0) return
        val canvas = try {
            s.lockHardwareCanvas() ?: s.lockCanvas(null)
        } catch (_: Exception) {
            null
        } ?: return
        try {
            CarMapRenderer.draw(canvas, surfaceW, surfaceH)
            CarHudRenderer.draw(canvas, surfaceW, surfaceH)
        } finally {
            try {
                s.unlockCanvasAndPost(canvas)
            } catch (_: Exception) {
            }
        }
    }

    override fun onSurfaceAvailable(container: SurfaceContainer) {
        surface = container.surface
        surfaceW = container.width
        surfaceH = container.height
        CarMapRenderer.warmCache(CarStatusHub.latitude, CarStatusHub.longitude)
        startRefreshLoop()
        redraw()
    }

    override fun onSurfaceDestroyed(container: SurfaceContainer) {
        refreshRunning = false
        main.removeCallbacks(refreshLoop)
        surface = null
    }

    override fun onVisibleAreaChanged(visibleArea: android.graphics.Rect) = redraw()

    override fun onStableAreaChanged(stableArea: android.graphics.Rect) = redraw()
}
