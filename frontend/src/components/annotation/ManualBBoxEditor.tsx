import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { AuthenticatedImage } from '@/components/datasets/AuthenticatedImage';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Loader2, MousePointer2, Pencil, Save, Trash2 } from 'lucide-react';

export interface ClassOption {
  id: string;
  name: string;
  color: string;
}

export interface EditableAnnotation {
  id: string;
  class_id: string;
  class_name: string;
  class_color: string;
  x_center: number;
  y_center: number;
  width: number;
  height: number;
  status: string;
  isNew?: boolean;
}

interface Props {
  imageId: string;
  classes: ClassOption[];
  onSaved?: () => void;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function boxStyle(ann: Pick<EditableAnnotation, 'x_center' | 'y_center' | 'width' | 'height'>) {
  return {
    left: `${(ann.x_center - ann.width / 2) * 100}%`,
    top: `${(ann.y_center - ann.height / 2) * 100}%`,
    width: `${ann.width * 100}%`,
    height: `${ann.height * 100}%`,
  };
}

function pointInBox(nx: number, ny: number, ann: EditableAnnotation) {
  const x1 = ann.x_center - ann.width / 2;
  const y1 = ann.y_center - ann.height / 2;
  const x2 = ann.x_center + ann.width / 2;
  const y2 = ann.y_center + ann.height / 2;
  return nx >= x1 && nx <= x2 && ny >= y1 && ny <= y2;
}

export function ManualBBoxEditor({ imageId, classes, onSaved }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [annotations, setAnnotations] = useState<EditableAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'draw'>('select');
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    orig: EditableAnnotation;
  } | null>(null);
  const [defaultClassId, setDefaultClassId] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!imageId) return;
    setLoading(true);
    try {
      const rows = await api.get<Array<{
        id: string;
        class_id: string;
        class_name: string;
        class_color: string;
        x_center: number;
        y_center: number;
        width: number;
        height: number;
        status: string;
      }>>(`/api/v1/annotation/image/${imageId}`);
      setAnnotations(rows.map((r) => ({ ...r, isNew: false })));
      setSelectedId(rows[0]?.id ?? null);
      setDeletedIds([]);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, [imageId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!defaultClassId && classes[0]) setDefaultClassId(classes[0].id);
  }, [classes, defaultClassId]);

  const normFromEvent = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (tool === 'draw') {
      const p = normFromEvent(e);
      setDrawStart(p);
      setDrawCurrent(p);
      setSelectedId(null);
      return;
    }
    const p = normFromEvent(e);
    const hit = [...annotations].reverse().find((a) => pointInBox(p.x, p.y, a));
    if (!hit) {
      setSelectedId(null);
      return;
    }
    setSelectedId(hit.id);
    const x2 = hit.x_center + hit.width / 2;
    const y2 = hit.y_center + hit.height / 2;
    const nearHandle = Math.hypot(p.x - x2, p.y - y2) < 0.03;
    setDrag({
      mode: nearHandle ? 'resize' : 'move',
      startX: p.x,
      startY: p.y,
      orig: { ...hit },
    });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const p = normFromEvent(e);
    if (tool === 'draw' && drawStart) {
      setDrawCurrent(p);
      return;
    }
    if (!drag || !selectedId) return;
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    setAnnotations((prev) =>
      prev.map((a) => {
        if (a.id !== selectedId) return a;
        if (drag.mode === 'move') {
          return {
            ...a,
            x_center: clamp01(drag.orig.x_center + dx),
            y_center: clamp01(drag.orig.y_center + dy),
          };
        }
        return {
          ...a,
          width: clamp01(Math.max(0.02, drag.orig.width + dx * 2)),
          height: clamp01(Math.max(0.02, drag.orig.height + dy * 2)),
        };
      }),
    );
    setDirty(true);
  };

  const finishDraw = () => {
    if (tool === 'draw' && drawStart && drawCurrent && defaultClassId) {
      const x1 = Math.min(drawStart.x, drawCurrent.x);
      const y1 = Math.min(drawStart.y, drawCurrent.y);
      const x2 = Math.max(drawStart.x, drawCurrent.x);
      const y2 = Math.max(drawStart.y, drawCurrent.y);
      if (x2 - x1 > 0.02 && y2 - y1 > 0.02) {
        const cls = classes.find((c) => c.id === defaultClassId);
        const id = `new-${Date.now()}`;
        setAnnotations((prev) => [
          ...prev,
          {
            id,
            class_id: defaultClassId,
            class_name: cls?.name ?? 'class',
            class_color: cls?.color ?? '#3B82F6',
            x_center: (x1 + x2) / 2,
            y_center: (y1 + y2) / 2,
            width: x2 - x1,
            height: y2 - y1,
            status: 'approved',
            isNew: true,
          },
        ]);
        setSelectedId(id);
        setDirty(true);
      }
    }
    setDrawStart(null);
    setDrawCurrent(null);
    setDrag(null);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const ann = annotations.find((a) => a.id === selectedId);
    if (ann && !ann.isNew) setDeletedIds((d) => [...d, ann.id]);
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
    setSelectedId(null);
    setDirty(true);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const id of deletedIds) {
        await api.delete(`/api/v1/annotation/${id}`);
      }
      for (const ann of annotations) {
        const payload = {
          class_id: ann.class_id,
          x_center: ann.x_center,
          y_center: ann.y_center,
          width: ann.width,
          height: ann.height,
        };
        if (ann.isNew) {
          await api.post(`/api/v1/annotation/image/${imageId}`, payload);
        } else {
          await api.patch(`/api/v1/annotation/${ann.id}`, payload);
        }
      }
      await load();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const selected = annotations.find((a) => a.id === selectedId);
  const previewBox =
    drawStart && drawCurrent
      ? {
          x_center: (Math.min(drawStart.x, drawCurrent.x) + Math.max(drawStart.x, drawCurrent.x)) / 2,
          y_center: (Math.min(drawStart.y, drawCurrent.y) + Math.max(drawStart.y, drawCurrent.y)) / 2,
          width: Math.abs(drawCurrent.x - drawStart.x),
          height: Math.abs(drawCurrent.y - drawStart.y),
        }
      : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading annotations…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <Button
          type="button"
          size="sm"
          variant={tool === 'select' ? 'default' : 'outline'}
          onClick={() => setTool('select')}
        >
          <MousePointer2 className="h-4 w-4" /> Select / move
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tool === 'draw' ? 'default' : 'outline'}
          onClick={() => setTool('draw')}
        >
          <Pencil className="h-4 w-4" /> Draw box
        </Button>
        <div className="min-w-[140px]">
          <Select
            label="Class for new box"
            value={defaultClassId}
            onChange={(e) => setDefaultClassId(e.target.value)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        {selected && (
          <Select
            label="Selected class"
            value={selected.class_id}
            onChange={(e) => {
              const cls = classes.find((c) => c.id === e.target.value);
              setAnnotations((prev) =>
                prev.map((a) =>
                  a.id === selected.id
                    ? {
                        ...a,
                        class_id: e.target.value,
                        class_name: cls?.name ?? a.class_name,
                        class_color: cls?.color ?? a.class_color,
                      }
                    : a,
                ),
              );
              setDirty(true);
            }}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}
        <Button type="button" size="sm" variant="destructive" disabled={!selectedId} onClick={deleteSelected}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
        <Button type="button" size="sm" disabled={!dirty || saving} onClick={saveAll}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Draw a box around the vehicle, drag to move, pull the bottom-right corner to resize. Save when done.
      </p>

      <div
        ref={containerRef}
        className={cn(
          'relative inline-block max-w-full select-none rounded-lg border border-border overflow-hidden',
          tool === 'draw' ? 'cursor-crosshair' : 'cursor-default',
        )}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={finishDraw}
        onMouseLeave={finishDraw}
      >
        <AuthenticatedImage imageId={imageId} className="block max-w-full max-h-[520px] w-auto h-auto" />
        {annotations.map((ann) => (
          <div
            key={ann.id}
            className={cn(
              'absolute border-2 pointer-events-none',
              ann.id === selectedId && 'ring-2 ring-primary ring-offset-1',
            )}
            style={{ ...boxStyle(ann), borderColor: ann.class_color }}
          >
            <span
              className="absolute -top-5 left-0 text-[10px] px-1 rounded text-white whitespace-nowrap"
              style={{ backgroundColor: ann.class_color }}
            >
              {ann.class_name}
            </span>
            {ann.id === selectedId && tool === 'select' && (
              <span
                className="absolute bottom-0 right-0 w-3 h-3 bg-primary border border-white rounded-sm translate-x-1/2 translate-y-1/2 pointer-events-none"
              />
            )}
          </div>
        ))}
        {previewBox && previewBox.width > 0.01 && (
          <div
            className="absolute border-2 border-dashed border-primary bg-primary/10 pointer-events-none"
            style={boxStyle(previewBox)}
          />
        )}
      </div>
    </div>
  );
}
