import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../models/detection.dart';
import 'camera_preview_fit.dart';
import 'detection_overlay.dart';

class CameraPip extends StatelessWidget {
  const CameraPip({
    super.key,
    required this.controller,
    required this.detections,
    required this.minConfidence,
    required this.expanded,
    required this.scanning,
    required this.onToggle,
    this.cameraOk = true,
    this.bottomOffset = 24,
  });

  final CameraController controller;
  final List<DetectionBox> detections;
  final double minConfidence;
  final bool expanded;
  final bool scanning;
  final VoidCallback onToggle;
  final bool cameraOk;
  final double bottomOffset;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      right: expanded ? 12 : 12,
      bottom: expanded ? bottomOffset + 120 : bottomOffset,
      left: expanded ? 12 : null,
      width: expanded ? null : 148,
      height: expanded ? 260 : 196,
      child: GestureDetector(
        onTap: onToggle,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Container(
            decoration: BoxDecoration(
              border: Border.all(
                color: cameraOk ? const Color(0xFF2DD4BF) : const Color(0xFFEF4444),
                width: 2,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (controller.value.isInitialized)
                  CameraPreviewFit(controller: controller)
                else
                  const ColoredBox(
                    color: Color(0xFF1E293B),
                    child: Center(
                      child: Icon(Icons.videocam_off, color: Color(0xFF64748B)),
                    ),
                  ),
                DetectionOverlay(
                  detections: detections,
                  minConfidence: minConfidence,
                  scanning: scanning,
                ),
                Positioned(
                  top: 8,
                  left: 8,
                  child: _badge(scanning ? 'AI · جاري' : 'AI', const Color(0xE60D9488)),
                ),
                Positioned(
                  top: 8,
                  right: 8,
                  child: _badge(
                    cameraOk ? 'LIVE' : 'NO CAM',
                    cameraOk ? const Color(0xE622C55E) : const Color(0xE6EF4444),
                  ),
                ),
                if (!expanded)
                  const Positioned(
                    bottom: 6,
                    right: 6,
                    child: Icon(Icons.open_in_full, color: Colors.white70, size: 14),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _badge(String text, Color bg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
      ),
    );
  }
}
