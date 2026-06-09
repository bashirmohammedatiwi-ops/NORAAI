import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';

/// Rotation (degrees) so camera buffer matches on-screen preview for inference.
int inferenceRotationDegrees(CameraController controller) {
  if (kIsWeb || !controller.value.isInitialized) return 0;

  final sensor = controller.description.sensorOrientation;
  final isFront = controller.description.lensDirection == CameraLensDirection.front;

  // Android back-camera buffers are typically landscape; rotate to portrait preview.
  if (sensor == 90) {
    return isFront ? -90 : 90;
  }
  if (sensor == 270) {
    return isFront ? 90 : -90;
  }
  if (sensor == 180) return 180;
  return 0;
}
