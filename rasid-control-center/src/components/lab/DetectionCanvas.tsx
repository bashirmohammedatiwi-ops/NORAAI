import { useEffect, useRef } from 'react';
import type { LabDetection } from '@/lib/predictLab';
import { drawDetectionsOnCanvas } from '@/lib/predictLab';

interface DetectionCanvasProps {
  media: HTMLImageElement | HTMLVideoElement | null;
  detections: LabDetection[];
  selectedId: string | null;
  minConf: number;
  className?: string;
}

export function DetectionCanvas({ media, detections, selectedId, minConf, className }: DetectionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!media || !canvasRef.current) return;
    drawDetectionsOnCanvas(canvasRef.current, media, detections, selectedId, minConf);
  }, [media, detections, selectedId, minConf]);

  return (
    <canvas
      ref={canvasRef}
      className={className ?? 'max-h-full max-w-full rounded-lg shadow-lg ring-1 ring-black/10'}
    />
  );
}
