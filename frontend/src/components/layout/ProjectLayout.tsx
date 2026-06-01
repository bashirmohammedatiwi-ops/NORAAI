import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { useProjectOverview } from '@/hooks/useProjects';
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
  const { data } = useProjectOverview(id);

  const project = data?.project;
  const modelReady = data?.model_status?.has_model ?? false;

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
