import 'dart:math' as math;
import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Letterbox + NCHW float tensor — top-level for [compute].
class OnnxPrepResult {
  const OnnxPrepResult({
    required this.tensor,
    required this.scale,
    required this.padX,
    required this.padY,
    required this.origW,
    required this.origH,
  });

  final Float32List tensor;
  final double scale;
  final double padX;
  final double padY;
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
  final scale = math.min(size / src.width, size / src.height);
  final newW = (src.width * scale).round();
  final newH = (src.height * scale).round();
  final padX = (size - newW) / 2.0;
  final padY = (size - newH) / 2.0;

  final resized = img.copyResize(src, width: newW, height: newH, interpolation: img.Interpolation.linear);
  final canvas = img.Image(width: size, height: size);
  img.fill(canvas, color: img.ColorRgb8(114, 114, 114));
  img.compositeImage(canvas, resized, dstX: padX.round(), dstY: padY.round());

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
    scale: scale,
    padX: padX,
    padY: padY,
    origW: src.width,
    origH: src.height,
  );
}
