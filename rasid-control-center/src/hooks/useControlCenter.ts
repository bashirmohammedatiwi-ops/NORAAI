import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usePollInterval } from '@/context/PreferencesContext';
import type { ControlOverview, CurrentUser, FleetDevice, ModelArtifact, NotificationItem, Project, RoadAlert, RoadStats, SystemStatus } from '@/types';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<Project[]>('/api/v1/projects'),
    retry: 2,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: () => api.get<CurrentUser>('/api/v1/auth/me'),
    staleTime: 60_000,
  });
}

export function useRoadStats(projectId: string) {
  const refetchInterval = usePollInterval(15_000);
  return useQuery({
    queryKey: ['roadStats', projectId],
    queryFn: () => api.get<RoadStats>(`/api/v1/road-intelligence/${projectId}/stats`),
    enabled: !!projectId,
    refetchInterval,
  });
}

export function useSystemStatus(projectId: string) {
  const refetchInterval = usePollInterval(20_000);
  return useQuery({
    queryKey: ['systemStatus', projectId],
    queryFn: () => api.get<SystemStatus>(`/api/v1/control-center/${projectId}/system`),
    enabled: !!projectId,
    refetchInterval,
  });
}

export function useOverview(projectId: string) {
  const refetchInterval = usePollInterval(8000);
  return useQuery({
    queryKey: ['overview', projectId],
    queryFn: () => api.get<ControlOverview>(`/api/v1/control-center/${projectId}/overview`),
    enabled: !!projectId,
    refetchInterval,
  });
}

export function useAlerts(projectId: string, opts?: { activeOnly?: boolean; recipient?: string; municipality?: string; eventType?: string }) {
  const refetchInterval = usePollInterval(6000);
  const params = new URLSearchParams();
  params.set('active_only', String(opts?.activeOnly ?? true));
  if (opts?.recipient) params.set('recipient', opts.recipient);
  if (opts?.municipality) params.set('municipality', opts.municipality);
  if (opts?.eventType) params.set('event_type', opts.eventType);
  return useQuery({
    queryKey: ['alerts', projectId, opts],
    queryFn: () => api.get<RoadAlert[]>(`/api/v1/road-intelligence/${projectId}/events?${params}`),
    enabled: !!projectId,
    refetchInterval,
    placeholderData: [],
  });
}

export function useNotifications(projectId: string) {
  const refetchInterval = usePollInterval(10_000);
  return useQuery({
    queryKey: ['notifications', projectId],
    queryFn: () => api.get<NotificationItem[]>(`/api/v1/control-center/${projectId}/notifications`),
    enabled: !!projectId,
    refetchInterval,
  });
}

export function useFleet(projectId: string) {
  const refetchInterval = usePollInterval(8000);
  return useQuery({
    queryKey: ['fleet', projectId],
    queryFn: () => api.get<FleetDevice[]>(`/api/v1/fleet/${projectId}`),
    enabled: !!projectId,
    refetchInterval,
  });
}

export function useModels(projectId: string) {
  return useQuery({
    queryKey: ['models', projectId],
    queryFn: () => api.get<ModelArtifact[]>(`/api/v1/models/project/${projectId}`),
    enabled: !!projectId,
  });
}

export function useResolveAlert(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) =>
      api.patch<RoadAlert>(`/api/v1/road-intelligence/${projectId}/events/${eventId}/resolve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts', projectId] });
      qc.invalidateQueries({ queryKey: ['overview', projectId] });
      qc.invalidateQueries({ queryKey: ['notifications', projectId] });
    },
  });
}

export function useImportModel(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.postForm<ModelArtifact>(`/api/v1/models/project/${projectId}/import`, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models', projectId] });
      qc.invalidateQueries({ queryKey: ['roadStats', projectId] });
    },
  });
}

export function usePromoteModel(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modelId: string) =>
      api.patch<{ id: string; lifecycle: string }>(`/api/v1/models/${modelId}/lifecycle?lifecycle=production`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models', projectId] });
      qc.invalidateQueries({ queryKey: ['roadStats', projectId] });
      qc.invalidateQueries({ queryKey: ['systemStatus', projectId] });
    },
  });
}

export function useUploadAlertEvidence(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, file }: { eventId: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return api.postForm<RoadAlert>(`/api/v1/control-center/${projectId}/events/${eventId}/evidence`, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts', projectId] });
      qc.invalidateQueries({ queryKey: ['overview', projectId] });
      qc.invalidateQueries({ queryKey: ['notifications', projectId] });
    },
  });
}

export interface DemoSeedResult {
  seeded: boolean;
  reason?: string;
  vehicles?: number;
  alerts?: number;
  municipality_alerts?: number;
  speed_violations?: number;
  cleared?: number;
  alerts_reassigned?: number;
  alerts_added?: number;
  source_vehicle?: string;
  images_attached?: number;
  images_source?: string;
}

export function useSeedDemo(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force?: boolean) =>
      api.post<DemoSeedResult>(`/api/v1/control-center/${projectId}/demo/seed?force=${force ? 'true' : 'false'}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts', projectId] });
      qc.invalidateQueries({ queryKey: ['overview', projectId] });
      qc.invalidateQueries({ queryKey: ['fleet', projectId] });
      qc.invalidateQueries({ queryKey: ['roadStats', projectId] });
    },
  });
}

export function useAttachDemoImages(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ attached: number; skipped: number; matched?: string[]; reason?: string; source?: string }>(
        `/api/v1/control-center/${projectId}/demo/attach-images`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts', projectId] });
      qc.invalidateQueries({ queryKey: ['overview', projectId] });
      qc.invalidateQueries({ queryKey: ['notifications', projectId] });
    },
  });
}
