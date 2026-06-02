import { useCallback, useRef, useState } from 'react';
import { filterImageFiles, uploadImagesInBatches } from '@/lib/uploadBatches';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AlertCircle, CheckCircle2, FolderOpen, ImagePlus, Loader2, Upload, X,
} from 'lucide-react';

interface Props {
  datasetId: string;
  classId?: string;
  /** Upload without labels — for normal/background images to reduce false positives */
  backgroundMode?: boolean;
  className?: string;
  classColor?: string;
  disabled?: boolean;
  onComplete?: (uploaded: number) => void;
}

export function BulkImageUpload({
  datasetId,
  classId,
  backgroundMode = false,
  className,
  classColor,
  disabled,
  onComplete,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0, batch: 0, batches: 0 });
  const [result, setResult] = useState<{ uploaded: number; failed: number; errors: string[] } | null>(null);

  const ready = Boolean(datasetId && !disabled && (backgroundMode || classId));

  const startUpload = useCallback(async (files: File[]) => {
    if (!ready || !files.length) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setUploading(true);
    setResult(null);
    setQueuedCount(files.length);
    setProgress({ done: 0, total: files.length, batch: 0, batches: Math.ceil(files.length / 8) });

    const res = await uploadImagesInBatches({
      datasetId,
      classId: backgroundMode ? null : classId,
      files,
      batchSize: 8,
      parallel: 2,
      signal: controller.signal,
      onProgress: (done, total, batch, batches) => {
        setProgress({ done, total, batch, batches });
      },
    });

    if (!controller.signal.aborted) {
      setResult(res);
      if (res.uploaded > 0) onComplete?.(res.uploaded);
    }
    setUploading(false);
  }, [backgroundMode, classId, datasetId, onComplete, ready]);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const images = filterImageFiles(fileList);
    if (!images.length) {
      setResult({ uploaded: 0, failed: 0, errors: ['No valid image files selected'] });
      return;
    }
    startUpload(images);
  };

  const cancelUpload = () => {
    abortRef.current?.abort();
    setUploading(false);
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && ready && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (ready) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (ready) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => ready && !uploading && inputRef.current?.click()}
        className={cn(
          'relative rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer',
          !ready && 'border-amber-200 bg-amber-50/40 cursor-not-allowed',
          ready && !dragOver && !uploading && 'border-primary/25 bg-primary/[0.03] hover:border-primary/45 hover:bg-primary/[0.06]',
          dragOver && 'border-primary bg-primary/10 scale-[1.01]',
          uploading && 'border-primary/40 bg-primary/5 cursor-default',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={!ready || uploading}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="flex flex-col items-center gap-3">
          <div className={cn(
            'flex h-14 w-14 items-center justify-center rounded-2xl',
            ready ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}>
            {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <ImagePlus className="h-7 w-7" />}
          </div>

          <div>
            <p className="font-semibold text-base">
              {uploading
                ? `Uploading ${progress.done} / ${progress.total} images`
                : ready
                  ? 'Drop images here or click to browse'
                  : backgroundMode
                    ? 'Select a dataset first'
                    : 'Select a class first'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {backgroundMode
                ? 'رفع صور سليمة — بدون صناديق (اختر صنفاً من الأعلى لربطها كسليمة)'
                : `رفع لصنف ${className ?? ''} — بدون صندوق = سليمة ضمن نفس الصنف`}
            </p>
            {className && ready && (
              <span
                className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ backgroundColor: `${classColor ?? '#3b82f6'}22`, color: classColor ?? '#3b82f6' }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: classColor ?? '#3b82f6' }} />
                {className}
              </span>
            )}
          </div>

          {ready && !uploading && (
            <div className="flex gap-2 mt-1">
              <Button type="button" size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
                <FolderOpen className="h-4 w-4" /> Browse files
              </Button>
            </div>
          )}
        </div>
      </div>

      {uploading && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium">
              <Upload className="h-4 w-4 text-primary" />
              Batch {progress.batch} / {progress.batches}
            </span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.done} of {progress.total} processed</span>
            <span>{queuedCount} queued</span>
          </div>
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={cancelUpload}>
            <X className="h-4 w-4" /> Cancel upload
          </Button>
        </div>
      )}

      {result && !uploading && (
        <div className={cn(
          'rounded-xl border p-4 text-sm',
          result.failed === 0 ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80',
        )}>
          <div className="flex items-start gap-2">
            {result.failed === 0
              ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              : <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />}
            <div>
              <p className="font-medium text-foreground">
                {result.uploaded} image{result.uploaded !== 1 ? 's' : ''} uploaded
                {result.failed > 0 && ` · ${result.failed} failed`}
              </p>
              <p className="text-muted-foreground mt-0.5">
                {result.uploaded > 0
                  ? 'Processing in background — image count updates within 1–2 minutes'
                  : 'Upload failed — try again with a stable connection or fewer images at once'}
              </p>
              {result.errors.slice(0, 3).map((err) => (
                <p key={err} className="text-xs text-destructive mt-1">{err}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
