import { Link } from 'react-router-dom';
import { useProjectsList, useDashboardStats } from '@/hooks/useProjects';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderKanban, Brain, Truck, AlertTriangle, ArrowRight, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';

export default function DashboardPage() {
  const {
    projects,
    isInitialLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useProjectsList();
  const { data: stats = {} } = useDashboardStats();

  const kpis = [
    { label: 'Projects', value: stats.total_projects ?? projects.length, icon: FolderKanban },
    { label: 'Training', value: stats.active_training_jobs || 0, icon: Brain },
    { label: 'Fleet online', value: stats.fleet_devices_online || 0, icon: Truck },
    { label: 'Alerts', value: stats.alerts_active || 0, icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard">
        <Link to="/builder">
          <Button><Sparkles className="h-4 w-4" /> Quick Start</Button>
        </Link>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold mt-0.5">{isInitialLoading && label === 'Projects' ? '—' : value}</p>
              </div>
              <Icon className="h-5 w-5 text-muted-foreground/60" />
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            Projects
            {isFetching && projects.length > 0 && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
          <Link to="/projects">
            <Button variant="ghost" size="sm">View all</Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-1">
          {isInitialLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading projects...</p>
          )}

          {isError && (
            <div className="py-8 text-center space-y-3">
              <AlertCircle className="h-8 w-8 mx-auto text-destructive/80" />
              <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Failed to load projects'}</p>
              <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Retry
              </Button>
            </div>
          )}

          {!isInitialLoading && !isError && projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">{p.name}</span>
                <Badge variant={p.has_model ? 'success' : 'warning'} className="shrink-0 text-[10px] px-1.5 py-0">
                  {p.has_model ? 'Model' : 'No model'}
                </Badge>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          ))}

          {!isInitialLoading && !isError && projects.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>No projects yet</p>
              <Link to="/projects"><Button className="mt-3" size="sm">Create project</Button></Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
