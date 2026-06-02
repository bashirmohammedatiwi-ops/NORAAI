import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { AuthenticatedImage } from '@/components/datasets/AuthenticatedImage';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Check, Loader2, MousePointer2, Pencil, Trash2 } from 'lucide-react';

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
  onSavingChange?: (saving: boolean) => void;
  onPrevImage?: () => void;
  onNextImage?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
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

function annPayload(ann: EditableAnnotation) {
  return {
    class_id: ann.class_id,
    x_center: ann.x_center,
    y_center: ann.y_center,
    width: ann.width,
    height: ann.height,
  };
}

function isTempId(id: string) {
  return id.startsWith('new-');
}

export function ManualBBoxEditor({
  imageId,
  classes,
  onSaved,
  onSavingChange,
  onPrevImage,
  onNextImage,
  hasPrev,
  hasNext,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const annotationsRef = useRef<EditableAnnotation[]>([]);
  const saveOpsRef = useRef(0);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout>>();

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
  const [savedFlash, setSavedFlash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  const setSavingCount = useCallback((delta: number) => {
    saveOpsRef.current = Math.max(0, saveOpsRef.current + delta);
    const active = saveOpsRef.current > 0;
    setSaving(active);
    onSavingChange?.(active);
  }, [onSavingChange]);

  const notifySaved = useCallback(() => {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = setTimeout(() => onSaved?.(), 350);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }, [onSaved]);

  const load = useCallback(async () => {
    if (!imageId) return;
    setLoading(true);
    setError(null);
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
      const mapped = rows.map((r) => ({ ...r, isNew: false }));
      setAnnotations(mapped);
      setSelectedId(mapped[0]?.id ?? null);
    } catch {
      setError('تعذّر تحميل التسميات');
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

  const persistCreate = useCallback(async (ann: EditableAnnotation) => {
    setSavingCount(1);
    try {
      const created = await api.post<{
        id: string;
        class_id: string;
        x_center: number;
        y_center: number;
        width: number;
        height: number;
        status: string;
      }>(`/api/v1/annotation/image/${imageId}`, annPayload(ann));
      const cls = classes.find((c) => c.id === ann.class_id);
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === ann.id
            ? {
                ...a,
                id: String(created.id),
                isNew: false,
                status: created.status ?? 'approved',
                class_name: cls?.name ?? a.class_name,
              }
            : a,
        ),
      );
      setSelectedId(String(created.id));
      notifySaved();
    } catch {
      setError('فشل الحفظ التلقائي');
      setAnnotations((prev) => prev.filter((a) => a.id !== ann.id));
    } finally {
      setSavingCount(-1);
    }
  }, [imageId, classes, notifySaved, setSavingCount]);

  const persistUpdate = useCallback(async (ann: EditableAnnotation) => {
    if (ann.isNew || isTempId(ann.id)) {
      await persistCreate(ann);
      return;
    }
    setSavingCount(1);
    try {
      await api.patch(`/api/v1/annotation/${ann.id}`, annPayload(ann));
      notifySaved();
    } catch {
      setError('فشل حفظ التعديل');
    } finally {
      setSavingCount(-1);
    }
  }, [persistCreate, notifySaved, setSavingCount]);

  const persistDelete = useCallback(async (id: string) => {
    if (isTempId(id)) return;
    setSavingCount(1);
    try {
      await api.delete(`/api/v1/annotation/${id}`);
      notifySaved();
    } catch {
      setError('فشل الحذف');
    } finally {
      setSavingCount(-1);
    }
  }, [notifySaved, setSavingCount]);

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
    if (e.button !== 0 || saving) return;
    if (tool === 'draw') {
      const p = normFromEvent(e);
      setDrawStart(p);
      setDrawCurrent(p);
      setSelectedId(null);
      return;
    }
    const p = normFromEvent(e);
    const hit = [...annotationsRef.current].reverse().find((a) => pointInBox(p.x, p.y, a));
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
  };

  const finishDraw = () => {
    const hadDrag = Boolean(drag && selectedId);
    const dragId = selectedId;

    if (tool === 'draw' && drawStart && drawCurrent && defaultClassId) {
      const x1 = Math.min(drawStart.x, drawCurrent.x);
      const y1 = Math.min(drawStart.y, drawCurrent.y);
      const x2 = Math.max(drawStart.x, drawCurrent.x);
      const y2 = Math.max(drawStart.y, drawCurrent.y);
      if (x2 - x1 > 0.02 && y2 - y1 > 0.02) {
        const cls = classes.find((c) => c.id === defaultClassId);
        const id = `new-${Date.now()}`;
        const newAnn: EditableAnnotation = {
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
        };
        setAnnotations((prev) => [...prev, newAnn]);
        setSelectedId(id);
        void persistCreate(newAnn);
      }
    }

    setDrawStart(null);
    setDrawCurrent(null);
    setDrag(null);

    if (hadDrag && dragId) {
      requestAnimationFrame(() => {
        const ann = annotationsRef.current.find((a) => a.id === dragId);
        if (ann) void persistUpdate(ann);
      });
    }
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId || saving) return;
    const id = selectedId;
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setSelectedId(null);
    void persistDelete(id);
  }, [selectedId, saving, persistDelete]);

  const deleteSelectedRef = useRef(deleteSelected);
  deleteSelectedRef.current = deleteSelected;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'd' || e.key === 'D') {
        setTool('draw');
        e.preventDefault();
      } else if (e.key === 'v' || e.key === 'V') {
        setTool('select');
        e.preventDefault();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedRef.current();
      } else if (e.key === 'ArrowLeft' && hasNext && !saving) {
        e.preventDefault();
        onNextImage?.();
      } else if (e.key === 'ArrowRight' && hasPrev && !saving) {
        e.preventDefault();
        onPrevImage?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasPrev, hasNext, onPrevImage, onNextImage, saving]);

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
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> جاري التحميل…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <Button type="button" size="sm" variant={tool === 'select' ? 'default' : 'outline'} onClick={() => setTool('select')} title="V" disabled={saving}>
          <MousePointer2 className="h-4 w-4" /> تحديد
        </Button>
        <Button type="button" size="sm" variant={tool === 'draw' ? 'default' : 'outline'} onClick={() => setTool('draw')} title="D" disabled={saving}>
          <Pencil className="h-4 w-4" /> رسم
        </Button>
        <div className="min-w-[140px]">
          <Select
            label="صنف الصندوق الجديد"
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
            label="صنف المحدد"
            value={selected.class_id}
            onChange={(e) => {
              const cls = classes.find((c) => c.id === e.target.value);
              const updated: EditableAnnotation = {
                ...selected,
                class_id: e.target.value,
                class_name: cls?.name ?? selected.class_name,
                class_color: cls?.color ?? selected.class_color,
              };
              setAnnotations((prev) =>
                prev.map((a) => (a.id === selected.id ? updated : a)),
              );
              void persistUpdate(updated);
            }}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}
        <Button type="button" size="sm" variant="destructive" disabled={!selectedId || saving} onClick={deleteSelected}>
          <Trash2 className="h-4 w-4" /> حذف
        </Button>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-h-[32px]">
          {saving && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>جاري الحفظ…</span>
            </>
          )}
          {!saving && savedFlash && (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-emerald-600">تم الحفظ</span>
            </>
          )}
          {!saving && !savedFlash && (
            <span>حفظ تلقائي عند الرسم أو التعديل</span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <p className="text-xs text-muted-foreground">
        ارسم صندوقاً حول الهدف، اسحب للنقل، الزاوية السفلى للتكبير. يُحفظ تلقائياً — D رسم · V تحديد.
      </p>

      <div
        ref={containerRef}
        className={cn(
          'relative inline-block max-w-full select-none rounded-lg border border-border overflow-hidden',
          tool === 'draw' ? 'cursor-crosshair' : 'cursor-default',
          saving && 'opacity-90 pointer-events-none',
        )}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={finishDraw}
        onMouseLeave={finishDraw}
      >
        <AuthenticatedImage imageId={imageId} className="block max-w-full max-h-[min(70vh,640px)] w-auto h-auto" />
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
