import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle, Archive, CheckCircle2, FileText, Loader2, Upload } from 'lucide-react';

interface ProjectClass {
  id: string;
  name: string;
  color: string;
}

interface PreviewData {
  image_count: number;
  labeled_count: number;
  raw_image_files?: number;
  raw_label_files?: number;
  detected_class_ids: number[];
  yolo_class_names: string[];
  suggested_mapping: Record<string, string>;
  warning?: string | null;
  valid?: boolean;
}

interface Props {
  datasetId: string;
  classes: ProjectClass[];
  disabled?: boolean;
  onComplete?: (result: { imported: number; trainingJobId?: string | null }) => void;
}

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full bg-violet-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function YoloLabelsUpload({ datasetId, classes, disabled, onComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [trainAfter, setTrainAfter] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'upload' | 'preview' | 'import' | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState('');

  const classNames = classes.map((c) => c.name);
  const defaultClass = classNames[0] ?? 'حفر';
  const canImport = Boolean(preview?.valid && preview.image_count > 0);
  const busy = phase === 'upload' || phase === 'preview' || phase === 'import';

  const reset = () => {
    setUploadId(null);
    setPreview(null);
    setMapping({});
    setTaskId(null);
    setStatus('');
    setUploadProgress(0);
    setImportProgress(0);
    setError('');
    setPhase(null);
  };

  const applyPreview = (data: PreviewData) => {
    setPreview(data);
    const base = { ...data.suggested_mapping };
    for (const id of data.detected_class_ids) {
      const key = String(id);
      if (!base[key]) base[key] = defaultClass;
    }
    setMapping(base);
    if (!data.valid || data.image_count === 0) {
      setError(data.warning ?? 'الأرشيف غير صالح — لا توجد صور مطابقة');
    }
  };

  const runUploadAndPreview = useCallback(async (f: File) => {
    if (!f || !datasetId) return;
    setPhase('upload');
    setUploadProgress(0);
    setError('');

    try {
      const uploadForm = new FormData();
      uploadForm.append('archive', f);
      const uploaded = await api.postFormWithProgress<{ upload_id: string; size_bytes: number; message: string }>(
        `/api/v1/datasets/${datasetId}/import-yolo/upload`,
        uploadForm,
        (loaded, total) => {
          const pct = total > 0 ? Math.round((loaded / total) * 100) : Math.min(99, Math.round(loaded / f.size * 100));
          setUploadProgress(pct);
        },
      );
      setUploadId(uploaded.upload_id);
      setUploadProgress(100);

      setPhase('preview');
      const previewForm = new FormData();
      previewForm.append('upload_id', uploaded.upload_id);
      const data = await api.post<PreviewData>(
        `/api/v1/datasets/${datasetId}/import-yolo/preview`,
        previewForm,
        undefined,
        600_000,
      );
      applyPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل رفع أو تحليل الأرشيف');
      setPreview(null);
      setUploadId(null);
    } finally {
      setPhase(null);
    }
  }, [datasetId, defaultClass]);

  const handleFile = (f: File | null) => {
    setFile(f);
    reset();
    if (f) void runUploadAndPreview(f);
  };

  const startImport = async () => {
    if (!uploadId || !datasetId || !preview || !canImport) return;
    setPhase('import');
    setError('');
    try {
      const form = new FormData();
      form.append('upload_id', uploadId);
      form.append('class_mapping', JSON.stringify(mapping));
      form.append('train_after_import', trainAfter ? 'true' : 'false');
      const res = await api.post<{ task_id: string; message: string }>(
        `/api/v1/datasets/${datasetId}/import-yolo`,
        form,
        undefined,
        120_000,
      );
      setTaskId(res.task_id);
      setStatus(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل بدء الاستيراد');
      setPhase(null);
    }
  };

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const st = await api.get<{
          state: string;
          progress?: number;
          imported?: number;
          annotations?: number;
          training_job_id?: string | null;
          error?: string;
        }>(`/api/v1/datasets/import-yolo/${taskId}/status`);
        if (cancelled) return;
        setImportProgress(st.progress ?? 0);
        if (st.state === 'progress' || st.state === 'PROGRESS') {
          setStatus(`استيراد… ${st.imported ?? 0} صورة · ${st.annotations ?? 0} صندوق`);
        } else if (st.state === 'completed') {
          setPhase(null);
          setStatus(`تم: ${st.imported ?? 0} صورة · ${st.annotations ?? 0} تسمية`);
          onComplete?.({ imported: st.imported ?? 0, trainingJobId: st.training_job_id });
          return;
        } else if (st.state === 'failed') {
          setPhase(null);
          setError(st.error ?? 'فشل الاستيراد');
          return;
        } else {
          setStatus('في قائمة الانتظار…');
        }
        window.setTimeout(poll, 2000);
      } catch {
        if (!cancelled) window.setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [taskId, onComplete]);

  const ready = Boolean(datasetId && !disabled && classes.length > 0);

  return (
    <div className="space-y-4">
      <div
        onClick={() => ready && !busy && inputRef.current?.click()}
        className={cn(
          'rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
          ready ? 'border-violet-300/60 bg-violet-500/5 hover:border-violet-400' : 'opacity-50 cursor-not-allowed',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          disabled={!ready || busy}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <Archive className="h-8 w-8 mx-auto text-violet-600 mb-2" />
        <p className="font-medium">رفع أرشيف YOLO (ZIP)</p>
        <p className="text-sm text-muted-foreground mt-1">
          يجب أن يحتوي على مجلدين: <code className="text-xs">images/</code> + <code className="text-xs">labels-YOLO/</code>
        </p>
        <p className="text-xs text-muted-foreground mt-1">الحد الأقصى: 4 GB</p>
        {file && (
          <p className="text-xs mt-2 text-violet-700">
            {file.name} ({formatMb(file.size)} MB)
            {file.size < 5 * 1024 * 1024 && (
              <span className="block text-amber-700 mt-1">حجم صغير — غالباً تسميات فقط بدون صور</span>
            )}
            {file.size > 500 * 1024 * 1024 && (
              <span className="block text-amber-700 mt-1">ملف كبير — سيستغرق الرفع عدة دقائق</span>
            )}
          </p>
        )}
      </div>

      {phase === 'upload' && (
        <ProgressBar value={uploadProgress} label={`جاري رفع الملف… ${uploadProgress}%`} />
      )}

      {phase === 'preview' && (
        <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري تحليل الأرشيف…
        </p>
      )}

      {preview && (
        <div className="rounded-xl border border-border p-4 space-y-3 text-sm">
          <p>
            <strong>{preview.image_count}</strong> زوج صورة+تسمية
            {(preview.raw_image_files ?? 0) > 0 && (
              <span className="text-muted-foreground text-xs"> · {preview.raw_image_files} صورة في الأرشيف</span>
            )}
            {(preview.raw_label_files ?? 0) > 0 && (
              <span className="text-muted-foreground text-xs"> · {preview.raw_label_files} ملف .txt</span>
            )}
          </p>

          {preview.warning && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-100 text-xs flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p>{preview.warning}</p>
                <p className="mt-2 font-medium">الصحيح في PowerShell:</p>
                <code className="block mt-1 text-[10px] break-all bg-black/5 dark:bg-white/5 p-2 rounded">
                  Compress-Archive -Path &quot;...\data\*&quot; -DestinationPath road-dataset.zip
                </code>
              </div>
            </div>
          )}

          {preview.yolo_class_names.length > 0 && (
            <p className="text-muted-foreground text-xs">
              أصناف الأرشيف: {preview.yolo_class_names.map((n, i) => `${i}=${n}`).join('، ')}
            </p>
          )}

          {canImport && (
            <>
              <div className="space-y-2">
                <p className="font-medium text-xs">ربط أصناف YOLO بأصناف المشروع:</p>
                {preview.detected_class_ids.map((id) => {
                  const yoloName = preview.yolo_class_names[id] ?? `class_${id}`;
                  return (
                    <div key={id} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono bg-secondary px-2 py-1 rounded">{id} · {yoloName}</span>
                      <span className="text-muted-foreground">→</span>
                      <select
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                        value={mapping[String(id)] ?? defaultClass}
                        onChange={(e) => setMapping((m) => ({ ...m, [String(id)]: e.target.value }))}
                      >
                        {classNames.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={trainAfter} onChange={(e) => setTrainAfter(e.target.checked)} />
                بدء التدريب تلقائياً بعد الاستيراد
              </label>
              <Button
                type="button"
                onClick={startImport}
                disabled={phase === 'import' || !!taskId}
                className="w-full"
              >
                {phase === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                استيراد والتدريب ({preview.image_count} صورة)
              </Button>
            </>
          )}

          {!canImport && file && uploadId && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPhase('preview');
                setError('');
                const previewForm = new FormData();
                previewForm.append('upload_id', uploadId);
                api.post<PreviewData>(
                  `/api/v1/datasets/${datasetId}/import-yolo/preview`,
                  previewForm,
                  undefined,
                  600_000,
                ).then(applyPreview).catch((e) => {
                  setError(e instanceof Error ? e.message : 'فشل التحليل');
                }).finally(() => setPhase(null));
              }}
              className="w-full"
            >
              <FileText className="h-4 w-4" /> إعادة التحليل
            </Button>
          )}
        </div>
      )}

      {phase === 'import' && importProgress > 0 && importProgress < 100 && (
        <ProgressBar value={importProgress} label={`جاري الاستيراد… ${importProgress}%`} />
      )}

      {status && !error && (
        <p className="text-sm text-emerald-700 flex items-center gap-2">
          {taskId && phase === 'import' && <Loader2 className="h-4 w-4 animate-spin" />}
          {taskId && !phase && <CheckCircle2 className="h-4 w-4" />}
          {status}
          {importProgress > 0 && importProgress < 100 && phase === 'import' && ` (${importProgress}%)`}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
