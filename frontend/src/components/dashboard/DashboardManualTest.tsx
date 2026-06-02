import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { DetectionSummaryCard } from '@/components/dashboard/DetectionSummaryCard';
import { detectionBoxClass, detectionLabelClass } from '@/lib/detectionDisplay';
import type { DetectionSummary } from '@/lib/detectionSummary';
import type { ProjectListItem } from '@/hooks/useProjects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  AlertCircle, AlertTriangle, ImagePlus, Loader2, ScanSearch, Target, Upload, X,
} from 'lucide-react';

interface Prediction {
  class: string;
  confidence: number;
  bbox: number[];
  vehicle_bbox?: number[];
  vehicle_type?: string;
  vehicle_confidence?: number;
  pipeline?: string;
}

interface PredictResponse {
  model_id: string;
  model_name: string;
  architecture: string;
  predictions: Prediction[];
  primary_class: string | null;
  primary_confidence: number | null;
  confidence_threshold?: number;
  raw_detection_count?: number;
  vehicle_count?: number;
  detected_vehicles?: { bbox: number[]; confidence: number; vehicle_type?: string; label: string }[];
  summary?: DetectionSummary;
  warnings?: string[];
  latency_ms: number;
  message: string;
}

interface InferenceStatus {
  ready: boolean;
  model_name?: string;
  classes?: string[];
  class_count?: number;
  single_class_model?: boolean;
  retrain_tip?: string | null;
}

interface Props {
  projects: ProjectListItem[];
  compact?: boolean;
}

export function DashboardManualTest({ projects, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<InferenceStatus | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minConfidence, setMinConfidence] = useState(0.72);

  const modelProjects = useMemo(
    () => projects.filter((p) => p.has_model),
    [projects],
  );

  useEffect(() => {
    if (!projectId && modelProjects.length) {
      setProjectId(modelProjects[0].id);
    }
  }, [modelProjects, projectId]);

  useEffect(() => {
    if (!projectId) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    api.get<InferenceStatus>(`/api/v1/inference/project/${projectId}/status`)
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
        if (data.single_class_model) setMinConfidence(0.85);
      })
      .catch(() => { if (!cancelled) setStatus({ ready: false }); });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clearImage = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const pickFile = (list: FileList | null) => {
    const picked = list?.[0];
    if (!picked || !picked.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }
    setFile(picked);
    setResult(null);
    setError(null);
  };

  const runTest = useCallback(async () => {
    if (!projectId || !file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('min_confidence', String(minConfidence));
      const data = await api.post<PredictResponse>(
        `/api/v1/inference/project/${projectId}/predict`,
        form,
      );
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prediction failed');
    } finally {
      setLoading(false);
    }
  }, [file, minConfidence, projectId]);

  const sortedPredictions = useMemo(
    () => [...(result?.predictions ?? [])].sort((a, b) => b.confidence - a.confidence),
    [result],
  );

  const filteredNote = result && (result.raw_detection_count ?? 0) > sortedPredictions.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ScanSearch className="h-5 w-5 text-primary" />
          Manual Test · اختبار يدوي
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          مساران: <strong>مركبات + حادث (نعم/لا)</strong> · <strong>طريق + حفر/عيوب (نعم/لا)</strong>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {modelProjects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No trained models yet. Train a model on a project first.
          </div>
        ) : (
          <>
            {status?.single_class_model && (
              <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  نموذج بصنف واحد فقط — إذا ظهر «حادث» على صورة سليمة، أضف 500+ صورة سيارات بدون حادث
                  (بدون تسمية) وأعد التدريب.
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-muted-foreground shrink-0">Project</label>
              <select
                className="h-9 flex-1 min-w-[180px] rounded-md border border-border bg-background px-3 text-sm"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setResult(null);
                  setError(null);
                }}
              >
                {modelProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {status?.ready && status.model_name && (
                <Badge variant="success" className="shrink-0">{status.model_name}</Badge>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Confidence threshold</span>
                <span className="font-mono">{(minConfidence * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={0.99}
                step={0.01}
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            {status?.classes && status.classes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {status.classes.map((cls) => (
                  <Badge key={cls} variant="outline" className="text-[10px]">{cls}</Badge>
                ))}
              </div>
            )}

            <div
              className={cn(
                'relative rounded-xl border-2 border-dashed transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-border',
                file ? 'p-3' : compact ? 'p-6' : 'p-8',
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files);
              }}
            >
              {!file ? (
                <div className="text-center space-y-3">
                  <ImagePlus className="h-10 w-10 mx-auto text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">Drop an image here or browse</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                    <Upload className="h-4 w-4" /> Choose image
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground truncate">{file.name}</p>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={clearImage}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {previewUrl && (
                    <div className="relative inline-block max-w-full">
                      <img
                        src={previewUrl}
                        alt="Test"
                        className="block max-w-full max-h-64 h-auto rounded-lg border border-border"
                      />
                      {sortedPredictions.map((p, i) => (
                        <div
                          key={`${p.class}-${i}`}
                          className={cn('absolute border-2 rounded-sm pointer-events-none', detectionBoxClass(p.class))}
                          style={{
                            left: `${p.bbox[0] * 100}%`,
                            top: `${p.bbox[1] * 100}%`,
                            width: `${Math.max(0, (p.bbox[2] - p.bbox[0]) * 100)}%`,
                            height: `${Math.max(0, (p.bbox[3] - p.bbox[1]) * 100)}%`,
                          }}
                        >
                          <span className={cn(
                            'absolute -top-5 right-0 text-[10px] font-semibold text-white px-1 rounded whitespace-nowrap',
                            detectionLabelClass(p.class),
                          )}>
                            {p.class} {(p.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                      <p className="text-[10px] text-muted-foreground pt-1">
                        <span className="inline-block w-3 h-0.5 bg-blue-500 align-middle mr-1" /> حوادث
                        <span className="inline-block w-3 h-0.5 bg-orange-500 align-middle mx-1 ml-3" /> حفر
                      </p>
                    </div>
                  )}
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={runTest} disabled={!file || !projectId || loading || !status?.ready}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                {loading ? 'Analyzing…' : 'Run test'}
              </Button>
              {file && (
                <Button type="button" variant="outline" onClick={clearImage} disabled={loading}>
                  Clear
                </Button>
              )}
            </div>

            {error && (
              <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {result && (
              <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
                {result.summary && (
                  <DetectionSummaryCard summary={result.summary} />
                )}

                {result.primary_class ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Detected class</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-2xl font-bold text-primary">{result.primary_class}</span>
                      <Badge variant="success">
                        {(result.primary_confidence! * 100).toFixed(1)}% confidence
                      </Badge>
                    </div>
                  </div>
                ) : result.vehicle_count && result.vehicle_count > 0 ? (
                  <div>
                    <p className="text-sm font-medium text-blue-700">
                      {result.vehicle_count} vehicle(s) detected
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Model did not confirm accident class at the current threshold — vehicle boxes shown from detector.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-emerald-700">No detection above threshold</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {filteredNote
                        ? `Model saw ${result.raw_detection_count} box(es) but all were below ${((result.confidence_threshold ?? minConfidence) * 100).toFixed(0)}% or filtered as full-frame false positives.`
                        : 'Nothing detected in this image.'}
                    </p>
                  </div>
                )}

                {result.warnings?.map((w) => (
                  <p key={w} className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 rounded px-2 py-1.5">{w}</p>
                ))}

                {sortedPredictions.length > 1 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">All detections</p>
                    <div className="space-y-1.5">
                      {sortedPredictions.map((p, i) => (
                        <div key={`${p.class}-${i}`} className="flex items-center justify-between text-sm rounded-md bg-background/80 px-3 py-2">
                          <span className="font-medium">{p.class}</span>
                          <span className="text-muted-foreground font-mono">{(p.confidence * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">
                  {result.model_name} · threshold {((result.confidence_threshold ?? minConfidence) * 100).toFixed(0)}% · {result.latency_ms.toFixed(0)} ms
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
