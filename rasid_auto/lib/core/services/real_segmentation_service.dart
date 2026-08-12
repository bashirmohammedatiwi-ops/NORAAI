import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;

import '../utils/image_preprocessor.dart';
import 'camera_frame_service.dart';
import 'onnx_segmentation_service.dart';
import 'road_segmentation_service.dart';

/// Production facade for on-device segmentation.
///
/// Default: bundled lilNewbie U-Net ONNX (NHWC 256, /255).
/// Later: drop in TFLite when `model.tflite` is provided — same interface.
class RealSegmentationService implements RoadSegmentationService {
  RoadSegmentationService? _backend;
  String? _loadError;
  String _backendLabel = 'Real Segmentation';

  @override
  bool get isReady => _backend?.isReady ?? false;

  @override
  bool get isLoading => _backend?.isLoading ?? false;

  @override
  String? get loadError => _loadError ?? _backend?.loadError;

  @override
  String get backendName => _backend?.backendName ?? _backendLabel;

  @override
  bool get usesCameraFrames => true;

  @override
  int get inputSize => _backend?.inputSize ?? 256;

  @override
  List<String> get classNames =>
      _backend?.classNames ?? const ['background', 'pothole', 'speed_bump'];

  @override
  Future<void> load({
    required String modelPath,
    required String manifestPath,
  }) async {
    await dispose();
    _loadError = null;

    if (!await File(modelPath).exists()) {
      _loadError = 'ملف الموديل غير موجود: $modelPath';
      return;
    }

    final ext = p.extension(modelPath).toLowerCase();
    if (ext == '.tflite') {
      // Placeholder for future TFLite interpreter wiring.
      _backendLabel = 'TFLite Segmentation (pending)';
      _loadError =
          'TFLite جاهز معمارياً — أضف Interpreter لاحقاً. استخدم ‎.onnx الآن.';
      debugPrint(_loadError);
      return;
    }

    final onnx = OnnxSegmentationService();
    await onnx.load(modelPath: modelPath, manifestPath: manifestPath);
    if (onnx.isReady) {
      _backend = onnx;
      _backendLabel = onnx.backendName;
      _loadError = null;
    } else {
      _loadError = onnx.loadError ?? 'فشل تحميل ONNX';
      await onnx.dispose();
      _backend = null;
    }
  }

  @override
  Future<SegmentationFrameResult> segmentJpeg({
    required List<int> jpegBytes,
    required double previewWidth,
    required double previewHeight,
    double minConfidence = 0.25,
  }) async {
    final b = _backend;
    if (b == null) {
      return const SegmentationFrameResult(detections: [], latencyMs: 0);
    }
    return b.segmentJpeg(
      jpegBytes: jpegBytes,
      previewWidth: previewWidth,
      previewHeight: previewHeight,
      minConfidence: minConfidence,
    );
  }

  @override
  Future<SegmentationFrameResult> segmentYuv({
    required FramePacket frame,
    required double previewWidth,
    required double previewHeight,
    double minConfidence = 0.25,
  }) async {
    final b = _backend;
    if (b == null) {
      return const SegmentationFrameResult(detections: [], latencyMs: 0);
    }
    return b.segmentYuv(
      frame: frame,
      previewWidth: previewWidth,
      previewHeight: previewHeight,
      minConfidence: minConfidence,
    );
  }

  @override
  Future<SegmentationFrameResult> segmentPrepared({
    required PrepTensor prep,
    required double previewWidth,
    required double previewHeight,
    double minConfidence = 0.25,
  }) async {
    final b = _backend;
    if (b == null) {
      return const SegmentationFrameResult(detections: [], latencyMs: 0);
    }
    return b.segmentPrepared(
      prep: prep,
      previewWidth: previewWidth,
      previewHeight: previewHeight,
      minConfidence: minConfidence,
    );
  }

  @override
  Future<void> dispose() async {
    await _backend?.dispose();
    _backend = null;
  }
}
