import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../theme/app_colors.dart';
import '../utils/platform_support.dart';
import '../utils/responsive.dart';
import '../widgets/camera_stack.dart';
import '../widgets/metrics_strip.dart';

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
      DriveSessionScope.of(context).requestCamera();
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
        final minConf = s.displayMinConfidence;
        final ready = cam != null && cam.value.isInitialized;
        final landscape = isLandscape(context);

        return Scaffold(
          backgroundColor: Colors.black,
          body: landscape && ready
              ? Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: CameraStack(
                        controller: cam,
                        detections: s.detections,
                        minConfidence: minConf,
                        scanning: s.overlayScanning,
                        headwayDistanceM: s.followingDistance.distanceM,
                        leadVehicleClass: s.followingDistance.leadClass,
                        localInference: s.usesLocalInference,
                      ),
                    ),
                    Expanded(child: _sidePanel(s, cfg, minConf)),
                  ],
                )
              : Column(
                  children: [
                    Expanded(
                      child: ready
                          ? CameraStack(
                              controller: cam,
                              detections: s.detections,
                              minConfidence: minConf,
                              scanning: s.overlayScanning,
                              headwayDistanceM: s.followingDistance.distanceM,
                              leadVehicleClass: s.followingDistance.leadClass,
                              localInference: s.usesLocalInference,
                            )
                          : Center(
                              child: Padding(
                                padding: const EdgeInsets.all(24),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    if (s.cameraStarting)
                                      const CircularProgressIndicator(color: AppColors.accent)
                                    else
                                      Icon(
                                        s.cameraError != null ? Icons.videocam_off : Icons.videocam_outlined,
                                        color: AppColors.textMuted,
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
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ),
                    ),
                    MetricsStrip(
                      speed: s.speedKmh,
                      roadSpeed: s.roadSpeed.cached,
                      placeName: s.modelStatus,
                      scanning: s.overlayScanning,
                      latencyMs: s.lastLatencyMs,
                      extra: _cameraControls(s, ready, cfg, minConf),
                    ),
                  ],
                ),
        );
      },
    );
  }

  Widget _cameraControls(DriveSession s, bool ready, dynamic cfg, double minConf) {
    return Row(
      children: [
        if (ready && !kIsWeb)
          IconButton(
            onPressed: s.toggleTorch,
            icon: Icon(
              s.torchOn ? Icons.flashlight_on : Icons.flashlight_off,
              color: s.torchOn ? AppColors.warning : AppColors.textSecondary,
            ),
          ),
        Expanded(
          child: Text(
            cfg?.detectionEnabled == true
                ? '${s.detections.length} اكتشاف · حد ${(minConf * 100).round()}%'
                : 'الاكتشاف معطّل',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
        ),
        if (s.followingDistance.hasLeadVehicle)
          Text(
            '~${s.followingDistance.distanceM?.round() ?? "—"}م',
            style: const TextStyle(color: AppColors.accentBright, fontSize: 12, fontWeight: FontWeight.w700),
          ),
      ],
    );
  }

  Widget _sidePanel(DriveSession s, dynamic cfg, double minConf) {
    return Container(
      color: AppColors.bgDeep,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(s.modelStatus, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text(
            cfg?.detectionEnabled == true
                ? 'وضع: ${inferenceModeLabel(cfg?.inferenceMode)} · ${s.detections.length} اكتشاف'
                : 'الاكتشاف معطّل',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
          ),
          if (s.detectError != null) ...[
            const SizedBox(height: 8),
            Text(s.detectError!, style: const TextStyle(color: AppColors.warning, fontSize: 11)),
          ],
          const Spacer(),
          if (!kIsWeb)
            FilledButton.icon(
              onPressed: s.toggleTorch,
              icon: Icon(s.torchOn ? Icons.flashlight_on : Icons.flashlight_off),
              label: Text(s.torchOn ? 'إطفاء الفلاش' : 'تشغيل الفلاش'),
            ),
        ],
      ),
    );
  }
}
