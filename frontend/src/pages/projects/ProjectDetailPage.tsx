import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Database } from 'lucide-react';

const tabs = [
  { key: 'data', label: 'Dataset Builder', path: 'data' },
  { key: '', label: 'Overview', path: '' },
  { key: 'datasets', label: 'Datasets', path: 'datasets' },
  { key: 'annotation', label: 'Annotation', path: 'annotation' },
  { key: 'classes', label: 'Classes', path: 'classes' },
  { key: 'training', label: 'Training', path: 'training' },
  { key: 'models', label: 'Models', path: 'models' },
  { key: 'deployments', label: 'Deployments', path: 'deployments' },
  { key: 'monitoring', label: 'Monitoring', path: 'monitoring' },
];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const [project, setProject] = useState<{ id: string; name: string; description: string } | null>(null);
  const [models, setModels] = useState<{ id: string; name: string; task_type: string }[]>([]);

  useEffect(() => {
    if (!id) return;
    api.get<typeof project>(`/api/v1/projects/${id}`).then(setProject).catch(() => {});
    api.get<typeof models>(`/api/v1/projects/${id}/models`).then(setModels).catch(() => {});
  }, [id]);

  if (!project) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground">{project.description}</p>
        </div>
        <Link to={`/projects/${id}/data`}>
          <Button size="lg" className="gap-2">
            <Database className="h-5 w-5" />
            Open Dataset Builder
          </Button>
        </Link>
      </div>

      <div className="flex gap-2 flex-wrap border-b border-border pb-2">
        {tabs.map(({ key, label, path }) => {
          const href = path ? `/projects/${id}/${path}` : `/projects/${id}`;
          const active = location.pathname === href;
          return (
            <Link
              key={key || 'overview'}
              to={href}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors hover:bg-accent',
                active ? 'bg-primary/10 text-primary' : ''
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Model Definitions</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {models.map((m) => (
                <div key={m.id} className="flex justify-between p-2 rounded bg-secondary/50">
                  <span>{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.task_type}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Link to={`/projects/${id}/data`} className="block p-2 rounded hover:bg-accent font-medium text-primary">
              Dataset Builder (upload + class + train) →
            </Link>
            <Link to={`/projects/${id}/training`} className="block p-2 rounded hover:bg-accent">Start Training →</Link>
            <Link to={`/projects/${id}/datasets`} className="block p-2 rounded hover:bg-accent">Manage Datasets →</Link>
            <Link to={`/projects/${id}/annotation`} className="block p-2 rounded hover:bg-accent">Review Annotations →</Link>
            <Link to={`/projects/${id}/deployments`} className="block p-2 rounded hover:bg-accent">Deploy Model →</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
