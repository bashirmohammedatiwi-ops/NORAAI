import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Top-level for [compute] — fast JPEG resize off UI thread.
Uint8List? compressFrameIsolate(List<dynamic> args) {
  final input = args[0] as Uint8List;
  final maxWidth = args[1] as int;
  final quality = args[2] as int;

  try {
    final decoded = img.decodeImage(input);
    if (decoded == null) return null;

    img.Image out = decoded;
    final targetW = maxWidth.clamp(416, 1280);
    if (decoded.width > targetW) {
      out = img.copyResize(decoded, width: targetW);
    }
    return Uint8List.fromList(img.encodeJpg(out, quality: quality.clamp(70, 92)));
  } catch (_) {
    return null;
  }
}
