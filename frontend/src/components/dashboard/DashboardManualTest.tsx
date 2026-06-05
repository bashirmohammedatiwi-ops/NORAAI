import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { ProjectListItem } from '@/hooks/useProjects';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ImagePlus, Loader2, ScanSearch, Upload, X } from 'lucide-react';

interface ModelClass {
  name: string;
  color: string;
}

interface Detection {
  class: string;
  confidence: number;
  bbox: number[];
}

interface PredictResult {
  predictions: Detection[];
  all_predictions?: Detection[];
  count: number;
  raw_count?: number;
  best_confidence?: number;
  latency_ms: number;
}

interface InferenceStatus {
  ready: boolean;
  model_name?: string;
  classes?: ModelClass[];
  training_image_size?: number;
  inference_imgsz?: number;
  recommended_confidence?: number;
  map50_95?: number;
}

interface Props {
  projects: ProjectListItem[];
  compact?: boolean;
}

const MAX_BYTES = 8 * 1024 * 1024;

async function prepareImage(file: File, maxEdge: number): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('صورة غير صالحة');
  if (file.size <= MAX_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}

export function DashboardManualTest({ projects, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<InferenceStatus | null>(null);
  const [allDetections, setAllDetections] = useState<Detection[]>([]);
  const [bestConfidence, setBestConfidence] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [rawCount, setRawCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [minConfidence, setMinConfidence] = useState(0.05);
  const [serverThreshold, setServerThreshold] = useState<number | null>(null);

  const modelProjects = useMemo(() => projects.filter((p) => p.has_model), [projects]);

  const detections = useMemo(
    () => allDetections.filter((d) => d.confidence >= minConfidence),
    [allDetections, minConfidence],
  );

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of status?.classes ?? []) m.set(c.name, c.color);
    return m;
  }, [status?.classes]);

  useEffect(() => {
    if (!projectId && modelProjects.length) setProjectId(modelProjects[0].id);
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
        setMinConfidence(0.05);
      })
      .catch(() => { if (!cancelled) setStatus({ ready: false }); });
    api.post(`/api/v1/inference/project/${projectId}/warmup`, {}).catch(() => {});
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

  const runTest = useCallback(async (image: File) => {
    if (!projectId || !status?.ready) return;
    setLoading(true);
    setError('');
    setAllDetections([]);
    setBestConfidence(null);
    setLatencyMs(null);
    setRawCount(null);
    try {
      const prepared = await prepareImage(image, 1920);
      const form = new FormData();
      form.append('file', prepared);
      form.append('min_confidence', '0.05');
      form.append('simple', 'true');
      form.append('high_accuracy', 'true');
      const data = await api.post<PredictResult & {
        confidence_threshold?: number;
        training_image_size?: number;
        inference_imgsz?: number;
        recommended_confidence?: number;
      }>(
        `/api/v1/inference/project/${projectId}/predict`,
        form,
        undefined,
        60_000,
      );
      const raw = data.all_predictions ?? data.predictions ?? [];
      setAllDetections(raw);
      setBestConfidence(data.best_confidence ?? null);
      setLatencyMs(data.latency_ms ?? null);
      setRawCount(data.raw_count ?? null);
      setServerThreshold(data.confidence_threshold ?? null);

    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الاختبار');
    } finally {
      setLoading(false);
    }
  }, [projectId, status?.ready, status?.training_image_size, status?.inference_imgsz]);

  const pickFile = (list: FileList | null) => {
    const picked = list?.[0];
    if (!picked) return;
    setFile(picked);
    setAllDetections([]);
    setBestConfidence(null);
    setLatencyMs(null);
    setRawCount(null);
    setError('');
  };

  const clearAll = () => {
    setFile(null);
    setAllDetections([]);
    setBestConfidence(null);
    setLatencyMs(null);
    setRawCount(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  useEffect(() => {
    if (!file || !status?.ready) return;
    void runTest(file);
  }, [file, projectId, status?.ready, runTest]);

  const boxColor = (cls: string) => colorMap.get(cls) ?? '#22c55e';

  if (!modelProjects.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          لا يوجد نموذج مدرب
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className={cn('space-y-3', compact ? 'pt-4' : 'pt-5')}>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 flex-1 min-w-[160px] rounded-md border border-border bg-background px-3 text-sm"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              clearAll();
            }}
          >
            {modelProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {status?.model_name && (
            <span className="text-xs text-emerald-700 bg-emerald-500/10 px-2 py-1 rounded-md">{status.model_name}</span>
          )}
        </div>

        {status?.classes && status.classes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {status.classes.map((c) => (
              <span
                key={c.name}
                className="text-[10px] px-2 py-0.5 rounded-full border"
                style={{ borderColor: c.color, color: c.color }}
              >
                {c.name}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="shrink-0">العتبة</span>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.05}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="font-mono w-10 text-right">{(minConfidence * 100).toFixed(0)}%</span>
          </div>
          {(status?.training_image_size || status?.map50_95 != null) && (
            <p className="text-[10px] text-muted-foreground">
              {status.training_image_size ? `تدريب ${status.training_image_size}px` : ''}
              {status.inference_imgsz ? ` · استدلال ${status.inference_imgsz}px` : ''}
              {status.map50_95 != null ? ` · mAP ${(status.map50_95 * 100).toFixed(1)}%` : ''}
              {serverThreshold != null ? ` · خادم ${(serverThreshold * 100).toFixed(0)}%` : ''}
              {' · وضع دقة عالية'}
            </p>
          )}
        </div>

        <div
          className={cn(
            'relative rounded-xl border-2 border-dashed border-border',
            file ? 'p-2' : compact ? 'p-5' : 'p-8',
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pickFile(e.dataTransfer.files);
          }}
        >
          {!file ? (
            <div className="text-center space-y-2">
              <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <Upload className="h-4 w-4" /> اختر صورة
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground truncate">{file.name}</span>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={clearAll}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {previewUrl && (
                <div className="relative w-fit max-w-full mx-auto">
                  <img
                    src={previewUrl}
                    alt=""
                    className="block max-w-full max-h-[min(70vh,520px)] h-auto rounded-lg"
                  />
                  {detections.map((d, i) => {
                    const [x1, y1, x2, y2] = d.bbox;
                    const color = boxColor(d.class);
                    return (
                      <div
                        key={`${d.class}-${i}`}
                        className="absolute border-2 pointer-events-none"
                        style={{
                          left: `${x1 * 100}%`,
                          top: `${y1 * 100}%`,
                          width: `${Math.max(0, (x2 - x1) * 100)}%`,
                          height: `${Math.max(0, (y2 - y1) * 100)}%`,
                          borderColor: color,
                          backgroundColor: `${color}22`,
                        }}
                      >
                        <span
                          className="absolute -top-5 right-0 text-[10px] font-semibold text-white px-1 rounded whitespace-nowrap"
                          style={{ backgroundColor: color }}
                        >
                          {d.class} {(d.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={loading || !status?.ready}
            onChange={(e) => pickFile(e.target.files)}
          />
        </div>

        <div className="flex items-center gap-2 min-h-8">
          {loading && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">جاري الاختبار…</span>
            </>
          )}
          {!loading && file && (
            <>
              <ScanSearch className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {detections.length}
                {rawCount != null && rawCount > 0 ? `/${rawCount}` : ''} كشف
                {latencyMs != null && ` · ${latencyMs.toFixed(0)} ms`}
                {detections.length === 0 && rawCount != null && rawCount > 0 && (
                  <span className="text-amber-700"> · خفّض العتبة لعرض {rawCount} كشف</span>
                )}
                {detections.length === 0 && (rawCount ?? 0) === 0 && bestConfidence != null && bestConfidence > 0 && (
                  <span className="text-amber-700">
                    {' '}
                    · أعلى ثقة {(bestConfidence * 100).toFixed(0)}% — أعد التدريب بعد التحديث
                  </span>
                )}
              </span>
            </>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
