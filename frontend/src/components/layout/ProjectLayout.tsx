import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Database, LayoutGrid, Images, Tag, PenTool, Brain, Box, Rocket, Activity,
} from 'lucide-react';

const tabs = [
  { path: '', label: 'Overview', icon: LayoutGrid },
  { path: 'data', label: 'Builder', icon: Database },
  { path: 'datasets', label: 'Gallery', icon: Images },
  { path: 'classes', label: 'Classes', icon: Tag },
  { path: 'annotation', label: 'Review', icon: PenTool },
  { path: 'training', label: 'Training', icon: Brain },
  { path: 'models', label: 'Models', icon: Box },
  { path: 'deployments', label: 'Deploy', icon: Rocket },
  { path: 'monitoring', label: 'Monitor', icon: Activity },
];

export function ProjectLayout() {
  const { id } = useParams();
  const location = useLocation();
  const [project, setProject] = useState<{ id: string; name: string; description: string | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<typeof project>(`/api/v1/projects/${id}`).then(setProject).catch(() => {});
  }, [id]);

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
          </div>
          <Link to={`/projects/${id}/data`}>
            <Button size="lg" className="shadow-sm">
              <Database className="h-4 w-4" />
              Open Builder
            </Button>
          </Link>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {tabs.map(({ path, label, icon: Icon }) => {
            const href = path ? `/projects/${id}/${path}` : `/projects/${id}`;
            const active = location.pathname === href;
            return (
              <Link
                key={path || 'overview'}
                to={href}
                className={cn('nav-pill shrink-0', active ? 'nav-pill-active' : 'nav-pill-inactive bg-card/80 border border-transparent')}
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
