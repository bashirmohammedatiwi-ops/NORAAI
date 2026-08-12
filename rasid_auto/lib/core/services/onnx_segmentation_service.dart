import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../models/detection_result.dart';
import '../utils/coordinate_converter.dart';
import '../utils/image_preprocessor.dart';
import '../utils/mask_to_boxes.dart';
import 'camera_frame_service.dart';
import 'platform_support.dart';
import 'road_segmentation_service.dart';

/// ONNX segmentation via **native file bridge** on Android.
///
/// Why: `flutter_onnxruntime` sends tensors through MethodChannel. A
/// 256×256×3 float32 input is ~3MB and exceeds Android's ~1MB binder limit,
/// which kills the app the moment inference starts.
class OnnxSegmentationService implements RoadSegmentationService {
  static const _ort = MethodChannel('com.rasid.auto/ort');

  int _inputSize = 256;
  bool _letterbox = false;
  NormalizeMode _normalize = NormalizeMode.div255;
  TensorLayout _layout = TensorLayout.nhwc;
  double _threshold = 0.30;
  int _potholeChannel = 1;
  List<String> _classNames = const ['background', 'pothole'];
  String? _loadError;
  Future<void>? _loadFuture;
  bool _busy = false;
  bool _nativeReady = false;
  String? _cacheDir;

  final _masker = const MaskToBoxes(minArea: 28, minConfidence: 0.15);

  @override
  bool get isReady => _nativeReady;

  @override
  bool get isLoading => _loadFuture != null;

  @override
  String? get loadError => _loadError;

  @override
  String get backendName => 'ONNX U-Net (native)';

  @override
  bool get usesCameraFrames => true;

  @override
  int get inputSize => _inputSize;

  @override
  List<String> get classNames => List.unmodifiable(_classNames);

  @override
  Future<void> load({
    required String modelPath,
    required String manifestPath,
  }) async {
    if (!supportsLocalInference) {
      _loadError = 'الاستدلال المحلي غير مدعوم على هذه المنصة';
      return;
    }
    if (!Platform.isAndroid) {
      _loadError = 'مسار native ORT متاح على Android حالياً';
      return;
    }
    if (_loadFuture != null) return _loadFuture!;
    _loadFuture = _loadImpl(modelPath, manifestPath);
    try {
      await _loadFuture;
    } finally {
      _loadFuture = null;
    }
  }

  Future<void> _loadImpl(String modelPath, String manifestPath) async {
    await dispose();
    _loadError = null;
    if (!await File(modelPath).exists()) {
      _loadError = 'ملف الموديل غير موجود';
      return;
    }
    try {
      if (await File(manifestPath).exists()) {
        final m = jsonDecode(await File(manifestPath).readAsString())
            as Map<String, dynamic>;
        _inputSize = (m['image_size'] as num?)?.toInt() ??
            (m['input_size'] as num?)?.toInt() ??
            256;
        _letterbox = (m['resize_mode'] as String?)?.toLowerCase() != 'stretch';
        final normRaw = ((m['normalize'] as String?) ??
                (m['input'] is Map ? (m['input'] as Map)['normalize'] : null) ??
                'div255')
            .toString()
            .toLowerCase();
        _normalize = normRaw.contains('imagenet')
            ? NormalizeMode.imagenet
            : NormalizeMode.div255;
        final layoutRaw = ((m['layout'] as String?) ??
                (m['input'] is Map ? (m['input'] as Map)['layout'] : null) ??
                'NHWC')
            .toString()
            .toUpperCase();
        _layout =
            layoutRaw == 'NCHW' ? TensorLayout.nchw : TensorLayout.nhwc;
        _threshold = (m['recommended_threshold'] as num?)?.toDouble() ?? 0.35;
        _potholeChannel = (m['pothole_channel'] as num?)?.toInt() ?? 1;
        final classes =
            (m['classes'] as List?)?.map((e) => e.toString()).toList();
        if (classes != null && classes.isNotEmpty) {
          _classNames = classes;
        }
      }

      final tmp = await getTemporaryDirectory();
      _cacheDir = tmp.path;

      final res = await _ort.invokeMethod<Map<dynamic, dynamic>>('load', {
        'modelPath': modelPath,
      });
      if (res == null || res['ok'] != true) {
        _loadError = 'فشل تحميل الموديل الأصلي';
        return;
      }
      _nativeReady = true;
      _loadError = null;
      debugPrint(
        'OnnxNative ready size=$_inputSize letterbox=$_letterbox '
        'norm=$_normalize layout=$_layout',
      );
    } catch (e) {
      _loadError = 'فشل تحميل Segmentation: $e';
      _nativeReady = false;
      debugPrint('OnnxNative load error: $e');
    }
  }

  @override
  Future<SegmentationFrameResult> segmentJpeg({
    required List<int> jpegBytes,
    required double previewWidth,
    required double previewHeight,
    double minConfidence = 0.25,
  }) async {
    if (!_nativeReady || _busy) {
      return const SegmentationFrameResult(detections: [], latencyMs: 0);
    }
    _busy = true;
    final total = Stopwatch()..start();
    var preprocessMs = 0;
    try {
      final prepSw = Stopwatch()..start();
      final prep = await compute(
        ImagePreprocessor.prepareJpegIsolate,
        [
          Uint8List.fromList(jpegBytes),
          _inputSize,
          _letterbox,
          _normalize.index,
          _layout.index,
        ],
      );
      preprocessMs = prepSw.elapsedMilliseconds;
      if (prep == null) {
        return SegmentationFrameResult(
          detections: const [],
          latencyMs: total.elapsedMilliseconds,
          preprocessMs: preprocessMs,
        );
      }
      return await _inferFromPrep(
        prep,
        previewWidth: previewWidth,
        previewHeight: previewHeight,
        minConfidence: minConfidence,
        total: total,
        preprocessMs: preprocessMs,
      );
    } catch (e) {
      debugPrint('OnnxNative jpeg error: $e');
      return SegmentationFrameResult(
        detections: const [],
        latencyMs: total.elapsedMilliseconds,
        preprocessMs: preprocessMs,
      );
    } finally {
      _busy = false;
    }
  }

  @override
  Future<SegmentationFrameResult> segmentYuv({
    required FramePacket frame,
    required double previewWidth,
    required double previewHeight,
    double minConfidence = 0.25,
  }) async {
    if (!_nativeReady || _busy) {
      return const SegmentationFrameResult(detections: [], latencyMs: 0);
    }
    _busy = true;
    final total = Stopwatch()..start();
    var preprocessMs = 0;
    try {
      final prepSw = Stopwatch()..start();
      final prep = await compute(
        ImagePreprocessor.prepareYuvIsolate,
        frame.toIsolateArgs(
          netSize: _inputSize,
          letterbox: _letterbox,
          normalizeIndex: _normalize.index,
          layoutIndex: _layout.index,
        ),
      );
      preprocessMs = prepSw.elapsedMilliseconds;
      if (prep == null) {
        return SegmentationFrameResult(
          detections: const [],
          latencyMs: total.elapsedMilliseconds,
          preprocessMs: preprocessMs,
        );
      }
      return await _inferFromPrep(
        prep,
        previewWidth: previewWidth,
        previewHeight: previewHeight,
        minConfidence: minConfidence,
        total: total,
        preprocessMs: preprocessMs,
      );
    } catch (e) {
      debugPrint('OnnxNative yuv error: $e');
      return SegmentationFrameResult(
        detections: const [],
        latencyMs: total.elapsedMilliseconds,
        preprocessMs: preprocessMs,
      );
    } finally {
      _busy = false;
    }
  }

  @override
  Future<SegmentationFrameResult> segmentPrepared({
    required PrepTensor prep,
    required double previewWidth,
    required double previewHeight,
    double minConfidence = 0.25,
  }) async {
    if (!_nativeReady || _busy) {
      return const SegmentationFrameResult(detections: [], latencyMs: 0);
    }
    _busy = true;
    final total = Stopwatch()..start();
    try {
      return await _inferFromPrep(
        prep,
        previewWidth: previewWidth,
        previewHeight: previewHeight,
        minConfidence: minConfidence,
        total: total,
        preprocessMs: 0,
      );
    } finally {
      _busy = false;
    }
  }

  Future<SegmentationFrameResult> _inferFromPrep(
    PrepTensor prep, {
    required double previewWidth,
    required double previewHeight,
    required double minConfidence,
    required Stopwatch total,
    required int preprocessMs,
  }) async {
    final dir = _cacheDir;
    if (dir == null) {
      return SegmentationFrameResult(
        detections: const [],
        latencyMs: total.elapsedMilliseconds,
        preprocessMs: preprocessMs,
      );
    }

    final inferSw = Stopwatch()..start();
    final inPath = '$dir/rasid_in.bin';
    final outPath = '$dir/rasid_out.bin';

    // Write float32 bytes to disk (avoids binder limit).
    final floats = prep.data;
    await File(inPath).writeAsBytes(
      floats.buffer.asUint8List(floats.offsetInBytes, floats.lengthInBytes),
      flush: false,
    );

    final h = prep.netH;
    final w = prep.netW;
    Map<dynamic, dynamic>? runRes;
    try {
      runRes = await _ort.invokeMethod<Map<dynamic, dynamic>>('run', {
        'inputPath': inPath,
        'outputPath': outPath,
        'n': 1,
        'h': h,
        'w': w,
        'c': 3,
      });
    } catch (e) {
      debugPrint('OnnxNative run failed: $e');
      return SegmentationFrameResult(
        detections: const [],
        latencyMs: total.elapsedMilliseconds,
        preprocessMs: preprocessMs,
        inferenceMs: inferSw.elapsedMilliseconds,
      );
    }
    final inferenceMs = inferSw.elapsedMilliseconds;

    final postSw = Stopwatch()..start();
    final outBytes = await File(outPath).readAsBytes();
    final outFloats = Float32List.view(
      outBytes.buffer,
      outBytes.offsetInBytes,
      outBytes.lengthInBytes ~/ 4,
    );

    final shape = (runRes?['shape'] as List?)
            ?.map((e) => (e as num).toInt())
            .toList() ??
        [1, h, w, 2];
    final decoded = _decodeFloats(outFloats, shape, w, h);
    // Confidence-scaled mask (0..255) — lets the overlay fade at the edges.
    final potholeMask = Uint8List(w * h);
    for (var i = 0; i < potholeMask.length; i++) {
      potholeMask[i] = decoded.classes[i] == 1
          ? (decoded.confidences[i] * 255).round().clamp(0, 255)
          : 0;
    }

    final raw = _masker
        .extract(
          mask: decoded.classes,
          width: w,
          height: h,
          confidenceMap: decoded.confidences,
          timestamp: DateTime.now(),
        )
        .where((d) => d.confidence >= minConfidence)
        .toList();

    // Keep the mask at NET resolution — the overlay painter scales it to
    // the preview with soft blur, so upscaling here is wasted work.
    final previewW = previewWidth > 0 ? previewWidth : prep.origW.toDouble();
    final previewH = previewHeight > 0 ? previewHeight : prep.origH.toDouble();

    final converter = prep.letterbox
        ? CoordinateConverter.letterbox(
            maskW: w.toDouble(),
            maskH: h.toDouble(),
            previewW: previewW,
            previewH: previewH,
            padX: prep.padX,
            padY: prep.padY,
            scale: prep.scale,
          )
        : CoordinateConverter.stretch(
            maskW: w.toDouble(),
            maskH: h.toDouble(),
            previewW: previewW,
            previewH: previewH,
          );

    final mapped = raw
        .map(
          (d) => DetectionResult(
            type: d.type,
            confidence: d.confidence,
            boundingBox: converter.mapBox(d.boundingBox),
            contourPoints: converter.mapPoints(d.contourPoints),
            centerX: converter.mapX(d.centerX),
            centerY: converter.mapY(d.centerY),
            area: converter.mapBox(d.boundingBox).area,
            timestamp: d.timestamp,
            maskWidth: w,
            maskHeight: h,
          ),
        )
        .toList();

    return SegmentationFrameResult(
      detections: mapped,
      latencyMs: total.elapsedMilliseconds,
      preprocessMs: preprocessMs,
      inferenceMs: inferenceMs,
      postprocessMs: postSw.elapsedMilliseconds,
      maskWidth: w,
      maskHeight: h,
      potholeMask: potholeMask,
    );
  }

  ({Int32List classes, Float32List confidences}) _decodeFloats(
    Float32List floats,
    List<int> shape,
    int netW,
    int netH,
  ) {
    final classes = Int32List(netW * netH);
    final confs = Float32List(netW * netH);
    final plane = netW * netH;

    // NHWC [1,H,W,C] with softmax probs (matches original segfile style).
    if (shape.length == 4 &&
        shape[1] == netH &&
        shape[2] == netW &&
        shape[3] > 1) {
      final c = shape[3];
      if (c == 2) {
        // Fast path: 2-channel softmax without per-pixel allocations.
        // p1 = 1 / (1 + exp(v0 - v1))
        final pc = _potholeChannel < 2 ? _potholeChannel : 1;
        for (var i = 0; i < plane; i++) {
          final v0 = floats[i * 2];
          final v1 = floats[i * 2 + 1];
          final d = (pc == 1 ? v0 - v1 : v1 - v0).clamp(-30.0, 30.0);
          final potProb = 1.0 / (1.0 + math.exp(d));
          if (potProb >= _threshold) {
            classes[i] = 1;
            confs[i] = potProb;
          } else {
            classes[i] = 0;
            confs[i] = 1.0 - potProb;
          }
        }
        return (classes: classes, confidences: confs);
      }
      for (var i = 0; i < plane; i++) {
        var maxV = floats[i * c];
        for (var k = 1; k < c; k++) {
          final v = floats[i * c + k];
          if (v > maxV) maxV = v;
        }
        var sum = 0.0;
        final exps = List<double>.filled(c, 0);
        for (var k = 0; k < c; k++) {
          exps[k] = math.exp((floats[i * c + k] - maxV).clamp(-20.0, 20.0));
          sum += exps[k];
        }
        var best = 0;
        var bestP = exps[0] / sum;
        for (var k = 1; k < c; k++) {
          final p = exps[k] / sum;
          if (p > bestP) {
            bestP = p;
            best = k;
          }
        }
        final potProb = (_potholeChannel < c) ? (exps[_potholeChannel] / sum) : bestP;
        // Prefer pothole if probability high enough (original-like sensitivity).
        if (potProb >= _threshold) {
          classes[i] = 1;
          confs[i] = potProb;
        } else {
          classes[i] = best == 0 ? 0 : (best == _potholeChannel ? 1 : best);
          confs[i] = bestP;
        }
      }
      return (classes: classes, confidences: confs);
    }

    final c = floats.length >= plane * 2 ? 2 : 1;
    for (var i = 0; i < plane && i * c < floats.length; i++) {
      if (c == 1) {
        final p = _toProb(floats[i]);
        classes[i] = p >= _threshold ? 1 : 0;
        confs[i] = p;
      } else {
        final v0 = floats[i * 2];
        final v1 = floats[i * 2 + 1];
        final m = v0 > v1 ? v0 : v1;
        final e0 = math.exp((v0 - m).clamp(-20.0, 20.0));
        final e1 = math.exp((v1 - m).clamp(-20.0, 20.0));
        final p1 = e1 / (e0 + e1);
        classes[i] = p1 >= _threshold ? 1 : 0;
        confs[i] = p1;
      }
    }
    return (classes: classes, confidences: confs);
  }

  double _toProb(double v) {
    if (v >= 0 && v <= 1) return v;
    if (v > 20) return 1;
    if (v < -20) return 0;
    return 1 / (1 + math.exp(-v));
  }

  @override
  Future<void> dispose() async {
    _nativeReady = false;
    try {
      await _ort.invokeMethod('close');
    } catch (_) {}
  }
}
