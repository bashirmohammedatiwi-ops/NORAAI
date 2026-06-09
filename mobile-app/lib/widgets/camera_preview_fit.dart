import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

/// Camera preview sized to the sensor aspect ratio — avoids over-cropped "zoomed" view.
class CameraPreviewFit extends StatelessWidget {
  const CameraPreviewFit({
    super.key,
    required this.controller,
    this.fit = BoxFit.contain,
  });

  final CameraController controller;

  /// [BoxFit.contain] shows the full field of view (recommended).
  /// [BoxFit.cover] fills the area and may crop edges slightly.
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    if (!controller.value.isInitialized) {
      return const ColoredBox(color: Colors.black);
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final maxW = constraints.maxWidth;
        final maxH = constraints.maxHeight;
        if (maxW <= 0 || maxH <= 0) {
          return const ColoredBox(color: Colors.black);
        }

        final previewSize = controller.value.previewSize;
        if (previewSize == null) {
          return const ColoredBox(
            color: Colors.black,
            child: Center(child: Icon(Icons.videocam_off, color: Colors.white38)),
          );
        }

        final oriented = _orientedPreviewSize(context, previewSize);
        final previewW = oriented.width;
        final previewH = oriented.height;
        final previewAspect = previewW / previewH;
        final screenAspect = maxW / maxH;

        late double renderW;
        late double renderH;
        if (fit == BoxFit.contain) {
          if (previewAspect > screenAspect) {
            renderW = maxW;
            renderH = maxW / previewAspect;
          } else {
            renderH = maxH;
            renderW = maxH * previewAspect;
          }
        } else {
          if (previewAspect > screenAspect) {
            renderH = maxH;
            renderW = maxH * previewAspect;
          } else {
            renderW = maxW;
            renderH = maxW / previewAspect;
          }
        }

        return ColoredBox(
          color: Colors.black,
          child: Center(
            child: ClipRect(
              child: SizedBox(
                width: fit == BoxFit.cover ? maxW : renderW,
                height: fit == BoxFit.cover ? maxH : renderH,
                child: FittedBox(
                  fit: fit,
                  clipBehavior: Clip.hardEdge,
                  child: SizedBox(
                    width: previewW,
                    height: previewH,
                    child: CameraPreview(controller),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  /// Map sensor buffer dimensions to how the preview is shown on screen.
  Size _orientedPreviewSize(BuildContext context, Size sensorSize) {
    var w = sensorSize.width.toDouble();
    var h = sensorSize.height.toDouble();

    final portrait = MediaQuery.orientationOf(context) == Orientation.portrait;
    // Phone sensors are landscape; swap so aspect ratio matches on-screen preview.
    if (portrait && w > h) {
      final t = w;
      w = h;
      h = t;
    } else if (!portrait && h > w) {
      final t = w;
      w = h;
      h = t;
    }
    return Size(w, h);
  }
}
