import { cn } from '@/lib/utils';

export interface TrainClassOption {
  id: string;
  name: string;
  color?: string;
}

interface Props {
  classes: TrainClassOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function TrainingClassPicker({
  classes,
  selectedIds,
  onChange,
  disabled,
  compact,
}: Props) {
  const allSelected = classes.length > 0 && selectedIds.length === classes.length;

  const toggle = (id: string) => {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      if (selectedIds.length <= 1) return;
      onChange(selectedIds.filter((x) => x !== id));
      return;
    }
    onChange([...selectedIds, id]);
  };

  const selectAll = () => {
    if (disabled) return;
    onChange(classes.map((c) => c.id));
  };

  if (!classes.length) {
    return (
      <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border px-3 py-2">
        لا توجد فئات — أضف فئات من صفحة Classes أولاً
      </p>
    );
  }

  return (
    <div className={cn('space-y-2', compact && 'space-y-1.5')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">فئات التدريب</span>
        <button
          type="button"
          className="text-[10px] text-primary underline disabled:opacity-50"
          disabled={disabled || allSelected}
          onClick={selectAll}
        >
          تحديد الكل
        </button>
      </div>
      <div className={cn('flex flex-wrap gap-2', compact && 'gap-1.5')}>
        {classes.map((cls) => {
          const active = selectedIds.includes(cls.id);
          const color = cls.color || '#64748b';
          return (
            <button
              key={cls.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(cls.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                active ? 'font-medium' : 'opacity-60',
                disabled && 'cursor-not-allowed opacity-50',
              )}
              style={{
                borderColor: color,
                backgroundColor: active ? `${color}22` : 'transparent',
                color: active ? color : undefined,
              }}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              {cls.name}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {selectedIds.length} / {classes.length} فئات مختارة — يجب اختيار فئة واحدة على الأقل
      </p>
      {selectedIds.length > 0 && selectedIds.length < classes.length && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          سيتم تحديث النموذج الرئيسي للفئات المحددة فقط. الفئات غير المختارة لن تُكتشف حتى تدريبها لاحقاً.
        </p>
      )}
    </div>
  );
}
