import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  domain: string;
  created_at: string;
  has_model: boolean;
}

export interface ActiveModelStatus {
  project_id: string;
  project_name: string;
  has_model: boolean;
  model: {
    id: string;
    name: string;
    architecture: string;
    lifecycle: string;
    metrics: Record<string, number>;
    classes_used: string[];
    model_size_mb: number;
    updated_at: string;
    gpu_used?: string;
    is_mock?: boolean;
  } | null;
  training: {
    is_running: boolean;
    job_id: string | null;
    status: string | null;
    name: string | null;
    progress?: number;
    current_epoch?: number;
    total_epochs?: number;
    device?: string;
    device_label?: string;
  };
  live_endpoint: string | null;
  connected_services: { id: string; name: string; uses: string }[];
}

export interface ProjectOverview {
  project: {
    id: string;
    name: string;
    description: string | null;
    domain: string;
    created_at: string;
  };
  model_status: ActiveModelStatus;
}

export const projectKeys = {
  all: ['projects'] as const,
  list: () => [...projectKeys.all, 'list'] as const,
  overview: (id: string) => [...projectKeys.all, 'overview', id] as const,
  activeModel: (id: string) => [...projectKeys.all, 'active-model', id] as const,
};

export const dashboardKeys = {
  stats: ['dashboard', 'stats'] as const,
  home: ['dashboard', 'home'] as const,
};

export function useProjectsList() {
  const query = useQuery<ProjectListItem[], Error>({
    queryKey: projectKeys.list(),
    queryFn: ({ signal }) => api.get<ProjectListItem[]>('/api/v1/projects', { signal }),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: (failureCount, error) => {
      if (error.message.includes('Session expired')) return false;
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const projects = query.data ?? [];
  return {
    ...query,
    projects,
    isInitialLoading: query.isLoading,
  };
}

export function useProjectOverview(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.overview(projectId ?? ''),
    queryFn: ({ signal }) => api.get<ProjectOverview>(`/api/v1/projects/${projectId}/overview`, { signal }),
    enabled: !!projectId,
    staleTime: 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: true,
  });
}

export function useActiveModel(projectId: string | undefined, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: projectKeys.activeModel(projectId ?? ''),
    queryFn: ({ signal }) => api.get<ActiveModelStatus>(`/api/v1/projects/${projectId}/active-model`, { signal }),
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: options?.refetchInterval,
    placeholderData: (prev) => prev,
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: dashboardKeys.stats,
    queryFn: ({ signal }) => api.get<Record<string, number>>('/api/v1/dashboard/stats', { signal }),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    placeholderData: (prev) => prev,
  });
}

export function useDashboardHome() {
  return useQuery({
    queryKey: dashboardKeys.home,
    queryFn: ({ signal }) =>
      api.get<{ stats: Record<string, number>; projects: ProjectListItem[] }>('/api/v1/dashboard/home', { signal }),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useInvalidateProjects() {
  const queryClient = useQueryClient();
  return {
    invalidateList: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
    invalidateProject: (id: string) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.overview(id) });
      queryClient.invalidateQueries({ queryKey: projectKeys.activeModel(id) });
    },
  };
}

export async function prefetchProjectsList(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.prefetchQuery({
    queryKey: projectKeys.list(),
    queryFn: ({ signal }) => api.get<ProjectListItem[]>('/api/v1/projects', { signal }),
    staleTime: 60_000,
  });
}
