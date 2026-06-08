import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../widgets/dash_bar.dart';
import '../widgets/drive_map_view.dart';

class MapsAppScreen extends StatelessWidget {
  const MapsAppScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: DriveSessionScope.of(context),
      builder: (context, _) {
        final s = DriveSessionScope.of(context);
        final bottomPad = MediaQuery.of(context).padding.bottom + 72;

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
              if (s.gpsSearching || s.gpsError != null)
                Positioned(
                  top: MediaQuery.of(context).padding.top + 8,
                  left: 16,
                  right: 16,
                  child: Material(
                    color: s.gpsError != null ? const Color(0xE6DC2626) : const Color(0xE60F172A),
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      child: Row(
                        children: [
                          if (s.gpsSearching && s.gpsError == null)
                            const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF0D9488)),
                            ),
                          if (s.gpsError != null)
                            const Icon(Icons.location_off, color: Colors.white, size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              s.gpsError ?? 'جاري تحديد الموقع الدقيق...',
                              style: const TextStyle(color: Colors.white, fontSize: 12),
                            ),
                          ),
                          if (s.gpsError != null)
                            TextButton(
                              onPressed: s.retryGps,
                              child: const Text('إعادة', style: TextStyle(color: Colors.white, fontSize: 11)),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              Positioned(
                top: MediaQuery.of(context).padding.top + (s.gpsSearching || s.gpsError != null ? 56 : 8),
                right: 12,
                child: Row(
                  children: [
                    _fab(Icons.my_location, s.hasGpsFix ? s.locateNow : s.retryGps),
                    const SizedBox(width: 8),
                    _fab(
                      s.followMap ? Icons.navigation : Icons.location_searching,
                      s.toggleFollow,
                      active: s.followMap,
                    ),
                  ],
                ),
              ),
              if (s.bannerText != null)
                Positioned(
                  top: MediaQuery.of(context).padding.top + 56,
                  left: 24,
                  right: 24,
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
              Positioned(
                left: 0,
                right: 0,
                bottom: bottomPad + 56,
                child: DashBar(
                  speed: s.speedKmh,
                  roadSpeed: s.roadSpeed.cached,
                  placeName: s.placeName ?? s.roadSpeed.cached.roadName,
                  modelStatus: s.hasGpsFix
                      ? (s.modelStatus)
                      : (s.gpsError ?? 'جاري تحديد الموقع...'),
                  nearestEvent: s.nearestEvent,
                  classMeta: s.classMeta,
                  latencyMs: s.lastLatencyMs,
                  scanning: s.scanning,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _fab(IconData icon, VoidCallback onTap, {bool active = false}) {
    return Material(
      color: active ? const Color(0xFF0D9488) : const Color(0xE60F172A),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Icon(icon, color: Colors.white, size: 22),
        ),
      ),
    );
  }
}
