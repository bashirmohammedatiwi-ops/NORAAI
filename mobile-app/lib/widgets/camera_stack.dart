import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../models/detection.dart';
import '../utils/preview_layout.dart';
import 'camera_preview_fit.dart';
import 'detection_overlay.dart';

/// Camera preview + detection overlay with aligned bounding boxes.
class CameraStack extends StatelessWidget {
  const CameraStack({
    super.key,
    required this.controller,
    required this.detections,
    required this.minConfidence,
    this.scanning = false,
    this.fit = BoxFit.contain,
    this.headwayDistanceM,
    this.leadVehicleClass,
    this.localInference = false,
  });

  final CameraController controller;
  final List<DetectionBox> detections;
  final double minConfidence;
  final bool scanning;
  final BoxFit fit;
  final double? headwayDistanceM;
  final String? leadVehicleClass;
  final bool localInference;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        PreviewLayout? layout;
        final previewSize = controller.value.previewSize;
        if (previewSize != null) {
          layout = computePreviewLayout(
            parentSize: Size(constraints.maxWidth, constraints.maxHeight),
            previewSize: previewSize,
            portrait: MediaQuery.orientationOf(context) == Orientation.portrait,
            fit: fit,
          );
        }

        return Stack(
          fit: StackFit.expand,
          children: [
            CameraPreviewFit(controller: controller, fit: fit),
            DetectionOverlay(
              detections: detections,
              minConfidence: minConfidence,
              scanning: scanning,
              layout: layout,
              headwayDistanceM: headwayDistanceM,
              leadVehicleClass: leadVehicleClass,
              localInference: localInference,
            ),
          ],
        );
      },
    );
  }
}
