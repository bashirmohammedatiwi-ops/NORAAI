import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Resize + JPEG encode for faster uploads and server-side detection.
Uint8List? compressJpegBytes(
  Uint8List input, {
  int maxWidth = 1280,
  int quality = 88,
}) {
  try {
    final decoded = img.decodeImage(input);
    if (decoded == null) return null;

    img.Image out = decoded;
    final targetW = maxWidth.clamp(640, 1920);
    if (decoded.width > targetW) {
      out = img.copyResize(decoded, width: targetW);
    }
    return Uint8List.fromList(img.encodeJpg(out, quality: quality.clamp(70, 95)));
  } catch (_) {
    return null;
  }
}
