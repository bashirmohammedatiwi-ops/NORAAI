import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderKanban, Brain, Truck, AlertTriangle, ArrowRight, Sparkles } from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.get<Record<string, number>>('/api/v1/dashboard/stats').then(setStats).catch(() => {});
    api.get<{ id: string; name: string }[]>('/api/v1/projects').then(setProjects).catch(() => {});
  }, []);

  const kpis = [
    { label: 'Projects', value: projects.length, icon: FolderKanban },
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
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold mt-0.5">{value}</p>
              </div>
              <Icon className="h-5 w-5 text-muted-foreground/60" />
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Projects</CardTitle>
          <Link to="/projects">
            <Button variant="ghost" size="sm">View all</Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-1">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-accent transition-colors"
            >
              <span className="text-sm font-medium">{p.name}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
          {projects.length === 0 && (
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
