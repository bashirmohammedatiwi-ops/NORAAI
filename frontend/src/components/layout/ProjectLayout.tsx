import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Database, LayoutGrid, Images, Tag, PenTool, Brain, Activity,
} from 'lucide-react';

const tabs = [
  { path: '', label: 'Overview', icon: LayoutGrid },
  { path: 'data', label: 'Data', icon: Database },
  { path: 'datasets', label: 'Gallery', icon: Images },
  { path: 'classes', label: 'Classes', icon: Tag },
  { path: 'annotation', label: 'Review', icon: PenTool },
  { path: 'model', label: 'Model', icon: Brain },
  { path: 'training', label: 'History', icon: Activity },
  { path: 'monitoring', label: 'Monitor', icon: Activity },
];

export function ProjectLayout() {
  const { id } = useParams();
  const location = useLocation();
  const [project, setProject] = useState<{ id: string; name: string; description: string | null } | null>(null);
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<typeof project>(`/api/v1/projects/${id}`).then(setProject).catch(() => {});
    api.get<{ has_model: boolean }>(`/api/v1/projects/${id}/active-model`)
      .then((s) => setModelReady(s.has_model))
      .catch(() => {});
  }, [id, location.pathname]);

  if (!id) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-primary/5 via-card to-card p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary">Project</p>
            <h1 className="text-2xl font-bold text-foreground">{project?.name ?? 'Loading...'}</h1>
            {project?.description && (
              <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
            )}
            <div className="mt-2">
              {modelReady ? (
                <Badge variant="success">Model active — services connected</Badge>
              ) : (
                <Badge variant="warning">No model — upload data & retrain</Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={`/projects/${id}/data`}>
              <Button variant="outline"><Database className="h-4 w-4" /> Add data</Button>
            </Link>
            <Link to={`/projects/${id}/model`}>
              <Button size="lg" className="shadow-sm"><Brain className="h-4 w-4" /> Model</Button>
            </Link>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {tabs.map(({ path, label, icon: Icon }) => {
            const href = path ? `/projects/${id}/${path}` : `/projects/${id}`;
            const active = location.pathname === href || (path === 'model' && location.pathname.includes('/models'));
            return (
              <Link
                key={path || 'overview'}
                to={href}
                className={cn('nav-pill shrink-0', active ? 'nav-pill-active' : 'nav-pill-inactive bg-card/80')}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      <Outlet />
    </div>
  );
}
