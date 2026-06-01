import { useEffect, useRef, useState } from 'react';
import { fetchRoadSpeedLimit, type RoadSpeedLimit } from '../lib/api';
import type { DriverConfig } from '../lib/storage';
import type { DriverLocation } from '../lib/location';
import { distanceMeters } from '../lib/mapGeo';

const MIN_MOVE_M = 25;
const MIN_INTERVAL_MS = 12_000;

interface Options {
  enabled: boolean;
  fallback: number;
}

function labelForSource(meta: RoadSpeedLimit): string {
  if (meta.source === 'google') return 'حد الشارع · Google';
  if (meta.source === 'osm') return meta.road_name ? `حد الشارع · ${meta.road_name}` : 'حد الشارع · OSM';
  if (meta.source === 'osm_inferred') {
    const type = meta.highway_type ? ` (${meta.highway_type})` : '';
    return meta.road_name ? `${meta.road_name}${type}` : `حد تقديري للشارع${type}`;
  }
  if (meta.source === 'fallback') return 'حد احتياطي — لا بيانات للشارع';
  return 'حد يدوي';
}

export function useRoadSpeedLimit(
  config: DriverConfig,
  location: DriverLocation | null,
  { enabled, fallback }: Options
) {
  const [limit, setLimit] = useState(fallback);
  const [meta, setMeta] = useState<RoadSpeedLimit>({
    speed_limit_kmh: fallback,
    source: 'default',
    road_speed_available: false,
    place_id: null,
    road_name: null,
    highway_type: null,
  });
  const [loading, setLoading] = useState(false);

  const lastPos = useRef<{ lat: number; lon: number } | null>(null);
  const lastFetch = useRef(0);
  const lastLimit = useRef(fallback);
  const mounted = useRef(false);

  useEffect(() => {
    setLimit(fallback);
    lastLimit.current = fallback;
  }, [fallback]);

  useEffect(() => {
    if (!enabled || !location) return;

    const now = Date.now();
    const prev = lastPos.current;
    const first = !mounted.current;
    const moved = !prev || distanceMeters(prev.lat, prev.lon, location.lat, location.lon) >= MIN_MOVE_M;
    const due = now - lastFetch.current >= MIN_INTERVAL_MS;

    if (!first && !moved && !due) return;

    let cancelled = false;
    setLoading(true);

    fetchRoadSpeedLimit(config, location.lat, location.lon, fallback)
      .then((res) => {
        if (cancelled) return;
        mounted.current = true;
        lastPos.current = { lat: location.lat, lon: location.lon };
        lastFetch.current = Date.now();
        lastLimit.current = res.speed_limit_kmh;
        setLimit(res.speed_limit_kmh);
        setMeta(res);
      })
      .catch(() => {
        if (cancelled) return;
        setLimit(lastLimit.current);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [config, location?.lat, location?.lon, enabled, fallback]);

  const fromRoad = meta.source === 'google' || meta.source === 'osm' || meta.source === 'osm_inferred';

  return {
    limit,
    meta,
    loading,
    fromRoad,
    limitLabel: labelForSource(meta),
  };
}
