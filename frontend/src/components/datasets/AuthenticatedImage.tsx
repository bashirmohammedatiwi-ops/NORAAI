import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AuthenticatedImageProps {
  imageId: string;
  alt?: string;
  className?: string;
}

export function AuthenticatedImage({ imageId, alt = '', className }: AuthenticatedImageProps) {
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
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId]);

  if (failed) {
    return (
      <div className={cn('bg-secondary flex items-center justify-center text-xs text-muted-foreground', className)}>
        No preview
      </div>
    );
  }

  if (!src) {
    return <div className={cn('bg-secondary animate-pulse', className)} />;
  }

  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
