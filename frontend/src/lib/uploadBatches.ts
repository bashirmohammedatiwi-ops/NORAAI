import { api } from '@/lib/api';

export interface BatchUploadResult {
  uploaded: number;
  failed: number;
  errors: string[];
}

export interface BatchUploadOptions {
  datasetId: string;
  classId: string;
  files: File[];
  batchSize?: number;
  onProgress?: (done: number, total: number, batchIndex: number, batchCount: number) => void;
  signal?: AbortSignal;
}

const IMAGE_TYPES = /^image\//;

export function filterImageFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter((f) => IMAGE_TYPES.test(f.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name));
}

export async function uploadImagesInBatches(opts: BatchUploadOptions): Promise<BatchUploadResult> {
  const { datasetId, classId, files, batchSize = 25, onProgress, signal } = opts;
  const total = files.length;
  let uploaded = 0;
  let failed = 0;
  const errors: string[] = [];
  const batchCount = Math.max(1, Math.ceil(total / batchSize));

  for (let i = 0; i < total; i += batchSize) {
    if (signal?.aborted) break;

    const batch = files.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const form = new FormData();
    batch.forEach((f) => form.append('files', f));
    form.append('source_type', 'manual_upload');
    form.append('class_id', classId);

    try {
      await api.post<{ message: string }>(`/api/v1/datasets/${datasetId}/upload`, form);
      uploaded += batch.length;
    } catch (e) {
      failed += batch.length;
      errors.push(e instanceof Error ? e.message : `Batch ${batchIndex} failed`);
    }

    onProgress?.(uploaded + failed, total, batchIndex, batchCount);
  }

  return { uploaded, failed, errors };
}
