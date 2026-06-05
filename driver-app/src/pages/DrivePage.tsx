import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AlertPanel from '../components/AlertPanel';
import CameraPanel from '../components/CameraPanel';
import DashBar from '../components/DashBar';
import DriveMap from '../components/DriveMap';
import TopBar from '../components/TopBar';
import {
  fetchConfig,
  detectFrame,
  fetchNearby,
  sendTelemetry,
  warmupModel,
  type NearbyEvent,
  type ServerConfig,
} from '../lib/api';
import { captureFrameBlob } from '../lib/frameCapture';
import { buildClassMetaFromServer, getEventMeta } from '../lib/eventMeta';
import { formatDistanceKm } from '../lib/mapGeo';
import { formatAccuracy, openSystemLocationSettings } from '../lib/location';
import { useDriverLocation } from '../hooks/useDriverLocation';
import { useRoadSpeedLimit } from '../hooks/useRoadSpeedLimit';
import type { DriverConfig } from '../lib/storage';

interface Props {
  config: DriverConfig;
  onLogout: () => void;
}

export default function DrivePage({ config, onLogout }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camExpanded, setCamExpanded] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [online, setOnline] = useState(false);
  const [err, setErr] = useState('');
  const [cfg, setCfg] = useState<ServerConfig | null>(null);
  const loc = useDriverLocation();
  const fallbackLimit = config.speedLimit;
  const roadSpeed = useRoadSpeedLimit(config, loc.location, {
    enabled: Boolean(loc.location),
    fallback: fallbackLimit,
  });
  const activeLimit = loc.location ? roadSpeed.limit : fallbackLimit;
  const [alerts, setAlerts] = useState<{ id: string; type: string; label: string; confidence: number }[]>([]);
  const [nearby, setNearby] = useState<NearbyEvent[]>([]);
  const [scanning, setScanning] = useState(false);
  const [camOk, setCamOk] = useState(false);
  const detectInFlight = useRef(false);
  const lastLatencyMs = useRef(400);

  const meta = useMemo(
    () => (cfg ? buildClassMetaFromServer(cfg.project_classes, cfg.alert_types) : buildClassMetaFromServer([])),
    [cfg]
  );

  const nearest = useMemo(() => [...nearby].sort((a, b) => a.distance_km - b.distance_km)[0], [nearby]);
  const nm = nearest ? getEventMeta(nearest.event_type, meta) : null;

  const pushAlert = useCallback((type: string, label: string, confidence: number) => {
    setAlerts((p) => [{ id: `${Date.now()}`, type, label, confidence }, ...p.slice(0, 9)]);
  }, []);

  useEffect(() => {
    let x = false;
    const sync = () =>
      fetchConfig(config)
        .then((c) => {
          if (!x) {
            setCfg(c);
            setOnline(true);
            setErr('');
            if (c.detection_enabled) warmupModel(config).catch(() => {});
          }
        })
        .catch((e) => {
          if (!x) {
            setOnline(false);
            setErr(e instanceof Error ? e.message : 'خطأ');
          }
        });
    sync();
    const t = window.setInterval(sync, 20000);
    return () => {
      x = true;
      window.clearInterval(t);
    };
  }, [config]);

  useEffect(() => {
    let s: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: 1280, height: 720 }, audio: false })
      .then((st) => {
        s = st;
        streamRef.current = st;
        const v = videoRef.current;
        if (v) {
          v.srcObject = st;
          void v.play();
          setCamOk(true);
        }
      })
      .catch(() => setCamOk(false));
    return () => {
      streamRef.current = null;
      s?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    const st = streamRef.current;
    if (!v || !st) return;
    if (v.srcObject !== st) v.srcObject = st;
    if (v.paused) void v.play().catch(() => {});
  }, [camExpanded]);

  useEffect(() => {
    if (!loc.location) return;
    sendTelemetry(config, {
      latitude: loc.location.lat,
      longitude: loc.location.lon,
      speed: loc.location.speed,
      gps_status: 'ok',
      camera_status: camOk ? 'ok' : 'error',
    }).catch(() => {});
  }, [config, loc.location, camOk]);

  useEffect(() => {
    if (!loc.location) return;
    const load = () => fetchNearby(config, loc.location!.lat, loc.location!.lon, 15).then(setNearby).catch(() => {});
    load();
    const t = window.setInterval(load, 15000);
    return () => window.clearInterval(t);
  }, [config, loc.location]);

  const aiOn = cfg?.detection_enabled ?? false;

  useEffect(() => {
    if (!loc.location || !camOk || !aiOn) return;

    let cancelled = false;
    let timer = 0;

    const intervalMs = () => {
      const speed = loc.location?.speed ?? 0;
      const fast = cfg?.speed_fast_kmh ?? 35;
      const base = speed >= fast
        ? (cfg?.scan_interval_fast_ms ?? 550)
        : (cfg?.scan_interval_ms ?? 900);
      return Math.max(base, Math.round(lastLatencyMs.current * 1.15) + 80);
    };

    const schedule = (delay: number) => {
      timer = window.setTimeout(() => void loop(), delay);
    };

    const loop = async () => {
      if (cancelled || !loc.location) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c) {
        schedule(400);
        return;
      }
      if (detectInFlight.current) {
        schedule(150);
        return;
      }
      detectInFlight.current = true;
      setScanning(true);
      try {
        const blob = await captureFrameBlob(v, c, {
          maxWidth: cfg?.capture_max_width ?? 640,
          jpegQuality: cfg?.jpeg_quality ?? 0.72,
        });
        if (!blob || cancelled || !loc.location) return;
        const t0 = performance.now();
        const res = await detectFrame(config, blob, {
          latitude: loc.location.lat,
          longitude: loc.location.lon,
          speed: loc.location.speed,
          speed_limit: activeLimit,
        });
        if (res.latency_ms != null) {
          lastLatencyMs.current = res.latency_ms;
        } else {
          lastLatencyMs.current = performance.now() - t0;
        }
        for (const a of res.alerts) {
          pushAlert(a.type, a.class_name || a.label || a.type, a.confidence);
        }
        if (res.events_created > 0) {
          fetchNearby(config, loc.location.lat, loc.location.lon, 15).then(setNearby).catch(() => {});
        }
      } catch {
        /* next frame */
      } finally {
        detectInFlight.current = false;
        setScanning(false);
        if (!cancelled) schedule(intervalMs());
      }
    };

    void loop();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      detectInFlight.current = false;
    };
  }, [config, loc.location, camOk, aiOn, pushAlert, activeLimit, cfg]);

  const gpsBad =
    !loc.location &&
    (loc.gpsStatus === 'denied' ||
      loc.gpsStatus === 'unavailable' ||
      loc.gpsStatus === 'loading' ||
      loc.gpsStatus === 'locating');

  return (
    <div className="nx-app">
      <div className="nx-shell">
        <TopBar
          onLocate={() => void loc.locateNow()}
          onLogout={onLogout}
          onAlerts={() => setAlertsOpen((v) => !v)}
          locating={loc.isLocating}
          gpsOk={loc.precise}
          online={online}
          mapEvents={nearby.length}
          alertCount={alerts.length + nearby.length}
          alertsOpen={alertsOpen}
          vehicle={config.vehicleId}
        />

        <main className="nx-stage">
          {(gpsBad || (!online && err)) && (
            <div className="nx-toast">
              {!online && err && <p className="nx-toast__err">{err}</p>}
              {gpsBad && (
                <div className="nx-toast__gps">
                  <strong>{loc.gpsLabel}</strong>
                  {loc.gpsHint && <span>{loc.gpsHint}</span>}
                  <div>
                    <button type="button" onClick={() => void loc.locateNow()} disabled={loc.isLocating}>
                      تحديد
                    </button>
                    {(loc.gpsStatus === 'denied' || loc.gpsStatus === 'unavailable') && (
                      <button type="button" onClick={openSystemLocationSettings}>إعدادات</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="nx-stage__map">
            {loc.location ? (
              <DriveMap
                lat={loc.location.lat}
                lon={loc.location.lon}
                heading={loc.location.heading}
                accuracy={loc.location.accuracy}
                events={nearby}
                classMeta={meta}
                visible
                locateTick={loc.locateTick}
                onLocate={() => void loc.locateNow()}
                isLocating={loc.isLocating}
                placeName={loc.placeName}
                gpsLabel={loc.gpsLabel}
                accuracyText={formatAccuracy(loc.location)}
                online={online}
                vehicleId={config.vehicleId}
              />
            ) : (
              <div className="nx-map-load">
                <div className="nx-map-load__ring" />
                <p>{loc.gpsLabel}</p>
              </div>
            )}
          </div>

          <CameraPanel
            videoRef={videoRef}
            canvasRef={canvasRef}
            ok={camOk}
            scan={aiOn && scanning}
            expanded={camExpanded}
            onToggle={() => setCamExpanded((v) => !v)}
          />

          <AlertPanel
            alerts={alerts}
            nearby={nearby}
            open={alertsOpen}
            floating
            onToggle={() => setAlertsOpen((v) => !v)}
            classMeta={meta}
          />
        </main>

        <DashBar
          speed={loc.location?.speed ?? null}
          limit={activeLimit}
          limitLabel={loc.location ? roadSpeed.limitLabel : 'حد يدوي'}
          limitFromRoad={roadSpeed.fromRoad}
          place={loc.placeName || loc.gpsLabel}
            sub={
              loc.location
                ? [formatAccuracy(loc.location), roadSpeed.fromRoad ? roadSpeed.limitLabel : '']
                    .filter(Boolean)
                    .join(' · ')
                : ''
            }
          online={online}
          vehicle={config.vehicleId}
          scanning={aiOn && scanning}
          hazard={
            nm && nearest
              ? { icon: nm.icon, label: nm.labelAr, dist: formatDistanceKm(nearest.distance_km), color: nm.color }
              : undefined
          }
        />
      </div>
    </div>
  );
}
