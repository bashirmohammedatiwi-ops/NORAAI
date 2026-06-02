import { useMemo, useState } from 'react';
import { AuthenticatedImage } from '@/components/datasets/AuthenticatedImage';
import type { WorkspaceImage } from '@/hooks/useAnnotationWorkspace';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

export type ImageFilter = 'all' | 'unlabeled' | 'labeled' | 'pending' | 'manual' | 'no_manual' | 'healthy';

interface Props {
  images: WorkspaceImage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: ImageFilter;
  onFilterChange: (f: ImageFilter) => void;
}

export function AnnotationImageList({
  images,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
}: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    let list = images;
    if (filter === 'unlabeled') list = list.filter((i) => !i.has_labels);
    if (filter === 'labeled') list = list.filter((i) => i.has_labels);
    if (filter === 'pending') list = list.filter((i) => i.needs_review);
    if (filter === 'manual') list = list.filter((i) => i.has_manual_labels);
    if (filter === 'no_manual') list = list.filter((i) => !i.has_manual_labels);
    if (filter === 'healthy') list = list.filter((i) => i.is_healthy);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((i) => i.filename.toLowerCase().includes(q));
    return list;
  }, [images, filter, query]);

  const filters: { id: ImageFilter; label: string }[] = [
    { id: 'all', label: 'الكل' },
    { id: 'healthy', label: 'سليمة ✓' },
    { id: 'manual', label: 'يدوي ✓' },
    { id: 'no_manual', label: 'بدون يدوي' },
    { id: 'unlabeled', label: 'فارغة' },
    { id: 'pending', label: 'مراجعة' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 space-y-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder="بحث باسم الملف…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={cn(
                'text-[11px] px-2 py-1 rounded-md border transition-colors',
                filter === f.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-secondary/60',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">{filtered.length} صورة</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {filtered.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => onSelect(img.id)}
            className={cn(
              'w-full text-left rounded-lg border overflow-hidden transition-all',
              selectedId === img.id
                ? 'border-primary ring-2 ring-primary/30 shadow-sm'
                : 'border-border hover:border-primary/40',
            )}
          >
            <div className="relative aspect-video bg-secondary">
              <AuthenticatedImage imageId={img.id} className="w-full h-full object-cover" />
              {img.is_healthy && (
                <span className="absolute top-1 left-1 text-[9px] px-1 rounded bg-sky-600 text-white font-medium">
                  سليمة
                </span>
              )}
              {img.has_manual_labels && !img.is_healthy && (
                <span className="absolute top-1 left-1 text-[9px] px-1 rounded bg-emerald-600 text-white font-medium">
                  يدوي
                </span>
              )}
              {img.needs_review && (
                <span className="absolute top-1 right-1 text-[9px] px-1 rounded bg-amber-500 text-white font-medium">
                  مراجعة
                </span>
              )}
              {img.annotation_count > 0 && (
                <span className="absolute bottom-1 left-1 text-[9px] px-1 rounded bg-black/60 text-white">
                  {img.annotation_count}
                </span>
              )}
            </div>
            <p className="text-[10px] px-2 py-1.5 truncate text-muted-foreground" title={img.filename}>
              {img.filename}
            </p>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8 px-2">
            لا توجد صور في هذا الفلتر. ارفع صوراً من قسم البيانات.
          </p>
        )}
      </div>
    </div>
  );
}
