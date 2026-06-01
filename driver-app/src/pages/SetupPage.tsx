import { useState } from 'react';
import type { DriverConfig } from '../lib/storage';

const TAGS = ['حفرة', 'حادث', 'طريق مغلق', 'سرعة'];

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
  const [localErr, setLocalErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLocalErr('');
    try {
      await onSave({ serverUrl, projectId, deviceId, apiKey, vehicleId, speedLimit });
    } catch (err) {
      setLocalErr(err instanceof Error ? err.message : 'فشل');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nx-setup">
      <div className="nx-setup__bg" aria-hidden="true" />

      <div className="nx-setup__card">
        <header>
          <p>NORAAI · DRIVER</p>
          <h1>ربط المركبة</h1>
          <span>سجّل الجهاز من Fleet واحصل على API Key</span>
        </header>

        <div className="nx-setup__tags">
          {TAGS.map((t) => (
            <i key={t}>{t}</i>
          ))}
        </div>

        <form onSubmit={submit}>
          <label>
            <span>Server URL</span>
            <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} required dir="ltr" />
          </label>
          <div className="nx-setup__row">
            <label>
              <span>Project ID</span>
              <input value={projectId} onChange={(e) => setProjectId(e.target.value)} required dir="ltr" />
            </label>
            <label>
              <span>Device ID</span>
              <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required dir="ltr" />
            </label>
          </div>
          <label>
            <span>Vehicle ID</span>
            <input value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required />
          </label>
          <label>
            <span>API Key</span>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" required dir="ltr" />
          </label>
          <label className="nx-setup__limit">
            <span>حد سرعة احتياطي (km/h)</span>
            <span className="nx-setup__hint">يُستخدم عند عدم توفر بيانات Google للشارع</span>
            <input
              type="number"
              value={speedLimit}
              onChange={(e) => setSpeedLimit(Number(e.target.value))}
              min={20}
              max={200}
            />
          </label>

          {(error || localErr) && <p className="nx-setup__err">{localErr || error}</p>}

          <button type="submit" disabled={loading}>{loading ? 'جاري الاتصال…' : 'بدء القيادة'}</button>
        </form>
      </div>
    </div>
  );
}
