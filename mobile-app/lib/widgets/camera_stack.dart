import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../models/detection.dart';
import '../utils/bbox_transform.dart';
import '../utils/camera_orientation.dart';
import '../utils/preview_layout.dart';
import 'camera_preview_fit.dart';
import 'detection_overlay.dart';

/// معاينة الكاميرا + مربعات الاكتشاف.
class CameraStack extends StatelessWidget {
  const CameraStack({
    super.key,
    required this.controller,
    required this.detections,
    required this.minConfidence,
    this.fit = BoxFit.contain,
  });

  final CameraController controller;
  final List<DetectionBox> detections;
  final double minConfidence;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        PreviewLayout? layout;
        List<DetectionBox> mapped = detections;

        final previewSize = controller.value.previewSize;
        final portrait = MediaQuery.orientationOf(context) == Orientation.portrait;

        if (previewSize != null) {
          layout = computePreviewLayout(
            parentSize: Size(constraints.maxWidth, constraints.maxHeight),
            previewSize: previewSize,
            portrait: portrait,
            fit: fit,
          );

          final rotation = inferenceRotationDegrees(
            controller,
            uiOrientation: portrait ? Orientation.portrait : Orientation.landscape,
          );
          final mirror = controller.description.lensDirection == CameraLensDirection.front;
          mapped = mapDetectionsToPreview(
            detections,
            rotationDegrees: rotation,
            mirrorX: mirror,
          );
        }

        return Stack(
          fit: StackFit.expand,
          children: [
            CameraPreviewFit(controller: controller, fit: fit),
            DetectionOverlay(
              detections: mapped,
              minConfidence: minConfidence,
              layout: layout,
            ),
          ],
        );
      },
    );
  }
}
