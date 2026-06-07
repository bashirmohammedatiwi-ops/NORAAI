import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface ProjectModel {
  id: string;
  name: string;
  architecture: string;
  lifecycle: string;
  metrics: Record<string, number>;
  model_size_mb: number | null;
  created_at: string;
  classes_used: string[];
  model_number: number;
  is_active: boolean;
}

export function formatModelOption(m: ProjectModel): string {
  const map = m.metrics?.map50_95;
  const acc = map != null ? ` · mAP ${(map * 100).toFixed(1)}%` : '';
  const active = m.is_active ? ' · رئيسي' : '';
  const arch = m.architecture.toUpperCase().replace('_', '-');
  return `#${m.model_number} ${m.name} (${arch}${acc})${active}`;
}

export function useProjectModels(projectId: string | undefined) {
  const [models, setModels] = useState<ProjectModel[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) {
      setModels([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<ProjectModel[]>(`/api/v1/models/project/${projectId}`);
      setModels(data);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  return { models, loading, reload: load };
}
