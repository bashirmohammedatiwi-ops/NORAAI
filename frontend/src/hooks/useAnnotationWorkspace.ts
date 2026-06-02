import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { withClassColors } from '@/lib/classColors';
import type { ClassOption } from '@/components/annotation/ManualBBoxEditor';

export interface WorkspaceImage {
  id: string;
  filename: string;
  annotation_count: number;
  manual_count: number;
  pending_count: number;
  has_labels: boolean;
  has_manual_labels: boolean;
  needs_review: boolean;
  created_at: string | null;
}

export interface WorkspaceStats {
  total_images: number;
  annotated_images: number;
  unannotated_images: number;
  manual_annotated_images: number;
  without_manual_images: number;
  pending_review: number;
  total_boxes: number;
}

export interface PendingAnn {
  id: string;
  image_id: string;
  class_id: string;
  x_center: number;
  y_center: number;
  width: number;
  height: number;
  confidence: number;
  status: string;
}

interface WorkspaceResponse {
  stats: WorkspaceStats;
  images: WorkspaceImage[];
  classes: ClassOption[];
}

export function useAnnotationWorkspace(projectId: string | undefined) {
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [images, setImages] = useState<WorkspaceImage[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [pending, setPending] = useState<PendingAnn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [workspace, pendingList] = await Promise.all([
        api.get<WorkspaceResponse>(`/api/v1/annotation/project/${projectId}/workspace`),
        api.get<PendingAnn[]>(`/api/v1/annotation/project/${projectId}/pending`),
      ]);
      setStats(workspace.stats);
      setImages(workspace.images);
      setClasses(withClassColors(workspace.classes));
      setPending(pendingList);
    } catch {
      setStats(null);
      setImages([]);
      setClasses([]);
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const classMap = Object.fromEntries(
    classes.map((c) => [c.id, { name: c.name, color: c.color }]),
  );

  return { stats, images, classes, classMap, pending, loading, reload: load };
}
