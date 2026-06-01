import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Popup, CircleMarker } from 'react-leaflet';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const EVENT_META: Record<string, { label: string; labelAr: string; color: string }> = {
  pothole: { label: 'Pothole', labelAr: 'حفرة', color: '#f97316' },
  accident: { label: 'Accident', labelAr: 'حادث', color: '#ef4444' },
  road_closed: { label: 'Road closed', labelAr: 'طريق مغلق', color: '#dc2626' },
  traffic_violation: { label: 'Violation', labelAr: 'مخالفة', color: '#eab308' },
  road_crack: { label: 'Crack', labelAr: 'شقوق', color: '#a855f7' },
  construction: { label: 'Construction', labelAr: 'أعمال', color: '#f59e0b' },
  flooded_road: { label: 'Flooded', labelAr: 'فيضان', color: '#3b82f6' },
  barrier: { label: 'Barrier', labelAr: 'حاجز', color: '#64748b' },
};

export default function RoadIntelligencePage() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [stats, setStats] = useState<Record<string, number | { ready?: boolean; name?: string }>>({});
  const [events, setEvents] = useState<{ id: string; event_type: string; latitude: number; longitude: number; confidence: number }[]>([]);
  const [filter, setFilter] = useState<string>('all');

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
    { label: 'Vehicles', labelAr: 'مركبات', value: stats.total_vehicles_reporting, key: 'vehicles' },
    { label: 'Potholes', labelAr: 'حفر', value: stats.potholes_detected, key: 'pothole' },
    { label: 'Accidents', labelAr: 'حوادث', value: stats.active_accidents, key: 'accident' },
    { label: 'Closed roads', labelAr: 'طرق مغلقة', value: stats.closed_roads, key: 'road_closed' },
    { label: 'Violations', labelAr: 'مخالفات', value: stats.traffic_violations, key: 'traffic_violation' },
  ];

  const filtered = filter === 'all' ? events : events.filter((e) => e.event_type === filter);

  return (
    <div className="space-y-6">
      <PageHeader title="Road Intelligence" description="Live events from driver app and fleet devices.">
        <select className="h-10 rounded-md border border-border bg-card px-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="cursor-pointer" onClick={() => setFilter('all')}>All</Badge>
        {Object.entries(EVENT_META).slice(0, 4).map(([k, v]) => (
          <Badge
            key={k}
            variant={filter === k ? 'default' : 'outline'}
            className="cursor-pointer"
            style={filter === k ? { backgroundColor: v.color } : {}}
            onClick={() => setFilter(k)}
          >
            {v.labelAr}
          </Badge>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map(({ label, labelAr, value }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">{labelAr}</p>
              <p className="text-xl font-semibold">{typeof value === 'number' ? value : 0}</p>
              <p className="text-[11px] text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Live map — {filtered.length} events</CardTitle></CardHeader>
        <CardContent className="p-0">
          <MapContainer center={[24.7136, 46.6753]} zoom={10} style={{ height: '480px', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {filtered.map((e) => {
              const meta = EVENT_META[e.event_type] ?? { label: e.event_type, labelAr: e.event_type, color: '#64748b' };
              return (
                <CircleMarker
                  key={e.id}
                  center={[e.latitude, e.longitude]}
                  radius={8}
                  pathOptions={{ color: meta.color, fillColor: meta.color, fillOpacity: 0.8 }}
                >
                  <Popup>
                    <strong>{meta.labelAr}</strong> ({meta.label})<br />
                    Confidence: {e.confidence != null ? `${(e.confidence * 100).toFixed(0)}%` : '—'}
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </CardContent>
      </Card>
    </div>
  );
}
