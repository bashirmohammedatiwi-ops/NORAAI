import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../theme/app_colors.dart';
import '../widgets/camera_stack.dart';

/// شاشة كاميرا ملء الشاشة — بدون نصوص أو أزرار.
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
        final ready = cam != null && cam.value.isInitialized;

        return Scaffold(
          backgroundColor: Colors.black,
          body: ready
              ? CameraStack(
                  controller: cam,
                  detections: s.detections,
                  minConfidence: s.displayMinConfidence,
                  fit: BoxFit.cover,
                )
              : GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: s.cameraStarting ? null : () => s.requestCamera(force: true),
                  child: const ColoredBox(
                    color: Colors.black,
                    child: Center(
                      child: SizedBox(
                        width: 28,
                        height: 28,
                        child: CircularProgressIndicator(
                          color: AppColors.accent,
                          strokeWidth: 2,
                        ),
                      ),
                    ),
                  ),
                ),
        );
      },
    );
  }
}
