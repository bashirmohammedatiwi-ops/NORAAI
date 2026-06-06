import { AuthenticatedImage } from '@/components/datasets/AuthenticatedImage';
import { ImageAnnotationOverlay } from '@/components/datasets/ImageAnnotationOverlay';
import type { PendingAnn } from '@/hooks/useAnnotationWorkspace';
import { Button } from '@/components/ui/button';
import { Check, Pencil, X } from 'lucide-react';

interface Props {
  pending: PendingAnn[];
  classMap: Record<string, { name: string; color: string }>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (imageId: string) => void;
}

export function AnnotationReviewQueue({
  pending,
  classMap,
  onApprove,
  onReject,
  onEdit,
}: Props) {
  if (pending.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-12 text-center">
        <p className="text-sm font-medium">لا توجد تسميات بانتظار المراجعة</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
      {pending.map((a, index) => {
        const cls = classMap[a.class_id];
        return (
          <article
            key={a.id}
            className="flex flex-col lg:flex-row gap-4 p-4 rounded-xl border border-border bg-card shadow-sm"
          >
            <div className="relative w-full lg:w-56 aspect-video shrink-0 rounded-lg overflow-hidden bg-secondary">
              <AuthenticatedImage imageId={a.image_id} className="w-full h-full object-cover" />
              <ImageAnnotationOverlay
                annotations={[{
                  class_name: cls?.name ?? 'صنف',
                  class_color: cls?.color ?? '#3B82F6',
                  x_center: a.x_center,
                  y_center: a.y_center,
                  width: a.width,
                  height: a.height,
                  status: a.status,
                }]}
              />
            </div>
            <div className="flex-1 flex flex-col justify-between gap-3 min-w-0">
              <div>
                <p className="text-xs text-muted-foreground">#{index + 1} من {pending.length}</p>
                <p className="text-lg font-semibold mt-0.5" style={{ color: cls?.color }}>
                  {cls?.name ?? 'صنف غير معروف'}
                </p>
                <p className="text-sm text-muted-foreground">
                  ثقة النموذج: {((a.confidence ?? 0) * 100).toFixed(0)}%
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="gap-1" onClick={() => onApprove(a.id)}>
                  <Check className="h-4 w-4" /> موافقة
                </Button>
                <Button size="sm" variant="destructive" className="gap-1" onClick={() => onReject(a.id)}>
                  <X className="h-4 w-4" /> رفض
                </Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => onEdit(a.image_id)}>
                  <Pencil className="h-4 w-4" /> تعديل يدوي
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
