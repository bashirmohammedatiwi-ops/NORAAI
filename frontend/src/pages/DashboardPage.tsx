import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FolderKanban, Brain, Truck, AlertTriangle, ArrowRight, Sparkles, Images, Rocket,
} from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.get<Record<string, number>>('/api/v1/dashboard/stats').then(setStats).catch(() => {});
    api.get<{ id: string; name: string }[]>('/api/v1/projects').then(setProjects).catch(() => {});
  }, []);

  const kpis = [
    { label: 'Projects', value: projects.length, icon: FolderKanban, color: 'bg-blue-50 text-blue-600' },
    { label: 'Training Jobs', value: stats.active_training_jobs || 0, icon: Brain, color: 'bg-violet-50 text-violet-600' },
    { label: 'Fleet Online', value: stats.fleet_devices_online || 0, icon: Truck, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Active Alerts', value: stats.alerts_active || 0, icon: AlertTriangle, color: 'bg-amber-50 text-amber-600' },
  ];

  const quickStart = [
    { step: 1, title: 'Create or open a project', desc: 'Organize your models and datasets', to: '/projects', icon: FolderKanban },
    { step: 2, title: 'Upload images with classes', desc: 'Dataset Builder auto-labels for YOLO', to: '/builder', icon: Sparkles },
    { step: 3, title: 'Browse & verify labels', desc: 'Gallery view with class filters', to: projects[0] ? `/projects/${projects[0].id}/datasets` : '/projects', icon: Images },
    { step: 4, title: 'Train & deploy', desc: 'Quick Train then publish model', to: projects[0] ? `/projects/${projects[0].id}/training` : '/projects', icon: Rocket },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Welcome to NORAAI"
        description="Smart road infrastructure AI — upload datasets, train detection models, and deploy to the field."
      >
        <Link to="/builder">
          <Button size="lg"><Sparkles className="h-4 w-4" /> Quick Start</Button>
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="hover:shadow-card transition-shadow">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-3xl font-bold mt-1">{value}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle>Getting started in 4 steps</CardTitle>
          <CardDescription>Follow this path — no ML expertise required</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickStart.map(({ step, title, desc, to, icon: Icon }) => (
            <Link key={step} to={to} className="group rounded-xl border border-border/80 bg-card p-4 shadow-soft hover:border-primary/40 hover:shadow-card transition-all">
              <div className="flex items-center gap-2 mb-3">
                <span className="step-badge">{step}</span>
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{title}</p>
              <p className="text-xs text-muted-foreground mt-1">{desc}</p>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Your Projects</CardTitle>
            <CardDescription>Jump into Dataset Builder for any project</CardDescription>
          </div>
          <Link to="/projects"><Button variant="outline" size="sm">View all</Button></Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}/data`}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 p-4 hover:bg-primary/5 hover:border-primary/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <span className="font-medium">{p.name}</span>
              </div>
              <span className="flex items-center gap-1 text-sm text-primary font-medium">
                Open Builder <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
          {projects.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No projects yet.</p>
              <Link to="/projects"><Button className="mt-3">Create first project</Button></Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
