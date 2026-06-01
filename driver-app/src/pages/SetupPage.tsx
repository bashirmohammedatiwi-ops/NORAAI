import { useState } from 'react';
import type { DriverConfig } from '../lib/storage';

const EVENT_LABELS: Record<string, string> = {
  pothole: 'حفرة',
  accident: 'حادث',
  road_closed: 'طريق مغلق',
  traffic_violation: 'مخالفة سرعة',
};

interface Props {
  initial: DriverConfig | null;
  error: string;
  onSave: (c: DriverConfig) => Promise<void>;
}

export default function SetupPage({ initial, error, onSave }: Props) {
  const [serverUrl, setServerUrl] = useState(initial?.serverUrl ?? 'http://187.127.88.146:8080');
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');
  const [deviceId, setDeviceId] = useState(initial?.deviceId ?? '');
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [vehicleId, setVehicleId] = useState(initial?.vehicleId ?? '');
  const [speedLimit, setSpeedLimit] = useState(initial?.speedLimit ?? 80);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLocalError('');
    try {
      await onSave({ serverUrl, projectId, deviceId, apiKey, vehicleId, speedLimit });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 480 }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>NORAAI Driver</h1>
        <p style={{ color: '#94a3b8', marginBottom: 20, fontSize: 14 }}>
          إعداد جهاز السيارة — سجّل الجهاز من لوحة Fleet واحصل على API Key
        </p>

        <div style={{ marginBottom: 16, padding: 12, background: '#0f172a', borderRadius: 8, fontSize: 13 }}>
          <p style={{ marginBottom: 8, fontWeight: 600 }}>ما يكتشفه التطبيق:</p>
          {Object.entries(EVENT_LABELS).map(([k, v]) => (
            <span key={k} style={{ display: 'inline-block', margin: '4px 4px 0 0', padding: '4px 8px', background: '#334155', borderRadius: 6 }}>{v}</span>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Server URL</span>
            <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} required />
          </label>
          <label>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Project ID</span>
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} required />
          </label>
          <label>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Device ID</span>
            <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required />
          </label>
          <label>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Vehicle ID</span>
            <input value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required />
          </label>
          <label>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>API Key</span>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} required type="password" />
          </label>
          <label>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Speed limit (km/h)</span>
            <input type="number" value={speedLimit} onChange={(e) => setSpeedLimit(Number(e.target.value))} min={20} max={200} />
          </label>
          {(error || localError) && <p style={{ color: '#f87171', fontSize: 14 }}>{localError || error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Connecting...' : 'Start driving'}</button>
        </form>
      </div>
    </div>
  );
}
