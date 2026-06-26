import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Smartphone, Upload, RefreshCw, Loader2, MapPin, Gauge, Brain, Settings2,
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
}

interface MobileStatus {
  project_id: string;
  driver_model_artifact_id: string | null;
  active_model_artifact_id: string | null;
  model_ready: boolean;
  deployment: Record<string, unknown> | null;
  mobile_config: Record<string, unknown>;
  devices_online: number;
  devices_total: number;
  violations_today: number;
  events_today: number;
}

interface DeployableModel {
  id: string;
  name: string;
  architecture: string;
  model_number: number;
  is_driver_deployed: boolean;
  is_active: boolean;
  map50_95?: number;
  classes: string[];
}

interface MobileDevice {
  id: string;
  device_id: string;
  vehicle_id: string;
  gps_status: string;
  camera_status: string;
  is_online: boolean;
  latitude: number | null;
  longitude: number | null;
  last_communication: string | null;
  app_version?: string | null;
  model_version?: string | null;
  model_sha256?: string | null;
  last_sync_at?: string | null;
}

interface Violation {
  id: string;
  latitude: number;
  longitude: number;
  created_at: string | null;
  metadata: Record<string, unknown>;
}

export default function MobileCommandPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState<MobileStatus | null>(null);
  const [models, setModels] = useState<DeployableModel[]>([]);
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [promoteActive, setPromoteActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const [inferenceMode, setInferenceMode] = useState('local');
  const [minConfidence, setMinConfidence] = useState(0.45);
  const [scanFps, setScanFps] = useState(12);
  const [toleranceKmh, setToleranceKmh] = useState(5);
  const [graceSeconds, setGraceSeconds] = useState(3);
  const [cooldownSeconds, setCooldownSeconds] = useState(60);

  useEffect(() => {
    api.get<Project[]>('/api/v1/projects').then((p) => {
      setProjects(p);
      if (p.length) setProjectId(p[0].id);
    }).catch(() => {});
  }, []);

  const loadAll = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [st, mds, devs, viols] = await Promise.all([
        api.get<MobileStatus>(`/api/v1/mobile/project/${projectId}/status`),
        api.get<DeployableModel[]>(`/api/v1/mobile/project/${projectId}/models`),
        api.get<MobileDevice[]>(`/api/v1/mobile/project/${projectId}/devices`),
        api.get<Violation[]>(`/api/v1/mobile/project/${projectId}/violations?limit=50`),
      ]);
      setStatus(st);
      setModels(mds);
      setDevices(devs);
      setViolations(viols);
      const deployed = mds.find((m) => m.is_driver_deployed);
      const active = mds.find((m) => m.is_active);
      setSelectedModelId((prev) => prev || deployed?.id || active?.id || mds[0]?.id || '');

      const cfg = st.mobile_config || {};
      setInferenceMode(String(cfg.inference_mode || 'local'));
      setMinConfidence(Number(cfg.min_confidence ?? 0.45));
      setScanFps(Number(cfg.scan_fps ?? 12));
      const sv = (cfg.speed_violation || {}) as Record<string, number>;
      setToleranceKmh(Number(sv.tolerance_kmh ?? 5));
      setGraceSeconds(Number(sv.grace_seconds ?? 3));
      setCooldownSeconds(Number(sv.cooldown_seconds ?? 60));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const syncModel = async () => {
    if (!projectId || !selectedModelId) return;
    setSyncing(true);
    try {
      await api.post(
        `/api/v1/mobile/project/${projectId}/sync-model`,
        {
          model_artifact_id: selectedModelId,
          promote_as_active: promoteActive,
        },
        undefined,
        600_000,
      );
      await loadAll();
      window.alert('تم رفع الموديل ومزامنته مع تطبيق الهاتف');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'فشلت المزامنة');
    } finally {
      setSyncing(false);
    }
  };

  const saveConfig = async () => {
    if (!projectId) return;
    setSavingConfig(true);
    try {
      await api.patch(`/api/v1/mobile/project/${projectId}/config`, {
        inference_mode: inferenceMode,
        min_confidence: minConfidence,
        scan_fps: scanFps,
        speed_violation: {
          enabled: true,
          tolerance_kmh: toleranceKmh,
          grace_seconds: graceSeconds,
          cooldown_seconds: cooldownSeconds,
        },
      });
      await loadAll();
      window.alert('تم حفظ إعدادات التطبيق');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSavingConfig(false);
    }
  };

  const deployment = status?.deployment;

  return (
    <div className="space-y-6">
      <PageHeader title="مركز تحكم تطبيق الهاتف (Flutter) · Mobile Command">
        <select
          className="h-10 rounded-md border border-border bg-card px-2 text-sm"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Button variant="outline" onClick={() => void loadAll()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          تحديث
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'أجهزة متصلة', value: status?.devices_online ?? 0, icon: Smartphone },
          { label: 'مخالفات اليوم', value: status?.violations_today ?? 0, icon: Gauge },
          { label: 'أحداث اليوم', value: status?.events_today ?? 0, icon: MapPin },
          { label: 'الموديل جاهز', value: status?.model_ready ? 'نعم' : 'لا', icon: Brain },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Icon className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" /> رفع ومزامنة الموديل
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              label="اختر الموديل للتطبيق"
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  #{m.model_number} · {m.name} · {m.architecture}
                  {m.map50_95 != null ? ` · ${(m.map50_95 * 100).toFixed(1)}%` : ''}
                  {m.is_driver_deployed ? ' ✓ منشور' : ''}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={promoteActive} onChange={(e) => setPromoteActive(e.target.checked)} />
              تفعيله أيضاً كموديل موحد نشط
            </label>
            {deployment && (
              <div className="rounded-lg bg-secondary/50 p-3 text-xs space-y-1">
                <p>الإصدار: <code>{String(deployment.model_version ?? '—')}</code></p>
                <p>آخر مزامنة: {deployment.synced_at ? new Date(String(deployment.synced_at)).toLocaleString() : '—'}</p>
                <p>حجم ONNX: {deployment.onnx_size_mb != null ? `${deployment.onnx_size_mb} MB` : '—'}</p>
              </div>
            )}
            <Button className="w-full" onClick={() => void syncModel()} disabled={syncing || !selectedModelId}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              رفع ومزامنة للتطبيق
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-5 w-5" /> إعدادات التطبيق عن بُعد
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select label="وضع الاكتشاف" value={inferenceMode} onChange={(e) => setInferenceMode(e.target.value)}>
              <option value="local">محلي على الهاتف (ONNX)</option>
              <option value="server">على السيرفر</option>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">FPS المسح</label>
                <Input type="number" min={1} max={30} value={scanFps} onChange={(e) => setScanFps(+e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">حد الثقة</label>
                <Input type="number" step={0.05} min={0.1} max={1} value={minConfidence} onChange={(e) => setMinConfidence(+e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">سماحية السرعة (كم/س)</label>
                <Input type="number" min={0} max={30} value={toleranceKmh} onChange={(e) => setToleranceKmh(+e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">مدة التجاوز (ث)</label>
                <Input type="number" min={1} max={60} value={graceSeconds} onChange={(e) => setGraceSeconds(+e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">فترة منع التكرار (ث)</label>
                <Input type="number" min={5} max={600} value={cooldownSeconds} onChange={(e) => setCooldownSeconds(+e.target.value)} />
              </div>
            </div>
            <Button className="w-full" variant="outline" onClick={() => void saveConfig()} disabled={savingConfig}>
              {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              حفظ الإعدادات
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الأجهزة ({devices.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-3">الجهاز</th>
                <th className="pb-2 pr-3">المركبة</th>
                <th className="pb-2 pr-3">الحالة</th>
                <th className="pb-2 pr-3">إصدار الموديل</th>
                <th className="pb-2 pr-3">التطبيق</th>
                <th className="pb-2">آخر ظهور</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-b border-border/60">
                  <td className="py-2 pr-3 font-medium">{d.device_id}</td>
                  <td className="pr-3">{d.vehicle_id}</td>
                  <td className="pr-3">
                    <Badge variant={d.is_online ? 'success' : 'secondary'}>{d.is_online ? 'متصل' : 'غير متصل'}</Badge>
                  </td>
                  <td className="pr-3 text-xs">{d.model_version || '—'}</td>
                  <td className="pr-3 text-xs">{d.app_version || '—'}</td>
                  <td className="text-xs text-muted-foreground">
                    {d.last_communication ? new Date(d.last_communication).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">مخالفات السرعة الأخيرة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-64 overflow-y-auto">
          {violations.length === 0 && (
            <p className="text-sm text-muted-foreground">لا توجد مخالفات مسجّلة بعد.</p>
          )}
          {violations.map((v) => (
            <div key={v.id} className="rounded-lg border border-border/60 px-3 py-2 text-xs flex justify-between gap-2">
              <span>
                {v.metadata.speed != null && v.metadata.speed_limit != null
                  ? `${v.metadata.speed} كم/س (الحد ${v.metadata.speed_limit})`
                  : 'مخالفة سرعة'}
                {v.metadata.road_name ? ` · ${String(v.metadata.road_name)}` : ''}
              </span>
              <span className="text-muted-foreground shrink-0">
                {v.created_at ? new Date(v.created_at).toLocaleString() : ''}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
