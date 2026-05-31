import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const tabs = [
  { key: '', label: 'Overview' },
  { key: 'datasets', label: 'Datasets' },
  { key: 'annotation', label: 'Annotation' },
  { key: 'classes', label: 'Classes' },
  { key: 'training', label: 'Training' },
  { key: 'models', label: 'Models' },
  { key: 'deployments', label: 'Deployments' },
  { key: 'monitoring', label: 'Monitoring' },
];

export default function ProjectDetailPage() {
  const { id } = useParams();
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
      <div>
        <h1 className="text-3xl font-bold">{project.name}</h1>
        <p className="text-muted-foreground">{project.description}</p>
      </div>

      <div className="flex gap-2 flex-wrap border-b border-border pb-2">
        {tabs.map(({ key, label }) => (
          <Link
            key={key}
            to={key ? `/projects/${id}/${key}` : `/projects/${id}`}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm transition-colors hover:bg-accent',
              !key && location.pathname === `/projects/${id}` ? 'bg-primary/10 text-primary' : ''
            )}
          >
            {label}
          </Link>
        ))}
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
