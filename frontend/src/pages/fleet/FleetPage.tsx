import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function FleetPage() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [devices, setDevices] = useState<{ id: string; device_id: string; vehicle_id: string; gps_status: string; camera_status: string; is_online: boolean; last_communication: string | null }[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [vehicleId, setVehicleId] = useState('');

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
    await api.post(`/api/v1/fleet/${projectId}`, { device_id: deviceId, vehicle_id: vehicleId });
    setDeviceId('');
    setVehicleId('');
    api.get<typeof devices>(`/api/v1/fleet/${projectId}`).then(setDevices);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Fleet Management</h1>

      <Card>
        <CardHeader><CardTitle>Register Device</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <select className="h-10 rounded border border-border bg-background px-2" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Input placeholder="Device ID" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
          <Input placeholder="Vehicle ID" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} />
          <Button onClick={register}>Register</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Devices ({devices.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2">Device ID</th>
                <th className="pb-2">Vehicle ID</th>
                <th className="pb-2">GPS</th>
                <th className="pb-2">Camera</th>
                <th className="pb-2">Online</th>
                <th className="pb-2">Last Comm</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-b border-border">
                  <td className="py-2">{d.device_id}</td>
                  <td>{d.vehicle_id}</td>
                  <td>{d.gps_status}</td>
                  <td>{d.camera_status}</td>
                  <td><span className={d.is_online ? 'text-green-400' : 'text-red-400'}>{d.is_online ? 'Online' : 'Offline'}</span></td>
                  <td className="text-muted-foreground">{d.last_communication ? new Date(d.last_communication).toLocaleString() : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
