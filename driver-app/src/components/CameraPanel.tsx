import type { RefObject } from 'react';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  ok: boolean;
  scan: boolean;
  expanded: boolean;
  onToggle: () => void;
}

export default function CameraPanel({ videoRef, canvasRef, ok, scan, expanded, onToggle }: Props) {
  return (
    <>
      {expanded && (
        <button type="button" className="nx-cam-backdrop" onClick={onToggle} aria-label="تصغير الكاميرا" />
      )}

      <div className={`nx-cam-float${expanded ? ' nx-cam-float--lg' : ''}${scan ? ' nx-cam-float--scan' : ''}`}>
        <header className="nx-cam-float__head">
          <div className="nx-cam-float__live">
            {ok && <b />}
            <span>{ok ? 'مباشر' : 'بدون كاميرا'}</span>
          </div>
          {scan && ok && <span className="nx-cam-float__ai">AI</span>}
          <button type="button" className="nx-cam-float__toggle" onClick={onToggle}>
            {expanded ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            )}
          </button>
        </header>

        <div className="nx-cam-float__body">
          <video ref={videoRef} muted playsInline autoPlay className="nx-cam-float__vid" />
          <canvas ref={canvasRef} className="nx-cam-float__buf" />

          {!ok && (
            <div className="nx-cam-float__err">
              <span>📷</span>
              <p>الكاميرا غير متاحة</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
