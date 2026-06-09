import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../theme/app_colors.dart';
import '../widgets/drive_map_view.dart';
import '../widgets/gps_status_banner.dart';
import '../widgets/map_hud.dart';
import '../widgets/metrics_strip.dart';
import '../widgets/waze_map_controls.dart';

class MapsAppScreen extends StatelessWidget {
  const MapsAppScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: DriveSessionScope.of(context),
      builder: (context, _) {
        final s = DriveSessionScope.of(context);
        final speed = s.speedKmh;
        final limit = s.roadSpeed.cached.limit;
        final overLimit = speed != null && limit > 0 && speed > limit;

        return Scaffold(
          backgroundColor: const Color(0xFFF1F5F9),
          body: Column(
            children: [
              Expanded(
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
                      speedLimit: limit,
                      speedKmh: speed,
                      nearbyEvents: s.nearbyEvents,
                      classMeta: s.classMeta,
                      onMapMoved: s.onMapMoved,
                    ),
                    GpsStatusBanner(
                      searching: s.gpsSearching,
                      error: s.gpsError,
                      onRetry: s.retryGps,
                    ),
                    Positioned(
                      left: 14,
                      bottom: 18,
                      child: MapHud(
                        speedKmh: speed?.round(),
                        speedLimit: limit,
                        heading: s.displayHeading,
                        accuracyM: s.position?.accuracy,
                        placeName: s.placeName ?? s.roadSpeed.cached.roadName,
                        overLimit: overLimit,
                        vibrationLevel: s.vibrationLevel,
                        vibrationLabel: s.vibrationLabel,
                        vibrationAvailable: s.vibrationSensorAvailable,
                      ),
                    ),
                    Positioned(
                      left: 14,
                      top: MediaQuery.of(context).padding.top + 72,
                      child: WazeSpeedLimitBadge(limit: limit, overLimit: overLimit),
                    ),
                    Positioned(
                      right: 12,
                      bottom: 18,
                      child: WazeMapControls(
                        onZoomIn: s.zoomMapIn,
                        onZoomOut: s.zoomMapOut,
                        onLocate: s.hasGpsFix ? s.locateNow : s.retryGps,
                        onToggleFollow: s.toggleFollow,
                        onToggleHeading: s.toggleMapHeadingUp,
                        onCycleStyle: s.cycleMapStyle,
                        followActive: s.followMap,
                        headingUp: s.mapHeadingUp,
                        mapStyle: s.mapStyle,
                        hasGps: s.hasGpsFix,
                      ),
                    ),
                    if (s.bannerText != null)
                      Positioned(
                        top: MediaQuery.of(context).padding.top + 8,
                        left: 12,
                        right: 12,
                        child: _AlertBanner(text: s.bannerText!),
                      ),
                  ],
                ),
              ),
              MetricsStrip(
                speed: speed,
                roadSpeed: s.roadSpeed.cached,
                placeName: s.placeName ?? s.roadSpeed.cached.roadName,
                heading: s.displayHeading,
                nearestEvent: s.nearestEvent,
                classMeta: s.classMeta,
                scanning: s.scanning,
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
}

class _AlertBanner extends StatelessWidget {
  const _AlertBanner({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.danger,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(color: AppColors.danger.withValues(alpha: 0.35), blurRadius: 12, offset: const Offset(0, 4)),
        ],
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
      ),
    );
  }
}
