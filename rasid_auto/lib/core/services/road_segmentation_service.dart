import 'dart:typed_data';

import '../models/detection_result.dart';
import '../utils/image_preprocessor.dart';
import 'camera_frame_service.dart';

/// Abstraction for road segmentation backends (ONNX / TFLite / Mock).
abstract class RoadSegmentationService {
  bool get isReady;
  bool get isLoading;
  String? get loadError;
  String get backendName;
  int get inputSize;
  List<String> get classNames;

  /// True when this backend consumes live camera YUV (not synthetic).
  bool get usesCameraFrames;

  Future<void> load({
    required String modelPath,
    required String manifestPath,
  });

  /// JPEG fallback / unit tests only — avoid in the live loop.
  Future<SegmentationFrameResult> segmentJpeg({
    required List<int> jpegBytes,
    required double previewWidth,
    required double previewHeight,
    double minConfidence = 0.25,
  });

  /// Preferred real-time path: camera YUV frame (no JPEG).
  Future<SegmentationFrameResult> segmentYuv({
    required FramePacket frame,
    required double previewWidth,
    required double previewHeight,
    double minConfidence = 0.25,
  });

  Future<SegmentationFrameResult> segmentPrepared({
    required PrepTensor prep,
    required double previewWidth,
    required double previewHeight,
    double minConfidence = 0.25,
  });

  Future<void> dispose();
}

class SegmentationFrameResult {
  const SegmentationFrameResult({
    required this.detections,
    required this.latencyMs,
    this.preprocessMs = 0,
    this.inferenceMs = 0,
    this.postprocessMs = 0,
    this.maskWidth = 0,
    this.maskHeight = 0,
    this.potholeMask,
  });

  final List<DetectionResult> detections;

  /// Total end-to-end detection latency for this frame.
  final int latencyMs;
  final int preprocessMs;
  final int inferenceMs;
  final int postprocessMs;
  final int maskWidth;
  final int maskHeight;

  /// Binary mask 0/255 for pothole pixels (model resolution) — red overlay.
  final Uint8List? potholeMask;
}
