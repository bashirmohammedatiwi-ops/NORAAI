import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../models/detection.dart';
import 'camera_stack.dart';

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
    this.fullWidth = false,
  });

  final CameraController controller;
  final List<DetectionBox> detections;
  final double minConfidence;
  final bool expanded;
  final bool scanning;
  final VoidCallback onToggle;
  final bool cameraOk;
  final double bottomOffset;
  final bool fullWidth;

  @override
  Widget build(BuildContext context) {
    if (fullWidth) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: _buildContent(),
      );
    }

    return Positioned(
      right: expanded ? 12 : 12,
      bottom: expanded ? bottomOffset + 120 : bottomOffset,
      left: expanded ? 12 : null,
      width: expanded ? null : 160,
      height: expanded ? 280 : 210,
      child: GestureDetector(
        onTap: onToggle,
        child: _buildContent(),
      ),
    );
  }

  Widget _buildContent() {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white24),
        boxShadow: const [
          BoxShadow(color: Colors.black45, blurRadius: 12, offset: Offset(0, 4)),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (controller.value.isInitialized)
              CameraStack(
                controller: controller,
                detections: detections,
                minConfidence: minConfidence,
                fit: BoxFit.cover,
              )
            else
              const ColoredBox(
                color: Color(0xFF1E293B),
                child: Center(
                  child: Icon(Icons.videocam_off, color: Color(0xFF64748B)),
                ),
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
            if (!expanded && !fullWidth)
              const Positioned(
                bottom: 6,
                right: 6,
                child: Icon(Icons.open_in_full, color: Colors.white70, size: 14),
              ),
          ],
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
