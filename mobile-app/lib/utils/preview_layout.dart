import 'package:flutter/material.dart';

/// Where the camera video is drawn inside the parent (letterbox/pillarbox aware).
class PreviewLayout {
  const PreviewLayout({
    required this.parentSize,
    required this.videoRect,
    required this.previewAspect,
  });

  final Size parentSize;
  final Rect videoRect;
  final double previewAspect;

  /// Map normalized bbox [x1,y1,x2,y2] (0–1) to screen coordinates.
  Rect mapNormalizedBbox(List<double> bbox) {
    if (bbox.length < 4) return Rect.zero;
    final r = videoRect;
    return Rect.fromLTRB(
      r.left + bbox[0] * r.width,
      r.top + bbox[1] * r.height,
      r.left + bbox[2] * r.width,
      r.top + bbox[3] * r.height,
    );
  }
}

PreviewLayout computePreviewLayout({
  required Size parentSize,
  required Size previewSize,
  required bool portrait,
  BoxFit fit = BoxFit.contain,
}) {
  var w = previewSize.width;
  var h = previewSize.height;
  if (portrait && w > h) {
    final t = w;
    w = h;
    h = t;
  } else if (!portrait && h > w) {
    final t = w;
    w = h;
    h = t;
  }

  final previewAspect = w / h;
  final maxW = parentSize.width;
  final maxH = parentSize.height;
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

  final displayW = fit == BoxFit.cover ? maxW : renderW;
  final displayH = fit == BoxFit.cover ? maxH : renderH;
  final left = (maxW - displayW) / 2;
  final top = (maxH - displayH) / 2;

  return PreviewLayout(
    parentSize: parentSize,
    videoRect: Rect.fromLTWH(left, top, displayW, displayH),
    previewAspect: previewAspect,
  );
}
