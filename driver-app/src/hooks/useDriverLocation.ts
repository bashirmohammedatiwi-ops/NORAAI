import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createLocationWatcher,
  gpsStatusHint,
  gpsStatusLabel,
  isHighAccuracy,
  reverseGeocode,
  type DriverLocation,
  type GpsStatus,
} from '../lib/location';

export function useDriverLocation() {
  const [location, setLocation] = useState<DriverLocation | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('loading');
  const [placeName, setPlaceName] = useState('');
  const [locateTick, setLocateTick] = useState(0);
  const watcherRef = useRef<ReturnType<typeof createLocationWatcher> | null>(null);

  useEffect(() => {
    watcherRef.current = createLocationWatcher(setLocation, setGpsStatus);
    return () => watcherRef.current?.stop();
  }, []);

  useEffect(() => {
    if (!location) {
      setPlaceName('');
      return;
    }
    let cancelled = false;
    reverseGeocode(location.lat, location.lon).then((name: string) => {
      if (!cancelled) setPlaceName(name);
    });
    return () => { cancelled = true; };
  }, [location?.lat, location?.lon]);

  const locateNow = useCallback(async () => {
    const ok = await watcherRef.current?.locateNow();
    if (ok) setLocateTick((n) => n + 1);
    return ok ?? false;
  }, []);

  const restartGps = useCallback(() => {
    watcherRef.current?.restart();
  }, []);

  const isLocating = gpsStatus === 'loading' || gpsStatus === 'locating';
  const precise = isHighAccuracy(location);

  return {
    location,
    gpsStatus,
    placeName,
    locateNow,
    restartGps,
    isLocating,
    precise,
    locateTick,
    gpsLabel: gpsStatusLabel(gpsStatus),
    gpsHint: gpsStatusHint(gpsStatus),
  };
}
