import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../models/nearby_event.dart';
import '../theme/app_colors.dart';
import '../utils/event_meta.dart';
import '../utils/map_geo.dart';
import '../utils/map_smooth.dart';
import '../utils/map_styles.dart';

class DriveMapView extends StatefulWidget {
  const DriveMapView({
    super.key,
    required this.mapController,
    required this.center,
    required this.nearbyEvents,
    required this.classMeta,
    this.position,
    this.hasGpsFix = true,
    this.displayHeading = 0,
    this.headingUp = true,
    this.followMap = true,
    this.mapZoom = 16,
    this.mapStyle = MapStyle.waze,
    this.trail = const [],
    this.speedLimit = 80,
    this.speedKmh,
    this.onMapMoved,
    this.showEventMarkers = false,
  });

  final MapController mapController;
  final LatLng center;
  final Position? position;
  final bool hasGpsFix;
  final double displayHeading;
  final bool headingUp;
  final bool followMap;
  final double mapZoom;
  final MapStyle mapStyle;
  final List<LatLng> trail;
  final double speedLimit;
  final double? speedKmh;
  final List<NearbyEvent> nearbyEvents;
  final Map<String, EventMeta> classMeta;
  final VoidCallback? onMapMoved;
  final bool showEventMarkers;

  static const _maxMarkers = 20;

  @override
  State<DriveMapView> createState() => _DriveMapViewState();
}

class _DriveMapViewState extends State<DriveMapView> with SingleTickerProviderStateMixin {
  Ticker? _ticker;
  Duration _lastTick = Duration.zero;

  late LatLng _camCenter;
  late double _camZoom;
  late double _camRotation;

  @override
  void initState() {
    super.initState();
    _camCenter = widget.center;
    _camZoom = widget.mapZoom;
    _camRotation = _targetRotation();
    _ticker = createTicker(_onTick)..start();
    WidgetsBinding.instance.addPostFrameCallback((_) => _applyCamera());
  }

  @override
  void dispose() {
    _ticker?.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant DriveMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.followMap && oldWidget.followMap) {
      _snapToController();
    }
    if (widget.followMap && !oldWidget.followMap) {
      _camCenter = widget.mapController.camera.center;
      _camZoom = widget.mapController.camera.zoom;
      _camRotation = widget.mapController.camera.rotation;
    }
  }

  double _targetRotation() => widget.headingUp ? -widget.displayHeading : 0;

  Offset _cameraOffset(Size size) {
    if (!widget.headingUp || !widget.followMap) return Offset.zero;
    // Waze-style: puck sits in lower third while driving.
    return Offset(0, size.height * 0.14);
  }

  void _onTick(Duration elapsed) {
    if (!widget.followMap) return;

    final dt = (_lastTick == Duration.zero)
        ? 1 / 60
        : (elapsed - _lastTick).inMicroseconds / 1e6;
    _lastTick = elapsed;
    if (dt <= 0 || dt > 0.5) return;

    final targetCenter = widget.center;
    final targetZoom = widget.mapZoom;
    final targetRot = _targetRotation();

    _camCenter = smoothLatLng(_camCenter, targetCenter, dt, hz: 10.5);
    _camZoom = smoothStep(_camZoom, targetZoom, dt, hz: 8);
    _camRotation = smoothStep(_camRotation, targetRot, dt, hz: 11);

    _applyCamera();
  }

  void _snapToController() {
    final cam = widget.mapController.camera;
    _camCenter = cam.center;
    _camZoom = cam.zoom;
    _camRotation = cam.rotation;
  }

  void _applyCamera() {
    if (!mounted) return;
    try {
      final size = MediaQuery.sizeOf(context);
      final offset = _cameraOffset(size);
      widget.mapController.move(_camCenter, _camZoom, offset: offset);
      widget.mapController.rotate(_camRotation);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final lat = widget.center.latitude;
    final lon = widget.center.longitude;
    final markerRotation = widget.headingUp ? 0.0 : widget.displayHeading;
    final accuracy = widget.position?.accuracy ?? 0;
    final nearest = widget.showEventMarkers
        ? _nearestEvents(widget.nearbyEvents, DriveMapView._maxMarkers)
        : <NearbyEvent>[];
    final overLimit = widget.speedKmh != null &&
        widget.speedLimit > 0 &&
        widget.speedKmh! > widget.speedLimit;

    final routeBlue = const Color(0xFF33A8FF);
    final routeGlow = const Color(0xFF4FC3FF);

    final retina = widget.mapStyle.useRetina && MediaQuery.devicePixelRatioOf(context) > 1.5;

    return RepaintBoundary(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(0),
        child: FlutterMap(
          mapController: widget.mapController,
          options: MapOptions(
            initialCenter: widget.center,
            initialZoom: widget.hasGpsFix ? widget.mapZoom : 12,
            initialRotation: _targetRotation(),
            onPositionChanged: (pos, hasGesture) {
              if (hasGesture) widget.onMapMoved?.call();
            },
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.all,
              pinchZoomThreshold: 0.35,
              pinchMoveThreshold: 28,
            ),
          ),
          children: [
            TileLayer(
              urlTemplate: widget.mapStyle.urlTemplate,
              subdomains: widget.mapStyle.subdomains,
              userAgentPackageName: 'com.norai.norai_drive',
              maxZoom: widget.mapStyle.maxZoom.toDouble(),
              retinaMode: retina,
            ),
            if (widget.mapStyle.labelOverlayTemplate != null)
              TileLayer(
                urlTemplate: widget.mapStyle.labelOverlayTemplate!,
                subdomains: const ['a', 'b', 'c', 'd'],
                userAgentPackageName: 'com.norai.norai_drive',
                maxZoom: widget.mapStyle.maxZoom.toDouble(),
                retinaMode: retina,
              ),
            if (widget.trail.length >= 2)
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: widget.trail,
                    strokeWidth: 10,
                    color: routeBlue.withValues(alpha: 0.22),
                    borderStrokeWidth: 0,
                  ),
                  Polyline(
                    points: widget.trail,
                    strokeWidth: 6.5,
                    color: routeGlow.withValues(alpha: 0.85),
                    borderColor: Colors.white.withValues(alpha: 0.55),
                    borderStrokeWidth: 2,
                  ),
                ],
              ),
            if (widget.hasGpsFix && accuracy > 0)
              CircleLayer(
                circles: [
                  CircleMarker(
                    point: LatLng(lat, lon),
                    radius: accuracy,
                    useRadiusInMeter: true,
                    color: routeBlue.withValues(alpha: 0.06),
                    borderColor: routeBlue.withValues(alpha: 0.2),
                    borderStrokeWidth: 1,
                  ),
                ],
              ),
            if (widget.hasGpsFix)
              CircleLayer(
                circles: [
                  CircleMarker(
                    point: LatLng(lat, lon),
                    radius: 18,
                    useRadiusInMeter: true,
                    color: routeBlue.withValues(alpha: 0.12),
                    borderColor: Colors.transparent,
                    borderStrokeWidth: 0,
                  ),
                ],
              ),
            MarkerLayer(
              markers: [
                ...nearest.map((e) {
                  final meta = getEventMeta(e.eventType, widget.classMeta);
                  final hot = highlightTypes.contains(e.eventType);
                  return Marker(
                    point: LatLng(e.latitude, e.longitude),
                    width: hot ? 48 : 40,
                    height: hot ? 56 : 48,
                    child: _WazeHazardPin(meta: meta, hot: hot, distanceKm: e.distanceKm),
                  );
                }),
                if (widget.hasGpsFix)
                  Marker(
                    point: LatLng(lat, lon),
                    width: 64,
                    height: 64,
                    child: Transform.rotate(
                      angle: markerRotation * math.pi / 180,
                      child: _WazePuck(overLimit: overLimit),
                    ),
                  )
                else
                  Marker(
                    point: LatLng(lat, lon),
                    width: 44,
                    height: 44,
                    child: Container(
                      decoration: BoxDecoration(
                        color: const Color(0xFF94A3B8),
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 3),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 8),
                        ],
                      ),
                      child: const Icon(Icons.location_searching_rounded, color: Colors.white, size: 22),
                    ),
                  ),
              ],
            ),
            RichAttributionWidget(
              alignment: AttributionAlignment.bottomLeft,
              attributions: [
                TextSourceAttribution(
                  widget.mapStyle.attribution,
                  textStyle: TextStyle(color: Colors.black.withValues(alpha: 0.45), fontSize: 9),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

}

List<NearbyEvent> _nearestEvents(List<NearbyEvent> events, int max) {
  final sorted = [...events]..sort((a, b) => a.distanceKm.compareTo(b.distanceKm));
  return sorted.take(max).toList();
}

class _WazePuck extends StatelessWidget {
  const _WazePuck({required this.overLimit});

  final bool overLimit;

  @override
  Widget build(BuildContext context) {
    final blue = overLimit ? AppColors.danger : const Color(0xFF33A8FF);
    return CustomPaint(
      size: const Size(64, 64),
      painter: _WazePuckPainter(color: blue),
    );
  }
}

class _WazePuckPainter extends CustomPainter {
  _WazePuckPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2 + 2);

    canvas.drawCircle(
      c,
      size.width * 0.34,
      Paint()
        ..color = color.withValues(alpha: 0.25)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );

    canvas.drawCircle(
      c,
      size.width * 0.28,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.fill,
    );
    canvas.drawCircle(
      c,
      size.width * 0.28,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );

    final arrow = ui.Path()
      ..moveTo(c.dx, c.dy - size.width * 0.16)
      ..lineTo(c.dx + size.width * 0.11, c.dy + size.width * 0.08)
      ..lineTo(c.dx, c.dy + size.width * 0.02)
      ..lineTo(c.dx - size.width * 0.11, c.dy + size.width * 0.08)
      ..close();

    canvas.drawPath(arrow, Paint()..color = color);
    canvas.drawPath(
      arrow,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(covariant _WazePuckPainter old) => old.color != color;
}

class _WazeHazardPin extends StatefulWidget {
  const _WazeHazardPin({
    required this.meta,
    required this.hot,
    required this.distanceKm,
  });

  final EventMeta meta;
  final bool hot;
  final double distanceKm;

  @override
  State<_WazeHazardPin> createState() => _WazeHazardPinState();
}

class _WazeHazardPinState extends State<_WazeHazardPin> with SingleTickerProviderStateMixin {
  late AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
      ..repeat(reverse: true);
    if (widget.hot) _pulse.repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) {
        final scale = widget.hot ? 1.0 + _pulse.value * 0.08 : 1.0;
        return Transform.scale(scale: scale, child: child);
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
              color: widget.meta.color,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white, width: 2.5),
              boxShadow: [
                BoxShadow(
                  color: widget.meta.color.withValues(alpha: 0.45),
                  blurRadius: widget.hot ? 14 : 6,
                  offset: const Offset(0, 3),
                ),
                BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 8, offset: const Offset(0, 2)),
              ],
            ),
            child: Text(widget.meta.icon, style: const TextStyle(fontSize: 18)),
          ),
          CustomPaint(
            size: const Size(14, 8),
            painter: _PinTailPainter(color: widget.meta.color),
          ),
          if (widget.hot)
            Text(
              formatDistanceKm(widget.distanceKm),
              style: TextStyle(
                color: widget.meta.color,
                fontSize: 9,
                fontWeight: FontWeight.w800,
                shadows: [Shadow(color: Colors.white.withValues(alpha: 0.9), blurRadius: 4)],
              ),
            ),
        ],
      ),
    );
  }
}

class _PinTailPainter extends CustomPainter {
  _PinTailPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = ui.Path()
      ..moveTo(size.width / 2, size.height)
      ..lineTo(0, 0)
      ..lineTo(size.width, 0)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _PinTailPainter old) => old.color != color;
}
