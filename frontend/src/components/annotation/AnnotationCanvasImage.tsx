import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  imageId: string;
  alt?: string;
  className?: string;
  onLoaded?: () => void;
}

/** Image for annotation canvas — never draggable, no pointer events. */
export function AnnotationCanvasImage({ imageId, alt = '', className, onLoaded }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    api.fetchBlob(api.imageContentPath(imageId))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setFailed(false);
        onLoaded?.();
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, onLoaded]);

  if (failed) {
    return (
      <div className={cn('bg-secondary flex items-center justify-center text-xs text-muted-foreground min-h-[200px]', className)}>
        لا توجد معاينة
      </div>
    );
  }

  if (!src) {
    return <div className={cn('bg-secondary animate-pulse min-h-[200px] w-full max-w-full', className)} />;
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      className={cn('block max-w-full max-h-[min(70vh,640px)] w-auto h-auto pointer-events-none select-none', className)}
    />
  );
}
