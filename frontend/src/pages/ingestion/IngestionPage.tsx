import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const sources = [
  { value: 'manual_upload', label: 'Manual Upload' },
  { value: 'vehicle_device', label: 'Vehicle Device' },
  { value: 'mobile_app', label: 'Mobile App' },
  { value: 'traffic_camera', label: 'Traffic Camera' },
  { value: 'government_camera', label: 'Government Camera' },
  { value: 'drone_camera', label: 'Drone Camera' },
];

export default function IngestionPage() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [source, setSource] = useState('manual_upload');
  const [stats, setStats] = useState<Record<string, number>>({});
  const [images, setImages] = useState<{ id: string; filename: string; status: string; quality_score: number | null; source_type: string }[]>([]);

  useEffect(() => {
    api.get<typeof projects>('/api/v1/projects').then((p) => {
      setProjects(p);
      if (p.length) setProjectId(p[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.get<typeof stats>(`/api/v1/ingestion/stats/${projectId}`).then(setStats).catch(() => {});
    api.get<typeof images>(`/api/v1/ingestion/images/${projectId}`).then(setImages).catch(() => {});
  }, [projectId]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !projectId) return;
    const form = new FormData();
    form.append('project_id', projectId);
    form.append('source_type', source);
    Array.from(e.target.files).forEach((f) => form.append('files', f));
    await api.post('/api/v1/ingest/upload', form);
    api.get<typeof stats>(`/api/v1/ingestion/stats/${projectId}`).then(setStats);
    api.get<typeof images>(`/api/v1/ingestion/images/${projectId}`).then(setImages);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Data Ingestion Center</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Ingestions', value: stats.total_ingestions },
          { label: 'Completed', value: stats.completed },
          { label: 'Total Images', value: stats.total_images },
          { label: 'Avg Quality', value: stats.avg_quality_score },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Upload Images</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <select className="h-10 rounded border border-border bg-background px-2" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="h-10 rounded border border-border bg-background px-2" value={source} onChange={(e) => setSource(e.target.value)}>
              {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <Input type="file" accept="image/*" multiple onChange={upload} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Images</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {images.map((img) => (
              <div key={img.id} className="flex justify-between p-2 rounded border border-border">
                <span>{img.filename}</span>
                <span className="text-sm text-muted-foreground">{img.source_type} | {img.status}</span>
                <span className={`text-sm font-medium ${(img.quality_score || 0) >= 70 ? 'text-green-400' : (img.quality_score || 0) >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                  Q: {img.quality_score?.toFixed(0) || 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
