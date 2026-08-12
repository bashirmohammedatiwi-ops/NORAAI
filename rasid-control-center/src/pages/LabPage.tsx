import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { DetectionCanvas } from '@/components/lab/DetectionCanvas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useControlContext } from '@/context/ControlContext';
import { useLabConfig, useLabPredict, useLabPredictBatch } from '@/hooks/useLabPredict';
import {
  classColor,
  downloadCanvas,
  extractVideoFrames,
  filterDetections,
  loadLabHistory,
  pushLabHistory,
  type LabHistoryEntry,
  type LabPredictParams,
  type LabPredictResult,
} from '@/lib/predictLab';
import { cn } from '@/lib/utils';
import {
  Activity, ChevronDown, ChevronUp, ClipboardPaste, Code2, Gauge,
  Download, Film, ImageIcon, Loader2, Play, Sparkles, Target, Timer, Upload, Zap,
} from 'lucide-react';

type MediaMode = 'image' | 'video';
type ResultTab = 'detections' | 'json' | 'timeline';

const FAST_PARAMS: LabPredictParams = { conf: 0.25, iou: 0.45, imgsz: 320 };

interface FrameResult {
  time: number;
  result: LabPredictResult;
  previewUrl: string;
}

export default function LabPage() {
  const { projectId } = useControlContext();
  const { data: labConfig } = useLabConfig();
  const predict = useLabPredict(projectId);
  const predictBatch = useLabPredictBatch(projectId);

  const [mode, setMode] = useState<MediaMode>('image');
  const [fastMode, setFastMode] = useState(true);
  const [params, setParams] = useState<LabPredictParams>(FAST_PARAMS);
  const [minConf, setMinConf] = useState(0.15);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<LabPredictResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAnnotated, setShowAnnotated] = useState(false);
  const [resultTab, setResultTab] = useState<ResultTab>('detections');
  const [history, setHistory] = useState<LabHistoryEntry[]>(() => loadLabHistory());
  const [videoFps, setVideoFps] = useState(2);
  const [frameResults, setFrameResults] = useState<FrameResult[]>([]);
  const [frameProgress, setFrameProgress] = useState<{ done: number; total: number } | null>(null);
  const [activeFrameIdx, setActiveFrameIdx] = useState(0);
  const [frameImageEl, setFrameImageEl] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteFlash, setPasteFlash] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!labConfig) return;
    if (fastMode && labConfig.fast_defaults) setParams(labConfig.fast_defaults);
    else if (labConfig.defaults) setParams(labConfig.defaults);
  }, [labConfig, fastMode]);

  useEffect(() => {
    const url = frameResults[activeFrameIdx]?.previewUrl;
    if (!url) {
      setFrameImageEl(null);
      return;
    }
    const img = new Image();
    img.src = url;
    img.onload = () => setFrameImageEl(img);
  }, [frameResults, activeFrameIdx]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      frameResults.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetMedia = useCallback(() => {
    setResult(null);
    setFrameResults([]);
    setFrameProgress(null);
    setActiveFrameIdx(0);
    setSelectedId(null);
    setError(null);
    setImageEl(null);
    setVideoEl(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    frameResults.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setPreviewUrl(null);
  }, [previewUrl, frameResults]);

  const loadFile = useCallback(async (f: File) => {
    resetMedia();
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);

    if (f.type.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(f.name)) {
      setMode('video');
      const vid = hiddenVideoRef.current ?? document.createElement('video');
      vid.src = url;
      vid.muted = true;
      vid.playsInline = true;
      await new Promise<void>((resolve, reject) => {
        vid.onloadeddata = () => resolve();
        vid.onerror = () => reject(new Error('تعذّر تحميل الفيديو'));
      });
      setVideoEl(vid);
    } else {
      setMode('image');
      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('تعذّر تحميل الصورة'));
      });
      setImageEl(img);
    }
  }, [resetMedia]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) await loadFile(f);
  }, [loadFile]);

  const pasteImageFromClipboard = useCallback(async (clipboard: DataTransfer | null) => {
    if (!clipboard) return false;
    const items = clipboard.items ?? [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item.type.startsWith('image/')) continue;
      const blob = item.getAsFile();
      if (!blob) continue;
      const ext = item.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      const pasted = new File([blob], `pasted-${Date.now()}.${ext}`, { type: item.type });
      await loadFile(pasted);
      setPasteFlash(true);
      window.setTimeout(() => setPasteFlash(false), 1800);
      return true;
    }
    return false;
  }, [loadFile]);

  const onPaste = useCallback(async (e: React.ClipboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    const ok = await pasteImageFromClipboard(e.clipboardData);
    if (ok) e.preventDefault();
  }, [pasteImageFromClipboard]);

  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      void pasteImageFromClipboard(e.clipboardData).then((ok) => {
        if (ok) e.preventDefault();
      });
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, [pasteImageFromClipboard]);

  const runImagePredict = async () => {
    if (!file || !projectId) return;
    setError(null);
    try {
      const res = await predict.mutateAsync({ file, filename: file.name, params });
      setResult(res);
      setShowAnnotated(!!res.annotated_image);
      const top = res.detections[0]?.class;
      const entry: LabHistoryEntry = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        filename: file.name,
        mode: 'image',
        count: res.count,
        latency_ms: res.latency_ms,
        top_class: top,
      };
      pushLabHistory(entry);
      setHistory(loadLabHistory());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحليل');
    }
  };

  const runVideoPredict = async () => {
    if (!file || !projectId) return;
    setError(null);
    setFrameResults([]);
    setResult(null);
    try {
      setFrameProgress({ done: 0, total: 1 });
      const maxEdge = fastMode ? 640 : 960;
      const frames = await extractVideoFrames(file, videoFps, 60, (done, total) => {
        setFrameProgress({ done, total: total + 1 });
      }, maxEdge);

      setFrameProgress({ done: frames.length, total: frames.length + 1 });
      const batch = await predictBatch.mutateAsync({
        frames: frames.map((f, i) => ({ blob: f.blob, filename: `frame_${i}.jpg` })),
        params,
      });

      const results: FrameResult[] = batch.results.map((res, idx) => ({
        time: frames[idx]?.time ?? idx,
        result: res,
        previewUrl: URL.createObjectURL(frames[idx].blob),
      }));

      setFrameProgress(null);
      if (results.length) {
        setFrameResults(results);
        setActiveFrameIdx(0);
        setResult(results[0].result);
        const totalDetections = results.reduce((s, r) => s + r.result.count, 0);
        const entry: LabHistoryEntry = {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          filename: file.name,
          mode: 'video',
          count: totalDetections,
          latency_ms: batch.total_latency_ms,
        };
        pushLabHistory(entry);
        setHistory(loadLabHistory());
      }
    } catch (e) {
      setFrameProgress(null);
      setError(e instanceof Error ? e.message : 'فشل تحليل الفيديو');
    }
  };

  const runPredict = () => {
    if (mode === 'video') runVideoPredict();
    else runImagePredict();
  };

  const activeDetections = useMemo(() => {
    if (mode === 'video' && frameResults.length) {
      return frameResults[activeFrameIdx]?.result.detections ?? [];
    }
    return result?.detections ?? [];
  }, [mode, frameResults, activeFrameIdx, result]);

  const filtered = useMemo(
    () => filterDetections(activeDetections, minConf).sort((a, b) => b.confidence - a.confidence),
    [activeDetections, minConf],
  );

  const classBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of filtered) map[d.class] = (map[d.class] ?? 0) + 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const handleExportImage = () => {
    const canvas = canvasWrapRef.current?.querySelector('canvas');
    if (canvas) downloadCanvas(canvas as HTMLCanvasElement, `rasid-lab-${Date.now()}.jpg`);
  };

  const handleExportJson = () => {
    const payload = result?.raw ?? frameResults[activeFrameIdx]?.result.raw;
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rasid-lab-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isRunning = predict.isPending || predictBatch.isPending || !!frameProgress;
  const apiReady = labConfig?.configured !== false;
  const labReady = apiReady && labConfig?.api_key_configured !== false;

  return (
    <div className="page-shell lab-shell" onPaste={onPaste}>
      <TopBar
        title="مختبر الاختبار"
        subtitle="رفع صورة أو فيديو · تحليل فوري بالنموذج exp-3-turin"
        actions={(
          <Button onClick={runPredict} disabled={!file || isRunning || !labReady} className="gap-2 shadow-md">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {isRunning ? 'جاري التحليل...' : 'تشغيل النموذج'}
          </Button>
        )}
      />

      <div className="page-body">
        <div className="grid gap-6 xl:grid-cols-12">
          {/* Left — Upload & Params */}
          <div className="space-y-4 xl:col-span-3">
            <Card className="overflow-hidden ring-1 ring-primary/10">
              <div className="lab-gradient-bar" />
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Upload className="h-4 w-4 text-primary" />
                  رفع الوسائط
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex rounded-lg border border-border p-1">
                  <button
                    type="button"
                    onClick={() => setMode('image')}
                    className={cn('flex flex-1 items-center justify-center gap-1 rounded-md py-2 text-xs font-semibold transition', mode === 'image' ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:bg-accent')}
                  >
                    <ImageIcon className="h-3.5 w-3.5" /> صورة
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('video')}
                    className={cn('flex flex-1 items-center justify-center gap-1 rounded-md py-2 text-xs font-semibold transition', mode === 'video' ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:bg-accent')}
                  >
                    <Film className="h-3.5 w-3.5" /> فيديو
                  </button>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onPaste={onPaste}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'lab-dropzone cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/40 hover:bg-accent/50',
                    pasteFlash && 'border-primary bg-primary/10 ring-2 ring-primary/30',
                  )}
                >
                  <Sparkles className="mx-auto h-8 w-8 text-primary/70" />
                  <p className="mt-2 text-sm font-semibold">اسحب ملفاً أو انقر للرفع</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {mode === 'image' ? 'JPG · PNG · WEBP' : 'MP4 · WEBM · MOV · حتى 80MB'}
                  </p>
                  {mode === 'image' && (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                      <ClipboardPaste className="h-3 w-3" />
                      {pasteFlash ? 'تم لصق الصورة!' : 'Ctrl+V أو ⌘V للصق من الحافظة'}
                    </p>
                  )}
                  {file && (
                    <Badge className="mt-3 border-primary/20 bg-primary/10 text-primary">{file.name}</Badge>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={mode === 'image' ? 'image/*' : 'video/*'}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }}
                  />
                </div>

                {mode === 'video' && (
                  <div>
                    <label className="mb-1 flex justify-between text-xs font-medium text-muted-foreground">
                      <span>معدل الإطارات</span>
                      <span>{videoFps} fps</span>
                    </label>
                    <input type="range" min={0.5} max={5} step={0.5} value={videoFps} onChange={(e) => setVideoFps(Number(e.target.value))} className="w-full accent-primary" />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-primary" />
                  معاملات YOLO
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <button
                  type="button"
                  onClick={() => setFastMode((v) => !v)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-semibold transition',
                    fastMode ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent',
                  )}
                >
                  <span className="inline-flex items-center gap-2"><Gauge className="h-4 w-4" />وضع السرعة القصوى</span>
                  <span className="text-xs">{fastMode ? '320px · ON' : 'OFF'}</span>
                </button>
                {([
                  ['conf', 'Confidence', 0.05, 0.95, 0.05],
                  ['iou', 'IoU NMS', 0.1, 0.95, 0.05],
                  ['imgsz', 'Image Size', 320, 1280, 32],
                ] as const).map(([key, label, min, max, step]) => (
                  <div key={key}>
                    <label className="mb-1 flex justify-between text-xs font-medium text-muted-foreground">
                      <span>{label}</span>
                      <span>{params[key]}</span>
                    </label>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={params[key]}
                      onChange={(e) => setParams((p) => ({ ...p, [key]: Number(e.target.value) }))}
                      className="w-full accent-primary"
                    />
                  </div>
                ))}

                <div>
                  <label className="mb-1 flex justify-between text-xs font-medium text-muted-foreground">
                    <span>فلتر العرض</span>
                    <span>{(minConf * 100).toFixed(0)}%</span>
                  </label>
                  <input type="range" min={0} max={0.95} step={0.05} value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className="w-full accent-primary" />
                </div>
              </CardContent>
            </Card>

            {history.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">آخر الاختبارات</CardTitle>
                </CardHeader>
                <CardContent className="max-h-48 space-y-2 overflow-y-auto">
                  {history.slice(0, 6).map((h) => (
                    <div key={h.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                      <span className="truncate font-medium">{h.filename}</span>
                      <Badge className="border-border">{h.count} · {h.latency_ms}ms</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Center — Viewer */}
          <div className="xl:col-span-6">
            <Card className="lab-viewer-card overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between border-b bg-gradient-to-l from-primary/5 to-transparent py-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-primary" />
                  المعاينة
                </CardTitle>
                <div className="flex gap-2">
                  {result?.annotated_image && (
                    <Button size="sm" variant="outline" onClick={() => setShowAnnotated((v) => !v)}>
                      {showAnnotated ? 'الأصل' : 'نتيجة مُعلّمة'}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={handleExportImage} disabled={!filtered.length && !previewUrl}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="relative flex min-h-[420px] items-center justify-center bg-[radial-gradient(circle_at_center,hsl(168_76%_36%/0.04),transparent_70%)] p-4">
                {frameProgress && (
                  <div className="absolute inset-x-4 top-4 z-10 rounded-lg bg-white/95 p-3 shadow-lg ring-1 ring-border">
                    <div className="mb-1 flex justify-between text-xs font-medium">
                      <span>{mode === 'video' ? 'تحليل إطارات الفيديو' : 'جاري التحليل'}</span>
                      <span>{frameProgress.done}/{frameProgress.total}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${(frameProgress.done / frameProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {!previewUrl && (
                  <div className="text-center text-muted-foreground">
                    <Play className="mx-auto h-12 w-12 opacity-30" />
                    <p className="mt-3 text-sm">ارفع صورة أو فيديو لبدء الاختبار</p>
                    <p className="mt-1 text-xs text-muted-foreground">أو الصق صورة من الحافظة · Ctrl+V</p>
                  </div>
                )}

                {previewUrl && (
                  <div ref={canvasWrapRef} className="relative flex max-h-[520px] w-full items-center justify-center">
                    {showAnnotated && result?.annotated_image ? (
                      <img src={result.annotated_image} alt="annotated" className="max-h-[520px] max-w-full rounded-lg shadow-lg ring-1 ring-black/10" />
                    ) : mode === 'image' && imageEl ? (
                      <DetectionCanvas media={imageEl} detections={activeDetections} selectedId={selectedId} minConf={minConf} />
                    ) : mode === 'video' && frameResults.length && frameImageEl ? (
                      <DetectionCanvas
                        media={frameImageEl}
                        detections={activeDetections}
                        selectedId={selectedId}
                        minConf={minConf}
                      />
                    ) : mode === 'video' && videoEl ? (
                      <video src={previewUrl} controls className="max-h-[520px] max-w-full rounded-lg shadow-lg" />
                    ) : mode === 'image' ? (
                      <img src={previewUrl} alt="" className="max-h-[520px] max-w-full rounded-lg" />
                    ) : null}
                  </div>
                )}

                {error && (
                  <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
              </CardContent>

              {mode === 'video' && frameResults.length > 1 && (
                <div className="border-t p-4">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">خط زمني — {frameResults.length} إطار</p>
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {frameResults.map((fr, idx) => (
                      <button
                        key={fr.time}
                        type="button"
                        onClick={() => { setActiveFrameIdx(idx); setResult(fr.result); }}
                        className={cn(
                          'relative h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2 transition',
                          idx === activeFrameIdx ? 'ring-primary' : 'ring-transparent hover:ring-primary/30',
                        )}
                      >
                        <img src={fr.previewUrl} alt="" className="h-full w-full object-cover" />
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-[9px] text-white">
                          {fr.result.count} · {fr.time.toFixed(1)}s
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Right — Results */}
          <div className="space-y-4 xl:col-span-3">
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3">
                <p className="text-[10px] font-medium text-muted-foreground">الاكتشافات</p>
                <p className="stat-value text-primary">{filtered.length}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" />الاستجابة</p>
                <p className="stat-value">{result?.inference_ms ?? result?.latency_ms ?? '—'}<span className="text-sm font-normal text-muted-foreground">ms</span></p>
                {result?.inference_ms != null && result.latency_ms !== result.inference_ms && (
                  <p className="text-[10px] text-muted-foreground">إجمالي {result.latency_ms}ms</p>
                )}
              </Card>
            </div>

            <Card>
              <div className="flex border-b">
                {([
                  ['detections', 'النتائج'],
                  ['json', 'JSON'],
                  ...(mode === 'video' && frameResults.length ? [['timeline', 'الخط الزمني']] as const : []),
                ] as [ResultTab, string][]).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setResultTab(tab)}
                    className={cn(
                      'flex-1 py-2.5 text-xs font-semibold transition',
                      resultTab === tab ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <CardContent className="max-h-[480px] overflow-y-auto p-0">
                {resultTab === 'detections' && (
                  <div className="divide-y">
                    {!filtered.length && (
                      <p className="p-4 text-sm text-muted-foreground">لا نتائج بعد — شغّل النموذج</p>
                    )}
                    {filtered.map((det) => (
                      <button
                        key={det.id}
                        type="button"
                        onClick={() => setSelectedId(det.id === selectedId ? null : det.id)}
                        className={cn(
                          'flex w-full items-center gap-3 p-3 text-right transition hover:bg-accent/50',
                          selectedId === det.id && 'bg-primary/5 ring-1 ring-inset ring-primary/20',
                        )}
                      >
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: classColor(det.class) }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{det.class}</p>
                          <p className="text-[10px] text-muted-foreground">
                            bbox: [{det.bbox.map((n) => n.toFixed(0)).join(', ')}]
                          </p>
                        </div>
                        <Badge style={{ background: `${classColor(det.class)}18`, color: classColor(det.class), borderColor: `${classColor(det.class)}40` }}>
                          {(det.confidence * 100).toFixed(1)}%
                        </Badge>
                        {selectedId === det.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4 opacity-40" />}
                      </button>
                    ))}
                  </div>
                )}

                {resultTab === 'json' && (
                  <div className="p-3">
                    <div className="mb-2 flex justify-end">
                      <Button size="sm" variant="outline" onClick={handleExportJson} disabled={!result}>
                        <Code2 className="h-3.5 w-3.5" /> تصدير
                      </Button>
                    </div>
                    <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-relaxed text-emerald-300">
                      {JSON.stringify(result?.raw ?? {}, null, 2)}
                    </pre>
                  </div>
                )}

                {resultTab === 'timeline' && (
                  <div className="space-y-2 p-3">
                    {frameResults.map((fr, idx) => (
                      <button
                        key={fr.time}
                        type="button"
                        onClick={() => { setActiveFrameIdx(idx); setResult(fr.result); }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs transition',
                          idx === activeFrameIdx ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                        )}
                      >
                        <span className="font-mono text-muted-foreground">{fr.time.toFixed(1)}s</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${Math.min(100, fr.result.count * 25)}%` }} />
                        </div>
                        <span className="font-bold">{fr.result.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {classBreakdown.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">توزيع الفئات</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {classBreakdown.map(([cls, count]) => (
                    <div key={cls} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: classColor(cls) }} />
                      <span className="flex-1 font-medium">{cls}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <video ref={hiddenVideoRef} className="hidden" muted playsInline />
    </div>
  );
}
