import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useTrainingJob } from '@/hooks/useTrainingJob';
import { TrainingConfigForm } from '@/components/training/TrainingConfigForm';
import { MetricChart } from '@/components/training/MetricChart';
import { ArchitectureBadge, TrainingStatusBadge } from '@/components/training/TrainingStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Activity, BarChart3, Brain, Clock, FlaskConical, Layers, RefreshCw, StopCircle, Trophy, Zap
} from 'lucide-react';

type Tab = 'configure' | 'jobs' | 'analytics' | 'hpo';

interface JobSummary {
  id: string;
  name: string;
  architecture: string;
  status: string;
  hpo_enabled: boolean;
  created_at: string;
  error_message?: string;
}

interface Trial {
  id: string;
  trial_number: number;
  params: Record<string, number>;
  metrics: Record<string, number>;
  status: string;
  is_best: boolean;
}

export default function TrainingPage() {
  const { id } = useParams();
  const [tab, setTab] = useState<Tab>('configure');
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [trials, setTrials] = useState<Trial[]>([]);
  const { job, chartMetrics, connected, refresh } = useTrainingJob(selectedJobId);

  const loadJobs = () => {
    if (!id) return;
    api.get<JobSummary[]>(`/api/v1/training/project/${id}`).then((j) => {
      setJobs(j);
      if (!selectedJobId && j.length > 0) setSelectedJobId(j[0].id);
    }).catch(() => {});
  };

  useEffect(() => { loadJobs(); }, [id]);

  useEffect(() => {
    if (!selectedJobId) return;
    api.get<Trial[]>(`/api/v1/training/${selectedJobId}/trials`).then(setTrials).catch(() => setTrials([]));
  }, [selectedJobId, job?.status]);

  const cancelJob = async (jobId: string) => {
    await api.post(`/api/v1/training/${jobId}/cancel`);
    loadJobs();
    refresh();
  };

  const tabs: { key: Tab; label: string; icon: typeof Brain }[] = [
    { key: 'configure', label: 'Configure', icon: Layers },
    { key: 'jobs', label: 'Jobs', icon: Activity },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'hpo', label: 'HPO Trials', icon: FlaskConical },
  ];

  const latest = job?.latest_metrics;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-primary" />
            Training Center
          </h1>
          <p className="text-muted-foreground mt-1">مركز التدريب — YOLO, RT-DETR, Faster R-CNN, EfficientDet</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadJobs(); refresh(); }}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Jobs', value: jobs.length, icon: Activity },
          { label: 'Running', value: jobs.filter((j) => j.status === 'running').length, icon: Zap },
          { label: 'Completed', value: jobs.filter((j) => j.status === 'completed').length, icon: Trophy },
          { label: 'Failed', value: jobs.filter((j) => j.status === 'failed').length, icon: StopCircle },
          { label: 'Best mAP50', value: latest?.map50 ? `${(latest.map50 * 100).toFixed(1)}%` : '—', icon: BarChart3 },
          { label: 'Live', value: connected ? 'Connected' : 'Offline', icon: Activity },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <Icon className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition-colors',
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'configure' && id && (
        <TrainingConfigForm projectId={id} onStarted={() => { loadJobs(); setTab('jobs'); }} />
      )}

      {tab === 'jobs' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>Training Jobs</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-auto">
              {jobs.map((j) => (
                <button
                  key={j.id}
                  onClick={() => { setSelectedJobId(j.id); setTab('analytics'); }}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border transition-all',
                    selectedJobId === j.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm">{j.name}</p>
                    <TrainingStatusBadge status={j.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <ArchitectureBadge architecture={j.architecture} />
                    {j.hpo_enabled && <span className="text-xs text-purple-400">HPO</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(j.created_at).toLocaleString()}</p>
                </button>
              ))}
              {jobs.length === 0 && <p className="text-muted-foreground text-sm">No training jobs yet</p>}
            </CardContent>
          </Card>

          {job && (
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{job.name}</CardTitle>
                {job.status === 'running' && (
                  <Button size="sm" variant="destructive" onClick={() => cancelJob(job.id)}>
                    <StopCircle className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <TrainingStatusBadge status={job.status} progress={job.progress} showProgress />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="p-3 rounded bg-secondary/50">
                    <p className="text-muted-foreground text-xs">Epoch</p>
                    <p className="font-bold">{job.current_epoch} / {job.total_epochs}</p>
                  </div>
                  <div className="p-3 rounded bg-secondary/50">
                    <p className="text-muted-foreground text-xs">Duration</p>
                    <p className="font-bold">{job.duration_seconds ? `${Math.floor(job.duration_seconds / 60)}m ${job.duration_seconds % 60}s` : '—'}</p>
                  </div>
                  <div className="p-3 rounded bg-secondary/50">
                    <p className="text-muted-foreground text-xs">Architecture</p>
                    <p className="font-bold">{job.architecture}</p>
                  </div>
                  <div className="p-3 rounded bg-secondary/50">
                    <p className="text-muted-foreground text-xs">Mode</p>
                    <p className="font-bold">{job.training_mode}</p>
                  </div>
                </div>

                {latest && (
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {[
                      { k: 'loss', v: latest.loss, fmt: (n: number) => n.toFixed(3) },
                      { k: 'Precision', v: latest.precision, fmt: (n: number) => `${(n * 100).toFixed(1)}%` },
                      { k: 'Recall', v: latest.recall, fmt: (n: number) => `${(n * 100).toFixed(1)}%` },
                      { k: 'F1', v: latest.f1, fmt: (n: number) => `${(n * 100).toFixed(1)}%` },
                      { k: 'mAP50', v: latest.map50, fmt: (n: number) => `${(n * 100).toFixed(1)}%` },
                      { k: 'mAP50-95', v: latest.map50_95, fmt: (n: number) => `${(n * 100).toFixed(1)}%` },
                    ].map(({ k, v, fmt }) => (
                      <div key={k} className="text-center p-2 rounded border border-border">
                        <p className="text-xs text-muted-foreground">{k}</p>
                        <p className="font-bold text-primary">{v != null ? fmt(v) : '—'}</p>
                      </div>
                    ))}
                  </div>
                )}

                {job.error_message && (
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{job.error_message}</div>
                )}

                {job.artifact && (
                  <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/5">
                    <p className="font-medium text-green-400 flex items-center gap-2">
                      <Trophy className="h-4 w-4" /> Model Artifact Registered
                    </p>
                    <p className="text-sm mt-1">{job.artifact.name} — {job.artifact.model_size_mb?.toFixed(2)} MB</p>
                    <p className="text-xs text-muted-foreground mt-1">mAP50: {job.artifact.metrics?.map50?.toFixed(3)} | mAP50-95: {job.artifact.metrics?.map50_95?.toFixed(3)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === 'analytics' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-muted-foreground">Job:</label>
            <select
              className="h-9 rounded border border-border bg-background px-3 text-sm min-w-[200px]"
              value={selectedJobId || ''}
              onChange={(e) => setSelectedJobId(e.target.value)}
            >
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.status})</option>)}
            </select>
            {connected && <span className="text-green-400 text-sm flex items-center gap-1"><Activity className="h-3 w-3 animate-pulse" /> Live WebSocket</span>}
            {job && <TrainingStatusBadge status={job.status} progress={job.progress} showProgress />}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <MetricChart data={chartMetrics} title="Loss Curve" lines={[{ key: 'loss', color: '#ef4444', label: 'Loss' }]} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <MetricChart
                  data={chartMetrics}
                  title="mAP Curves"
                  lines={[
                    { key: 'map50', color: '#3b82f6', label: 'mAP@50' },
                    { key: 'map50_95', color: '#8b5cf6', label: 'mAP@50-95' },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <MetricChart
                  data={chartMetrics}
                  title="Precision & Recall"
                  lines={[
                    { key: 'precision', color: '#22c55e', label: 'Precision' },
                    { key: 'recall', color: '#f59e0b', label: 'Recall' },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <MetricChart data={chartMetrics} title="F1 Score" lines={[{ key: 'f1', color: '#06b6d4', label: 'F1' }]} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === 'hpo' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" /> Hyperparameter Optimization Trials
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 mb-4">
              <select
                className="h-9 rounded border border-border bg-background px-3 text-sm"
                value={selectedJobId || ''}
                onChange={(e) => setSelectedJobId(e.target.value)}
              >
                {jobs.filter((j) => j.hpo_enabled).map((j) => (
                  <option key={j.id} value={j.id}>{j.name}</option>
                ))}
              </select>
            </div>
            {trials.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">LR</th>
                      <th className="pb-2 pr-4">Batch</th>
                      <th className="pb-2 pr-4">mAP50-95</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2">Best</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trials.map((t) => (
                      <tr key={t.id} className={cn('border-b border-border', t.is_best && 'bg-yellow-500/5')}>
                        <td className="py-2 pr-4">{t.trial_number}</td>
                        <td className="py-2 pr-4">{t.params.learning_rate?.toExponential(2)}</td>
                        <td className="py-2 pr-4">{t.params.batch_size}</td>
                        <td className="py-2 pr-4 font-medium">{t.metrics.map50_95?.toFixed(4) ?? '—'}</td>
                        <td className="py-2 pr-4">{t.status}</td>
                        <td className="py-2">{t.is_best && <Trophy className="h-4 w-4 text-yellow-500" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground">No HPO trials. Enable Auto HPO when starting training.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
