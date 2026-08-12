package com.rasid.rasid_auto

import android.content.Context
import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import java.io.File
import java.io.FileOutputStream
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import javax.net.ssl.SSLException
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.tan

/**
 * Real map tiles for the car surface:
 *  - bundled offline Baghdad base map (assets) → a real map ALWAYS shows
 *  - ancestor over-zoom: scaled parent tiles while detailed ones load
 *  - disk cache so downloaded tiles survive restarts and weak signal
 *  - never blocks the draw loop; in-flight tracking + failure backoff
 *  - binds to cellular if the car Wi-Fi claims internet but delivers none
 *  - on-screen diagnostics (loaded count + last error) for remote debugging
 */
object CarMapRenderer {
    private const val TILE = 256
    private const val UA = "RASID-Auto/1.5.4 (Android Auto Navigation)"
    private const val BACKOFF_VISIBLE_MS = 8_000L
    private const val BACKOFF_PREFETCH_MS = 20_000L
    private const val MAX_PENDING = 24

    private val PROVIDERS = listOf(
        "https://a.basemaps.cartocdn.com/dark_all/%d/%d/%d.png",
        "https://tile.openstreetmap.org/%d/%d/%d.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/%d/%d/%d.png",
    )

    private val cache = object : LruCache<String, Bitmap>(140) {
        override fun sizeOf(key: String, value: Bitmap): Int = 1
    }
    private val pending = ConcurrentHashMap.newKeySet<String>()
    private val failedAt = ConcurrentHashMap<String, Long>()
    private val assetTiles = ConcurrentHashMap.newKeySet<String>()
    private val visibleIo = Executors.newFixedThreadPool(4)
    private val prefetchIo = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private var redrawPending = false
    private var appContext: Context? = null
    private var assetMgr: AssetManager? = null
    private var diskDir: File? = null

    @Volatile var tilesReady = false
    @Volatile var lastError: String? = null
    @Volatile var loadedCount: Int = 0
    @Volatile private var consecutiveFails = 0
    @Volatile private var boundToCellular = false

    fun init(context: Context) {
        appContext = context.applicationContext
        assetMgr = context.assets
        val dir = File(context.cacheDir, "map_tiles")
        dir.mkdirs()
        diskDir = dir
        prefetchIo.execute {
            try {
                context.assets.list("map_tiles")?.forEach { zStr ->
                    context.assets.list("map_tiles/$zStr")?.forEach { xStr ->
                        context.assets.list("map_tiles/$zStr/$xStr")?.forEach { f ->
                            if (f.endsWith(".png")) {
                                assetTiles.add("$zStr/$xStr/${f.removeSuffix(".png")}")
                            }
                        }
                    }
                }
            } catch (_: Exception) {
            }
        }
    }

    fun warmCache(lat: Double, lng: Double, zoom: Int = 16) {
        prefetch(lat, lng, zoom, radius = 1)
    }

    fun draw(canvas: Canvas, width: Int, height: Int) {
        if (width <= 0 || height <= 0) return
        val lat = CarStatusHub.latitude
        val lng = CarStatusHub.longitude
        val zoom = CarStatusHub.effectiveMapZoom()
        val heading = CarStatusHub.headingDeg
        val rotate = CarStatusHub.navigating && CarStatusHub.displaySpeedKmh > 12

        canvas.drawColor(CarColors.ASPHALT)
        val scale = 2.0.pow(zoom)
        val wx = lngToWorldX(lng, scale)
        val wy = latToWorldY(lat, scale)
        val cx = width / 2.0
        val cy = height / 2.0

        canvas.save()
        if (rotate) {
            canvas.rotate((-heading).toFloat(), cx.toFloat(), cy.toFloat())
        }

        val ctX = tileX(lng, zoom)
        val ctY = tileY(lat, zoom)
        val missing = ArrayList<IntArray>(24)
        var drew = 0
        var drewExact = 0
        var visible = 0

        for (tx in ctX - 2..ctX + 2) {
            for (ty in ctY - 2..ctY + 2) {
                val left = (tx * TILE - wx + cx).toFloat()
                val top = (ty * TILE - wy + cy).toFloat()
                if (left > width + TILE || top > height + TILE ||
                    left + TILE < -TILE || top + TILE < -TILE
                ) {
                    continue
                }
                visible++
                when {
                    drawExact(canvas, zoom, tx, ty, left, top) -> {
                        drew++; drewExact++
                    }
                    drawAncestor(canvas, zoom, tx, ty, left, top) -> {
                        drew++
                        missing.add(intArrayOf(tx, ty))
                    }
                    else -> {
                        drawTilePlaceholder(canvas, left, top)
                        missing.add(intArrayOf(tx, ty))
                    }
                }
            }
        }
        tilesReady = visible == 0 || drew >= (visible * 0.55)

        // Center-out so the map appears where the driver looks first.
        missing.sortBy { (it[0] - ctX) * (it[0] - ctX) + (it[1] - ctY) * (it[1] - ctY) }
        missing.forEach { requestTile(zoom, it[0], it[1], highPriority = true) }

        drawRoute(canvas, zoom, wx, wy, cx, cy)
        drawHazards(canvas, zoom, wx, wy, cx, cy, width, height)
        if (CarStatusHub.destLat != 0.0 || CarStatusHub.destLng != 0.0) {
            drawPin(canvas, CarStatusHub.destLat, CarStatusHub.destLng, zoom, wx, wy, cx, cy)
            drawDestPulse(canvas, CarStatusHub.destLat, CarStatusHub.destLng, zoom, wx, wy, cx, cy)
        }
        if (!CarStatusHub.navigating) {
            drawHospitalDots(canvas, lat, lng, zoom, wx, wy, cx, cy, width, height)
        }
        canvas.restore()

        drawNavArrow(canvas, cx.toFloat(), cy.toFloat(), if (rotate) 0.0 else heading)
        drawBrand(canvas, width, height)
        drawVignette(canvas, width, height)
        if (visible > 0 && drewExact < visible * 0.6) {
            drawMapStatus(canvas, width, height)
        }
        prefetch(lat, lng, zoom, radius = 1)
    }

    // ---------- tiles ----------

    private fun drawExact(canvas: Canvas, z: Int, x: Int, y: Int, left: Float, top: Float): Boolean {
        val k = key(z, x, y)
        cache.get(k)?.let {
            canvas.drawBitmap(it, left, top, paint)
            return true
        }
        if (assetTiles.contains(k)) {
            val bmp = loadAssetTile(z, x, y)
            if (bmp != null) {
                cache.put(k, bmp)
                canvas.drawBitmap(bmp, left, top, paint)
                return true
            }
        }
        return false
    }

    /** Over-zoom: walk up to 4 levels for a cached/bundled parent and scale it. */
    private fun drawAncestor(canvas: Canvas, z: Int, x: Int, y: Int, left: Float, top: Float): Boolean {
        var az = z
        var ax = x
        var ay = y
        while (az > 12 && z - az < 5) {
            az--
            ax = floor(ax / 2.0).toInt()
            ay = floor(ay / 2.0).toInt()
            val k = key(az, ax, ay)
            var parent = cache.get(k)
            if (parent == null && assetTiles.contains(k)) {
                parent = loadAssetTile(az, ax, ay)
                if (parent != null) cache.put(k, parent)
            }
            if (parent != null) {
                val shift = z - az
                val scale = 1 shl shift
                val fx = x - ax * scale
                val fy = y - ay * scale
                val sub = TILE / scale
                val src = Rect(fx * sub, fy * sub, (fx + 1) * sub, (fy + 1) * sub)
                val dst = RectF(left, top, left + TILE, top + TILE)
                canvas.drawBitmap(parent, src, dst, paint)
                return true
            }
        }
        return false
    }

    private fun loadAssetTile(z: Int, x: Int, y: Int): Bitmap? {
        val mgr = assetMgr ?: return null
        return try {
            mgr.open("map_tiles/$z/$x/$y.png").use { BitmapFactory.decodeStream(it) }
        } catch (_: Exception) {
            null
        }
    }

    private fun drawTilePlaceholder(c: Canvas, left: Float, top: Float) {
        c.drawRect(left, top, left + TILE, top + TILE, Paint().apply {
            color = Color.parseColor("#10161F")
        })
    }

    private fun requestTile(z: Int, x: Int, y: Int, highPriority: Boolean) {
        val k = key(z, x, y)
        if (cache.get(k) != null) return
        val backoff = if (highPriority) BACKOFF_VISIBLE_MS else BACKOFF_PREFETCH_MS
        val failed = failedAt[k]
        if (failed != null && System.currentTimeMillis() - failed < backoff) return
        if (!pending.add(k)) return
        if (pending.size > MAX_PENDING && !highPriority) {
            pending.remove(k)
            return
        }
        val pool = if (highPriority) visibleIo else prefetchIo
        pool.execute {
            try {
                val bmp = loadTile(z, x, y)
                if (bmp != null) {
                    cache.put(k, bmp)
                    consecutiveFails = 0
                    scheduleRedraw()
                } else {
                    failedAt[k] = System.currentTimeMillis()
                    val fails = ++consecutiveFails
                    if (fails >= 6) maybeBindCellular()
                }
            } finally {
                pending.remove(k)
            }
        }
    }

    /** Memory is checked by callers; here: disk → network (with diagnostics). */
    private fun loadTile(z: Int, x: Int, y: Int): Bitmap? {
        val n = 1 shl z
        if (y < 0 || y >= n) return null
        val xw = ((x % n) + n) % n

        diskFile(z, xw, y)?.let { f ->
            if (f.exists() && f.length() > 0) {
                val bmp = BitmapFactory.decodeFile(f.absolutePath)
                if (bmp != null) return bmp
                f.delete()
            }
        }

        if (!isOnline()) {
            lastError = "لا اتصال"
            return null
        }

        var err: String? = null
        for (fmt in PROVIDERS) {
            // Locale.US is mandatory: with an Arabic device locale, %d emits
            // Arabic-Indic digits (٤٠٨٤٣) and every server answers HTTP 400.
            val url = String.format(Locale.US, fmt, z, xw, y)
            var conn: HttpURLConnection? = null
            try {
                conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 8000
                conn.readTimeout = 12000
                conn.instanceFollowRedirects = true
                conn.useCaches = false
                conn.setRequestProperty("User-Agent", UA)
                conn.setRequestProperty("Accept", "image/png,image/*")
                val code = conn.responseCode
                if (code != 200) {
                    err = "HTTP $code"
                    continue
                }
                val bmp = conn.inputStream.use { BitmapFactory.decodeStream(it) }
                if (bmp != null) {
                    saveDisk(z, xw, y, bmp)
                    loadedCount++
                    lastError = null
                    return bmp
                }
                err = "ملف تالف"
            } catch (e: UnknownHostException) {
                err = "DNS"
            } catch (e: SocketTimeoutException) {
                err = "مهلة"
            } catch (e: SSLException) {
                err = "SSL"
            } catch (e: ConnectException) {
                err = "لا يوجد مسار"
            } catch (e: Exception) {
                err = e.javaClass.simpleName
            } finally {
                try {
                    conn?.disconnect()
                } catch (_: Exception) {
                }
            }
        }
        lastError = err
        return null
    }

    /** Wireless AA: the car Wi-Fi may claim internet but route nowhere → use cellular. */
    private fun maybeBindCellular() {
        if (boundToCellular) return
        val ctx = appContext ?: return
        try {
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return
            val active = cm.activeNetwork ?: return
            val caps = cm.getNetworkCapabilities(active) ?: return
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return
            cm.allNetworks.forEach { net ->
                val c = cm.getNetworkCapabilities(net)
                if (c != null &&
                    c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
                ) {
                    boundToCellular = cm.bindProcessToNetwork(net)
                    if (boundToCellular) {
                        lastError = null
                        consecutiveFails = 0
                        failedAt.clear()
                    }
                    return
                }
            }
        } catch (_: Exception) {
        }
    }

    private fun diskFile(z: Int, x: Int, y: Int): File? {
        val dir = diskDir ?: return null
        return File(dir, "${z}_${x}_$y.png")
    }

    private fun saveDisk(z: Int, x: Int, y: Int, bmp: Bitmap) {
        val f = diskFile(z, x, y) ?: return
        try {
            FileOutputStream(f).use { out ->
                bmp.compress(Bitmap.CompressFormat.PNG, 90, out)
            }
        } catch (_: Exception) {
        }
    }

    private fun isOnline(): Boolean {
        val ctx = appContext ?: return true
        return try {
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return true
            val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } catch (_: Exception) {
            true
        }
    }

    private fun prefetch(lat: Double, lng: Double, zoom: Int, radius: Int) {
        if (pending.size > MAX_PENDING) return
        val tx = tileX(lng, zoom)
        val ty = tileY(lat, zoom)
        for (dx in -radius..radius) {
            for (dy in -radius..radius) {
                requestTile(zoom, tx + dx, ty + dy, highPriority = false)
            }
        }
    }

    private fun scheduleRedraw() {
        if (redrawPending) return
        redrawPending = true
        main.postDelayed({
            redrawPending = false
            CarStatusHub.notifyListeners()
        }, 120)
    }

    // ---------- overlays ----------

    private fun drawMapStatus(c: Canvas, w: Int, h: Int) {
        val online = isOnline()
        val err = lastError
        val loaded = loadedCount
        val title = when {
            !online -> "لا يوجد اتصال بالإنترنت"
            err != null && loaded == 0 -> "تعذّر تحميل الخريطة · $err"
            else -> "جاري تحميل الخريطة…"
        }
        val sub = when {
            !online -> "فعّل بيانات الهاتف — الخريطة الأساسية معروضة"
            loaded > 0 -> "تم تحميل $loaded · تُحفظ للاستخدام لاحقاً"
            err != null -> "إعادة المحاولة تلقائياً…"
            else -> "أول تحميل يحتاج إنترنت"
        }
        val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.MIST; textSize = 19f
            textAlign = Paint.Align.CENTER; typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        val sp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.MIST_DIM; textSize = 14f; textAlign = Paint.Align.CENTER
        }
        val tw = maxOf(tp.measureText(title), sp.measureText(sub))
        val rect = RectF(
            w / 2f - tw / 2f - 22f, h * 0.34f,
            w / 2f + tw / 2f + 22f, h * 0.34f + 64f,
        )
        c.drawRoundRect(rect, 18f, 18f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#E61A222D")
        })
        c.drawText(title, w / 2f, rect.top + 26f, tp)
        c.drawText(sub, w / 2f, rect.top + 50f, sp)
    }

    private fun drawRoute(c: Canvas, zoom: Int, wx: Double, wy: Double, cx: Double, cy: Double) {
        val pts = CarStatusHub.routePoints
        if (pts.size < 2) return
        val scale = 2.0.pow(zoom)
        val split = CarStatusHub.routeNearestIndex.coerceIn(0, pts.size - 1)

        fun mkPath(from: Int, to: Int): Path {
            val p = Path()
            for (i in from..to) {
                val x = lngToWorldX(pts[i].second, scale) - wx + cx
                val y = latToWorldY(pts[i].first, scale) - wy + cy
                if (i == from) p.moveTo(x.toFloat(), y.toFloat()) else p.lineTo(x.toFloat(), y.toFloat())
            }
            return p
        }

        if (split > 0) {
            c.drawPath(mkPath(0, split), Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.parseColor("#5A6578"); strokeWidth = 11f
                style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
            })
        }
        val up = mkPath(split, pts.size - 1)
        c.drawPath(up, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#553D9CF0"); strokeWidth = 18f
            style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
        })
        c.drawPath(up, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CarColors.INFO; strokeWidth = 10f
            style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
        })
    }

    private fun drawHazards(
        c: Canvas, zoom: Int, wx: Double, wy: Double, cx: Double, cy: Double,
        w: Int, h: Int,
    ) {
        val scale = 2.0.pow(zoom)
        CarStatusHub.hazards.forEach { hz ->
            val px = (lngToWorldX(hz.lng, scale) - wx + cx).toFloat()
            val py = (latToWorldY(hz.lat, scale) - wy + cy).toFloat()
            if (px < -30f || py < -30f || px > w + 30f || py > h + 30f) return@forEach
            val col = when (hz.kind) {
                "p" -> 0xFFFF8A00.toInt()
                "b" -> 0xFFF5B301.toInt()
                "a" -> 0xFFE53935.toInt()
                "m" -> 0xFFAB47BC.toInt()
                else -> 0xFFFF8A00.toInt()
            }
            c.drawCircle(px, py, 11f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = col })
            c.drawCircle(px, py, 11f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE; style = Paint.Style.STROKE; strokeWidth = 2f
            })
            c.drawText("!", px, py + 5f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE; textSize = 14f
                textAlign = Paint.Align.CENTER; typeface = android.graphics.Typeface.DEFAULT_BOLD
            })
        }
    }

    private fun drawHospitalDots(
        c: Canvas, lat: Double, lng: Double, zoom: Int,
        wx: Double, wy: Double, cx: Double, cy: Double, w: Int, h: Int,
    ) {
        val scale = 2.0.pow(zoom)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = CarColors.DANGER }
        CarHospitalData.nearest(lat, lng, 6).forEach { (hp, _) ->
            val px = lngToWorldX(hp.lng, scale) - wx + cx
            val py = latToWorldY(hp.lat, scale) - wy + cy
            if (px in -40.0..(w + 40).toDouble() && py in -40.0..(h + 40).toDouble()) {
                c.drawCircle(px.toFloat(), py.toFloat(), 9f, p)
                c.drawCircle(px.toFloat(), py.toFloat(), 9f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.WHITE; style = Paint.Style.STROKE; strokeWidth = 2f
                })
            }
        }
    }

    private fun drawPin(c: Canvas, lat: Double, lng: Double, zoom: Int, wx: Double, wy: Double, cx: Double, cy: Double) {
        val scale = 2.0.pow(zoom)
        val px = lngToWorldX(lng, scale) - wx + cx
        val py = latToWorldY(lat, scale) - wy + cy
        c.drawCircle(px.toFloat(), py.toFloat(), 15f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = CarColors.DANGER })
        c.drawCircle(px.toFloat(), py.toFloat(), 15f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE; style = Paint.Style.STROKE; strokeWidth = 3.5f
        })
    }

    private fun drawDestPulse(c: Canvas, lat: Double, lng: Double, zoom: Int, wx: Double, wy: Double, cx: Double, cy: Double) {
        val scale = 2.0.pow(zoom)
        val px = lngToWorldX(lng, scale) - wx + cx
        val py = latToWorldY(lat, scale) - wy + cy
        val phase = (System.currentTimeMillis() % 1400) / 1400f
        val r = 18f + phase * 22f
        c.drawCircle(px.toFloat(), py.toFloat(), r, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#44E53935"); style = Paint.Style.STROKE; strokeWidth = 3f
        })
    }

    private fun drawNavArrow(c: Canvas, cx: Float, cy: Float, heading: Double) {
        val h = Math.toRadians(heading)
        val cone = Path()
        val len = 62f
        cone.moveTo(cx, cy)
        cone.lineTo(cx + (sin(h - 0.32) * len).toFloat(), cy - (cos(h - 0.32) * len).toFloat())
        cone.lineTo(cx + (sin(h + 0.32) * len).toFloat(), cy - (cos(h + 0.32) * len).toFloat())
        cone.close()
        c.drawPath(cone, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#503D9CF0") })
        val arr = Path()
        val a = 36f
        arr.moveTo(cx + (sin(h) * a).toFloat(), cy - (cos(h) * a).toFloat())
        arr.lineTo(cx + (sin(h + 2.5) * a * 0.55).toFloat(), cy - (cos(h + 2.5) * a * 0.55).toFloat())
        arr.lineTo(cx + (sin(h - 2.5) * a * 0.55).toFloat(), cy - (cos(h - 2.5) * a * 0.55).toFloat())
        arr.close()
        c.drawCircle(cx, cy, 18f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = CarColors.INFO })
        c.drawPath(arr, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE })
    }

    private fun drawBrand(c: Canvas, w: Int, h: Int) {
        c.drawText("RASID", w - 18f, h - 14f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#668A96A5"); textSize = 16f
            textAlign = Paint.Align.RIGHT; typeface = android.graphics.Typeface.DEFAULT_BOLD
        })
    }

    private fun drawVignette(c: Canvas, w: Int, h: Int) {
        c.drawRect(0f, h * 0.58f, w.toFloat(), h.toFloat(), Paint().apply {
            shader = LinearGradient(
                0f, h * 0.58f, 0f, h.toFloat(),
                Color.TRANSPARENT, Color.parseColor("#D90B0F14"), Shader.TileMode.CLAMP,
            )
        })
    }

    // ---------- projection ----------

    private fun key(z: Int, x: Int, y: Int) = "$z/$x/$y"

    private fun tileX(lng: Double, z: Int) = floor((lng + 180.0) / 360.0 * (1 shl z)).toInt()

    private fun tileY(lat: Double, z: Int): Int {
        val r = Math.toRadians(lat)
        return floor((1.0 - ln(tan(r) + 1 / cos(r)) / Math.PI) / 2.0 * (1 shl z)).toInt()
    }

    private fun lngToWorldX(lng: Double, scale: Double) = (lng + 180.0) / 360.0 * scale * TILE

    private fun latToWorldY(lat: Double, scale: Double): Double {
        val r = Math.toRadians(lat)
        return (1.0 - ln(tan(r) + 1 / cos(r)) / Math.PI) / 2.0 * scale * TILE
    }
}
