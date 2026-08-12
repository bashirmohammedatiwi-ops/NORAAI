import 'dart:math' as math;
import 'dart:typed_data';

import '../models/detection_result.dart';
import '../utils/image_preprocessor.dart';
import 'camera_frame_service.dart';
import 'road_segmentation_service.dart';

/// Synthetic detections for UI / tracking / overlay testing without weights.
class MockSegmentationService implements RoadSegmentationService {
  MockSegmentationService({this.enabled = true});

  bool enabled;
  final _rng = math.Random(42);
  double _t = 0;
  String? _error;

  @override
  bool get isReady => enabled;

  @override
  bool get isLoading => false;

  @override
  String? get loadError => _error;

  @override
  String get backendName => 'Mock Segmentation';

  @override
  bool get usesCameraFrames => false;

  @override
  int get inputSize => 256;

  @override
  List<String> get classNames => const ['background', 'pothole', 'speed_bump'];

  @override
  Future<void> load({
    required String modelPath,
    required String manifestPath,
  }) async {
    _error = null;
    enabled = true;
  }

  @override
  Future<SegmentationFrameResult> segmentJpeg({
    required List<int> jpegBytes,
    required double previewWidth,
    required double previewHeight,
    double minConfidence = 0.25,
  }) =>
      _synthetic(
        previewWidth: previewWidth,
        previewHeight: previewHeight,
        minConfidence: minConfidence,
      );

  @override
  Future<SegmentationFrameResult> segmentYuv({
    required FramePacket frame,
    required double previewWidth,
    required double previewHeight,
    double minConfidence = 0.25,
  }) =>
      _synthetic(
        previewWidth: previewWidth > 0 ? previewWidth : frame.width.toDouble(),
        previewHeight:
            previewHeight > 0 ? previewHeight : frame.height.toDouble(),
        minConfidence: minConfidence,
      );

  @override
  Future<SegmentationFrameResult> segmentPrepared({
    required PrepTensor prep,
    required double previewWidth,
    required double previewHeight,
    double minConfidence = 0.25,
  }) =>
      _synthetic(
        previewWidth: previewWidth,
        previewHeight: previewHeight,
        minConfidence: minConfidence,
      );

  Future<SegmentationFrameResult> _synthetic({
    required double previewWidth,
    required double previewHeight,
    required double minConfidence,
  }) async {
    final total = Stopwatch()..start();
    // Simulate light preprocess / infer / post without blocking UI long.
    await Future<void>.delayed(const Duration(milliseconds: 6));
    final preprocessMs = 2;
    final inferenceMs = 3;
    final postSw = Stopwatch()..start();
    _t += 0.08;

    final w = previewWidth <= 0 ? 720.0 : previewWidth;
    final h = previewHeight <= 0 ? 1280.0 : previewHeight;

    final pothole = _box(
      cx: w * (0.35 + 0.08 * math.sin(_t)),
      cy: h * (0.62 + 0.04 * math.cos(_t * 0.7)),
      bw: w * 0.18,
      bh: h * 0.08,
      type: SegClass.pothole,
      conf: 0.72 + 0.15 * math.sin(_t * 1.3),
    );
    final bump = _box(
      cx: w * (0.62 + 0.05 * math.cos(_t * 0.9)),
      cy: h * (0.48 + 0.03 * math.sin(_t)),
      bw: w * 0.28,
      bh: h * 0.05,
      type: SegClass.speedBump,
      conf: 0.65 + 0.2 * math.cos(_t),
    );

    final noise = _rng.nextDouble();
    final list = <DetectionResult>[
      if (pothole.confidence >= minConfidence) pothole,
      if (bump.confidence >= minConfidence && noise > 0.15) bump,
    ];
    final postprocessMs = postSw.elapsedMilliseconds;

    final mw = 320;
    final mh = 320;
    final mask = Uint8List(mw * mh);
    void stampOval(DetectionResult d) {
      if (d.type != SegClass.pothole) return;
      final cx = (d.centerX / w * mw).round();
      final cy = (d.centerY / h * mh).round();
      final rx = (d.boundingBox.width / w * mw / 2).round().clamp(4, 80);
      final ry = (d.boundingBox.height / h * mh / 2).round().clamp(3, 60);
      for (var y = cy - ry; y <= cy + ry; y++) {
        for (var x = cx - rx; x <= cx + rx; x++) {
          if (x < 0 || y < 0 || x >= mw || y >= mh) continue;
          final nx = (x - cx) / rx;
          final ny = (y - cy) / ry;
          final d2 = nx * nx + ny * ny;
          if (d2 <= 1) {
            // Radial falloff: bright core, soft fading rim.
            mask[y * mw + x] = ((1 - d2) * 255).round().clamp(0, 255);
          }
        }
      }
    }
    for (final d in list) {
      stampOval(d);
    }

    return SegmentationFrameResult(
      detections: list,
      latencyMs: total.elapsedMilliseconds,
      preprocessMs: preprocessMs,
      inferenceMs: inferenceMs,
      postprocessMs: postprocessMs,
      maskWidth: mw,
      maskHeight: mh,
      potholeMask: mask,
    );
  }

  DetectionResult _box({
    required double cx,
    required double cy,
    required double bw,
    required double bh,
    required SegClass type,
    required double conf,
  }) {
    final box = BoundingBox(
      left: (cx - bw / 2).clamp(0, double.infinity),
      top: (cy - bh / 2).clamp(0, double.infinity),
      right: cx + bw / 2,
      bottom: cy + bh / 2,
    );
    return DetectionResult(
      type: type,
      confidence: conf.clamp(0.0, 1.0),
      boundingBox: box,
      centerX: box.centerX,
      centerY: box.centerY,
      area: box.area,
      timestamp: DateTime.now(),
      contourPoints: [
        (x: box.left, y: box.top),
        (x: box.right, y: box.top),
        (x: box.right, y: box.bottom),
        (x: box.left, y: box.bottom),
      ],
    );
  }

  @override
  Future<void> dispose() async {}
}
