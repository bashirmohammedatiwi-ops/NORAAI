import { useEffect } from 'react';
import { formatModelOption, useProjectModels } from '@/hooks/useProjectModels';

export type TrainSourceMode = 'scratch' | 'existing';

interface Props {
  projectId: string;
  mode: TrainSourceMode;
  onModeChange: (mode: TrainSourceMode) => void;
  selectedModelId: string;
  onSelectedModelIdChange: (id: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function TrainSourceModelPicker({
  projectId,
  mode,
  onModeChange,
  selectedModelId,
  onSelectedModelIdChange,
  disabled,
  compact,
}: Props) {
  const { models } = useProjectModels(projectId);

  useEffect(() => {
    if (!models.length) {
      if (mode !== 'scratch') onModeChange('scratch');
      return;
    }
    if (mode === 'existing' && !selectedModelId) {
      const active = models.find((m) => m.is_active);
      onSelectedModelIdChange(active?.id ?? models[0].id);
    }
  }, [models, mode, selectedModelId, onModeChange, onSelectedModelIdChange]);

  const selectCls = compact
    ? 'h-9 w-full rounded-md border border-border bg-background px-2 text-xs'
    : 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm';

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3'}>
      {!compact && (
        <p className="text-sm font-medium">مصدر التدريب / Training source</p>
      )}
      <div className={compact ? 'flex flex-wrap items-end gap-3' : 'space-y-2'}>
        <label className={`flex items-center gap-2 cursor-pointer ${compact ? 'text-xs' : 'text-sm'}`}>
          <input
            type="radio"
            name={`train-source-${projectId}`}
            checked={mode === 'scratch'}
            onChange={() => onModeChange('scratch')}
            disabled={disabled}
            className="rounded-full border-border"
          />
          من الصفر (Pretrained)
        </label>
        <label className={`flex items-center gap-2 cursor-pointer ${compact ? 'text-xs' : 'text-sm'}`}>
          <input
            type="radio"
            name={`train-source-${projectId}`}
            checked={mode === 'existing'}
            onChange={() => onModeChange('existing')}
            disabled={disabled || models.length === 0}
            className="rounded-full border-border"
          />
          متابعة من موديل موجود
        </label>
      </div>

      {mode === 'existing' && models.length > 0 && (
        <div className={compact ? 'min-w-[220px] flex-1' : ''}>
          {!compact && (
            <label className="text-xs text-muted-foreground mb-1 block">اختر الموديل / Select model</label>
          )}
          <select
            className={selectCls}
            value={selectedModelId}
            onChange={(e) => onSelectedModelIdChange(e.target.value)}
            disabled={disabled}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {formatModelOption(m)}
              </option>
            ))}
          </select>
        </div>
      )}

      {models.length === 0 && (
        <p className="text-xs text-muted-foreground">
          لا يوجد موديل مدرب بعد — سيبدأ التدريب من أوزان YOLO الجاهزة.
        </p>
      )}
    </div>
  );
}
