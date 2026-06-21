import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

import '../utils/frame_compress.dart';
import 'onnx_frame_prep.dart';

/// Frame capture from [CameraController.startImageStream].
///
/// Never retain [CameraImage] outside the stream callback — copy bytes immediately.
class CameraFrameBuffer {
  _FrameSnapshot? _snapshot;
  bool _attached = false;
  bool _captureBusy = false;

  bool get hasFrame => _snapshot != null;
  bool get isAttached => _attached;

  Future<void> attach(CameraController controller) async {
    if (_attached || !controller.value.isInitialized) return;
    if (controller.value.isStreamingImages) {
      _attached = true;
      return;
    }
    try {
      await controller.startImageStream(_onCameraImage);
      _attached = true;
    } catch (e) {
      debugPrint('CameraFrameBuffer.attach failed: $e');
      _attached = false;
    }
  }

  Future<void> detach(CameraController? controller) async {
    _snapshot = null;
    if (!_attached) return;
    _attached = false;
    if (controller != null && controller.value.isStreamingImages) {
      try {
        await controller.stopImageStream();
      } catch (_) {}
    }
  }

  void _onCameraImage(CameraImage image) {
    if (_captureBusy) return;

    try {
      _snapshot = _FrameSnapshot.fromCameraImage(image);
    } catch (e) {
      debugPrint('CameraFrameBuffer snapshot failed: $e');
    }
  }

  /// YUV → ONNX tensor directly (fast local path — no JPEG).
  Future<OnnxPrepResult?> captureOnnxInput(int netW, int netH) async {
    final snap = _snapshot;
    if (snap == null || snap.yuvPayload == null) return null;

    _captureBusy = true;
    try {
      return await compute(prepareOnnxFromYuvPayload, [
        snap.yuvPayload![0],
        snap.yuvPayload![1],
        snap.yuvPayload![3],
        snap.yuvPayload![4],
        snap.yuvPayload![5],
        netW,
        netH,
      ]);
    } catch (e) {
      debugPrint('captureOnnxInput failed: $e');
      return null;
    } finally {
      _captureBusy = false;
    }
  }

  Future<Uint8List?> captureJpeg({int maxWidth = 640, int quality = 72}) async {
    final snap = _snapshot;
    if (snap == null) return null;

    _captureBusy = true;
    try {
      if (snap.jpegBytes != null) {
        return await compute(compressFrameIsolate, [snap.jpegBytes!, maxWidth, quality]);
      }
      final payload = snap.buildEncodePayload(maxWidth, quality);
      if (payload == null) return null;
      return await compute(_encodeCameraImageIsolate, payload);
    } catch (e) {
      debugPrint('captureJpeg failed: $e');
      return null;
    } finally {
      _captureBusy = false;
    }
  }
}

class _FrameSnapshot {
  _FrameSnapshot._({
    this.jpegBytes,
    this.yuvPayload,
  });

  final Uint8List? jpegBytes;
  final List<dynamic>? yuvPayload;

  factory _FrameSnapshot.fromCameraImage(CameraImage image) {
    final group = image.format.group;
    final planes = image.planes;

    if (group == ImageFormatGroup.jpeg && planes.isNotEmpty) {
      return _FrameSnapshot._(jpegBytes: Uint8List.fromList(planes[0].bytes));
    }

    final planeBytes = planes.map((p) => Uint8List.fromList(p.bytes)).toList();
    return _FrameSnapshot._(
      yuvPayload: <dynamic>[
        image.width,
        image.height,
        group.index,
        planeBytes,
        planes.map((p) => p.bytesPerRow).toList(),
        planes.map((p) => p.bytesPerPixel ?? 1).toList(),
      ],
    );
  }

  List<dynamic>? buildEncodePayload(int maxWidth, int quality) {
    if (yuvPayload == null) return null;
    return [
      yuvPayload![0],
      yuvPayload![1],
      yuvPayload![2],
      yuvPayload![3],
      yuvPayload![4],
      yuvPayload![5],
      maxWidth,
      quality,
    ];
  }
}

Uint8List? _encodeCameraImageIsolate(List<dynamic> args) {
  final width = args[0] as int;
  final height = args[1] as int;
  final formatIndex = args[2] as int;
  final planeBytes = (args[3] as List).cast<Uint8List>();
  final bytesPerRow = (args[4] as List).cast<int>();
  final bytesPerPixel = (args[5] as List).cast<int>();
  final maxWidth = args[6] as int;
  final quality = args[7] as int;

  final group = ImageFormatGroup.values[formatIndex];

  if (group == ImageFormatGroup.jpeg && planeBytes.isNotEmpty) {
    return compressFrameIsolate([planeBytes[0], maxWidth, quality]);
  }

  img.Image? image;

  if (group == ImageFormatGroup.bgra8888 && planeBytes.isNotEmpty) {
    final plane = planeBytes[0];
    image = img.Image.fromBytes(
      width: width,
      height: height,
      bytes: plane.buffer,
      bytesOffset: plane.offsetInBytes,
      numChannels: 4,
      order: img.ChannelOrder.bgra,
    );
  } else if (planeBytes.length >= 3) {
    image = _yuv420ToImage(
      width,
      height,
      planeBytes,
      bytesPerRow,
      bytesPerPixel,
      maxWidth: maxWidth,
    );
  }

  if (image == null) return null;

  img.Image out = image;
  if (image.width > maxWidth) {
    out = img.copyResize(image, width: maxWidth, interpolation: img.Interpolation.linear);
  }
  return Uint8List.fromList(img.encodeJpg(out, quality: quality.clamp(65, 92)));
}

img.Image? _yuv420ToImage(
  int width,
  int height,
  List<Uint8List> planes,
  List<int> bytesPerRow,
  List<int> bytesPerPixel, {
  required int maxWidth,
}) {
  final yPlane = planes[0];
  final uPlane = planes[1];
  final vPlane = planes[2];
  final yRow = bytesPerRow[0];
  final uRow = bytesPerRow[1];
  final uvPixel = bytesPerPixel[1];

  final step = maxWidth < 520 ? 2 : 1;
  final outW = (width + step - 1) ~/ step;
  final outH = (height + step - 1) ~/ step;
  final image = img.Image(width: outW, height: outH);

  for (var y = 0, oy = 0; y < height; y += step, oy++) {
    final uvRow = (y >> 1) * uRow;
    for (var x = 0, ox = 0; x < width; x += step, ox++) {
      final yIndex = y * yRow + x;
      final uvIndex = uvRow + (x >> 1) * uvPixel;

      if (yIndex >= yPlane.length || uvIndex >= uPlane.length || uvIndex >= vPlane.length) {
        continue;
      }

      final yVal = yPlane[yIndex] & 0xff;
      final uVal = uPlane[uvIndex] & 0xff;
      final vVal = vPlane[uvIndex] & 0xff;

      final r = (yVal + 1.402 * (vVal - 128)).round().clamp(0, 255);
      final g = (yVal - 0.344136 * (uVal - 128) - 0.714136 * (vVal - 128)).round().clamp(0, 255);
      final b = (yVal + 1.772 * (uVal - 128)).round().clamp(0, 255);

      image.setPixelRgba(ox, oy, r, g, b, 255);
    }
  }
  return image;
}
