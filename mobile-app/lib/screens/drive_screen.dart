import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../widgets/alert_sheet.dart';
import '../widgets/camera_pip.dart';
import '../widgets/dash_bar.dart';
import '../widgets/drive_map_view.dart';
import '../widgets/drive_top_bar.dart';

/// Full combined drive view — map + camera + dash.
class DriveScreen extends StatefulWidget {
  const DriveScreen({super.key});

  @override
  State<DriveScreen> createState() => _DriveScreenState();
}

class _DriveScreenState extends State<DriveScreen> {
  bool _showAlerts = false;
  bool _camExpanded = false;

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
        final bottomPad = MediaQuery.of(context).padding.bottom;
        const dashHeight = 168.0;
        final camBottom = dashHeight + bottomPad + 8;

        return Scaffold(
          backgroundColor: const Color(0xFF0F172A),
          body: Stack(
            children: [
              DriveMapView(
                mapController: s.mapController,
                center: s.mapCenter,
                position: s.position,
                hasGpsFix: s.hasGpsFix,
                nearbyEvents: s.nearbyEvents,
                classMeta: s.classMeta,
                onMapMoved: s.onMapMoved,
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
              if (s.configMessage != null && s.configMessage!.isNotEmpty)
                Positioned(
                  top: MediaQuery.of(context).padding.top + 58,
                  left: 12,
                  right: 12,
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xE6B45309),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(s.configMessage!, style: const TextStyle(color: Colors.white, fontSize: 11)),
                  ),
                ),
              if (s.bannerText != null)
                Positioned(
                  top: MediaQuery.of(context).padding.top + 58,
                  left: 48,
                  right: 48,
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xE6EF4444),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      s.bannerText!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              if (s.camera != null)
                CameraPip(
                  controller: s.camera!,
                  detections: s.detections,
                  minConfidence: s.serverCfg?.minConfidence ?? 0.45,
                  expanded: _camExpanded,
                  scanning: s.scanning,
                  cameraOk: s.camera!.value.isInitialized,
                  bottomOffset: camBottom,
                  onToggle: () => setState(() => _camExpanded = !_camExpanded),
                ),
              Positioned(
                left: 0,
                right: 0,
                bottom: bottomPad,
                child: DashBar(
                  speed: s.speedKmh,
                  roadSpeed: s.roadSpeed.cached,
                  placeName: s.placeName ?? s.roadSpeed.cached.roadName,
                  modelStatus: s.modelStatus,
                  nearestEvent: s.nearestEvent,
                  classMeta: s.classMeta,
                  latencyMs: s.lastLatencyMs,
                  scanning: s.scanning,
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
      },
    );
  }
}
