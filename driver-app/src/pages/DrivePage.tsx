import { useCallback, useEffect, useRef, useState } from 'react';
import type { DriverConfig } from '../lib/storage';
import { detectFrame, fetchNearby, sendTelemetry, type NearbyEvent } from '../lib/api';

const LABELS: Record<string, string> = {
  pothole: 'حفرة',
  accident: 'حادث',
  road_closed: 'طريق مغلق',
  traffic_violation: 'مخالفة سرعة',
  speed_violation: 'تجاوز سرعة',
};

const COLORS: Record<string, string> = {
  pothole: '#f97316',
  accident: '#ef4444',
  road_closed: '#dc2626',
  traffic_violation: '#eab308',
  speed_violation: '#eab308',
};

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

export default function DrivePage({ config, onLogout }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [online, setOnline] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lon: number; speed: number | null } | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [nearby, setNearby] = useState<NearbyEvent[]>([]);
  const [scanning, setScanning] = useState(false);
  const [cameraOk, setCameraOk] = useState(false);

  const pushAlert = useCallback((type: string, label: string, confidence: number) => {
    setAlerts((prev) => [
      { id: `${Date.now()}-${type}`, type, label, confidence, time: Date.now() },
      ...prev.slice(0, 9),
    ]);
  }, []);

  // Camera
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 1280, height: 720 }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
          setCameraOk(true);
        }
      })
      .catch(() => setCameraOk(false));
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // GPS + telemetry every 20s
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const speed = pos.coords.speed != null ? pos.coords.speed * 3.6 : null;
        setGps({ lat, lon, speed });
        try {
          await sendTelemetry(config, {
            latitude: lat,
            longitude: lon,
            speed,
            gps_status: 'ok',
            camera_status: cameraOk ? 'ok' : 'error',
          });
          setOnline(true);
        } catch {
          setOnline(false);
        }
      },
      () => setOnline(false),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [config, cameraOk]);

  // Nearby events every 30s
  useEffect(() => {
    if (!gps) return;
    const load = () => {
      fetchNearby(config, gps.lat, gps.lon).then(setNearby).catch(() => {});
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [config, gps]);

  // Frame scan every 4s
  useEffect(() => {
    if (!gps || !cameraOk) return;
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
        if (!blob || !gps) return;
        try {
          const result = await detectFrame(config, blob, {
            latitude: gps.lat,
            longitude: gps.lon,
            speed: gps.speed,
            speed_limit: config.speedLimit,
          });
          for (const a of result.alerts) {
            pushAlert(a.type, a.label, a.confidence);
          }
          setOnline(true);
        } catch {
          setOnline(false);
        } finally {
          setScanning(false);
        }
      }, 'image/jpeg', 0.85);
    };
    const interval = setInterval(scan, 4000);
    scan();
    return () => clearInterval(interval);
  }, [config, gps, cameraOk, pushAlert]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      {/* Top bar */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
        <div>
          <strong>NORAAI Driver</strong>
          <span style={{ marginRight: 12, fontSize: 13, color: '#94a3b8' }}>{config.vehicleId}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: online ? '#4ade80' : '#f87171' }}>{online ? '● Online' : '● Offline'}</span>
          {gps?.speed != null && (
            <span style={{ color: gps.speed > config.speedLimit ? '#eab308' : '#94a3b8' }}>
              {Math.round(gps.speed)} km/h / {config.speedLimit}
            </span>
          )}
          {scanning && <span style={{ color: '#60a5fa' }}>Scanning...</span>}
          <button className="secondary" onClick={onLogout} style={{ padding: '6px 12px', fontSize: 12 }}>Logout</button>
        </div>
      </header>

      <main style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 0, minHeight: 0 }}>
        {/* Camera */}
        <div style={{ position: 'relative', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {!cameraOk && (
            <p style={{ position: 'absolute', color: '#f87171' }}>Camera not available</p>
          )}
        </div>

        {/* Alerts panel */}
        <aside style={{ background: '#1e293b', borderRight: '1px solid #334155', overflow: 'auto', padding: 12 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>تنبيهات</h2>
          {alerts.length === 0 && <p style={{ color: '#64748b', fontSize: 14 }}>لا توجد تنبيهات</p>}
          {alerts.map((a) => (
            <div key={a.id} style={{
              marginBottom: 8, padding: 12, borderRadius: 8,
              background: `${COLORS[a.type] ?? '#334155'}22`,
              borderRight: `4px solid ${COLORS[a.type] ?? '#64748b'}`,
            }}>
              <p style={{ fontWeight: 700 }}>{LABELS[a.label] ?? LABELS[a.type] ?? a.type}</p>
              <p style={{ fontSize: 12, color: '#94a3b8' }}>{Math.round(a.confidence * 100)}%</p>
            </div>
          ))}

          <h2 style={{ fontSize: 16, margin: '20px 0 12px' }}>أحداث قريبة</h2>
          {nearby.length === 0 && <p style={{ color: '#64748b', fontSize: 14 }}>لا أحداث في النطاق</p>}
          {nearby.slice(0, 8).map((e) => (
            <div key={e.id} style={{ marginBottom: 6, padding: 8, background: '#0f172a', borderRadius: 6, fontSize: 13 }}>
              <span style={{ color: COLORS[e.event_type] ?? '#94a3b8' }}>{LABELS[e.event_type] ?? e.event_type}</span>
              <span style={{ color: '#64748b', marginRight: 8 }}>{e.distance_km} km</span>
            </div>
          ))}
        </aside>
      </main>

      {/* GPS footer */}
      <footer style={{ padding: '8px 16px', background: '#0f172a', fontSize: 12, color: '#64748b', display: 'flex', gap: 16 }}>
        {gps ? (
          <>
            <span>GPS: {gps.lat.toFixed(5)}, {gps.lon.toFixed(5)}</span>
          </>
        ) : (
          <span>Waiting for GPS...</span>
        )}
      </footer>
    </div>
  );
}
