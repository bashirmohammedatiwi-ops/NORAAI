import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';

/// Real-time camera capture via [CameraController.startImageStream].
///
/// Policy:
/// - Always copies plane bytes before leaving the stream callback (platform
///   buffers are recycled).
/// - Keeps **only the latest** accepted frame (no queue).
/// - Drops frames while [busy] or when under skip throttle.
class CameraFrameService {
  CameraFrameService({
    this.targetInferFps = 12,
    this.skipEvery = 0,
  });

  /// Desired inference rate; used to derive skip if [skipEvery] == 0.
  int targetInferFps;

  /// Explicit skip: process 1 of N frames. 0 = auto from [targetInferFps].
  int skipEvery;

  CameraController? _controller;
  bool _streaming = false;
  bool _busy = false;
  int _frameIndex = 0;
  int _accepted = 0;
  int _droppedBusy = 0;
  int _droppedSkip = 0;
  int _cameraTicks = 0;
  DateTime? _fpsWindowStart;
  double cameraFps = 0;

  FramePacket? _latest;

  bool get isStreaming => _streaming;
  bool get busy => _busy;
  int get droppedBusy => _droppedBusy;
  int get droppedSkip => _droppedSkip;
  int get acceptedFrames => _accepted;

  int get effectiveSkip {
    if (skipEvery > 0) return skipEvery.clamp(1, 30);
    return (30 / targetInferFps.clamp(1, 30)).round().clamp(1, 15);
  }

  Future<void> attach(CameraController controller) async {
    _controller = controller;
  }

  Future<void> start() async {
    final cam = _controller;
    if (cam == null || !cam.value.isInitialized) return;
    if (_streaming) return;
    if (cam.value.isStreamingImages) {
      try {
        await cam.stopImageStream();
      } catch (_) {}
    }
    _streaming = true;
    _frameIndex = 0;
    _accepted = 0;
    _droppedBusy = 0;
    _droppedSkip = 0;
    _cameraTicks = 0;
    _fpsWindowStart = DateTime.now();
    cameraFps = 0;

    final skip = effectiveSkip;
    debugPrint('CameraFrameService: startImageStream skip=$skip');

    await cam.startImageStream((image) {
      _cameraTicks++;
      _updateCameraFps();

      _frameIndex++;
      if (_frameIndex % skip != 0) {
        _droppedSkip++;
        return;
      }
      if (_busy) {
        _droppedBusy++;
        // Keep newest only when not busy; if busy, drop entirely (no queue).
        return;
      }

      // Copy only when we accept this frame for inference.
      _latest = FramePacket.fromCameraImage(image);
      _accepted++;
    });
  }

  void _updateCameraFps() {
    final started = _fpsWindowStart;
    if (started == null) return;
    final elapsed = DateTime.now().difference(started).inMilliseconds;
    if (elapsed >= 1000) {
      cameraFps = _cameraTicks * 1000 / elapsed;
      _cameraTicks = 0;
      _fpsWindowStart = DateTime.now();
    }
  }

  Future<void> stop() async {
    final cam = _controller;
    if (!_streaming) return;
    _streaming = false;
    if (cam != null) {
      try {
        if (cam.value.isStreamingImages) {
          await cam.stopImageStream();
        }
      } catch (e) {
        debugPrint('stopImageStream: $e');
      }
    }
    _latest = null;
  }

  /// Take the newest frame (clears slot). Returns null if none ready.
  FramePacket? consume() {
    final f = _latest;
    _latest = null;
    return f;
  }

  void setBusy(bool v) => _busy = v;

  void configure({int? targetInferFps, int? skipEvery}) {
    if (targetInferFps != null) this.targetInferFps = targetInferFps;
    if (skipEvery != null) this.skipEvery = skipEvery;
  }
}

/// Immutable YUV snapshot safe to send across isolates.
class FramePacket {
  const FramePacket({
    required this.width,
    required this.height,
    required this.planes,
    required this.bytesPerRow,
    required this.bytesPerPixel,
    required this.format,
    required this.uvPixelStride,
    required this.layout,
    this.timestampMs,
  });

  final int width;
  final int height;

  /// Copied plane bytes: [Y, U, V] for yuv420_888 or [Y, VU] for nv21-style.
  final List<Uint8List> planes;
  final List<int> bytesPerRow;
  final List<int> bytesPerPixel;
  final ImageFormatGroup format;

  /// Android YUV_420_888 chroma pixel stride (often 2 when UV interleaved).
  final int uvPixelStride;

  final YuvLayout layout;
  final int? timestampMs;

  factory FramePacket.fromCameraImage(CameraImage image) {
    final planes = <Uint8List>[];
    final rows = <int>[];
    final pix = <int>[];

    for (final p in image.planes) {
      // Required copy: platform may recycle the underlying buffer.
      final src = p.bytes;
      final copy = Uint8List(src.length);
      copy.setRange(0, src.length, src);
      planes.add(copy);
      rows.add(p.bytesPerRow);
      pix.add(p.bytesPerPixel ?? 1);
    }

    final layout = _detectLayout(image, pix);
    final uvStride = pix.length > 1 ? pix[1] : 1;

    return FramePacket(
      width: image.width,
      height: image.height,
      planes: planes,
      bytesPerRow: rows,
      bytesPerPixel: pix,
      format: image.format.group,
      uvPixelStride: uvStride,
      layout: layout,
      timestampMs: DateTime.now().millisecondsSinceEpoch,
    );
  }

  static YuvLayout _detectLayout(CameraImage image, List<int> pix) {
    if (image.planes.length == 2) return YuvLayout.nv21;
    if (image.planes.length >= 3) {
      // pixelStride==2 usually means interleaved UV in Android YUV_420_888.
      if ((pix.length > 1 && pix[1] == 2) || (pix.length > 2 && pix[2] == 2)) {
        return YuvLayout.yuv420Interleaved;
      }
      return YuvLayout.yuv420Planar;
    }
    return YuvLayout.unknown;
  }

  /// Isolate args for [ImagePreprocessor.prepareYuvIsolate].
  List<dynamic> toIsolateArgs({
    required int netSize,
    required bool letterbox,
    int normalizeIndex = 0,
    int layoutIndex = 0,
  }) =>
      [
        width,
        height,
        planes,
        bytesPerRow,
        bytesPerPixel,
        netSize,
        letterbox,
        layout.index,
        uvPixelStride,
        normalizeIndex,
        layoutIndex,
      ];
}

enum YuvLayout {
  yuv420Planar,
  yuv420Interleaved,
  nv21,
  unknown,
}
