/** Default map center (Riyadh) when GPS is unavailable on desktop. */
export const DEFAULT_COORDS = { lat: 24.7136, lon: 46.6753 };

export type LocationSource = 'gps' | 'ip' | 'default';

export interface DriverLocation {
  lat: number;
  lon: number;
  speed: number | null;
  heading: number | null;
  source: LocationSource;
  accuracy: number | null;
}

export type GpsStatus = 'loading' | 'gps' | 'approx' | 'denied' | 'unavailable';

async function fetchIpLocation(): Promise<{ lat: number; lon: number } | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { latitude?: number; longitude?: number };
    if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return null;
    return { lat: data.latitude, lon: data.longitude };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function coordsFromPosition(pos: GeolocationPosition): DriverLocation {
  return {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    speed: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
    heading: pos.coords.heading,
    source: 'gps',
    accuracy: pos.coords.accuracy,
  };
}

export function startLocationWatch(
  onUpdate: (loc: DriverLocation) => void,
  onStatus: (status: GpsStatus) => void
): () => void {
  let stopped = false;
  let watchId: number | null = null;
  let hasLocation = false;

  const apply = (loc: DriverLocation, status: GpsStatus) => {
    if (stopped) return;
    hasLocation = true;
    onUpdate(loc);
    onStatus(status);
  };

  const runFallback = async (reason: GpsStatus) => {
    if (stopped || hasLocation) return;
    const ip = await fetchIpLocation();
    if (stopped || hasLocation) return;
    if (ip) {
      apply(
        { lat: ip.lat, lon: ip.lon, speed: null, heading: null, source: 'ip', accuracy: null },
        'approx'
      );
      return;
    }
    apply(
      {
        lat: DEFAULT_COORDS.lat,
        lon: DEFAULT_COORDS.lon,
        speed: null,
        heading: null,
        source: 'default',
        accuracy: null,
      },
      reason === 'denied' ? 'denied' : 'unavailable'
    );
  };

  const fallbackTimer = window.setTimeout(() => {
    if (!hasLocation) void runFallback('unavailable');
  }, 12000);

  if (!navigator.geolocation) {
    window.clearTimeout(fallbackTimer);
    void runFallback('unavailable');
    return () => { stopped = true; };
  }

  const onGpsSuccess = (pos: GeolocationPosition) => {
    window.clearTimeout(fallbackTimer);
    apply(coordsFromPosition(pos), 'gps');
  };

  const onGpsError = (err: GeolocationPositionError) => {
    if (hasLocation) return;
    window.clearTimeout(fallbackTimer);
    const status: GpsStatus = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
    void runFallback(status);
  };

  const startWatch = () => {
    watchId = navigator.geolocation.watchPosition(
      onGpsSuccess,
      onGpsError,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  };

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      onGpsSuccess(pos);
      startWatch();
    },
    () => startWatch(),
    { enableHighAccuracy: false, maximumAge: 120000, timeout: 8000 }
  );

  onStatus('loading');

  return () => {
    stopped = true;
    window.clearTimeout(fallbackTimer);
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
  };
}

export function gpsStatusLabel(status: GpsStatus, source?: LocationSource): string {
  if (status === 'loading') return 'جاري تحديد الموقع...';
  if (status === 'gps') return 'GPS دقيق';
  if (status === 'approx' && source === 'ip') return 'موقع تقريبي (شبكة)';
  if (status === 'denied') return 'GPS مرفوض — موقع افتراضي';
  if (status === 'unavailable') return 'GPS غير متاح — موقع افتراضي';
  return 'موقع تقريبي';
}
