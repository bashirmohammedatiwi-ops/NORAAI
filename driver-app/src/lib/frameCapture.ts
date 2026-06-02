/** Resize camera frame for fast upload + inference. */
export function captureFrameBlob(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  options: { maxWidth: number; jpegQuality: number },
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (video.readyState < 2) {
      resolve(null);
      return;
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      resolve(null);
      return;
    }
    const scale = Math.min(1, options.maxWidth / vw);
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(null);
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', options.jpegQuality);
  });
}
