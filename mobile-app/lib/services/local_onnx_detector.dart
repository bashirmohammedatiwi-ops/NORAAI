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

/// Ultralytics YOLO ONNX — postprocess matches official ONNXRuntime example.
class LocalOnnxDetector {
  OrtSession? _session;
  String? _inputName;
  String? _outputName;
  List<String> _classNames = [];
  int _inputSize = 640;
  int _inputH = 640;
  int _inputW = 640;
  String? loadError;
  Future<void>? _loadFuture;
  Future<LocalDetectResult>? _detectFuture;
  bool _loggedMeta = false;
  Float64List? _rawBuf;
  int _inferCount = 0;

  bool get isReady => _session != null && _classNames.isNotEmpty;
  bool get isLoading => _loadFuture != null;
  int get inputSize => _inputSize;
  int get inputWidth => _inputW;
  int get inputHeight => _inputH;
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
    _loggedMeta = false;

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
      if (kIsWeb) {
        _session = await ort.createSession(modelPath);
      } else {
        // XNNPACK first: a small 320 YOLO runs the whole graph on one fast
        // CPU delegate, avoiding the partition transfers NNAPI incurs on the
        // in-graph NMS ops (which it can't run → 3 partitions → slower).
        final fast = OrtSessionOptions(
          intraOpNumThreads: 4,
          interOpNumThreads: 2,
          providers: [
            OrtProvider.XNNPACK,
            OrtProvider.NNAPI,
            OrtProvider.CPU,
          ],
        );
        try {
          _session = await ort.createSession(modelPath, options: fast);
        } catch (_) {
          final cpu = OrtSessionOptions(
            intraOpNumThreads: 4,
            providers: [OrtProvider.CPU],
          );
          _session = await ort.createSession(modelPath, options: cpu);
        }
      }
      _inputName = _session!.inputNames.isNotEmpty ? _session!.inputNames.first : 'images';
      _outputName = _pickOutputName(_session!.outputNames);
      await _resolveInputShape();
      loadError = null;
    } catch (e) {
      loadError = 'فشل تحميل ONNX: $e';
      await dispose();
    }
  }

  /// Read the model's real input dims (NCHW) — manifest size is unreliable.
  Future<void> _resolveInputShape() async {
    final session = _session;
    if (session == null) return;
    try {
      final info = await session.getInputInfo();
      Map<String, dynamic>? imagesInfo;
      for (final entry in info) {
        if (entry['name'] == _inputName) {
          imagesInfo = entry;
          break;
        }
      }
      imagesInfo ??= info.isNotEmpty ? info.first : null;
      final rawShape = imagesInfo?['shape'];
      if (rawShape is List && rawShape.length == 4) {
        final dims = rawShape.map((e) => (e as num?)?.toInt() ?? -1).toList();
        // NCHW: [batch, channels, height, width]
        final h = dims[2];
        final w = dims[3];
        if (h > 0) _inputH = h;
        if (w > 0) _inputW = w;
        // Square fallback when one dim is dynamic.
        if (h > 0 && w <= 0) _inputW = h;
        if (w > 0 && h <= 0) _inputH = w;
        _inputSize = _inputH > 0 ? _inputH : _inputSize;
      }
    } catch (e) {
      debugPrint('getInputInfo failed, using manifest size $_inputSize: $e');
      _inputH = _inputSize;
      _inputW = _inputSize;
    }
    if (_inputH <= 0) _inputH = _inputSize;
    if (_inputW <= 0) _inputW = _inputSize;
    debugPrint('LocalOnnx input dims = ${_inputW}x$_inputH (manifest=$_inputSize)');
  }

  String _pickOutputName(List<String> names) {
    if (names.isEmpty) return 'output0';
    for (final n in names) {
      final lower = n.toLowerCase();
      if (lower == 'output0' || lower == 'output' || lower.contains('detect')) {
        return n;
      }
    }
    return names.first;
  }

  Future<LocalDetectResult> detectFromPrep(
    OnnxPrepResult prep, {
    required double minConfidence,
    double iouThreshold = 0.45,
  }) async {
    if (_detectFuture != null) return _detectFuture!;
    _detectFuture = _inferPrep(
      prep,
      minConfidence: minConfidence,
      iouThreshold: iouThreshold,
    );
    try {
      return await _detectFuture!;
    } finally {
      _detectFuture = null;
    }
  }

  Future<LocalDetectResult> detect(
    Uint8List jpegBytes, {
    required double minConfidence,
    int rotationDegrees = 0,
    double iouThreshold = 0.45,
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
    final sw = Stopwatch()..start();
    final prep = await compute(prepareOnnxInput, [jpegBytes, _inputW, _inputH]);
    if (prep == null) {
      return LocalDetectResult(boxes: const [], latencyMs: sw.elapsedMilliseconds);
    }
    return _inferPrep(
      prep,
      minConfidence: minConfidence,
      iouThreshold: iouThreshold,
      sw: sw,
    );
  }

  Future<LocalDetectResult> _inferPrep(
    OnnxPrepResult prep, {
    required double minConfidence,
    required double iouThreshold,
    Stopwatch? sw,
  }) async {
    final session = _session;
    final inputName = _inputName;
    final outputName = _outputName;
    if (session == null || inputName == null || outputName == null) {
      throw StateError(loadError ?? 'الموديل المحلي غير جاهز');
    }

    final timer = sw ?? Stopwatch()..start();
    if (sw == null) timer.start();

    final inputTensor = await OrtValue.fromList(
      prep.tensor,
      [1, 3, _inputH, _inputW],
    );

    Map<String, OrtValue> outputs;
    try {
      outputs = await session.run({inputName: inputTensor});
    } finally {
      await inputTensor.dispose();
    }

    OrtValue? output = outputs[outputName];
    if (output == null && outputs.isNotEmpty) {
      output = outputs.values.first;
    }
    if (output == null) {
      for (final v in outputs.values) {
        await v.dispose();
      }
      return LocalDetectResult(boxes: const [], latencyMs: timer.elapsedMilliseconds);
    }

    final flat = await output.asFlattenedList();
    final shape = output.shape;
    await output.dispose();
    for (final v in outputs.values) {
      if (v != output) await v.dispose();
    }

    if (!_loggedMeta) {
      _loggedMeta = true;
      debugPrint(
        'LocalOnnx outputs=$outputName shape=$shape nc=${_classNames.length} '
        'in=$_inputSize gain=${prep.gain.toStringAsFixed(3)} img=${prep.origW}x${prep.origH}',
      );
    }

    // Reuse a Float64List buffer to avoid per-frame List allocation churn.
    final n = flat.length;
    if (_rawBuf == null || _rawBuf!.length != n) {
      _rawBuf = Float64List(n);
    }
    final raw = _rawBuf!;
    for (var i = 0; i < n; i++) {
      raw[i] = (flat[i] as num).toDouble();
    }
    final inferMin = math.max(0.08, minConfidence);
    final boxes = _decodeOutput(
      raw,
      shape,
      prep: prep,
      minConfidence: inferMin,
      iouThreshold: iouThreshold,
    );

    _inferCount++;
    if (boxes.isNotEmpty) {
      debugPrint(
        'LocalOnnx ${boxes.length} @ ${boxes.first.confidence.toStringAsFixed(2)} '
        '${timer.elapsedMilliseconds}ms',
      );
    } else if (_inferCount % 20 == 0) {
      debugPrint('LocalOnnx infer ${timer.elapsedMilliseconds}ms (empty)');
    }

    return LocalDetectResult(boxes: boxes, latencyMs: timer.elapsedMilliseconds);
  }

  Future<void> dispose() async {
    final session = _session;
    _session = null;
    _inputName = null;
    _outputName = null;
    _classNames = [];
    _loggedMeta = false;
    if (session != null) {
      try {
        await session.close();
      } catch (_) {}
    }
  }

  List<DetectionBox> _decodeOutput(
    List<double> data,
    List<int> shape, {
    required OnnxPrepResult prep,
    required double minConfidence,
    required double iouThreshold,
  }) {
    if (shape.isEmpty) return const [];

    // End-to-end: (1, N, 6) or (1, 6, N) with N <= 1000
    if (shape.length == 3 && shape[0] == 1) {
      final d1 = shape[1];
      final d2 = shape[2];
      if (d2 == 6 && d1 > 6 && d1 <= 1000) {
        return _decodeEnd2End(data, rows: d1, channelsLast: true, prep: prep, minConfidence: minConfidence, iouThreshold: iouThreshold);
      }
      if (d1 == 6 && d2 > 6 && d2 <= 1000) {
        return _decodeEnd2End(data, rows: d2, channelsLast: false, prep: prep, minConfidence: minConfidence, iouThreshold: iouThreshold);
      }
    }

    if (shape.length == 3 && shape[0] == 1) {
      return _decodeUltralyticsYolo(
        data,
        shape[1],
        shape[2],
        prep: prep,
        minConfidence: minConfidence,
        iouThreshold: iouThreshold,
      );
    }

    return const [];
  }

  /// Standard Ultralytics export: (1, 4+nc, anchors) or (1, anchors, 4+nc).
  List<DetectionBox> _decodeUltralyticsYolo(
    List<double> data,
    int d1,
    int d2, {
    required OnnxPrepResult prep,
    required double minConfidence,
    required double iouThreshold,
  }) {
    final nc = _classNames.length;
    if (nc == 0) return const [];

    late final int numCh;
    late final int numRows;
    late final bool channelsLast;

    if (d1 < d2) {
      numCh = d1;
      numRows = d2;
      channelsLast = false;
    } else {
      numRows = d1;
      numCh = d2;
      channelsLast = true;
    }

    if (numCh < 5 || numRows < 100) return const [];
    final tensorNc = numCh - 4;
    if (tensorNc < 1) return const [];
    final useNc = math.min(nc, tensorNc);

    final candidates = <_Cand>[];
    final gain = prep.gain;
    final ow = prep.origW.toDouble();
    final oh = prep.origH.toDouble();

    for (var i = 0; i < numRows; i++) {
      var cx = _at(data, channelsLast, numRows, numCh, 0, i);
      var cy = _at(data, channelsLast, numRows, numCh, 1, i);
      final w = _at(data, channelsLast, numRows, numCh, 2, i);
      final h = _at(data, channelsLast, numRows, numCh, 3, i);

      // Ultralytics: subtract pad from center before scaling (pad = top, left).
      cx -= prep.padLeft;
      cy -= prep.padTop;

      var bestScore = 0.0;
      var bestClass = 0;
      for (var c = 0; c < useNc; c++) {
        final raw = _at(data, channelsLast, numRows, numCh, 4 + c, i);
        final score = _classScore(raw);
        if (score > bestScore) {
          bestScore = score;
          bestClass = c;
        }
      }
      if (bestScore < minConfidence) continue;

      final left = (cx - w / 2) / gain;
      final top = (cy - h / 2) / gain;
      final width = w / gain;
      final height = h / gain;

      final x1 = (left / ow).clamp(0.0, 1.0);
      final y1 = (top / oh).clamp(0.0, 1.0);
      final x2 = ((left + width) / ow).clamp(0.0, 1.0);
      final y2 = ((top + height) / oh).clamp(0.0, 1.0);

      if (x2 <= x1 || y2 <= y1) continue;
      final area = (x2 - x1) * (y2 - y1);
      if (area < 0.0002 || area > 0.95) continue;

      candidates.add(_Cand(
        className: _classNames[bestClass],
        confidence: bestScore,
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
      ));
    }

    return _toBoxes(_nms(candidates, iouThreshold).take(50).toList());
  }

  List<DetectionBox> _decodeEnd2End(
    List<double> data, {
    required int rows,
    required bool channelsLast,
    required OnnxPrepResult prep,
    required double minConfidence,
    required double iouThreshold,
  }) {
    final nc = _classNames.length;
    const numCh = 6;
    final candidates = <_Cand>[];
    final gain = prep.gain;
    final ow = prep.origW.toDouble();
    final oh = prep.origH.toDouble();

    for (var i = 0; i < rows; i++) {
      final rawX1 = _at(data, channelsLast, rows, numCh, 0, i);
      final rawY1 = _at(data, channelsLast, rows, numCh, 1, i);
      final rawX2 = _at(data, channelsLast, rows, numCh, 2, i);
      final rawY2 = _at(data, channelsLast, rows, numCh, 3, i);
      final score = _classScore(_at(data, channelsLast, rows, numCh, 4, i));
      if (score < minConfidence) continue;

      final clsId = _at(data, channelsLast, rows, numCh, 5, i).round().clamp(0, nc - 1);

      double x1;
      double y1;
      double x2;
      double y2;

      if (rawX2 <= 1.5 && rawY2 <= 1.5) {
        x1 = rawX1;
        y1 = rawY1;
        x2 = rawX2;
        y2 = rawY2;
      } else {
        x1 = (rawX1 - prep.padLeft) / gain / ow;
        y1 = (rawY1 - prep.padTop) / gain / oh;
        x2 = (rawX2 - prep.padLeft) / gain / ow;
        y2 = (rawY2 - prep.padTop) / gain / oh;
      }

      x1 = x1.clamp(0.0, 1.0);
      y1 = y1.clamp(0.0, 1.0);
      x2 = x2.clamp(0.0, 1.0);
      y2 = y2.clamp(0.0, 1.0);
      if (x2 <= x1 || y2 <= y1) continue;

      candidates.add(_Cand(
        className: _classNames[clsId],
        confidence: score,
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
      ));
    }

    return _toBoxes(_nms(candidates, iouThreshold).take(50).toList());
  }

  static double _at(
    List<double> data,
    bool channelsLast,
    int rows,
    int ch,
    int channel,
    int row,
  ) {
    final offset = channelsLast ? row * ch + channel : channel * rows + row;
    if (offset < 0 || offset >= data.length) return 0;
    return data[offset];
  }

  /// Ultralytics ONNX example uses raw class scores (no sigmoid).
  static double _classScore(double v) {
    if (v >= 0 && v <= 1) return v;
    if (v > 1) return 1 / (1 + math.exp(-v));
    return v;
  }

  static List<DetectionBox> _toBoxes(List<_Cand> kept) {
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
