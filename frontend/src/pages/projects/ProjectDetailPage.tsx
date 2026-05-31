import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, Brain, Images, PenTool, Rocket, ArrowRight } from 'lucide-react';

const actions = [
  { to: 'data', label: 'Dataset Builder', desc: 'Upload images + assign classes + train', icon: Database, color: 'bg-blue-50 text-blue-600' },
  { to: 'datasets', label: 'Browse Gallery', desc: 'View images and labels by class', icon: Images, color: 'bg-violet-50 text-violet-600' },
  { to: 'training', label: 'Training', desc: 'Monitor jobs and metrics', icon: Brain, color: 'bg-emerald-50 text-emerald-600' },
  { to: 'annotation', label: 'Review Labels', desc: 'Approve or reject annotations', icon: PenTool, color: 'bg-amber-50 text-amber-600' },
  { to: 'deployments', label: 'Deploy Model', desc: 'Publish to production endpoint', icon: Rocket, color: 'bg-rose-50 text-rose-600' },
];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [models, setModels] = useState<{ id: string; name: string; task_type: string }[]>([]);

  useEffect(() => {
    if (!id) return;
    api.get<typeof models>(`/api/v1/projects/${id}/models`).then(setModels).catch(() => {});
  }, [id]);

  if (!id) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {actions.map(({ to, label, desc, icon: Icon, color }) => (
          <Link key={to} to={`/projects/${id}/${to}`}>
            <Card className="h-full hover:shadow-card hover:border-primary/30 transition-all group">
              <CardContent className="pt-5">
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${color} mb-3`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="font-semibold group-hover:text-primary transition-colors flex items-center gap-1">
                  {label} <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="text-sm text-muted-foreground mt-1">{desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Model Definitions</CardTitle>
          <CardDescription>Registered model architectures for this project</CardDescription>
        </CardHeader>
        <CardContent>
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">No models defined yet. Start training to create artifacts.</p>
          ) : (
            <div className="space-y-2">
              {models.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-4 py-3">
                  <span className="font-medium">{m.name}</span>
                  <Badge variant="outline">{m.task_type}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
