import { api } from '@/lib/api';

export interface BatchUploadResult {
  uploaded: number;
  failed: number;
  errors: string[];
}

export interface BatchUploadOptions {
  datasetId: string;
  classId?: string | null;
  files: File[];
  batchSize?: number;
  /** How many HTTP upload requests run at the same time */
  parallel?: number;
  onProgress?: (done: number, total: number, batchIndex: number, batchCount: number) => void;
  signal?: AbortSignal;
}

const IMAGE_TYPES = /^image\//;
const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_PARALLEL = 2;

export function filterImageFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter((f) => IMAGE_TYPES.test(f.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name));
}

function uploadTimeoutForBatch(batchLen: number): number {
  // Large batches on a slow VPS need more time for MinIO writes.
  return Math.min(300_000, 90_000 + batchLen * 12_000);
}

async function uploadOneBatch(
  datasetId: string,
  classId: string | null | undefined,
  batch: File[],
): Promise<void> {
  const form = new FormData();
  batch.forEach((f) => form.append('files', f));
  form.append('source_type', 'manual_upload');
  if (classId) form.append('class_id', classId);
  await api.post<{ message: string }>(
    `/api/v1/datasets/${datasetId}/upload`,
    form,
    undefined,
    uploadTimeoutForBatch(batch.length),
  );
}

export async function uploadImagesInBatches(opts: BatchUploadOptions): Promise<BatchUploadResult> {
  const {
    datasetId,
    classId,
    files,
    batchSize = DEFAULT_BATCH_SIZE,
    parallel = DEFAULT_PARALLEL,
    onProgress,
    signal,
  } = opts;

  const total = files.length;
  let uploaded = 0;
  let failed = 0;
  const errors: string[] = [];

  const batches: File[][] = [];
  for (let i = 0; i < total; i += batchSize) {
    batches.push(files.slice(i, i + batchSize));
  }
  const batchCount = batches.length;

  for (let start = 0; start < batchCount; start += parallel) {
    if (signal?.aborted) break;

    const chunk = batches.slice(start, start + parallel);
    const results = await Promise.allSettled(
      chunk.map((batch, offset) => uploadOneBatch(datasetId, classId, batch).then(() => start + offset + 1)),
    );

    results.forEach((result, idx) => {
      const batchLen = chunk[idx].length;
      const batchNum = start + idx + 1;
      if (result.status === 'fulfilled') {
        uploaded += batchLen;
      } else {
        failed += batchLen;
        const msg = result.reason instanceof Error ? result.reason.message : `Batch ${batchNum} failed`;
        errors.push(msg);
      }
      onProgress?.(uploaded + failed, total, batchNum, batchCount);
    });
  }

  return { uploaded, failed, errors };
}
