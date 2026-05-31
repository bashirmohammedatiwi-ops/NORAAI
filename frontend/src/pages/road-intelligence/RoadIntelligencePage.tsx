import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function RoadIntelligencePage() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [stats, setStats] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<{ id: string; event_type: string; latitude: number; longitude: number; confidence: number }[]>([]);

  useEffect(() => {
    api.get<typeof projects>('/api/v1/projects').then((p) => {
      setProjects(p);
      if (p.length) setProjectId(p[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const load = () => {
      api.get<typeof stats>(`/api/v1/road-intelligence/${projectId}/stats`).then(setStats).catch(() => {});
      api.get<typeof events>(`/api/v1/road-intelligence/${projectId}/events`).then(setEvents).catch(() => {});
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [projectId]);

  const kpis = [
    { label: 'Vehicles Reporting', value: stats.total_vehicles_reporting },
    { label: 'Road Issues', value: stats.road_issues_detected },
    { label: 'Active Accidents', value: stats.active_accidents },
    { label: 'Closed Roads', value: stats.closed_roads },
    { label: 'Potholes', value: stats.potholes_detected },
    { label: 'Violations', value: stats.traffic_violations },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Road Intelligence Center</h1>
        <select className="h-10 rounded border border-border bg-background px-2" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold">{value ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Interactive GIS Map</CardTitle></CardHeader>
        <CardContent className="p-0">
          <MapContainer center={[24.7136, 46.6753]} zoom={10} style={{ height: '500px', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {events.map((e) => (
              <Marker key={e.id} position={[e.latitude, e.longitude]}>
                <Popup>
                  <strong>{e.event_type}</strong><br />
                  Confidence: {(e.confidence * 100).toFixed(0)}%
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </CardContent>
      </Card>
    </div>
  );
}
