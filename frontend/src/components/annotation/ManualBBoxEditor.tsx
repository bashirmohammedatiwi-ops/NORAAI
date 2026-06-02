import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { colorForClass } from '@/lib/classColors';
import { AnnotationCanvasImage } from '@/components/annotation/AnnotationCanvasImage';
import { Button } from '@/components/ui/button';
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

interface BoxGeom {
  x_center: number;
  y_center: number;
  width: number;
  height: number;
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

const MIN_BOX = 0.012;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function boxStyle(ann: BoxGeom) {
  return {
    left: `${(ann.x_center - ann.width / 2) * 100}%`,
    top: `${(ann.y_center - ann.height / 2) * 100}%`,
    width: `${Math.max(0.1, ann.width * 100)}%`,
    height: `${Math.max(0.1, ann.height * 100)}%`,
  };
}

function pointInBox(nx: number, ny: number, ann: BoxGeom) {
  const x1 = ann.x_center - ann.width / 2;
  const y1 = ann.y_center - ann.height / 2;
  const x2 = ann.x_center + ann.width / 2;
  const y2 = ann.y_center + ann.height / 2;
  return nx >= x1 && nx <= x2 && ny >= y1 && ny <= y2;
}

function boxFromCorners(x1: number, y1: number, x2: number, y2: number): BoxGeom {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  return {
    x_center: (left + right) / 2,
    y_center: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  };
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

function resolveClass(classes: ClassOption[], classId: string) {
  const idx = classes.findIndex((c) => c.id === classId);
  const cls = classes[idx];
  return {
    name: cls?.name ?? 'class',
    color: cls ? colorForClass(cls.name, idx, cls.color) : '#3B82F6',
  };
}

function BBoxLayer({
  ann,
  selected,
  showHandle,
}: {
  ann: BoxGeom & { id?: string; class_name: string; class_color: string };
  selected?: boolean;
  showHandle?: boolean;
}) {
  return (
    <div
      className={cn(
        'absolute border-2 box-border pointer-events-none z-20',
        selected && 'ring-2 ring-white ring-offset-1 ring-offset-black/40',
      )}
      style={{ ...boxStyle(ann), borderColor: ann.class_color }}
    >
      <span
        className="absolute -top-5 left-0 text-[10px] px-1.5 py-0.5 rounded font-medium text-white whitespace-nowrap shadow-sm"
        style={{ backgroundColor: ann.class_color }}
      >
        {ann.class_name}
      </span>
      {showHandle && (
        <span
          className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-sm border-2 border-white shadow-md pointer-events-none"
          style={{ backgroundColor: ann.class_color, transform: 'translate(50%, 50%)' }}
        />
      )}
    </div>
  );
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
  const canvasRef = useRef<HTMLDivElement>(null);
  const annotationsRef = useRef<EditableAnnotation[]>([]);
  const saveOpsRef = useRef(0);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const interactionRef = useRef<'draw' | 'move' | 'resize' | null>(null);

  const [annotations, setAnnotations] = useState<EditableAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'draw'>('draw');
  const [defaultClassId, setDefaultClassId] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<BoxGeom | null>(null);
  const [dragOrig, setDragOrig] = useState<EditableAnnotation | null>(null);
  const [dragMode, setDragMode] = useState<'move' | 'resize' | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [liveBox, setLiveBox] = useState<(BoxGeom & { class_name: string; class_color: string }) | null>(null);

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

  const enrich = useCallback(
    (row: Omit<EditableAnnotation, 'class_name' | 'class_color'> & Partial<Pick<EditableAnnotation, 'class_name' | 'class_color'>>) => {
      const { name, color } = resolveClass(classes, row.class_id);
      return {
        ...row,
        class_name: row.class_name ?? name,
        class_color: row.class_color ?? color,
        isNew: row.isNew ?? false,
      } as EditableAnnotation;
    },
    [classes],
  );

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
      const mapped = rows.map((r) =>
        enrich({
          ...r,
          class_color: colorForClass(
            r.class_name,
            classes.findIndex((c) => c.id === r.class_id),
            r.class_color,
          ),
          isNew: false,
        }),
      );
      setAnnotations(mapped);
      setSelectedId(null);
    } catch {
      setError('تعذّر تحميل التسميات');
    } finally {
      setLoading(false);
    }
  }, [imageId, classes, enrich]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!defaultClassId && classes[0]) setDefaultClassId(classes[0].id);
  }, [classes, defaultClassId]);

  const persistCreate = useCallback(
    async (ann: EditableAnnotation) => {
      setSavingCount(1);
      try {
        const created = await api.post<{
          id: string;
          status: string;
        }>(`/api/v1/annotation/image/${imageId}`, annPayload(ann));
        const saved = enrich({
          ...ann,
          id: String(created.id),
          isNew: false,
          status: created.status ?? 'approved',
        });
        setAnnotations((prev) => prev.map((a) => (a.id === ann.id ? saved : a)));
        setSelectedId(saved.id);
        notifySaved();
        return saved;
      } catch {
        setError('فشل الحفظ التلقائي');
        setAnnotations((prev) => prev.filter((a) => a.id !== ann.id));
        return null;
      } finally {
        setSavingCount(-1);
      }
    },
    [imageId, enrich, notifySaved, setSavingCount],
  );

  const persistUpdate = useCallback(
    async (ann: EditableAnnotation) => {
      if (ann.isNew || isTempId(ann.id)) {
        return persistCreate(ann);
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
    },
    [persistCreate, notifySaved, setSavingCount],
  );

  const persistDelete = useCallback(
    async (id: string) => {
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
    },
    [notifySaved, setSavingCount],
  );

  const normFromClient = useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return { x: 0, y: 0 };
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }, []);

  const resetInteraction = useCallback(() => {
    interactionRef.current = null;
    setDrawStart(null);
    setDrawPreview(null);
    setDragOrig(null);
    setDragMode(null);
    setDragStart(null);
    setLiveBox(null);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || saving) return;
    e.preventDefault();
    e.stopPropagation();
    const layer = e.currentTarget;
    layer.setPointerCapture(e.pointerId);

    const p = normFromClient(e.clientX, e.clientY);

    if (tool === 'draw') {
      interactionRef.current = 'draw';
      setDrawStart(p);
      setDrawPreview({ x_center: p.x, y_center: p.y, width: 0.002, height: 0.002 });
      setSelectedId(null);
      setLiveBox(null);
      return;
    }

    const hit = [...annotationsRef.current].reverse().find((a) => pointInBox(p.x, p.y, a));
    if (!hit) {
      setSelectedId(null);
      return;
    }

    setSelectedId(hit.id);
    const x2 = hit.x_center + hit.width / 2;
    const y2 = hit.y_center + hit.height / 2;
    const nearHandle = Math.hypot(p.x - x2, p.y - y2) < 0.04;
    const mode = nearHandle ? 'resize' : 'move';
    interactionRef.current = mode;
    setDragOrig(hit);
    setDragMode(mode);
    setDragStart(p);
    setLiveBox({
      x_center: hit.x_center,
      y_center: hit.y_center,
      width: hit.width,
      height: hit.height,
      class_name: hit.class_name,
      class_color: hit.class_color,
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactionRef.current) return;
    e.preventDefault();
    const p = normFromClient(e.clientX, e.clientY);

    if (interactionRef.current === 'draw' && drawStart) {
      setDrawPreview(boxFromCorners(drawStart.x, drawStart.y, p.x, p.y));
      return;
    }

    if ((interactionRef.current === 'move' || interactionRef.current === 'resize') && dragOrig && dragStart) {
      const dx = p.x - dragStart.x;
      const dy = p.y - dragStart.y;
      if (interactionRef.current === 'move') {
        setLiveBox({
          x_center: clamp01(dragOrig.x_center + dx),
          y_center: clamp01(dragOrig.y_center + dy),
          width: dragOrig.width,
          height: dragOrig.height,
          class_name: dragOrig.class_name,
          class_color: dragOrig.class_color,
        });
      } else {
        setLiveBox({
          x_center: dragOrig.x_center,
          y_center: dragOrig.y_center,
          width: clamp01(Math.max(MIN_BOX, dragOrig.width + dx * 2)),
          height: clamp01(Math.max(MIN_BOX, dragOrig.height + dy * 2)),
          class_name: dragOrig.class_name,
          class_color: dragOrig.class_color,
        });
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const mode = interactionRef.current;
    if (!mode) return;
    e.preventDefault();

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    if (mode === 'draw' && drawStart && drawPreview && defaultClassId) {
      if (drawPreview.width >= MIN_BOX && drawPreview.height >= MIN_BOX) {
        const { name, color } = resolveClass(classes, defaultClassId);
        const id = `new-${Date.now()}`;
        const newAnn: EditableAnnotation = {
          id,
          class_id: defaultClassId,
          class_name: name,
          class_color: color,
          ...drawPreview,
          status: 'approved',
          isNew: true,
        };
        setAnnotations((prev) => [...prev, newAnn]);
        setSelectedId(id);
        void persistCreate(newAnn);
      }
    }

    if ((mode === 'move' || mode === 'resize') && dragOrig && liveBox && selectedId) {
      const updated: EditableAnnotation = { ...dragOrig, ...liveBox };
      setAnnotations((prev) => prev.map((a) => (a.id === selectedId ? updated : a)));
      void persistUpdate(updated);
    }

    resetInteraction();
  };

  const onPointerCancel = () => {
    resetInteraction();
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
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (ev.key === 'd' || ev.key === 'D') {
        setTool('draw');
        ev.preventDefault();
      } else if (ev.key === 'v' || ev.key === 'V') {
        setTool('select');
        ev.preventDefault();
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        deleteSelectedRef.current();
      } else if (ev.key === 'ArrowLeft' && hasNext && !saving) {
        ev.preventDefault();
        onNextImage?.();
      } else if (ev.key === 'ArrowRight' && hasPrev && !saving) {
        ev.preventDefault();
        onPrevImage?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasPrev, hasNext, onPrevImage, onNextImage, saving]);

  const defaultClass = classes.find((c) => c.id === defaultClassId);
  const previewClass = defaultClass
    ? resolveClass(classes, defaultClassId)
    : { name: '', color: '#2563EB' };

  const staticAnnotations = annotations.filter((a) => a.id !== selectedId || !liveBox);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> جاري التحميل…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          type="button"
          size="sm"
          variant={tool === 'select' ? 'default' : 'outline'}
          onClick={() => setTool('select')}
          disabled={saving}
        >
          <MousePointer2 className="h-4 w-4" /> تحديد
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tool === 'draw' ? 'default' : 'outline'}
          onClick={() => setTool('draw')}
          disabled={saving}
        >
          <Pencil className="h-4 w-4" /> رسم
        </Button>

        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground ml-1">الصنف:</span>
          {classes.map((c, i) => {
            const hex = colorForClass(c.name, i, c.color);
            const active = defaultClassId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                disabled={saving}
                onClick={() => {
                  setDefaultClassId(c.id);
                  if (selectedId && !saving) {
                    const ann = annotationsRef.current.find((a) => a.id === selectedId);
                    if (ann) {
                      const updated = enrich({ ...ann, class_id: c.id });
                      setAnnotations((prev) => prev.map((a) => (a.id === selectedId ? updated : a)));
                      void persistUpdate(updated);
                    }
                  }
                }}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full border-2 font-medium transition-all',
                  active ? 'text-white shadow-md scale-105' : 'bg-card hover:opacity-90',
                )}
                style={{
                  borderColor: hex,
                  backgroundColor: active ? hex : `${hex}22`,
                  color: active ? '#fff' : hex,
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={!selectedId || saving}
          onClick={deleteSelected}
          className="mr-auto"
        >
          <Trash2 className="h-4 w-4" /> حذف
        </Button>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground w-full sm:w-auto">
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
          {!saving && !savedFlash && <span>حفظ تلقائي — اسحب لرسم الصندوق</span>}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div
        ref={canvasRef}
        className={cn(
          'relative inline-block max-w-full rounded-lg border border-border bg-black/5 overflow-hidden touch-none',
          saving && 'opacity-80',
        )}
      >
        <AnnotationCanvasImage imageId={imageId} />

        <div
          className={cn(
            'absolute inset-0 z-10',
            tool === 'draw' ? 'cursor-crosshair' : 'cursor-default',
            saving && 'pointer-events-none',
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          style={{ touchAction: 'none' }}
        >
          {staticAnnotations.map((ann) => (
            <BBoxLayer
              key={ann.id}
              ann={ann}
              selected={ann.id === selectedId}
              showHandle={ann.id === selectedId && tool === 'select' && !liveBox}
            />
          ))}

          {liveBox && selectedId && (
            <BBoxLayer
              ann={liveBox}
              selected
              showHandle={tool === 'select'}
            />
          )}

          {drawPreview && drawPreview.width > 0.001 && (
            <div
              className="absolute border-2 border-dashed z-30 pointer-events-none box-border"
              style={{
                ...boxStyle(drawPreview),
                borderColor: previewClass.color,
                backgroundColor: `${previewClass.color}33`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
