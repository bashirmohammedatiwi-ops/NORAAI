import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../models/nearby_event.dart';
import '../utils/event_meta.dart';
import '../utils/map_geo.dart';

class DriveMapView extends StatelessWidget {
  const DriveMapView({
    super.key,
    required this.mapController,
    required this.position,
    required this.nearbyEvents,
    required this.classMeta,
    this.onMapMoved,
  });

  final MapController mapController;
  final Position position;
  final List<NearbyEvent> nearbyEvents;
  final Map<String, EventMeta> classMeta;
  final VoidCallback? onMapMoved;

  @override
  Widget build(BuildContext context) {
    final lat = position.latitude;
    final lon = position.longitude;
    final heading = position.heading >= 0 ? position.heading : 0.0;
    final accuracy = position.accuracy;

    final wedgePoints =
        headingWedge(lat, lon, heading).map((p) => LatLng(p[0], p[1])).toList();

    final nearest = [...nearbyEvents]
      ..sort((a, b) => a.distanceKm.compareTo(b.distanceKm));
    final lineTargets = nearest.take(3).toList();

    return FlutterMap(
      mapController: mapController,
      options: MapOptions(
        initialCenter: LatLng(lat, lon),
        initialZoom: zoomForAccuracy(accuracy),
        onPositionChanged: (pos, hasGesture) {
          if (hasGesture) onMapMoved?.call();
        },
        interactionOptions: const InteractionOptions(flags: InteractiveFlag.all),
      ),
      children: [
        TileLayer(
          urlTemplate:
              'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
          subdomains: const ['a', 'b', 'c', 'd'],
          userAgentPackageName: 'com.norai.norai_drive',
        ),
        if (accuracy > 0)
          CircleLayer(
            circles: [
              CircleMarker(
                point: LatLng(lat, lon),
                radius: accuracy,
                useRadiusInMeter: true,
                color: const Color(0x222DD4BF),
                borderColor: const Color(0x882DD4BF),
                borderStrokeWidth: 1,
              ),
            ],
          ),
        PolylineLayer(
          polylines: [
            Polyline(
              points: wedgePoints,
              color: const Color(0x662DD4BF),
              strokeWidth: 2,
            ),
            ...lineTargets.map((e) {
              final meta = getEventMeta(e.eventType, classMeta);
              return Polyline(
                points: [LatLng(lat, lon), LatLng(e.latitude, e.longitude)],
                color: meta.color.withValues(alpha: 0.45),
                strokeWidth: 2,
                pattern: StrokePattern.dashed(segments: const [8, 8]),
              );
            }),
          ],
        ),
        MarkerLayer(
          markers: [
            ...nearbyEvents.map((e) {
              final meta = getEventMeta(e.eventType, classMeta);
              final hot = highlightTypes.contains(e.eventType);
              return Marker(
                point: LatLng(e.latitude, e.longitude),
                width: hot ? 44 : 34,
                height: hot ? 44 : 34,
                child: Tooltip(
                  message: '${meta.labelAr} · ${formatDistanceKm(e.distanceKm)}',
                  child: Container(
                    decoration: BoxDecoration(
                      color: meta.color.withValues(alpha: 0.9),
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: hot ? 2 : 1),
                      boxShadow: hot
                          ? [
                              BoxShadow(
                                color: meta.color.withValues(alpha: 0.6),
                                blurRadius: 10,
                              ),
                            ]
                          : null,
                    ),
                    alignment: Alignment.center,
                    child: Text(meta.icon, style: TextStyle(fontSize: hot ? 18 : 14)),
                  ),
                ),
              );
            }),
            Marker(
              point: LatLng(lat, lon),
              width: 48,
              height: 48,
              child: Transform.rotate(
                angle: heading * math.pi / 180,
                child: Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFF0D9488),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                    boxShadow: const [
                      BoxShadow(color: Color(0x660D9488), blurRadius: 12),
                    ],
                  ),
                  child: const Icon(Icons.navigation, color: Colors.white, size: 24),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
