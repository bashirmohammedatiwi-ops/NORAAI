import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useTrainingJob } from '@/hooks/useTrainingJob';
import {
  useDatasetBuilderStats,
  useDatasetHub,
  useProjectClasses,
} from '@/hooks/useDatasets';
import { BulkImageUpload } from '@/components/training/BulkImageUpload';
import { SimpleTrainCard } from '@/components/training/SimpleTrainCard';
import { TrainingConfigForm } from '@/components/training/TrainingConfigForm';
import { TrainingMetricsPanel } from '@/components/training/TrainingMetricsPanel';
import { TrainingProgressCard } from '@/components/training/TrainingProgressCard';
import { TrainingActivityLog } from '@/components/training/TrainingActivityLog';
import { MetricChart } from '@/components/training/MetricChart';
import { ArchitectureBadge, TrainingStatusBadge } from '@/components/training/TrainingStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { cancelTrainingJob } from '@/lib/cancelTraining';
import { buildMetricsSubtitle, METRIC_DISPLAY, normalizeQualityMetrics } from '@/lib/trainingMetrics';
import {
  Activity, BarChart3, Brain, ChevronDown, ChevronUp, Database, ImageIcon, Plus, RefreshCw, StopCircle,
} from 'lucide-react';

type Tab = 'studio' | 'charts';

interface JobSummary {
  id: string;
  name: string;
  architecture: string;
  status: string;
  created_at: string;
  progress?: number;
  current_epoch?: number;
  total_epochs?: number;
}

interface DatasetSummary {
  id: string;
  name: string;
  image_count: number;
}

interface ProjectClass {
  id: string;
  name: string;
  color: string;
}

export default function TrainingPage() {
  const { id: projectId } = useParams();
  const [tab, setTab] = useState<Tab>('studio');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCharts, setShowCharts] = useState(false);

  const { data: hub, refetch: refetchHub } = useDatasetHub(projectId);
  const datasets: DatasetSummary[] = hub?.datasets ?? [];
  const { data: classes = [], refetch: refetchClasses } = useProjectClasses(projectId);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const { data: stats, refetch: refetchStats } = useDatasetBuilderStats(selectedDatasetId || undefined);

  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const { job, chartMetrics, connected, refresh, progressDetail, activityLog } = useTrainingJob(selectedJobId);

  const loadDatasets = useCallback(async () => {
    await refetchHub();
  }, [refetchHub]);

  const loadClasses = useCallback(async () => {
    await refetchClasses();
  }, [refetchClasses]);

  useEffect(() => {
    if (!selectedDatasetId && hub?.default_dataset_id) {
      setSelectedDatasetId(hub.default_dataset_id);
    } else if (!selectedDatasetId && datasets[0]?.id) {
      setSelectedDatasetId(datasets[0].id);
    }
  }, [hub?.default_dataset_id, datasets, selectedDatasetId]);

  useEffect(() => {
    if (!selectedClassId && classes[0]?.id) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  const loadJobs = useCallback(() => {
    if (!projectId) return;
    api.get<JobSummary[]>(`/api/v1/training/project/${projectId}`).then((j) => {
      setJobs(j);
      const running = j.find((x) => x.status === 'running');
      const latest = j[0];
      setSelectedJobId((prev) => {
        if (prev && j.some((x) => x.id === prev)) return prev;
        return running?.id ?? latest?.id ?? null;
      });
    }).catch(() => {});
  }, [projectId]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  useEffect(() => {
    const t = setInterval(() => { loadJobs(); }, 8000);
    return () => clearInterval(t);
  }, [loadJobs]);

  const refreshAll = () => {
    loadDatasets();
    loadClasses();
    loadJobs();
    refresh();
  };

  const addClass = async () => {
    if (!projectId || !newClassName.trim()) return;
    const cls = await api.post<ProjectClass>(`/api/v1/projects/${projectId}/classes`, { name: newClassName.trim() });
    setNewClassName('');
    await loadClasses();
    setSelectedClassId(cls.id);
  };

  const cancelJob = async () => {
    if (!job?.id) return;
    if (!window.confirm('Stop this training run? Progress will be lost.')) return;
    setStopping(true);
    try {
      await cancelTrainingJob(job.id);
      loadJobs();
      refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to stop training');
    } finally {
      setStopping(false);
    }
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const displayMetrics = normalizeQualityMetrics(job?.latest_metrics ?? job?.artifact?.metrics ?? null);
  const metricsSubtitle = buildMetricsSubtitle(job?.name, job?.architecture, job?.metrics_meta, job?.message);
  const runningJob = jobs.find((j) => j.status === 'running' || j.status === 'pending');
  const showProgress = job && (job.status === 'running' || job.status === 'pending');

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" />
            Training Studio
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload images · Train on CPU · Track epoch progress &amp; quality metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected && (
            <Badge variant="success" className="gap-1">
              <Activity className="h-3 w-3 animate-pulse" /> Live
            </Badge>
          )}
          {runningJob && <TrainingStatusBadge status="running" />}
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Images', value: stats?.image_count ?? 0, icon: ImageIcon },
          { label: 'Labeled', value: stats?.annotated_count ?? 0, icon: Database },
          { label: 'Jobs', value: jobs.length, icon: Activity },
          {
            label: 'Epoch',
            value: showProgress ? `${job?.current_epoch ?? 0}/${job?.total_epochs ?? '—'}` : runningJob ? '…' : '—',
            icon: BarChart3,
          },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
            <Icon className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {showProgress && job && (
        <div className="space-y-3">
          <TrainingProgressCard
            progress={job.progress}
            currentEpoch={job.current_epoch}
            totalEpochs={job.total_epochs}
            durationSeconds={job.duration_seconds}
            deviceLabel={(job.config?.device as string) === 'cpu' || !job.config?.device ? 'CPU Training' : String(job.config.device)}
            status={job.status}
            jobName={job.name}
            phase={job.phase}
            message={job.message}
            batch={job.batch}
            totalBatches={job.total_batches}
            detail={progressDetail}
            onStop={job.status === 'running' || job.status === 'pending' ? cancelJob : undefined}
            stopping={stopping}
          />
          {activityLog.length > 0 && <TrainingActivityLog entries={activityLog} />}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { key: 'studio' as Tab, label: 'Studio', icon: Brain },
          { key: 'charts' as Tab, label: 'Charts', icon: BarChart3 },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition-colors',
              tab === key ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'studio' && projectId && (
        <div className="space-y-5">
          {/* Step 1: Class + Upload */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                Upload Training Images
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedClassId(c.id)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-all',
                      selectedClassId === c.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent',
                    )}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                    {stats?.per_class.find((p) => p.class_id === c.id) && (
                      <span className="text-xs opacity-70">
                        ({stats.per_class.find((p) => p.class_id === c.id)?.count})
                      </span>
                    )}
                  </button>
                ))}
                <div className="flex gap-1">
                  <Input
                    placeholder="New class"
                    className="h-8 w-28 text-sm"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addClass()}
                  />
                  <Button type="button" size="sm" variant="secondary" onClick={addClass}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {datasets.length > 1 && (
                <select
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm max-w-xs"
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.image_count})</option>
                  ))}
                </select>
              )}

              <BulkImageUpload
                datasetId={selectedDatasetId}
                classId={selectedClassId}
                className={selectedClass?.name}
                classColor={selectedClass?.color}
                disabled={!selectedDatasetId}
                onComplete={(uploaded) => {
                  if (uploaded <= 0) return;
                  setTimeout(() => { void refetchStats(); }, 5000);
                  setTimeout(() => { void refetchStats(); }, 15000);
                }}
              />
            </CardContent>
          </Card>

          {/* Step 2: Train */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">2</span>
              Train
            </p>
            {showAdvanced ? (
              <TrainingConfigForm
                projectId={projectId}
                onStarted={() => { loadJobs(); setShowAdvanced(false); }}
              />
            ) : (
              <SimpleTrainCard
                projectId={projectId}
                datasetId={selectedDatasetId}
                imageCount={stats?.image_count ?? 0}
                ready={Boolean(stats?.ready_for_training && stats.head_version_id)}
                onStarted={(jobId) => {
                  loadJobs();
                  if (jobId) setSelectedJobId(jobId);
                }}
                showAdvanced={showAdvanced}
                onToggleAdvanced={() => setShowAdvanced(true)}
              />
            )}
            {showAdvanced && (
              <Button type="button" variant="ghost" size="sm" className="mt-2 text-primary" onClick={() => setShowAdvanced(false)}>
                ← Back to simple mode
              </Button>
            )}
          </div>

          {/* Step 3: Metrics */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">3</span>
              Quality Metrics
            </p>

            {job && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <ArchitectureBadge architecture={job.architecture} />
                <TrainingStatusBadge status={job.status} progress={job.progress} showProgress />
                <select
                  className="h-8 rounded border border-border bg-background px-2 text-xs ml-auto"
                  value={selectedJobId || ''}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                >
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>{j.name} ({j.status})</option>
                  ))}
                </select>
                {(job.status === 'running' || job.status === 'pending') && (
                  <Button size="sm" variant="destructive" onClick={cancelJob} disabled={stopping}>
                    <StopCircle className="h-3.5 w-3.5" /> {stopping ? 'Stopping…' : 'Stop'}
                  </Button>
                )}
              </div>
            )}

            <TrainingMetricsPanel
              metrics={displayMetrics}
              metricsMeta={job?.metrics_meta}
              title={job?.status === 'running' ? 'Live Training Metrics' : 'Latest Model Quality'}
              subtitle={job ? metricsSubtitle : 'No training job selected'}
              trainingProgress={job?.progress}
              epoch={job ? { current: job.current_epoch, total: job.total_epochs } : undefined}
              status={job?.status}
            />

            {job?.error_message && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-sm">
                {job.error_message}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'charts' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-muted-foreground">Job</label>
            <select
              className="h-9 rounded border border-border bg-background px-3 text-sm min-w-[200px]"
              value={selectedJobId || ''}
              onChange={(e) => setSelectedJobId(e.target.value)}
            >
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.status})</option>)}
            </select>
            {connected && (
              <span className="text-emerald-600 text-sm flex items-center gap-1">
                <Activity className="h-3 w-3 animate-pulse" /> Live
              </span>
            )}
          </div>

          {jobs.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No training jobs yet</CardContent></Card>
          ) : (
            <>
              <button
                type="button"
                className="flex items-center gap-2 text-sm text-primary"
                onClick={() => setShowCharts(!showCharts)}
              >
                {showCharts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showCharts ? 'Hide' : 'Show'} epoch charts
              </button>

              {showCharts && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card><CardContent className="pt-6">
                    <MetricChart data={chartMetrics} title="Loss" lines={[{ key: 'loss', color: '#ef4444', label: 'Loss' }]} />
                  </CardContent></Card>
                  <Card><CardContent className="pt-6">
                    <MetricChart data={chartMetrics} title="Accuracy" lines={[
                      { key: 'map50', color: '#3b82f6', label: METRIC_DISPLAY.detectionAccuracy.label },
                      { key: 'map50_95', color: '#8b5cf6', label: METRIC_DISPLAY.accuracy.label },
                    ]} />
                  </CardContent></Card>
                  <Card><CardContent className="pt-6">
                    <MetricChart data={chartMetrics} title="Precision & Recall" lines={[
                      { key: 'precision', color: '#22c55e', label: 'Precision' },
                      { key: 'recall', color: '#f59e0b', label: 'Recall' },
                    ]} />
                  </CardContent></Card>
                  <Card><CardContent className="pt-6">
                    <MetricChart data={chartMetrics} title="F1 Score" lines={[{ key: 'f1', color: '#06b6d4', label: 'F1' }]} />
                  </CardContent></Card>
                </div>
              )}

              {!showCharts && (
                <TrainingMetricsPanel metrics={displayMetrics} metricsMeta={job?.metrics_meta} compact />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
