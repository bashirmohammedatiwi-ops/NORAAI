import { Link, useParams } from 'react-router-dom';
import { METRIC_DISPLAY } from '@/lib/trainingMetrics';
import { useProjectOverview } from '@/hooks/useProjects';
import { Badge } from '@/components/ui/badge';
import { Database, Brain, Images, PenTool, Activity, ArrowRight } from 'lucide-react';

const actions = [
  { to: 'data', label: 'Data', icon: Database },
  { to: 'model', label: 'Model', icon: Brain },
  { to: 'datasets', label: 'Datasets', icon: Images },
  { to: 'annotation', label: 'Review', icon: PenTool },
  { to: 'monitoring', label: 'Monitor', icon: Activity },
];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { data } = useProjectOverview(id);
  const modelStatus = data?.model_status;

  if (!id) return null;

  return (
    <div className="space-y-5">
      <div className="surface p-4 flex flex-wrap items-center gap-3">
        {modelStatus?.has_model ? (
          <>
            <Badge variant="success">Model active</Badge>
            {modelStatus.model?.metrics?.map50_95 != null && (
              <span className="text-sm text-muted-foreground">
                {METRIC_DISPLAY.accuracy.label} {(modelStatus.model.metrics.map50_95 * 100).toFixed(1)}%
              </span>
            )}
          </>
        ) : (
          <Badge variant="warning">No model trained yet</Badge>
        )}
        <Link to={`/projects/${id}/data`} className="text-sm text-primary ml-auto inline-flex items-center gap-1">
          Add data <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {actions.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={`/projects/${id}/${to}`} className="stat-card hover:border-primary/30 transition-colors group">
            <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary mb-2" />
            <p className="text-sm font-medium">{label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
