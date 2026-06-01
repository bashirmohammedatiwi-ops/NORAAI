import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import CameraPanel from '../components/CameraPanel';
import DriveMap from '../components/DriveMap';
import SpeedGauge from '../components/SpeedGauge';
import {
  fetchConfig,
  detectFrame,
  fetchNearby,
  sendTelemetry,
  type NearbyEvent,
  type ServerConfig,
} from '../lib/api';
import { buildClassMetaFromServer, getEventMeta, type EventMeta } from '../lib/eventMeta';
import {
  gpsStatusLabel,
  startLocationWatch,
  type DriverLocation,
  type GpsStatus,
} from '../lib/location';
import type { DriverConfig } from '../lib/storage';

type ViewMode = 'camera' | 'map';

interface Props {
  config: DriverConfig;
  onLogout: () => void;
}

interface Alert {
  id: string;
  type: string;
  label: string;
  confidence: number;
  time: number;
}

function AlertsPanel({
  alerts,
  nearby,
  overlay,
  classMeta,
}: {
  alerts: Alert[];
  nearby: NearbyEvent[];
  overlay?: boolean;
  classMeta: Record<string, EventMeta>;
}) {
  return (
    <aside className={`drive-aside${overlay ? ' drive-aside--overlay' : ''}`}>
      <h2 className="drive-aside__title">تنبيهات</h2>
      {alerts.length === 0 && <p className="drive-aside__empty">لا توجد تنبيهات</p>}
      {alerts.map((a) => {
        const meta = getEventMeta(a.label || a.type, classMeta);
        return (
          <div
            key={a.id}
            className="drive-alert"
            style={{ '--alert-color': meta.color } as CSSProperties}
          >
            <p className="drive-alert__label">{meta.labelAr}</p>
            <p className="drive-alert__meta">{Math.round(a.confidence * 100)}%</p>
          </div>
        );
      })}

      <h2 className="drive-aside__title drive-aside__title--spaced">أحداث قريبة</h2>
      {nearby.length === 0 && <p className="drive-aside__empty">لا أحداث في النطاق</p>}
      {nearby.slice(0, 10).map((e) => {
        const meta = getEventMeta(e.event_type, classMeta);
        return (
          <div key={e.id} className="drive-nearby">
            <span style={{ color: meta.color }}>{meta.icon} {meta.labelAr}</span>
            <span className="drive-nearby__dist">{e.distance_km} km</span>
          </div>
        );
      })}
    </aside>
  );
}

export default function DrivePage({ config, onLogout }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('camera');
  const [online, setOnline] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [location, setLocation] = useState<DriverLocation | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('loading');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [nearby, setNearby] = useState<NearbyEvent[]>([]);
  const [scanning, setScanning] = useState(false);
  const [cameraOk, setCameraOk] = useState(false);

  const classMeta = useMemo(
    () =>
      serverConfig
        ? buildClassMetaFromServer(serverConfig.project_classes, serverConfig.alert_types)
        : buildClassMetaFromServer([]),
    [serverConfig]
  );

  const pushAlert = useCallback((type: string, label: string, confidence: number) => {
    setAlerts((prev) => [
      { id: `${Date.now()}-${type}`, type, label, confidence, time: Date.now() },
      ...prev.slice(0, 9),
    ]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const cfg = await fetchConfig(config);
        if (!cancelled) {
          setServerConfig(cfg);
          setOnline(true);
          setConnectionError('');
        }
      } catch (e) {
        if (!cancelled) {
          setOnline(false);
          setConnectionError(e instanceof Error ? e.message : 'فشل الاتصال بالسيرفر');
        }
      }
    };
    sync();
    const id = window.setInterval(sync, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [config]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'environment', width: 1280, height: 720 },
        audio: false,
      })
      .then((s) => {
        stream = s;
        streamRef.current = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          void video.play();
          setCameraOk(true);
        }
      })
      .catch(() => setCameraOk(false));

    return () => {
      streamRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    if (video.paused) {
      void video.play().catch(() => {});
    }
  }, [viewMode]);

  useEffect(() => {
    return startLocationWatch(setLocation, setGpsStatus);
  }, []);

  useEffect(() => {
    if (!location) return;
    sendTelemetry(config, {
      latitude: location.lat,
      longitude: location.lon,
      speed: location.speed,
      gps_status: location.source === 'gps' ? 'ok' : 'approx',
      camera_status: cameraOk ? 'ok' : 'error',
    }).catch(() => {});
  }, [config, location, cameraOk]);

  useEffect(() => {
    if (!location) return;
    const radiusKm = viewMode === 'map' ? 15 : 10;
    const load = () => {
      fetchNearby(config, location.lat, location.lon, radiusKm).then(setNearby).catch(() => {});
    };
    load();
    const t = window.setInterval(load, viewMode === 'map' ? 15000 : 30000);
    return () => window.clearInterval(t);
  }, [config, location, viewMode]);

  const detectionEnabled = serverConfig?.detection_enabled ?? false;

  useEffect(() => {
    if (!location || !cameraOk || !detectionEnabled) return;
    const scan = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      setScanning(true);
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(async (blob) => {
        if (!blob || !location) return;
        try {
          const result = await detectFrame(config, blob, {
            latitude: location.lat,
            longitude: location.lon,
            speed: location.speed,
            speed_limit: config.speedLimit,
          });
          for (const a of result.alerts) {
            const label = a.class_name || a.label || a.type;
            pushAlert(a.type, label, a.confidence);
          }
          if (result.events_created > 0) {
            fetchNearby(config, location.lat, location.lon, viewMode === 'map' ? 15 : 10)
              .then(setNearby)
              .catch(() => {});
          }
        } finally {
          setScanning(false);
        }
      }, 'image/jpeg', 0.85);
    };
    const interval = window.setInterval(scan, 4000);
    scan();
    return () => window.clearInterval(interval);
  }, [config, location, cameraOk, pushAlert, viewMode, detectionEnabled]);

  const classNames = serverConfig?.classes ?? [];
  const eventCount = nearby.filter((e) => classNames.includes(e.event_type)).length;
  const gpsLabel = gpsStatusLabel(gpsStatus, location?.source);
  const modelMessage = serverConfig?.message;

  return (
    <div className="drive-page">
      <header className="drive-header">
        <div className="drive-header__brand">
          <strong>NORAAI Driver</strong>
          <span className="drive-header__vehicle">{config.vehicleId}</span>
          {serverConfig?.model_name && (
            <span className="drive-header__model">{serverConfig.model_name}</span>
          )}
        </div>

        <div className="view-toggle">
          <button
            type="button"
            className={`view-toggle__btn${viewMode === 'camera' ? ' view-toggle__btn--active' : ''}`}
            onClick={() => setViewMode('camera')}
          >
            📷 كاميرا
          </button>
          <button
            type="button"
            className={`view-toggle__btn${viewMode === 'map' ? ' view-toggle__btn--active' : ''}`}
            onClick={() => setViewMode('map')}
          >
            🗺 خريطة
            {eventCount > 0 && <span className="view-toggle__badge">{eventCount}</span>}
          </button>
        </div>

        <div className="drive-header__actions">
          <span className={`drive-status${online ? ' drive-status--online' : ''}`} title={connectionError}>
            {online ? '● متصل' : '● غير متصل'}
          </span>
          {detectionEnabled && scanning && <span className="drive-scan-label">Scanning...</span>}
          <button type="button" className="secondary drive-logout" onClick={onLogout}>
            خروج
          </button>
        </div>
      </header>

      {!online && connectionError && (
        <div className="drive-banner drive-banner--error">
          {connectionError} — تحقق من Server URL و API Key
        </div>
      )}

      {online && serverConfig && !detectionEnabled && modelMessage && (
        <div className="drive-banner drive-banner--warn">
          {modelMessage}
          {serverConfig.project_classes.length > 0 && (
            <span className="drive-banner__classes">
              {' '}الكلاسات: {serverConfig.project_classes.map((c) => c.name).join('، ')}
            </span>
          )}
        </div>
      )}

      {detectionEnabled && serverConfig && (
        <div className="drive-banner drive-banner--ok">
          النموذج نشط — يتعرف على: {serverConfig.classes.join('، ')}
        </div>
      )}

      {location && location.source !== 'gps' && (
        <div className="drive-banner drive-banner--warn">
          {gpsLabel} — فعّل «Location» في إعدادات Windows للدقة الأفضل
        </div>
      )}

      <main className={`drive-main drive-main--${viewMode}`}>
        {viewMode === 'map' && (
          <div className="drive-map-layout">
            {location ? (
              <DriveMap
                lat={location.lat}
                lon={location.lon}
                heading={location.heading}
                events={nearby}
                followUser={location.source === 'gps'}
                classMeta={classMeta}
              />
            ) : (
              <div className="drive-map-loading">{gpsLabel}</div>
            )}
            <div className="drive-map-overlay">
              <SpeedGauge speed={location?.speed ?? null} limit={config.speedLimit} />
            </div>
          </div>
        )}

        <CameraPanel
          videoRef={videoRef}
          canvasRef={canvasRef}
          cameraOk={cameraOk}
          scanning={detectionEnabled && scanning}
          speed={location?.speed ?? null}
          speedLimit={config.speedLimit}
          mode={viewMode === 'camera' ? 'full' : 'pip'}
        />

        <AlertsPanel
          alerts={alerts}
          nearby={nearby}
          overlay={viewMode === 'map'}
          classMeta={classMeta}
        />
      </main>

      <footer className="drive-footer">
        {location ? (
          <span className={location.source === 'gps' ? 'drive-footer__gps-ok' : 'drive-footer__gps-warn'}>
            {gpsLabel}: {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
          </span>
        ) : (
          <span>{gpsLabel}</span>
        )}
        {viewMode === 'map' && nearby.length > 0 && (
          <span>{nearby.length} حدث في النطاق</span>
        )}
      </footer>
    </div>
  );
}
