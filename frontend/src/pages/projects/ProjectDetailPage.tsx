import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, Brain, Images, PenTool, Rocket, ArrowRight } from 'lucide-react';

const actions = [
  { to: 'data', label: 'Add data', desc: 'Upload images & classes', icon: Database, color: 'bg-blue-50 text-blue-600' },
  { to: 'model', label: 'Project model', desc: 'Retrain & view metrics', icon: Brain, color: 'bg-violet-50 text-violet-600' },
  { to: 'datasets', label: 'Gallery', desc: 'Browse labeled images', icon: Images, color: 'bg-emerald-50 text-emerald-600' },
  { to: 'annotation', label: 'Review labels', desc: 'Approve annotations', icon: PenTool, color: 'bg-amber-50 text-amber-600' },
  { to: 'monitoring', label: 'Monitor', desc: 'Inference & drift alerts', icon: Rocket, color: 'bg-rose-50 text-rose-600' },
];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [modelStatus, setModelStatus] = useState<{ has_model: boolean; model: { metrics: Record<string, number> } | null } | null>(null);
  const [models, setModels] = useState<{ id: string; name: string; task_type: string }[]>([]);

  useEffect(() => {
    if (!id) return;
    api.get<typeof modelStatus>(`/api/v1/projects/${id}/active-model`).then(setModelStatus).catch(() => {});
    api.get<typeof models>(`/api/v1/projects/${id}/models`).then(setModels).catch(() => {});
  }, [id]);

  if (!id) return null;

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Single model workflow
          </CardTitle>
          <CardDescription>
            One model per project — add data, retrain continuously. No manual deploy: Fleet, Road Intel, and Monitoring connect automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {modelStatus?.has_model ? (
            <>
              <Badge variant="success">Model active</Badge>
              {modelStatus.model?.metrics?.map50_95 != null && (
                <span className="text-sm text-muted-foreground">
                  mAP: {(modelStatus.model.metrics.map50_95 * 100).toFixed(1)}%
                </span>
              )}
            </>
          ) : (
            <Badge variant="warning">Train your first model</Badge>
          )}
          <Link to={`/projects/${id}/model`} className="text-sm text-primary font-medium inline-flex items-center gap-1">
            Open model page <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>

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

      {models.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Model definitions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {models.map((m) => (
              <div key={m.id} className="flex justify-between rounded-xl border border-border/60 bg-secondary/30 px-4 py-3">
                <span>{m.name}</span>
                <Badge variant="outline">{m.task_type}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
