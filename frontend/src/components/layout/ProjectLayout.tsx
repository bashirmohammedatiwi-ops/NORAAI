import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '', label: 'Overview' },
  { path: 'data', label: 'Data' },
  { path: 'datasets', label: 'Datasets' },
  { path: 'classes', label: 'Classes' },
  { path: 'annotation', label: 'Review' },
  { path: 'model', label: 'Model' },
  { path: 'training', label: 'Training' },
  { path: 'monitoring', label: 'Monitor' },
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
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Project</p>
            <h2 className="text-xl font-semibold">{project?.name ?? 'Loading...'}</h2>
          </div>
          <Badge variant={modelReady ? 'success' : 'warning'}>
            {modelReady ? 'Model ready' : 'No model'}
          </Badge>
        </div>

        <nav className="flex gap-4 overflow-x-auto border-b border-border">
          {tabs.map(({ path, label }) => {
            const href = path ? `/projects/${id}/${path}` : `/projects/${id}`;
            const active = location.pathname === href || (path === 'model' && location.pathname.includes('/models'));
            return (
              <Link key={path || 'overview'} to={href} className={cn('tab-link shrink-0', active && 'tab-link-active')}>
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <Outlet />
    </div>
  );
}
