import 'dart:math' as math;
import 'dart:typed_data';

import 'package:image/image.dart' as img;

enum TensorLayout { nchw, nhwc }

enum NormalizeMode { imagenet, div255 }

class PrepTensor {
  const PrepTensor({
    required this.data,
    required this.netW,
    required this.netH,
    required this.origW,
    required this.origH,
    required this.scale,
    required this.padX,
    required this.padY,
    required this.letterbox,
    this.layout = TensorLayout.nchw,
  });

  /// Float32 pixels — NCHW or NHWC depending on [layout].
  final Float32List data;

  /// Alias kept for older call sites.
  Float32List get nchw => data;

  final int netW;
  final int netH;
  final int origW;
  final int origH;
  final double scale;
  final double padX;
  final double padY;
  final bool letterbox;
  final TensorLayout layout;
}

/// Resize + normalize → float32 tensor for segmentation ONNX.
class ImagePreprocessor {
  const ImagePreprocessor({
    this.netSize = 320,
    this.letterbox = true,
    this.mean = const [0.485, 0.456, 0.406],
    this.std = const [0.229, 0.224, 0.225],
    this.normalize = NormalizeMode.imagenet,
    this.layout = TensorLayout.nchw,
  });

  final int netSize;
  final bool letterbox;
  final List<double> mean;
  final List<double> std;
  final NormalizeMode normalize;
  final TensorLayout layout;

  /// Isolate: [Uint8List jpeg, int netSize, bool letterbox, int normalize, int layout]
  static PrepTensor? prepareJpegIsolate(List<dynamic> args) {
    final bytes = args[0] as Uint8List;
    final net = args[1] as int;
    final lb = args[2] as bool;
    final norm = args.length > 3
        ? NormalizeMode.values[(args[3] as int).clamp(0, 1)]
        : NormalizeMode.imagenet;
    final lay = args.length > 4
        ? TensorLayout.values[(args[4] as int).clamp(0, 1)]
        : TensorLayout.nchw;
    final decoded = img.decodeImage(bytes);
    if (decoded == null) return null;
    return ImagePreprocessor(
      netSize: net,
      letterbox: lb,
      normalize: norm,
      layout: lay,
    ).fromRgb(decoded);
  }

  /// Isolate args:
  /// [w,h,planes,bytesPerRow,bytesPerPixel,netSize,letterbox,yuvLayoutIndex,uvPixelStride,normalize,layout]
  static PrepTensor? prepareYuvIsolate(List<dynamic> args) {
    final width = args[0] as int;
    final height = args[1] as int;
    final planes = (args[2] as List).cast<Uint8List>();
    final bytesPerRow = (args[3] as List).cast<int>();
    final bytesPerPixel = (args[4] as List).cast<int>();
    final net = args[5] as int;
    final lb = args[6] as bool;
    final layoutIndex = args.length > 7 ? args[7] as int : 0;
    final uvPixelStride = args.length > 8
        ? args[8] as int
        : (bytesPerPixel.length > 1 ? bytesPerPixel[1] : 1);
    final norm = args.length > 9
        ? NormalizeMode.values[(args[9] as int).clamp(0, 1)]
        : NormalizeMode.imagenet;
    final lay = args.length > 10
        ? TensorLayout.values[(args[10] as int).clamp(0, 1)]
        : TensorLayout.nchw;

    if (planes.isEmpty) return null;

    final y = planes[0];
    late final Uint8List u;
    late final Uint8List v;
    late final int uRow;
    late final int vRow;
    late final int uPix;
    late final int vPix;

    if (planes.length >= 3) {
      u = planes[1];
      v = planes[2];
      uRow = bytesPerRow[1];
      vRow = bytesPerRow[2];
      uPix = bytesPerPixel.length > 1 ? bytesPerPixel[1] : uvPixelStride;
      vPix = bytesPerPixel.length > 2 ? bytesPerPixel[2] : uvPixelStride;
    } else if (planes.length == 2) {
      // NV21: Y + interleaved VU
      u = planes[1];
      v = planes[1];
      uRow = bytesPerRow[1];
      vRow = bytesPerRow[1];
      uPix = 2;
      vPix = 2;
    } else {
      return null;
    }

    return ImagePreprocessor(
      netSize: net,
      letterbox: lb,
      normalize: norm,
      layout: lay,
    ).fromYuv420(
      width: width,
      height: height,
      yPlane: y,
      uPlane: u,
      vPlane: v,
      yRowStride: bytesPerRow[0],
      uRowStride: uRow,
      vRowStride: vRow,
      uPixelStride: uPix,
      vPixelStride: vPix,
      nv21: layoutIndex == 2 || planes.length == 2,
    );
  }

  PrepTensor fromRgb(img.Image src) {
    final origW = src.width;
    final origH = src.height;
    final netW = netSize;
    final netH = netSize;

    late final double scale;
    late final double padX;
    late final double padY;
    late final img.Image canvas;

    if (letterbox) {
      scale = math.min(netW / origW, netH / origH);
      final newW = (origW * scale).round().clamp(1, netW);
      final newH = (origH * scale).round().clamp(1, netH);
      padX = (netW - newW) / 2.0;
      padY = (netH - newH) / 2.0;
      final resized = img.copyResize(
        src,
        width: newW,
        height: newH,
        interpolation: img.Interpolation.linear,
      );
      canvas = img.Image(width: netW, height: netH);
      img.fill(canvas, color: img.ColorRgb8(0, 0, 0));
      img.compositeImage(
        canvas,
        resized,
        dstX: padX.round(),
        dstY: padY.round(),
      );
    } else {
      scale = 1;
      padX = 0;
      padY = 0;
      canvas = img.copyResize(
        src,
        width: netW,
        height: netH,
        interpolation: img.Interpolation.linear,
      );
    }

    return _tensorFromCanvas(
      canvas,
      origW: origW,
      origH: origH,
      scale: scale,
      padX: padX,
      padY: padY,
      letterbox: letterbox,
    );
  }

  /// Fast path: sample YUV420 → net tensor without full-res RGB allocation.
  PrepTensor fromYuv420({
    required int width,
    required int height,
    required Uint8List yPlane,
    required Uint8List uPlane,
    required Uint8List vPlane,
    required int yRowStride,
    required int uRowStride,
    required int vRowStride,
    required int uPixelStride,
    required int vPixelStride,
    bool nv21 = false,
  }) {
    final netW = netSize;
    final netH = netSize;
    late final double scale;
    late final double padX;
    late final double padY;
    late final int contentW;
    late final int contentH;

    if (letterbox) {
      scale = math.min(netW / width, netH / height);
      contentW = (width * scale).round().clamp(1, netW);
      contentH = (height * scale).round().clamp(1, netH);
      padX = (netW - contentW) / 2.0;
      padY = (netH - contentH) / 2.0;
    } else {
      scale = 1;
      padX = 0;
      padY = 0;
      contentW = netW;
      contentH = netH;
    }

    final plane = netW * netH;
    final tensor = Float32List(3 * plane);
    final pad = _normalize(0, 0, 0);
    _fillBackground(tensor, plane, pad);

    for (var dy = 0; dy < contentH; dy++) {
      final sy = letterbox
          ? ((dy + 0.5) / scale).floor().clamp(0, height - 1)
          : ((dy + 0.5) * height / contentH).floor().clamp(0, height - 1);
      for (var dx = 0; dx < contentW; dx++) {
        final sx = letterbox
            ? ((dx + 0.5) / scale).floor().clamp(0, width - 1)
            : ((dx + 0.5) * width / contentW).floor().clamp(0, width - 1);

        final yIndex = sy * yRowStride + sx;
        final uvX = sx ~/ 2;
        final uvY = sy ~/ 2;

        final y = yPlane[yIndex.clamp(0, yPlane.length - 1)].toDouble();
        late final double u;
        late final double v;
        if (nv21) {
          final uvIndex = uvY * uRowStride + uvX * 2;
          final vi = uvIndex.clamp(0, vPlane.length - 1);
          final ui = (uvIndex + 1).clamp(0, uPlane.length - 1);
          v = vPlane[vi].toDouble() - 128.0;
          u = uPlane[ui].toDouble() - 128.0;
        } else {
          final uIndex = uvY * uRowStride + uvX * uPixelStride;
          final vIndex = uvY * vRowStride + uvX * vPixelStride;
          u = uPlane[uIndex.clamp(0, uPlane.length - 1)].toDouble() - 128.0;
          v = vPlane[vIndex.clamp(0, vPlane.length - 1)].toDouble() - 128.0;
        }

        // BT.601
        var r = y + 1.402 * v;
        var g = y - 0.344136 * u - 0.714136 * v;
        var b = y + 1.772 * u;
        r = (r / 255.0).clamp(0.0, 1.0);
        g = (g / 255.0).clamp(0.0, 1.0);
        b = (b / 255.0).clamp(0.0, 1.0);

        final ox = (padX.round() + dx).clamp(0, netW - 1);
        final oy = (padY.round() + dy).clamp(0, netH - 1);
        _writePixel(tensor, plane, ox, oy, netW, r, g, b);
      }
    }

    return PrepTensor(
      data: tensor,
      netW: netW,
      netH: netH,
      origW: width,
      origH: height,
      scale: scale,
      padX: padX,
      padY: padY,
      letterbox: letterbox,
      layout: layout,
    );
  }

  PrepTensor _tensorFromCanvas(
    img.Image canvas, {
    required int origW,
    required int origH,
    required double scale,
    required double padX,
    required double padY,
    required bool letterbox,
  }) {
    final netW = canvas.width;
    final netH = canvas.height;
    final plane = netW * netH;
    final tensor = Float32List(3 * plane);
    for (var y = 0; y < netH; y++) {
      for (var x = 0; x < netW; x++) {
        final p = canvas.getPixel(x, y);
        final r = p.r / 255.0;
        final g = p.g / 255.0;
        final b = p.b / 255.0;
        _writePixel(tensor, plane, x, y, netW, r, g, b);
      }
    }
    return PrepTensor(
      data: tensor,
      netW: netW,
      netH: netH,
      origW: origW,
      origH: origH,
      scale: scale,
      padX: padX,
      padY: padY,
      letterbox: letterbox,
      layout: layout,
    );
  }

  (double, double, double) _normalize(double r, double g, double b) {
    if (normalize == NormalizeMode.div255) {
      return (r, g, b);
    }
    return ((r - mean[0]) / std[0], (g - mean[1]) / std[1], (b - mean[2]) / std[2]);
  }

  void _fillBackground(
    Float32List tensor,
    int plane,
    (double, double, double) pad,
  ) {
    if (layout == TensorLayout.nhwc) {
      for (var i = 0; i < plane; i++) {
        final o = i * 3;
        tensor[o] = pad.$1;
        tensor[o + 1] = pad.$2;
        tensor[o + 2] = pad.$3;
      }
    } else {
      for (var i = 0; i < plane; i++) {
        tensor[i] = pad.$1;
        tensor[plane + i] = pad.$2;
        tensor[2 * plane + i] = pad.$3;
      }
    }
  }

  void _writePixel(
    Float32List tensor,
    int plane,
    int x,
    int y,
    int netW,
    double r,
    double g,
    double b,
  ) {
    final n = _normalize(r, g, b);
    if (layout == TensorLayout.nhwc) {
      final o = (y * netW + x) * 3;
      tensor[o] = n.$1;
      tensor[o + 1] = n.$2;
      tensor[o + 2] = n.$3;
    } else {
      final i = y * netW + x;
      tensor[i] = n.$1;
      tensor[plane + i] = n.$2;
      tensor[2 * plane + i] = n.$3;
    }
  }
}
