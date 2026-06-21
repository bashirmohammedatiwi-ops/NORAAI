import 'package:flutter/material.dart';

import '../config/detection_config.dart';
import '../controllers/drive_session.dart';
import '../theme/app_colors.dart';
import '../utils/responsive.dart';
import '../widgets/alert_sheet.dart';
import '../widgets/camera_stack.dart';
import '../widgets/drive_cockpit.dart';
import '../widgets/drive_map_view.dart';

/// وضع القيادة — قمرة قيادة احترافية: كاميرا ذكية + خريطة + لوحة عدّادات.
class DriveScreen extends StatefulWidget {
  const DriveScreen({super.key});

  @override
  State<DriveScreen> createState() => _DriveScreenState();
}

class _DriveScreenState extends State<DriveScreen> {
  bool _showAlerts = false;

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
        final landscape = isLandscape(context);
        final camReady = s.camera != null && s.camera!.value.isInitialized;
        final minConf = s.displayMinConfidence;

        final cockpit = CockpitBar(
          speed: s.speedKmh,
          roadSpeed: s.roadSpeed.cached,
          placeName: s.placeName ?? s.roadSpeed.cached.roadName,
          modelStatus: s.modelStatus,
          heading: s.displayHeading,
          latencyMs: s.lastLatencyMs,
          scanning: s.overlayScanning,
          detectionCount: s.detections.length,
          localInference: s.usesLocalInference,
          nearestEvent: s.nearestEvent,
          classMeta: s.classMeta,
          followingDistance: s.followingDistance,
          vibrationLevel: s.vibrationLevel,
          vibrationAvailable: s.vibrationSensorAvailable,
          compact: !landscape,
        );

        final cameraPanel = _PanelCard(
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (camReady)
                CameraStack(
                  controller: s.camera!,
                  detections: s.detections,
                  minConfidence: minConf,
                  scanning: s.overlayScanning,
                  fit: BoxFit.cover,
                  headwayDistanceM: s.followingDistance.distanceM,
                  leadVehicleClass: s.followingDistance.leadClass,
                  localInference: s.usesLocalInference,
                )
              else
                _cameraLoading(s.cameraError),
              Positioned(
                top: 10,
                left: 10,
                right: 10,
                child: CockpitTopBar(
                  vehicleId: s.config.vehicleId,
                  online: s.online,
                  connectionLabel: s.connectionLabel,
                  alertsCount: s.alertsCount,
                  onAlerts: () => setState(() => _showAlerts = !_showAlerts),
                  onLogout: s.logout,
                ),
              ),
              if (camReady)
                Positioned(
                  bottom: 10,
                  right: 10,
                  child: CockpitIconButton(
                    icon: s.torchOn ? Icons.flash_on_rounded : Icons.flash_off_rounded,
                    active: s.torchOn,
                    activeColor: AppColors.warning,
                    onTap: s.toggleTorch,
                  ),
                ),
              if (s.bannerText != null || s.detectError != null)
                Positioned(
                  top: 60,
                  left: 12,
                  right: 12,
                  child: _banner(
                    s.bannerText ?? s.detectError!,
                    s.bannerText != null ? AppColors.danger : AppColors.warning,
                  ),
                ),
              if (_showAlerts)
                AlertSheet(
                  liveAlerts: s.liveAlerts,
                  nearbyEvents: s.nearbyEvents,
                  classMeta: s.classMeta,
                ),
            ],
          ),
        );

        final mapPanel = _PanelCard(
          child: Stack(
            fit: StackFit.expand,
            children: [
              DriveMapView(
                mapController: s.mapController,
                center: s.mapCenter,
                position: s.position,
                hasGpsFix: s.hasGpsFix,
                displayHeading: s.displayHeading,
                headingUp: s.mapHeadingUp,
                followMap: s.followMap,
                mapZoom: s.mapZoom,
                mapStyle: s.mapStyle,
                trail: s.positionTrail,
                speedLimit: s.roadSpeed.cached.limit,
                speedKmh: s.speedKmh,
                nearbyEvents: s.nearbyEvents,
                classMeta: s.classMeta,
                onMapMoved: s.onMapMoved,
                showEventMarkers: DetectionConfig.mapEventReporting,
              ),
              Positioned(
                bottom: 10,
                right: 10,
                child: Column(
                  children: [
                    CockpitIconButton(
                      icon: Icons.layers_rounded,
                      onTap: s.cycleMapStyle,
                    ),
                    const SizedBox(height: 8),
                    CockpitIconButton(
                      icon: s.followMap ? Icons.my_location_rounded : Icons.location_searching_rounded,
                      active: s.followMap,
                      onTap: s.toggleFollow,
                    ),
                    const SizedBox(height: 8),
                    CockpitIconButton(
                      icon: Icons.gps_fixed_rounded,
                      onTap: s.locateNow,
                    ),
                  ],
                ),
              ),
            ],
          ),
        );

        return Scaffold(
          backgroundColor: AppColors.bgDeep,
          body: landscape
              ? Column(
                  children: [
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
                        child: Row(
                          children: [
                            Expanded(flex: 3, child: cameraPanel),
                            const SizedBox(width: 8),
                            Expanded(flex: 2, child: mapPanel),
                          ],
                        ),
                      ),
                    ),
                    cockpit,
                  ],
                )
              : Column(
                  children: [
                    Expanded(
                      flex: 3,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
                        child: cameraPanel,
                      ),
                    ),
                    Expanded(
                      flex: 2,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
                        child: mapPanel,
                      ),
                    ),
                    cockpit,
                  ],
                ),
        );
      },
    );
  }

  Widget _cameraLoading(String? error) {
    return Container(
      color: AppColors.bgBase,
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (error != null) ...[
            const Icon(Icons.videocam_off_rounded, color: AppColors.textMuted, size: 36),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                error,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
              ),
            ),
          ] else
            const CircularProgressIndicator(color: AppColors.accent),
        ],
      ),
    );
  }

  Widget _banner(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: color.withValues(alpha: 0.4), blurRadius: 14),
        ],
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// Rounded, bordered container for the camera and map surfaces.
class _PanelCard extends StatelessWidget {
  const _PanelCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderLight.withValues(alpha: 0.5)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.4),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: child,
      ),
    );
  }
}
