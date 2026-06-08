import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

/// Full-screen camera preview with correct aspect ratio (fixes black screen on web).
class CameraPreviewFit extends StatelessWidget {
  const CameraPreviewFit({super.key, required this.controller});

  final CameraController controller;

  @override
  Widget build(BuildContext context) {
    if (!controller.value.isInitialized) {
      return const ColoredBox(color: Colors.black);
    }

    return ClipRect(
      child: OverflowBox(
        alignment: Alignment.center,
        child: FittedBox(
          fit: BoxFit.cover,
          child: SizedBox(
            width: _previewWidth(controller),
            height: _previewHeight(controller),
            child: CameraPreview(controller),
          ),
        ),
      ),
    );
  }

  double _previewWidth(CameraController c) {
    final size = c.value.previewSize;
    if (size == null) return 640;
    return c.value.isRecordingVideo ? size.height : size.width;
  }

  double _previewHeight(CameraController c) {
    final size = c.value.previewSize;
    if (size == null) return 480;
    return c.value.isRecordingVideo ? size.width : size.height;
  }
}
