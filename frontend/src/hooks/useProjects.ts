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
  } | null;
  training: {
    is_running: boolean;
    job_id: string | null;
    status: string | null;
    name: string | null;
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
  return useQuery({
    queryKey: projectKeys.list(),
    queryFn: () => api.get<ProjectListItem[]>('/api/v1/projects'),
    staleTime: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });
}

export function useProjectOverview(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.overview(projectId ?? ''),
    queryFn: () => api.get<ProjectOverview>(`/api/v1/projects/${projectId}/overview`),
    enabled: !!projectId,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useActiveModel(projectId: string | undefined, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: projectKeys.activeModel(projectId ?? ''),
    queryFn: () => api.get<ActiveModelStatus>(`/api/v1/projects/${projectId}/active-model`),
    enabled: !!projectId,
    staleTime: 15_000,
    refetchInterval: options?.refetchInterval,
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: dashboardKeys.stats,
    queryFn: () => api.get<Record<string, number>>('/api/v1/dashboard/stats'),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useDashboardHome() {
  return useQuery({
    queryKey: dashboardKeys.home,
    queryFn: () =>
      api.get<{ stats: Record<string, number>; projects: ProjectListItem[] }>('/api/v1/dashboard/home'),
    staleTime: 30_000,
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
