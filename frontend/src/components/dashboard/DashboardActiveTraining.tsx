import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useTrainingJob } from '@/hooks/useTrainingJob';
import type { DashboardActiveTrainingJob } from '@/hooks/useProjects';
import { cancelTrainingJob } from '@/lib/cancelTraining';
import { TrainingProgressCard } from '@/components/training/TrainingProgressCard';
import { TrainingActivityLog } from '@/components/training/TrainingActivityLog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, ArrowRight, Brain } from 'lucide-react';

interface Props {
  jobs: DashboardActiveTrainingJob[];
  onStopped?: () => void;
}

export function DashboardActiveTraining({ jobs, onStopped }: Props) {
  if (!jobs.length) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Training in progress
          <Badge variant="success" className="gap-1 text-[10px]">
            <Activity className="h-3 w-3 animate-pulse" /> Live
          </Badge>
        </h2>
        <span className="text-xs text-muted-foreground">
          {jobs.length} job{jobs.length > 1 ? 's' : ''} running
        </span>
      </div>

      {jobs.map((job) => (
        <DashboardTrainingJobCard key={job.job_id} job={job} onStopped={onStopped} />
      ))}
    </div>
  );
}

function DashboardTrainingJobCard({
  job,
  onStopped,
}: {
  job: DashboardActiveTrainingJob;
  onStopped?: () => void;
}) {
  const [stopping, setStopping] = useState(false);
  const { job: liveJob, progressDetail, activityLog, connected } = useTrainingJob(job.job_id);
  const display = liveJob ?? {
    id: job.job_id,
    name: job.name,
    progress: job.progress,
    current_epoch: job.current_epoch,
    total_epochs: job.total_epochs,
    duration_seconds: job.duration_seconds,
    status: job.status,
    phase: job.phase,
    message: job.message,
    batch: job.batch,
    total_batches: job.total_batches,
    epoch_progress: job.epoch_progress,
    export_current: job.export_current,
    export_total: job.export_total,
    current_step: job.current_step,
    total_steps: job.total_steps,
    eta_seconds: job.eta_seconds,
    latest_metrics: job.latest_metrics,
    config: {},
  };

  const stop = async () => {
    if (!window.confirm('Stop this training run?')) return;
    setStopping(true);
    try {
      await cancelTrainingJob(job.job_id);
      onStopped?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to stop training');
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{job.project_name}</p>
          <p className="text-xs text-muted-foreground">{job.name} · {job.architecture}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {connected && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Activity className="h-3 w-3 animate-pulse" /> WS
            </Badge>
          )}
          <Link to={`/projects/${job.project_id}/training`}>
            <Button variant="outline" size="sm">
              Open Training <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Link to={`/projects/${job.project_id}/model`}>
            <Button variant="ghost" size="sm">Model</Button>
          </Link>
        </div>
      </div>

      <TrainingProgressCard
        progress={display.progress}
        currentEpoch={display.current_epoch}
        totalEpochs={display.total_epochs}
        durationSeconds={display.duration_seconds}
        deviceLabel={job.device_label ?? 'CPU Training'}
        status={display.status}
        jobName={display.name}
        phase={display.phase}
        message={display.message}
        batch={display.batch}
        totalBatches={display.total_batches}
        detail={progressDetail ?? {
          epochProgress: job.epoch_progress,
          exportCurrent: job.export_current,
          exportTotal: job.export_total,
          currentStep: job.current_step,
          totalSteps: job.total_steps,
          etaSeconds: job.eta_seconds,
          loss: job.latest_metrics?.loss,
          map50: job.latest_metrics?.map50,
          precision: job.latest_metrics?.precision,
        }}
        onStop={stop}
        stopping={stopping}
        compact
      />

      {activityLog.length > 0 && <TrainingActivityLog entries={activityLog} />}
    </div>
  );
}
