import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Truck, Smartphone } from 'lucide-react';

interface RegisteredDevice {
  id: string;
  device_id: string;
  vehicle_id: string;
  api_key: string;
  project_id: string;
}

export default function FleetPage() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [devices, setDevices] = useState<{ id: string; device_id: string; vehicle_id: string; gps_status: string; camera_status: string; is_online: boolean; last_communication: string | null }[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [registered, setRegistered] = useState<RegisteredDevice | null>(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    api.get<typeof projects>('/api/v1/projects').then((p) => {
      setProjects(p);
      if (p.length) setProjectId(p[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.get<typeof devices>(`/api/v1/fleet/${projectId}`).then(setDevices).catch(() => {});
  }, [projectId]);

  const register = async () => {
    const res = await api.post<RegisteredDevice>(`/api/v1/fleet/${projectId}`, { device_id: deviceId, vehicle_id: vehicleId });
    setRegistered(res);
    setDeviceId('');
    setVehicleId('');
    api.get<typeof devices>(`/api/v1/fleet/${projectId}`).then(setDevices);
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const driverConfigJson = registered ? JSON.stringify({
    serverUrl: window.location.origin,
    projectId: registered.project_id,
    deviceId: registered.device_id,
    vehicleId: registered.vehicle_id,
    apiKey: registered.api_key,
    speedLimit: 80,
  }, null, 2) : '';

  return (
    <div className="space-y-6">
      <PageHeader title="Fleet & Driver App" />

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-5 w-5 text-primary" /> Driver Desktop App
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Install and run from project folder:</p>
          <code className="block bg-secondary/50 rounded-lg px-3 py-2 text-xs">cd driver-app && npm install && npm run dev</code>
          <p>Detects: pothole, accident, road closed, speed violation (GPS).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Register device</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <select className="h-10 rounded-md border border-border bg-card px-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Input placeholder="Device ID (e.g. car-001)" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="max-w-xs" />
          <Input placeholder="Vehicle ID (e.g. ABC-1234)" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="max-w-xs" />
          <Button onClick={register} disabled={!deviceId || !vehicleId}>Register</Button>
        </CardContent>
      </Card>

      {registered && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-base text-amber-900">Save API Key — shown once</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-muted-foreground">API Key:</span>
              <code className="bg-card border rounded px-2 py-1 text-xs break-all">{registered.api_key}</code>
              <Button size="sm" variant="outline" onClick={() => copyText(registered.api_key, 'key')}>
                {copied === 'key' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-muted-foreground">Project ID:</span>
              <code className="text-xs">{registered.project_id}</code>
              <Button size="sm" variant="ghost" onClick={() => copyText(registered.project_id, 'proj')}>
                {copied === 'proj' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => copyText(driverConfigJson, 'json')}>
              {copied === 'json' ? 'Copied!' : 'Copy driver config JSON'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-5 w-5" /> Devices ({devices.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 pr-4">Device</th>
                <th className="pb-2 pr-4">Vehicle</th>
                <th className="pb-2 pr-4">GPS</th>
                <th className="pb-2 pr-4">Camera</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-b border-border/60">
                  <td className="py-2 pr-4 font-medium">{d.device_id}</td>
                  <td className="pr-4">{d.vehicle_id}</td>
                  <td className="pr-4">{d.gps_status}</td>
                  <td className="pr-4">{d.camera_status}</td>
                  <td className="pr-4">
                    <Badge variant={d.is_online ? 'success' : 'secondary'}>{d.is_online ? 'Online' : 'Offline'}</Badge>
                  </td>
                  <td className="text-muted-foreground">{d.last_communication ? new Date(d.last_communication).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
