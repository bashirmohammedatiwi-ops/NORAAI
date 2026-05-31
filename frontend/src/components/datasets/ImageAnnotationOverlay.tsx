import { cn } from '@/lib/utils';

interface AnnotationBox {
  class_name: string;
  class_color: string;
  x_center: number;
  y_center: number;
  width: number;
  height: number;
  status: string;
}

interface ImageAnnotationOverlayProps {
  annotations: AnnotationBox[];
  className?: string;
}

export function ImageAnnotationOverlay({ annotations, className }: ImageAnnotationOverlayProps) {
  if (!annotations.length) return null;

  return (
    <div className={cn('absolute inset-0 pointer-events-none', className)}>
      {annotations.map((ann, idx) => {
        const left = (ann.x_center - ann.width / 2) * 100;
        const top = (ann.y_center - ann.height / 2) * 100;
        return (
          <div
            key={idx}
            className="absolute border-2"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${ann.width * 100}%`,
              height: `${ann.height * 100}%`,
              borderColor: ann.class_color,
            }}
          >
            <span
              className="absolute -top-4 left-0 text-[9px] px-1 rounded whitespace-nowrap text-white leading-tight"
              style={{ backgroundColor: ann.class_color }}
            >
              {ann.class_name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
