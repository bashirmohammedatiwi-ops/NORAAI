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
  });

  final Float32List tensor;
  /// Resize ratio min(input_h/img_h, input_w/img_w).
  final double gain;
  final int padTop;
  final int padLeft;
  final int origW;
  final int origH;
}

OnnxPrepResult? prepareOnnxInput(List<dynamic> args) {
  final bytes = args[0] as Uint8List;
  final size = args[1] as int;
  final decoded = img.decodeImage(bytes);
  if (decoded == null) return null;
  return _letterboxTensor(decoded, size);
}

OnnxPrepResult _letterboxTensor(img.Image src, int size) {
  final origW = src.width;
  final origH = src.height;

  // Ultralytics letterbox: gain = min(input_h/img_h, input_w/img_w)
  final gain = math.min(size / origH, size / origW);
  final newW = (origW * gain).round();
  final newH = (origH * gain).round();

  final dw = (size - newW) / 2.0;
  final dh = (size - newH) / 2.0;
  final padTop = (dh - 0.1).round();
  final padLeft = (dw - 0.1).round();

  final resized = img.copyResize(src, width: newW, height: newH, interpolation: img.Interpolation.linear);
  final canvas = img.Image(width: size, height: size);
  img.fill(canvas, color: img.ColorRgb8(114, 114, 114));
  img.compositeImage(canvas, resized, dstX: padLeft, dstY: padTop);

  final tensor = Float32List(3 * size * size);
  final plane = size * size;
  var i = 0;
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
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
  );
}
