import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// Rotate normalized bboxes from camera buffer space into on-screen preview space.
///
/// Phone sensors capture in landscape; [CameraPreview] aligns to UI orientation.
/// When UI is also landscape (drive mode), no rotation is needed — applying 90°
/// here was the main cause of misaligned boxes.
int inferenceRotationDegrees(
  CameraController controller, {
  required Orientation uiOrientation,
}) {
  if (kIsWeb || !controller.value.isInitialized) return 0;

  final previewSize = controller.value.previewSize;
  if (previewSize == null) return 0;

  final bufferLandscape = previewSize.width > previewSize.height;
  final uiPortrait = uiOrientation == Orientation.portrait;

  // Buffer aspect matches UI → coordinates already aligned.
  final needsRotation = bufferLandscape == uiPortrait;
  if (!needsRotation) return 0;

  final sensor = controller.description.sensorOrientation;
  final front = controller.description.lensDirection == CameraLensDirection.front;

  switch (sensor) {
    case 90:
      return front ? 270 : 90;
    case 270:
      return front ? 90 : 270;
    case 180:
      return 180;
    default:
      return 90;
  }
}
