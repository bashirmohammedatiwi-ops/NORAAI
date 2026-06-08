import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../utils/platform_support.dart';
import '../widgets/camera_preview_fit.dart';
import '../widgets/detection_overlay.dart';

class CameraAppScreen extends StatefulWidget {
  const CameraAppScreen({super.key});

  @override
  State<CameraAppScreen> createState() => _CameraAppScreenState();
}

class _CameraAppScreenState extends State<CameraAppScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      DriveSessionScope.of(context).requestCamera(force: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: DriveSessionScope.of(context),
      builder: (context, _) {
        final s = DriveSessionScope.of(context);
        final cam = s.camera;
        final cfg = s.serverCfg;
        final minConf = cfg?.minConfidence ?? 0.45;
        final ready = cam != null && cam.value.isInitialized;

        return Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            fit: StackFit.expand,
            children: [
              if (ready)
                CameraPreviewFit(controller: cam)
              else
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (s.cameraStarting)
                          const CircularProgressIndicator(color: Color(0xFF0D9488))
                        else
                          Icon(
                            s.cameraError != null ? Icons.videocam_off : Icons.videocam_outlined,
                            color: const Color(0xFF64748B),
                            size: 48,
                          ),
                        const SizedBox(height: 12),
                        Text(
                          s.cameraError ??
                              (s.cameraStarting ? 'جاري تشغيل الكاميرا...' : 'اضغط لبدء الكاميرا'),
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white70),
                        ),
                        if (s.cameraError != null || !s.cameraStarting) ...[
                          const SizedBox(height: 16),
                          FilledButton.icon(
                            onPressed: s.cameraStarting ? null : () => s.requestCamera(force: true),
                            icon: const Icon(Icons.refresh),
                            label: const Text('إعادة المحاولة'),
                            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF0D9488)),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              if (ready)
                DetectionOverlay(
                  detections: s.detections,
                  minConfidence: minConf,
                  scanning: s.scanning,
                ),
              Positioned(
                top: MediaQuery.of(context).padding.top + 8,
                left: 12,
                right: 12,
                child: Row(
                  children: [
                    _chip(s.scanning ? 'AI · جاري المسح' : 'AI · جاهز', const Color(0xFF0D9488)),
                    const SizedBox(width: 6),
                    if (s.lastLatencyMs != null)
                      _chip('${s.lastLatencyMs}ms', const Color(0xFF334155)),
                    const Spacer(),
                    _chip('${s.detections.length} اكتشاف', const Color(0xFF8B5CF6)),
                  ],
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: MediaQuery.of(context).padding.bottom + 72,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xCC0F172A),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFF334155)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          s.modelStatus,
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          cfg?.detectionEnabled == true
                              ? 'وضع الاكتشاف: ${inferenceModeLabel(cfg?.inferenceMode)} · حد الثقة ${(minConf * 100).round()}%'
                              : 'الاكتشاف معطّل — زامِن الموديل من لوحة التحكم',
                          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                        ),
                        if (s.detections.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: s.detections.take(5).map((d) {
                              return Chip(
                                label: Text(
                                  '${d.className} ${(d.confidence * 100).round()}%',
                                  style: const TextStyle(fontSize: 10),
                                ),
                                backgroundColor: const Color(0xFF1E293B),
                                side: const BorderSide(color: Color(0xFF0D9488)),
                                visualDensity: VisualDensity.compact,
                              );
                            }).toList(),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _chip(String text, Color bg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
    );
  }
}
