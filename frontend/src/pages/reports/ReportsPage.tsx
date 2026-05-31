import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function ReportsPage() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [reports, setReports] = useState<{ id: string; name: string; format: string; status: string; created_at: string }[]>([]);
  const [name, setName] = useState('');
  const [format, setFormat] = useState('pdf');

  useEffect(() => {
    api.get<typeof projects>('/api/v1/projects').then((p) => {
      setProjects(p);
      if (p.length) setProjectId(p[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.get<typeof reports>(`/api/v1/reports/project/${projectId}`).then(setReports).catch(() => {});
  }, [projectId]);

  const generate = async () => {
    await api.post(`/api/v1/reports/project/${projectId}`, {
      name: name || 'Custom Report',
      format,
      report_type: 'custom',
    });
    setName('');
    api.get<typeof reports>(`/api/v1/reports/project/${projectId}`).then(setReports);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Reporting System</h1>

      <Card>
        <CardHeader><CardTitle>Generate Report</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <select className="h-10 rounded border border-border bg-background px-2" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Input placeholder="Report name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="h-10 rounded border border-border bg-background px-2" value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="pdf">PDF</option>
            <option value="excel">Excel</option>
          </select>
          <Button onClick={generate}>Generate</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Report History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 rounded border border-border">
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-sm text-muted-foreground">{r.format.toUpperCase()} | {r.status} | {new Date(r.created_at).toLocaleString()}</p>
              </div>
              {r.status === 'completed' && (
                <a href={api.getDownloadUrl(`/api/v1/reports/${r.id}/download`)} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">Download</Button>
                </a>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
