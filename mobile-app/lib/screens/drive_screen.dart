import 'package:flutter/material.dart';

import '../config/detection_config.dart';
import '../controllers/drive_session.dart';
import '../theme/app_colors.dart';
import '../utils/responsive.dart';
import '../widgets/alert_sheet.dart';
import '../widgets/camera_stack.dart';
import '../widgets/drive_map_view.dart';
import '../widgets/drive_top_bar.dart';
import '../widgets/metrics_strip.dart';

/// وضع القيادة — خريطة وكاميرا في أقسام منفصلة بدون تغطية.
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

        if (landscape) {
          return Scaffold(
            backgroundColor: AppColors.bgDeep,
            body: Row(
              children: [
                Expanded(
                  flex: 3,
                  child: Stack(
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
                      DriveTopBar(
                        vehicleId: s.config.vehicleId,
                        online: s.online,
                        eventsCount: s.eventsCount,
                        alertsCount: s.alertsCount,
                        followMode: s.followMap,
                        onAlerts: () => setState(() => _showAlerts = !_showAlerts),
                        onLocate: s.locateNow,
                        onToggleFollow: s.toggleFollow,
                        onLogout: s.logout,
                      ),
                    ],
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Column(
                    children: [
                      Expanded(
                        child: camReady
                            ? CameraStack(
                                controller: s.camera!,
                                detections: s.detections,
                                minConfidence: minConf,
                                scanning: s.overlayScanning,
                                headwayDistanceM: s.followingDistance.distanceM,
                                leadVehicleClass: s.followingDistance.leadClass,
                                localInference: s.usesLocalInference,
                              )
                            : const Center(child: CircularProgressIndicator(color: AppColors.accent)),
                      ),
                      MetricsStrip(
                        speed: s.speedKmh,
                        roadSpeed: s.roadSpeed.cached,
                        placeName: s.placeName ?? s.roadSpeed.cached.roadName,
                        heading: s.displayHeading,
                        nearestEvent: s.nearestEvent,
                        classMeta: s.classMeta,
                        scanning: s.overlayScanning,
                        latencyMs: s.lastLatencyMs,
                        vibrationLevel: s.vibrationLevel,
                        vibrationAvailable: s.vibrationSensorAvailable,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        }

        return Scaffold(
          backgroundColor: AppColors.bgDeep,
          body: Column(
            children: [
              Expanded(
                flex: 5,
                child: Stack(
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
                    DriveTopBar(
                      vehicleId: s.config.vehicleId,
                      online: s.online,
                      eventsCount: s.eventsCount,
                      alertsCount: s.alertsCount,
                      followMode: s.followMap,
                      onAlerts: () => setState(() => _showAlerts = !_showAlerts),
                      onLocate: s.locateNow,
                      onToggleFollow: s.toggleFollow,
                      onLogout: s.logout,
                    ),
                    if (s.bannerText != null)
                      Positioned(
                        top: MediaQuery.of(context).padding.top + 58,
                        left: 12,
                        right: 12,
                        child: _banner(s.bannerText!, AppColors.danger),
                      ),
                    if (s.detectError != null)
                      Positioned(
                        top: MediaQuery.of(context).padding.top + 58,
                        left: 12,
                        right: 12,
                        child: _banner(s.detectError!, AppColors.warning),
                      ),
                    if (_showAlerts)
                      AlertSheet(
                        liveAlerts: s.liveAlerts,
                        nearbyEvents: s.nearbyEvents,
                        classMeta: s.classMeta,
                      ),
                  ],
                ),
              ),
              if (camReady)
                SizedBox(
                  height: 180,
                  child: CameraStack(
                    controller: s.camera!,
                    detections: s.detections,
                    minConfidence: minConf,
                    scanning: s.overlayScanning,
                    headwayDistanceM: s.followingDistance.distanceM,
                    leadVehicleClass: s.followingDistance.leadClass,
                    localInference: s.usesLocalInference,
                  ),
                ),
              MetricsStrip(
                speed: s.speedKmh,
                roadSpeed: s.roadSpeed.cached,
                placeName: s.placeName ?? s.roadSpeed.cached.roadName,
                heading: s.displayHeading,
                nearestEvent: s.nearestEvent,
                classMeta: s.classMeta,
                scanning: s.overlayScanning,
                latencyMs: s.lastLatencyMs,
                vibrationLevel: s.vibrationLevel,
                vibrationAvailable: s.vibrationSensorAvailable,
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _banner(String text, Color color) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 11)),
    );
  }
}
