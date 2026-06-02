import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DatasetSummary {
  id: string;
  name: string;
  description?: string | null;
  head_version_id: string | null;
  version_tag?: string | null;
  image_count: number;
  builder_stats?: DatasetBuilderStats;
}

export interface DatasetBuilderStats {
  dataset_id: string;
  dataset_name: string;
  head_version_id: string | null;
  image_count: number;
  annotated_count: number;
  healthy_count?: number;
  ready_for_training: boolean;
  unlabeled_count?: number;
  per_class: {
    class_id: string;
    name: string;
    color: string;
    count?: number;
    image_count?: number;
    healthy_count?: number;
  }[];
}

export interface ProjectDatasetHub {
  datasets: DatasetSummary[];
  default_dataset_id: string | null;
  default_stats: DatasetBuilderStats | null;
}

export interface ProjectClass {
  id: string;
  name: string;
  color: string;
}

export const datasetKeys = {
  all: ['datasets'] as const,
  list: (projectId: string, includeStats = false) =>
    [...datasetKeys.all, 'list', projectId, includeStats ? 'stats' : 'lite'] as const,
  hub: (projectId: string) => [...datasetKeys.all, 'hub', projectId] as const,
  stats: (datasetId: string) => [...datasetKeys.all, 'stats', datasetId] as const,
  gallery: (datasetId: string, query: string) => [...datasetKeys.all, 'gallery', datasetId, query] as const,
  classes: (projectId: string) => [...datasetKeys.all, 'classes', projectId] as const,
};

function shouldRetry(failureCount: number, error: Error) {
  if (error.message.includes('Session expired')) return false;
  return failureCount < 2;
}

export function useProjectDatasets(projectId: string | undefined, options?: { includeStats?: boolean }) {
  const includeStats = options?.includeStats ?? false;
  return useQuery<DatasetSummary[], Error>({
    queryKey: datasetKeys.list(projectId ?? '', includeStats),
    queryFn: ({ signal }) => {
      const params = includeStats ? '?include_stats=true' : '';
      return api.get<DatasetSummary[]>(`/api/v1/datasets/project/${projectId}${params}`, { signal });
    },
    enabled: !!projectId,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
    retry: shouldRetry,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useDatasetHub(projectId: string | undefined) {
  return useQuery<ProjectDatasetHub, Error>({
    queryKey: datasetKeys.hub(projectId ?? ''),
    queryFn: ({ signal }) => api.get<ProjectDatasetHub>(`/api/v1/datasets/project/${projectId}/hub`, { signal }),
    enabled: !!projectId,
    staleTime: 30_000,
    gcTime: 15 * 60_000,
    placeholderData: (prev) => prev,
    retry: shouldRetry,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useDatasetBuilderStats(datasetId: string | undefined) {
  return useQuery<DatasetBuilderStats | null, Error>({
    queryKey: datasetKeys.stats(datasetId ?? ''),
    queryFn: ({ signal }) =>
      api.get<DatasetBuilderStats>(`/api/v1/datasets/${datasetId}/builder-stats`, { signal }),
    enabled: !!datasetId,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    retry: shouldRetry,
    refetchOnWindowFocus: true,
  });
}

export function useProjectClasses(projectId: string | undefined) {
  return useQuery<ProjectClass[], Error>({
    queryKey: datasetKeys.classes(projectId ?? ''),
    queryFn: ({ signal }) => api.get<ProjectClass[]>(`/api/v1/projects/${projectId}/classes`, { signal }),
    enabled: !!projectId,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    retry: shouldRetry,
    refetchOnWindowFocus: true,
  });
}

export function useInvalidateDatasets() {
  const queryClient = useQueryClient();
  return {
    invalidateProject: (projectId: string) => {
      queryClient.invalidateQueries({ queryKey: [...datasetKeys.all, 'list', projectId] });
      queryClient.invalidateQueries({ queryKey: datasetKeys.hub(projectId) });
      queryClient.invalidateQueries({ queryKey: datasetKeys.classes(projectId) });
    },
    invalidateDataset: (datasetId: string, projectId?: string) => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.stats(datasetId) });
      queryClient.invalidateQueries({ queryKey: [...datasetKeys.all, 'gallery', datasetId] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: [...datasetKeys.all, 'list', projectId] });
        queryClient.invalidateQueries({ queryKey: datasetKeys.hub(projectId) });
      }
    },
  };
}

export interface DatasetGalleryData {
  dataset_id: string;
  dataset_name: string;
  description: string | null;
  total: number;
  limit: number;
  offset: number;
  unlabeled_count: number;
  per_class: {
    class_id: string;
    name: string;
    color: string;
    image_count: number;
    healthy_count?: number;
  }[];
  items: unknown[];
}

export function useDatasetGallery(
  datasetId: string | undefined,
  options: {
    limit: number;
    offset: number;
    classId?: string | null;
    unlabeledOnly?: boolean;
    healthyOnly?: boolean;
  },
) {
  const query = new URLSearchParams({
    limit: String(options.limit),
    offset: String(options.offset),
  });
  if (options.classId) query.set('class_id', options.classId);
  if (options.unlabeledOnly) query.set('unlabeled_only', 'true');
  if (options.healthyOnly) query.set('healthy_only', 'true');

  return useQuery<DatasetGalleryData, Error>({
    queryKey: datasetKeys.gallery(datasetId ?? '', query.toString()),
    queryFn: ({ signal }) =>
      api.get<DatasetGalleryData>(`/api/v1/datasets/${datasetId}/gallery?${query}`, { signal }),
    enabled: !!datasetId,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    retry: shouldRetry,
    refetchOnWindowFocus: true,
  });
}
