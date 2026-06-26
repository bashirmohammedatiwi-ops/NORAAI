import 'dart:math' as math;
import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Letterbox + NCHW float tensor — matches Ultralytics ONNX preprocessing.
class OnnxPrepResult {
  const OnnxPrepResult({
    required this.tensor,
    required this.gain,
    required this.padTop,
    required this.padLeft,
    required this.origW,
    required this.origH,
    required this.netW,
    required this.netH,
    this.stretch = false,
  });

  final Float32List tensor;
  final double gain;
  final int padTop;
  final int padLeft;
  final int origW;
  final int origH;
  final int netW;
  final int netH;
  final bool stretch;
}

/// JPEG fallback — args: [bytes, netW, netH, stretch?]. top-level for [compute].
OnnxPrepResult? prepareOnnxInput(List<dynamic> args) {
  final bytes = args[0] as Uint8List;
  final netW = args[1] as int;
  final netH = args.length > 2 ? args[2] as int : netW;
  final stretch = args.length > 3 ? args[3] as bool : false;
  final decoded = img.decodeImage(bytes);
  if (decoded == null) return null;
  return stretch ? _stretchFromRgb(decoded, netW, netH) : _letterboxFromRgb(decoded, netW, netH);
}

/// Fast path: YUV420 camera buffer → tensor in one pass (no JPEG).
/// args: [width, height, planeBytes, bytesPerRow, bytesPerPixel, netW, netH, stretch?, fast?]
OnnxPrepResult? prepareOnnxFromYuvPayload(List<dynamic> args) {
  final width = args[0] as int;
  final height = args[1] as int;
  final planeBytes = (args[2] as List).cast<Uint8List>();
  final bytesPerRow = (args[3] as List).cast<int>();
  final bytesPerPixel = (args[4] as List).cast<int>();
  final netW = args[5] as int;
  final netH = args.length > 6 ? args[6] as int : netW;
  final stretch = args.length > 7 ? args[7] as bool : false;
  final fast = args.length > 8 ? args[8] as bool : false;

  if (planeBytes.length < 3) return null;

  if (stretch) {
    return _stretchFromYuvDirect(
      width: width,
      height: height,
      planeBytes: planeBytes,
      bytesPerRow: bytesPerRow,
      bytesPerPixel: bytesPerPixel,
      netW: netW,
      netH: netH,
    );
  }

  return _letterboxFromYuv(
    width: width,
    height: height,
    planeBytes: planeBytes,
    bytesPerRow: bytesPerRow,
    bytesPerPixel: bytesPerPixel,
    netW: netW,
    netH: netH,
    fast: fast,
  );
}

OnnxPrepResult _letterboxFromRgb(img.Image src, int netW, int netH) {
  final origW = src.width;
  final origH = src.height;
  final gain = math.min(netH / origH, netW / origW);
  final newW = (origW * gain).round();
  final newH = (origH * gain).round();
  final padTop = ((netH - newH) / 2.0 - 0.1).round();
  final padLeft = ((netW - newW) / 2.0 - 0.1).round();

  final resized = img.copyResize(src, width: newW, height: newH, interpolation: img.Interpolation.linear);
  final canvas = img.Image(width: netW, height: netH);
  img.fill(canvas, color: img.ColorRgb8(114, 114, 114));
  img.compositeImage(canvas, resized, dstX: padLeft, dstY: padTop);

  final tensor = Float32List(3 * netW * netH);
  final plane = netW * netH;
  var i = 0;
  for (var y = 0; y < netH; y++) {
    for (var x = 0; x < netW; x++) {
      final p = canvas.getPixel(x, y);
      tensor[i] = p.r / 255.0;
      tensor[i + plane] = p.g / 255.0;
      tensor[i + 2 * plane] = p.b / 255.0;
      i++;
    }
  }

  return OnnxPrepResult(
    tensor: tensor,
    gain: gain,
    padTop: padTop,
    padLeft: padLeft,
    origW: origW,
    origH: origH,
    netW: netW,
    netH: netH,
  );
}

OnnxPrepResult _stretchFromRgb(img.Image src, int netW, int netH) {
  final origW = src.width;
  final origH = src.height;
  final resized = img.copyResize(src, width: netW, height: netH, interpolation: img.Interpolation.linear);
  final tensor = Float32List(3 * netW * netH);
  final plane = netW * netH;
  var i = 0;
  for (var y = 0; y < netH; y++) {
    for (var x = 0; x < netW; x++) {
      final p = resized.getPixel(x, y);
      tensor[i] = p.r / 255.0;
      tensor[i + plane] = p.g / 255.0;
      tensor[i + 2 * plane] = p.b / 255.0;
      i++;
    }
  }
  return OnnxPrepResult(
    tensor: tensor,
    gain: 1.0,
    padTop: 0,
    padLeft: 0,
    origW: origW,
    origH: origH,
    netW: netW,
    netH: netH,
    stretch: true,
  );
}

OnnxPrepResult _stretchFromYuvDirect({
  required int width,
  required int height,
  required List<Uint8List> planeBytes,
  required List<int> bytesPerRow,
  required List<int> bytesPerPixel,
  required int netW,
  required int netH,
}) {
  final yPlane = planeBytes[0];
  final uPlane = planeBytes[1];
  final vPlane = planeBytes[2];
  final yRow = bytesPerRow[0];
  final uRow = bytesPerRow[1];
  final uvPixel = bytesPerPixel[1];

  final tensor = Float32List(3 * netW * netH);
  final plane = netW * netH;
  final xScale = width / netW;
  final yScale = height / netH;

  for (var y = 0; y < netH; y++) {
    final sy = (y * yScale).round().clamp(0, height - 1);
    final uvRow = (sy >> 1) * uRow;
    for (var x = 0; x < netW; x++) {
      final sx = (x * xScale).round().clamp(0, width - 1);
      final yIndex = sy * yRow + sx;
      final uvIndex = uvRow + (sx >> 1) * uvPixel;
      final i = y * netW + x;

      if (yIndex >= yPlane.length ||
          uvIndex >= uPlane.length ||
          uvIndex >= vPlane.length) {
        const pad = 114.0 / 255.0;
        tensor[i] = pad;
        tensor[i + plane] = pad;
        tensor[i + 2 * plane] = pad;
        continue;
      }

      final yVal = yPlane[yIndex] & 0xff;
      final uVal = uPlane[uvIndex] & 0xff;
      final vVal = vPlane[uvIndex] & 0xff;
      tensor[i] = ((yVal + 1.402 * (vVal - 128)) / 255.0).clamp(0.0, 1.0);
      tensor[i + plane] =
          ((yVal - 0.344136 * (uVal - 128) - 0.714136 * (vVal - 128)) / 255.0).clamp(0.0, 1.0);
      tensor[i + 2 * plane] = ((yVal + 1.772 * (uVal - 128)) / 255.0).clamp(0.0, 1.0);
    }
  }

  return OnnxPrepResult(
    tensor: tensor,
    gain: 1.0,
    padTop: 0,
    padLeft: 0,
    origW: width,
    origH: height,
    netW: netW,
    netH: netH,
    stretch: true,
  );
}

OnnxPrepResult _letterboxFromYuv({
  required int width,
  required int height,
  required List<Uint8List> planeBytes,
  required List<int> bytesPerRow,
  required List<int> bytesPerPixel,
  required int netW,
  required int netH,
  bool fast = false,
}) {
  final gain = math.min(netH / height, netW / width);
  final newW = (width * gain).round();
  final newH = (height * gain).round();
  final padTop = ((netH - newH) / 2.0 - 0.1).round();
  final padLeft = ((netW - newW) / 2.0 - 0.1).round();

  final yPlane = planeBytes[0];
  final uPlane = planeBytes[1];
  final vPlane = planeBytes[2];
  final yRow = bytesPerRow[0];
  final uRow = bytesPerRow[1];
  final uvPixel = bytesPerPixel[1];

  final tensor = Float32List(3 * netW * netH);
  final plane = netW * netH;
  const padR = 114.0 / 255.0;
  final srcStep = fast
      ? (width > 960
          ? 4
          : width > 640
              ? 3
              : width > 400
                  ? 2
                  : 1)
      : 1;

  for (var y = 0; y < netH; y++) {
    final dstY = y - padTop;
    for (var x = 0; x < netW; x++) {
      final dstX = x - padLeft;
      final i = y * netW + x;

      double r;
      double g;
      double b;
      if (dstY < 0 || dstX < 0 || dstY >= newH || dstX >= newW) {
        r = padR;
        g = padR;
        b = padR;
      } else {
        final sx = ((dstX / gain).round() ~/ srcStep * srcStep).clamp(0, width - 1);
        final sy = ((dstY / gain).round() ~/ srcStep * srcStep).clamp(0, height - 1);
        final yIndex = sy * yRow + sx;
        final uvRow = (sy >> 1) * uRow;
        final uvIndex = uvRow + (sx >> 1) * uvPixel;

        if (yIndex >= yPlane.length ||
            uvIndex >= uPlane.length ||
            uvIndex >= vPlane.length) {
          r = padR;
          g = padR;
          b = padR;
        } else {
          final yVal = yPlane[yIndex] & 0xff;
          final uVal = uPlane[uvIndex] & 0xff;
          final vVal = vPlane[uvIndex] & 0xff;
          r = (yVal + 1.402 * (vVal - 128)) / 255.0;
          g = (yVal - 0.344136 * (uVal - 128) - 0.714136 * (vVal - 128)) / 255.0;
          b = (yVal + 1.772 * (uVal - 128)) / 255.0;
          r = r.clamp(0.0, 1.0);
          g = g.clamp(0.0, 1.0);
          b = b.clamp(0.0, 1.0);
        }
      }

      tensor[i] = r;
      tensor[i + plane] = g;
      tensor[i + 2 * plane] = b;
    }
  }

  return OnnxPrepResult(
    tensor: tensor,
    gain: gain,
    padTop: padTop,
    padLeft: padLeft,
    origW: width,
    origH: height,
    netW: netW,
    netH: netH,
  );
}
