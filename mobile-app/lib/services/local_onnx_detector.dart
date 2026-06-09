import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter_onnxruntime/flutter_onnxruntime.dart';
import '../models/detection.dart';
import '../utils/platform_support.dart';
import 'onnx_frame_prep.dart';

class LocalDetectResult {
  const LocalDetectResult({
    required this.boxes,
    required this.latencyMs,
  });

  final List<DetectionBox> boxes;
  final int latencyMs;
}

/// Ultralytics YOLO ONNX — on-device, optimized for speed.
class LocalOnnxDetector {
  OrtSession? _session;
  String? _inputName;
  String? _outputName;
  List<String> _classNames = [];
  int _inputSize = 640;
  String? loadError;
  Future<void>? _loadFuture;
  Future<LocalDetectResult>? _detectFuture;

  bool get isReady => _session != null && _classNames.isNotEmpty;
  bool get isLoading => _loadFuture != null;
  int get inputSize => _inputSize;
  List<String> get classNames => List.unmodifiable(_classNames);

  Future<void> load({
    required String modelPath,
    required String manifestPath,
  }) async {
    if (!supportsLocalInference) return;
    if (_loadFuture != null) return _loadFuture!;

    _loadFuture = _loadImpl(modelPath: modelPath, manifestPath: manifestPath);
    try {
      await _loadFuture;
    } finally {
      _loadFuture = null;
    }
  }

  Future<void> _loadImpl({
    required String modelPath,
    required String manifestPath,
  }) async {
    await dispose();
    loadError = null;

    if (!await File(modelPath).exists()) {
      loadError = 'ملف الموديل غير موجود — زامِن من شاشة الموديل';
      return;
    }

    try {
      final manifestRaw = await File(manifestPath).readAsString();
      final manifest = jsonDecode(manifestRaw) as Map<String, dynamic>;
      final classes = (manifest['classes'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [];
      if (classes.isEmpty) {
        loadError = 'قائمة كلاسات الموديل فارغة';
        return;
      }

      _inputSize = (manifest['image_size'] as num?)?.toInt() ?? 640;
      _classNames = classes;

      final ort = OnnxRuntime();
      final options = OrtSessionOptions(
        intraOpNumThreads: 4,
        interOpNumThreads: 2,
        providers: kIsWeb ? null : [OrtProvider.XNNPACK, OrtProvider.CPU],
      );

      _session = await ort.createSession(modelPath, options: options);
      _inputName = _session!.inputNames.isNotEmpty ? _session!.inputNames.first : 'images';
      _outputName = _session!.outputNames.isNotEmpty ? _session!.outputNames.first : 'output0';
      loadError = null;
    } catch (e) {
      loadError = 'فشل تحميل ONNX: $e';
      await dispose();
    }
  }

  Future<LocalDetectResult> detect(
    Uint8List jpegBytes, {
    required double minConfidence,
    double iouThreshold = 0.42,
  }) async {
    if (_detectFuture != null) return _detectFuture!;
    _detectFuture = _detectImpl(
      jpegBytes,
      minConfidence: minConfidence,
      iouThreshold: iouThreshold,
    );
    try {
      return await _detectFuture!;
    } finally {
      _detectFuture = null;
    }
  }

  Future<LocalDetectResult> _detectImpl(
    Uint8List jpegBytes, {
    required double minConfidence,
    required double iouThreshold,
  }) async {
    final session = _session;
    final inputName = _inputName;
    final outputName = _outputName;
    if (session == null || inputName == null || outputName == null) {
      throw StateError(loadError ?? 'الموديل المحلي غير جاهز');
    }

    final sw = Stopwatch()..start();

    final prep = await compute(prepareOnnxInput, [jpegBytes, _inputSize]);
    if (prep == null) {
      return LocalDetectResult(boxes: const [], latencyMs: sw.elapsedMilliseconds);
    }

    final inputTensor = await OrtValue.fromList(
      prep.tensor,
      [1, 3, _inputSize, _inputSize],
    );

    Map<String, OrtValue> outputs;
    try {
      outputs = await session.run({inputName: inputTensor});
    } finally {
      await inputTensor.dispose();
    }

    final output = outputs[outputName];
    if (output == null) {
      for (final v in outputs.values) {
        await v.dispose();
      }
      return LocalDetectResult(boxes: const [], latencyMs: sw.elapsedMilliseconds);
    }

    final flat = await output.asFlattenedList();
    final shape = output.shape;
    await output.dispose();
    for (final v in outputs.values) {
      if (v != output) await v.dispose();
    }

    final raw = flat.map((e) => (e as num).toDouble()).toList();
    final inferMin = math.max(0.12, minConfidence * 0.72);
    final boxes = _decodeYolo(
      raw,
      shape,
      prep: prep,
      minConfidence: inferMin,
      iouThreshold: iouThreshold,
    );

    return LocalDetectResult(boxes: boxes, latencyMs: sw.elapsedMilliseconds);
  }

  Future<void> dispose() async {
    final session = _session;
    _session = null;
    _inputName = null;
    _outputName = null;
    _classNames = [];
    if (session != null) {
      try {
        await session.close();
      } catch (_) {}
    }
  }

  List<DetectionBox> _decodeYolo(
    List<double> data,
    List<int> shape, {
    required OnnxPrepResult prep,
    required double minConfidence,
    required double iouThreshold,
  }) {
    if (shape.length != 3 || shape[0] != 1) return const [];

    final channels = shape[1];
    final numPreds = shape[2];
    final numClasses = channels - 4;
    if (numClasses <= 0 || numClasses > _classNames.length + 4) return const [];

    final candidates = <_Cand>[];

    for (var i = 0; i < numPreds; i++) {
      var bestScore = 0.0;
      var bestClass = 0;
      for (var c = 0; c < numClasses; c++) {
        final score = data[(4 + c) * numPreds + i];
        if (score > bestScore) {
          bestScore = score;
          bestClass = c;
        }
      }
      if (bestScore < minConfidence) continue;

      final cx = data[0 * numPreds + i];
      final cy = data[1 * numPreds + i];
      final w = data[2 * numPreds + i];
      final h = data[3 * numPreds + i];

      final x1 = ((cx - w / 2) - prep.padX) / prep.scale / prep.origW;
      final y1 = ((cy - h / 2) - prep.padY) / prep.scale / prep.origH;
      final x2 = ((cx + w / 2) - prep.padX) / prep.scale / prep.origW;
      final y2 = ((cy + h / 2) - prep.padY) / prep.scale / prep.origH;

      if (x2 <= x1 || y2 <= y1) continue;
      if (x2 < 0 || y2 < 0 || x1 > 1 || y1 > 1) continue;

      final cls = bestClass < _classNames.length ? _classNames[bestClass] : 'class_$bestClass';
      candidates.add(_Cand(
        className: cls,
        confidence: bestScore,
        x1: x1.clamp(0.0, 1.0),
        y1: y1.clamp(0.0, 1.0),
        x2: x2.clamp(0.0, 1.0),
        y2: y2.clamp(0.0, 1.0),
      ));
    }

    final kept = _nms(candidates, iouThreshold);
    return kept
        .map(
          (c) => DetectionBox(
            className: c.className,
            confidence: c.confidence,
            bbox: [c.x1, c.y1, c.x2, c.y2],
          ),
        )
        .toList();
  }

  static List<_Cand> _nms(List<_Cand> boxes, double iouThresh) {
    final sorted = [...boxes]..sort((a, b) => b.confidence.compareTo(a.confidence));
    final kept = <_Cand>[];

    for (final box in sorted) {
      var overlap = false;
      for (final k in kept) {
        if (_iou(box, k) > iouThresh) {
          overlap = true;
          break;
        }
      }
      if (!overlap) kept.add(box);
    }
    return kept;
  }

  static double _iou(_Cand a, _Cand b) {
    final ix1 = math.max(a.x1, b.x1);
    final iy1 = math.max(a.y1, b.y1);
    final ix2 = math.min(a.x2, b.x2);
    final iy2 = math.min(a.y2, b.y2);
    final iw = math.max(0.0, ix2 - ix1);
    final ih = math.max(0.0, iy2 - iy1);
    final inter = iw * ih;
    final areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
    final areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
    final union = areaA + areaB - inter;
    return union <= 0 ? 0 : inter / union;
  }
}

class _Cand {
  const _Cand({
    required this.className,
    required this.confidence,
    required this.x1,
    required this.y1,
    required this.x2,
    required this.y2,
  });

  final String className;
  final double confidence;
  final double x1;
  final double y1;
  final double x2;
  final double y2;
}
