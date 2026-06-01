import type { RefObject } from 'react';
import SpeedGauge from './SpeedGauge';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraOk: boolean;
  scanning: boolean;
  speed: number | null;
  speedLimit: number;
  mode?: 'full' | 'pip';
}

export default function CameraPanel({
  videoRef,
  canvasRef,
  cameraOk,
  scanning,
  speed,
  speedLimit,
  mode = 'full',
}: Props) {
  const pip = mode === 'pip';

  return (
    <div className={`camera-panel${pip ? ' camera-panel--pip' : ''}${scanning ? ' camera-panel--scanning' : ''}`}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="camera-panel__video"
      />
      <canvas ref={canvasRef} className="camera-panel__canvas" />

      {!cameraOk && (
        <div className="camera-panel__error">
          <span>📷</span>
          <p>الكاميرا غير متاحة</p>
        </div>
      )}

      {cameraOk && (
        <div className="camera-panel__live">
          <span className="camera-panel__live-dot" />
          مباشر
        </div>
      )}

      {scanning && cameraOk && (
        <div className="camera-panel__scan">جاري الفحص...</div>
      )}

      {!pip && <SpeedGauge speed={speed} limit={speedLimit} />}
    </div>
  );
}
