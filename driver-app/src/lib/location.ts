export type LocationSource = 'gps' | 'windows';

export interface DriverLocation {
  lat: number;
  lon: number;
  speed: number | null;
  heading: number | null;
  source: LocationSource;
  accuracy: number | null;
}

export type GpsStatus = 'loading' | 'locating' | 'gps' | 'denied' | 'unavailable';

const HIGH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 25000,
};

/** Windows desktops often have no GPS — Wi‑Fi/network positioning needs this. */
const LOW_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 120000,
  timeout: 25000,
};

const WATCH_HIGH: PositionOptions = {
  ...HIGH_OPTIONS,
  timeout: 60000,
};

const WATCH_LOW: PositionOptions = {
  ...LOW_OPTIONS,
  timeout: 60000,
};

export function isValidCoords(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001) return false;
  return true;
}

export async function queryGeolocationPermission(): Promise<PermissionState | 'unknown'> {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state;
  } catch {
    return 'unknown';
  }
}

function hasNativeLocationBridge(): boolean {
  return typeof window.norai?.getNativeLocation === 'function';
}

async function getNativeLocationOnce(): Promise<DriverLocation> {
  const result = await window.norai!.getNativeLocation!();
  if (result.ok && result.lat != null && result.lon != null && isValidCoords(result.lat, result.lon)) {
    return {
      lat: result.lat,
      lon: result.lon,
      speed: result.speed ?? null,
      heading: result.heading ?? null,
      source: 'windows',
      accuracy: result.accuracy ?? null,
    };
  }
  const err = new Error(result.message || 'Native location failed') as Error & { code?: string };
  err.code = result.code || 'unavailable';
  throw err;
}

export function openSystemLocationSettings() {
  void window.norai?.openLocationSettings?.();
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&accept-language=ar,en`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return '';
    const data = (await res.json()) as { display_name?: string; address?: Record<string, string> };
    const addr = data.address;
    if (addr) {
      const parts = [addr.suburb, addr.city, addr.town, addr.village, addr.state, addr.country].filter(Boolean);
      if (parts.length) return parts.slice(0, 3).join('، ');
    }
    return data.display_name?.split(',').slice(0, 3).join('، ') ?? '';
  } catch {
    return '';
  }
}

function coordsFromPosition(pos: GeolocationPosition): DriverLocation | null {
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  if (!isValidCoords(lat, lon)) return null;
  return {
    lat,
    lon,
    speed: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
    heading: pos.coords.heading,
    source: 'gps',
    accuracy: pos.coords.accuracy,
  };
}

function isBetterCandidate(next: DriverLocation, current: DriverLocation | null): boolean {
  if (!current) return true;
  const nextAcc = next.accuracy ?? Number.MAX_VALUE;
  const curAcc = current.accuracy ?? Number.MAX_VALUE;
  return nextAcc < curAcc;
}

export function zoomForAccuracy(accuracyMeters: number | null): number {
  if (!accuracyMeters || accuracyMeters > 5000) return 14;
  if (accuracyMeters > 1000) return 15;
  if (accuracyMeters > 200) return 16;
  if (accuracyMeters > 50) return 17;
  return 18;
}

export interface LocationWatcher {
  stop: () => void;
  restart: () => void;
  locateNow: () => Promise<boolean>;
}

function getPositionOnce(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function getPositionWithFallback(onProgress?: (loc: DriverLocation) => void): Promise<DriverLocation> {
  if (hasNativeLocationBridge()) {
    try {
      const native = await getNativeLocationOnce();
      onProgress?.(native);
      return native;
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      if (code === 'denied') throw err;
    }
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocation unavailable');
  }

  try {
    const high = coordsFromPosition(await getPositionOnce(HIGH_OPTIONS));
    if (high) {
      onProgress?.(high);
      if (high.accuracy == null || high.accuracy <= 100) return high;
    }
  } catch (err) {
    const geoErr = err as GeolocationPositionError;
    if (geoErr?.code === geoErr.PERMISSION_DENIED && !hasNativeLocationBridge()) throw err;
  }

  try {
    const low = coordsFromPosition(await getPositionOnce(LOW_OPTIONS));
    if (low) {
      onProgress?.(low);
      return low;
    }
  } catch (err) {
    const geoErr = err as GeolocationPositionError;
    if (geoErr?.code === geoErr.PERMISSION_DENIED && !hasNativeLocationBridge()) throw err;
  }

  if (hasNativeLocationBridge()) {
    return getNativeLocationOnce();
  }

  throw new Error('Location timeout');
}

function acquirePreciseLocation(onProgress?: (loc: DriverLocation) => void): Promise<DriverLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }

    let best: DriverLocation | null = null;
    let highWatchId = 0;
    let lowWatchId = 0;
    let settled = false;
    let usingLowWatch = false;

    const clearWatches = () => {
      if (highWatchId) navigator.geolocation.clearWatch(highWatchId);
      if (lowWatchId) navigator.geolocation.clearWatch(lowWatchId);
      highWatchId = 0;
      lowWatchId = 0;
    };

    const finishOk = (loc: DriverLocation) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearTimeout(lowWatchTimer);
      clearWatches();
      resolve(loc);
    };

    const finishErr = (error: GeolocationPositionError | Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearTimeout(lowWatchTimer);
      clearWatches();
      reject(error);
    };

    const onPosition = (pos: GeolocationPosition) => {
      const loc = coordsFromPosition(pos);
      if (!loc) return;
      if (isBetterCandidate(loc, best)) {
        best = loc;
        onProgress?.(loc);
      }
      if (loc.accuracy != null && loc.accuracy <= 50) {
        finishOk(loc);
      }
    };

    const onWatchError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        finishErr(err);
        return;
      }
      if (best) finishOk(best);
    };

    const startLowWatch = () => {
      if (settled || usingLowWatch) return;
      usingLowWatch = true;
      lowWatchId = navigator.geolocation.watchPosition(onPosition, onWatchError, WATCH_LOW);
      void getPositionOnce(LOW_OPTIONS)
        .then(onPosition)
        .catch((err: GeolocationPositionError) => {
          if (err?.code === err.PERMISSION_DENIED) finishErr(err);
        });
    };

    const timer = window.setTimeout(() => {
      if (best) finishOk(best);
      else finishErr(new Error('Location timeout'));
    }, 45000);

    const lowWatchTimer = window.setTimeout(startLowWatch, 12000);

    highWatchId = navigator.geolocation.watchPosition(onPosition, onWatchError, WATCH_HIGH);
    void getPositionOnce(HIGH_OPTIONS)
      .then(onPosition)
      .catch((err: GeolocationPositionError) => {
        if (err?.code === err.PERMISSION_DENIED) finishErr(err);
      });
  });
}

export function createLocationWatcher(
  onUpdate: (loc: DriverLocation) => void,
  onStatus: (status: GpsStatus) => void
): LocationWatcher {
  let stopped = false;
  let highWatchId: number | null = null;
  let lowWatchId: number | null = null;
  let locating = false;
  let hasFix = false;
  let unavailableTimer: number | null = null;
  let retryTimer: number | null = null;
  let retryCount = 0;

  const clearUnavailableTimer = () => {
    if (unavailableTimer != null) {
      window.clearTimeout(unavailableTimer);
      unavailableTimer = null;
    }
  };

  const clearRetryTimer = () => {
    if (retryTimer != null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleUnavailableCheck = () => {
    clearUnavailableTimer();
    unavailableTimer = window.setTimeout(() => {
      if (!hasFix && !stopped && !locating) {
        onStatus('unavailable');
        scheduleBackgroundRetry();
      }
    }, 120000);
  };

  const scheduleBackgroundRetry = () => {
    clearRetryTimer();
    if (stopped || hasFix) return;
    retryTimer = window.setTimeout(() => {
      if (stopped || hasFix) return;
      retryCount += 1;
      onStatus('loading');
      void tryInitialFix();
    }, Math.min(15000 + retryCount * 5000, 45000));
  };

  const stopWatches = () => {
    if (highWatchId != null) {
      navigator.geolocation.clearWatch(highWatchId);
      highWatchId = null;
    }
    if (lowWatchId != null) {
      navigator.geolocation.clearWatch(lowWatchId);
      lowWatchId = null;
    }
  };

  const stop = () => {
    stopped = true;
    clearUnavailableTimer();
    clearRetryTimer();
    stopWatches();
  };

  const applyLocation = (loc: DriverLocation) => {
    if (stopped || locating) return;
    hasFix = true;
    retryCount = 0;
    clearUnavailableTimer();
    clearRetryTimer();
    onUpdate(loc);
    onStatus('gps');
  };

  const onSuccess = (pos: GeolocationPosition) => {
    if (stopped || locating) return;
    const loc = coordsFromPosition(pos);
    if (!loc) return;
    applyLocation(loc);
  };

  const onError = (err: GeolocationPositionError) => {
    if (stopped || locating) return;
    if (err.code === err.PERMISSION_DENIED && !hasNativeLocationBridge()) {
      clearUnavailableTimer();
      clearRetryTimer();
      onStatus('denied');
      return;
    }
    if (!hasFix) {
      onStatus('loading');
      if (!lowWatchId) startLowWatch();
    }
  };

  const startHighWatch = () => {
    if (!navigator.geolocation || stopped) return;
    if (highWatchId != null) return;
    highWatchId = navigator.geolocation.watchPosition(onSuccess, onError, WATCH_HIGH);
  };

  const startLowWatch = () => {
    if (!navigator.geolocation || stopped) return;
    if (lowWatchId != null) return;
    lowWatchId = navigator.geolocation.watchPosition(onSuccess, onError, WATCH_LOW);
  };

  const startWatches = () => {
    startHighWatch();
    window.setTimeout(() => {
      if (!hasFix && !stopped && !locating) startLowWatch();
    }, 12000);
  };

  const tryInitialFix = async () => {
    if (stopped) return;

    if (!hasNativeLocationBridge() && !navigator.geolocation) {
      clearUnavailableTimer();
      onStatus('unavailable');
      scheduleBackgroundRetry();
      return;
    }

    try {
      const loc = await getPositionWithFallback((progress) => {
        hasFix = true;
        onUpdate(progress);
        onStatus('loading');
      });
      applyLocation(loc);
      startWatches();
    } catch (err) {
      const nativeErr = err as Error & { code?: string };
      if (nativeErr.code === 'denied') {
        clearUnavailableTimer();
        onStatus('denied');
        return;
      }
      const geoErr = err as GeolocationPositionError;
      if (geoErr?.code === geoErr.PERMISSION_DENIED && !hasNativeLocationBridge()) {
        clearUnavailableTimer();
        onStatus('denied');
        return;
      }
      startWatches();
      scheduleUnavailableCheck();
    }
  };

  const start = async () => {
    stopWatches();
    stopped = false;
    hasFix = false;
    retryCount = 0;
    onStatus('loading');
    scheduleUnavailableCheck();
    await tryInitialFix();
  };

  const locateNow = async (): Promise<boolean> => {
    if (stopped) return false;

    locating = true;
    onStatus('locating');
    stopWatches();
    clearUnavailableTimer();
    clearRetryTimer();

    try {
      if (hasNativeLocationBridge()) {
        const loc = await getNativeLocationOnce();
        hasFix = true;
        onUpdate(loc);
        onStatus('gps');
        startWatches();
        return true;
      }

      const loc = await acquirePreciseLocation((progress) => {
        hasFix = true;
        onUpdate(progress);
        onStatus('locating');
      });
      hasFix = true;
      onUpdate(loc);
      onStatus('gps');
      startWatches();
      return true;
    } catch (err) {
      const nativeErr = err as Error & { code?: string };
      if (nativeErr.code === 'denied') {
        onStatus('denied');
      } else {
        try {
          const loc = await getPositionWithFallback((progress) => {
            hasFix = true;
            onUpdate(progress);
            onStatus('locating');
          });
          hasFix = true;
          onUpdate(loc);
          onStatus('gps');
          startWatches();
          return true;
        } catch (inner) {
          const innerNative = inner as Error & { code?: string };
          if (innerNative.code === 'denied') {
            onStatus('denied');
          } else if (!hasFix) {
            onStatus('loading');
            scheduleUnavailableCheck();
          }
        }
      }
      startWatches();
      return false;
    } finally {
      locating = false;
    }
  };

  localStorage.removeItem('norai_driver_manual_location');
  void start();

  return { stop, restart: () => { void start(); }, locateNow };
}

export function gpsStatusLabel(status: GpsStatus): string {
  if (status === 'loading') return 'جاري البحث عن GPS...';
  if (status === 'locating') return 'جاري تحديد موقع دقيق...';
  if (status === 'gps') return 'GPS دقيق';
  if (status === 'denied') return 'Windows يرفض الموقع — فعّل «تطبيقات سطح المكتب»';
  return 'GPS غير متاح — فعّل Location + Wi‑Fi ثم اضغط تحديد موقعي';
}

export function gpsStatusHint(status: GpsStatus): string {
  if (status === 'denied') {
    return 'Settings → Privacy → Location → On ثم «Let desktop apps access your location» → On. أعد تشغيل التطبيق.';
  }
  if (status === 'unavailable') {
    return 'على الحاسوب: فعّل Location وWi‑Fi (لا يوجد GPS حقيقي). على الجوال/تابلت GPS أدق.';
  }
  if (status === 'loading' || status === 'locating') {
    return 'جاري البحث عبر GPS ثم Wi‑Fi — قد يستغرق حتى 60 ثانية';
  }
  return '';
}

export function formatAccuracy(loc: DriverLocation | null): string {
  if (!loc || loc.accuracy == null) return '';
  return loc.accuracy >= 1000
    ? `±${(loc.accuracy / 1000).toFixed(1)} km`
    : `±${Math.round(loc.accuracy)} m`;
}

export function isHighAccuracy(loc: DriverLocation | null): boolean {
  if (!loc || loc.accuracy == null) return false;
  return loc.accuracy <= 100;
}
