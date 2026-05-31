import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderKanban, Upload, Brain, Truck, AlertTriangle } from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.get<Record<string, number>>('/api/v1/dashboard/stats').then(setStats).catch(() => {});
    api.get<{ id: string; name: string }[]>('/api/v1/projects').then(setProjects).catch(() => {});
  }, []);

  const kpis = [
    { label: 'Projects', value: projects.length, icon: FolderKanban, color: 'text-blue-400' },
    { label: 'Training Jobs', value: stats.active_training_jobs || 0, icon: Brain, color: 'text-purple-400' },
    { label: 'Fleet Online', value: stats.fleet_devices_online || 0, icon: Truck, color: 'text-green-400' },
    { label: 'Active Alerts', value: stats.alerts_active || 0, icon: AlertTriangle, color: 'text-yellow-400' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Operations Dashboard</h1>
        <p className="text-muted-foreground">Smart Road Infrastructure & Traffic Monitoring</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-3xl font-bold">{value}</p>
                </div>
                <Icon className={`h-8 w-8 ${color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Active Projects</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center justify-between p-3 rounded-md hover:bg-accent">
                <span className="font-medium">{p.name}</span>
                <span className="text-sm text-muted-foreground">View →</span>
              </Link>
            ))}
            {projects.length === 0 && <p className="text-muted-foreground">No projects yet. Run init_db to seed data.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
