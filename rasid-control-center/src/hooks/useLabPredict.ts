import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LabBatchResult, LabConfig, LabPredictParams, LabPredictResult } from '@/lib/predictLab';
import { optimizeImageFile } from '@/lib/predictLab';

export function useLabConfig() {
  return useQuery({
    queryKey: ['lab-config'],
    queryFn: () => api.get<LabConfig>('/api/v1/control-center/lab/config'),
    staleTime: 60_000,
  });
}

function appendPredictForm(form: FormData, params: LabPredictParams, apiKey?: string, includeRaw = false) {
  form.append('conf', String(params.conf));
  form.append('iou', String(params.iou));
  form.append('imgsz', String(params.imgsz));
  form.append('include_raw', String(includeRaw));
  if (apiKey?.trim()) form.append('api_key', apiKey.trim());
}

export function useLabPredict(projectId: string) {
  return useMutation({
    mutationFn: async (input: {
      file: Blob;
      filename: string;
      params: LabPredictParams;
      apiKey?: string;
      includeRaw?: boolean;
      optimize?: boolean;
    }) => {
      let file = input.file;
      if (input.optimize !== false && file instanceof File && file.type.startsWith('image/')) {
        file = await optimizeImageFile(file, Math.min(1280, input.params.imgsz * 1.25));
      }
      const form = new FormData();
      form.append('file', file, input.filename.endsWith('.jpg') ? input.filename : input.filename.replace(/\.\w+$/, '.jpg'));
      appendPredictForm(form, input.params, input.apiKey, input.includeRaw ?? false);
      return api.postForm<LabPredictResult>(`/api/v1/control-center/${projectId}/lab/predict`, form);
    },
  });
}

export function useLabPredictBatch(projectId: string) {
  return useMutation({
    mutationFn: async (input: {
      frames: { blob: Blob; filename: string }[];
      params: LabPredictParams;
      apiKey?: string;
      includeRaw?: boolean;
    }) => {
      const form = new FormData();
      for (const frame of input.frames) {
        form.append('files', frame.blob, frame.filename);
      }
      appendPredictForm(form, input.params, input.apiKey, input.includeRaw ?? false);
      return api.postForm<LabBatchResult>(`/api/v1/control-center/${projectId}/lab/predict-batch`, form);
    },
  });
}
