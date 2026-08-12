import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/models/detection.dart';
import '../core/models/hospital.dart';
import '../core/services/cached_tile_provider.dart';
import '../core/services/drive_session.dart';
import '../theme/rasid_theme.dart';

class RasidMap extends StatefulWidget {
  const RasidMap({
    super.key,
    required this.session,
    this.mapController,
    this.interactive = true,
    this.compact = false,
    this.followUser = false,
    this.onHospitalTap,
  });

  final DriveSession session;
  final MapController? mapController;
  final bool interactive;
  final bool compact;

  /// When true (drive / nav), smoothly keep user centered.
  final bool followUser;
  final void Function(Hospital hospital)? onHospitalTap;

  @override
  State<RasidMap> createState() => _RasidMapState();
}

class _RasidMapState extends State<RasidMap> with TickerProviderStateMixin {
  MapController? _owned;
  MapController get _ctrl => widget.mapController ?? _owned!;
  LatLng? _lastFollow;
  int _fittedRouteVersion = -1;

  // ── Smooth camera flight ──
  late final AnimationController _camAnim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 650),
  );
  LatLng? _camFrom;
  LatLng? _camTo;
  double _zoomFrom = 15;
  double _zoomTo = 15;

  // ── Route draw-in animation ──
  late final AnimationController _routeAnim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void initState() {
    super.initState();
    if (widget.mapController == null) {
      _owned = MapController();
    }
    _camAnim.addListener(_onCamTick);
    widget.session.addListener(_onSession);
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSession);
    _camAnim.dispose();
    _routeAnim.dispose();
    _owned?.dispose();
    super.dispose();
  }

  void _onCamTick() {
    final from = _camFrom;
    final to = _camTo;
    if (from == null || to == null) return;
    final t = Curves.easeOutCubic.transform(_camAnim.value);
    final lat = from.latitude + (to.latitude - from.latitude) * t;
    final lng = from.longitude + (to.longitude - from.longitude) * t;
    final z = _zoomFrom + (_zoomTo - _zoomFrom) * t;
    try {
      _ctrl.move(LatLng(lat, lng), z);
    } catch (_) {}
  }

  void _flyTo(LatLng to, double zoom, {int ms = 650}) {
    try {
      _camFrom = _ctrl.camera.center;
      _zoomFrom = _ctrl.camera.zoom;
    } catch (_) {
      _camFrom = to;
      _zoomFrom = zoom;
    }
    _camTo = to;
    _zoomTo = zoom;
    _camAnim
      ..duration = Duration(milliseconds: ms)
      ..forward(from: 0);
  }

  void _onSession() {
    if (!mounted) return;
    final s = widget.session;
    final here = LatLng(s.latitude, s.longitude);

    if (widget.followUser || s.navigating) {
      final prev = _lastFollow;
      final moved = prev == null ||
          const Distance().as(LengthUnit.Meter, prev, here) > 6;
      if (moved) {
        _lastFollow = here;
        // Speed-adaptive zoom: closer in city crawling, wider on highways.
        final targetZoom = s.speedKmh > 100
            ? 15.2
            : s.speedKmh > 60
                ? 15.9
                : 16.6;
        _flyTo(here, targetZoom, ms: 700);
      }
    }

    if (s.routeVersion != _fittedRouteVersion && s.routePoints.length >= 2) {
      _fittedRouteVersion = s.routeVersion;
      _routeAnim.forward(from: 0);
      if (!widget.followUser) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _fitRouteAnimated(s.routePoints);
        });
      }
    }
    setState(() {});
  }

  void _fitRouteAnimated(List<LatLng> route) {
    try {
      final bounds = LatLngBounds.fromPoints(route);
      final fit = CameraFit.bounds(
        bounds: bounds,
        padding: const EdgeInsets.all(52),
        maxZoom: 16.5,
      );
      final cam = fit.fit(_ctrl.camera);
      _flyTo(cam.center, cam.zoom, ms: 900);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final center = LatLng(session.latitude, session.longitude);
    // While navigating at low speed GPS heading is unreliable — follow the
    // route's bearing instead; at speed, trust GPS heading.
    final heading = session.navigating && session.speedKmh < 25
        ? session.routeBearingDeg
        : session.heading;

    final markers = <Marker>[
      Marker(
        point: center,
        width: session.navigating ? 76 : 60,
        height: session.navigating ? 76 : 60,
        alignment: Alignment.center,
        child: _NavArrow(headingDeg: heading, navigating: session.navigating),
      ),
    ];

    final dest = session.navigationTarget;
    if (dest != null) {
      markers.add(
        Marker(
          point: LatLng(dest.latitude, dest.longitude),
          width: 52,
          height: 62,
          alignment: Alignment.topCenter,
          child: const _DestinationPin(),
        ),
      );
    }

    if (session.showHazards) {
      for (final e in session.events.take(80)) {
        markers.add(
          Marker(
            point: LatLng(e.latitude, e.longitude),
            width: 36,
            height: 36,
            child: _HazardDot(kind: e.kind, label: e.labelAr),
          ),
        );
      }
    }

    if (session.showHospitals) {
      for (final h in session.nearestHospitals) {
        if (dest?.id == h.id) continue;
        markers.add(
          Marker(
            point: LatLng(h.latitude, h.longitude),
            width: 46,
            height: 46,
            child: GestureDetector(
              onTap: () => widget.onHospitalTap?.call(h),
              child: Tooltip(
                message: h.nameAr,
                child: const _HospitalPin(),
              ),
            ),
          ),
        );
      }
    }

    final route = session.routePoints;

    return FlutterMap(
      mapController: _ctrl,
      options: MapOptions(
        initialCenter: center,
        initialZoom: widget.compact ? 15.0 : 15.8,
        minZoom: 4,
        maxZoom: 19,
        interactionOptions: InteractionOptions(
          flags: widget.interactive
              ? InteractiveFlag.all & ~InteractiveFlag.rotate
              : InteractiveFlag.none,
        ),
        onMapReady: () {
          if (route.length >= 2 && !widget.followUser) {
            _fitRouteAnimated(route);
          } else {
            _flyTo(center, widget.compact ? 16.5 : 15.8, ms: 900);
          }
        },
      ),
      children: [
        TileLayer(
          // Dark premium style — matches the app theme, looks like a
          // high-end navigation unit.
          urlTemplate:
              'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          subdomains: const ['a', 'b', 'c', 'd'],
          userAgentPackageName: 'com.rasid.auto',
          tileProvider: CachedTileProvider(),
          maxZoom: 19,
          retinaMode: RetinaMode.isHighDensity(context),
        ),
        if (route.length >= 2)
          AnimatedBuilder(
            animation: _routeAnim,
            builder: (context, _) {
              final visible = _visibleRoute(route, _routeAnim.value);
              // Split at the nearest point: passed = grey, ahead = blue.
              final split = session.navigating
                  ? session.nearestRouteIndex.clamp(0, visible.length - 1)
                  : 0;
              final ahead = visible.sublist(split);
              final passed = visible.sublist(0, split + 1);
              return PolylineLayer(
                polylines: [
                  if (passed.length >= 2)
                    Polyline(
                      points: passed,
                      strokeWidth: widget.compact ? 5 : 6.5,
                      color: Colors.grey.withValues(alpha: 0.45),
                      borderStrokeWidth: 0,
                    ),
                  // Wide soft glow under the route.
                  Polyline(
                    points: ahead,
                    strokeWidth: widget.compact ? 10 : 14,
                    color: const Color(0xFF2979FF).withValues(alpha: 0.20),
                    borderStrokeWidth: 0,
                  ),
                  // Main route — bright blue with light border.
                  Polyline(
                    points: ahead,
                    strokeWidth: widget.compact ? 5 : 6.5,
                    color: const Color(0xFF40C4FF),
                    borderStrokeWidth: 1.6,
                    borderColor: Colors.white.withValues(alpha: 0.85),
                  ),
                ],
              );
            },
          ),
        MarkerLayer(markers: markers),
        if (!widget.compact)
          RichAttributionWidget(
            attributions: const [
              TextSourceAttribution('© OpenStreetMap · © CARTO'),
            ],
          ),
      ],
    );
  }

  /// Progressive reveal: route draws itself from user → destination.
  List<LatLng> _visibleRoute(List<LatLng> route, double t) {
    if (t >= 1) return route;
    final eased = Curves.easeInOutCubic.transform(t);
    final count = (route.length * eased).ceil().clamp(2, route.length);
    return route.sublist(0, count);
  }
}

/// Professional GPS navigation arrow (heading-up chevron + pulse).
class _NavArrow extends StatefulWidget {
  const _NavArrow({required this.headingDeg, required this.navigating});

  final double headingDeg;
  final bool navigating;

  @override
  State<_NavArrow> createState() => _NavArrowState();
}

class _NavArrowState extends State<_NavArrow>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  double _smoothedHeading = 0;

  @override
  void initState() {
    super.initState();
    _smoothedHeading = widget.headingDeg;
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    if (widget.navigating) _pulse.repeat();
  }

  @override
  void didUpdateWidget(covariant _NavArrow old) {
    super.didUpdateWidget(old);
    // Adaptive heading smoothing (shortest arc): small GPS jitter gets heavy
    // smoothing; real turns (>25°) snap quickly so the arrow feels alive.
    var delta = (widget.headingDeg - _smoothedHeading) % 360;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    final absDelta = delta.abs();
    final alpha = absDelta > 45
        ? 0.85
        : absDelta > 25
            ? 0.6
            : absDelta > 8
                ? 0.4
                : 0.22;
    _smoothedHeading += delta * alpha;
    if (widget.navigating && !_pulse.isAnimating) {
      _pulse.repeat();
    } else if (!widget.navigating && _pulse.isAnimating) {
      _pulse.stop();
      _pulse.value = 0;
    }
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
        return Transform.rotate(
          angle: _smoothedHeading * math.pi / 180,
          child: CustomPaint(
            size: Size(
              widget.navigating ? 72 : 56,
              widget.navigating ? 72 : 56,
            ),
            painter: _NavArrowPainter(
              active: widget.navigating,
              pulse: widget.navigating ? _pulse.value : 0,
            ),
          ),
        );
      },
    );
  }
}

class _NavArrowPainter extends CustomPainter {
  _NavArrowPainter({required this.active, required this.pulse});

  final bool active;
  final double pulse;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final accent = active ? const Color(0xFF40C4FF) : RasidColors.amber;

    // Direction view-cone ahead of the arrow (Google-Maps style beam).
    final beam = ui.Path()
      ..moveTo(c.dx, c.dy - 6)
      ..lineTo(c.dx + 16, c.dy - 34)
      ..quadraticBezierTo(c.dx, c.dy - 42, c.dx - 16, c.dy - 34)
      ..close();
    canvas.drawPath(
      beam,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [
            accent.withValues(alpha: active ? 0.30 : 0.18),
            accent.withValues(alpha: 0.0),
          ],
        ).createShader(Rect.fromLTWH(c.dx - 18, c.dy - 44, 36, 44)),
    );

    if (active) {
      final ringR = 16 + pulse * 15;
      canvas.drawCircle(
        c,
        ringR,
        Paint()
          ..color = accent.withValues(alpha: (1 - pulse) * 0.30)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.4,
      );
      canvas.drawCircle(
        c,
        14 + pulse * 7,
        Paint()
          ..color = accent.withValues(alpha: (1 - pulse) * 0.14)
          ..style = PaintingStyle.fill,
      );
    }

    canvas.drawCircle(
      c,
      17,
      Paint()
        ..color = accent.withValues(alpha: 0.30)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
    );

    final shadow = ui.Path()
      ..moveTo(c.dx, c.dy - 18)
      ..lineTo(c.dx + 14, c.dy + 15)
      ..lineTo(c.dx, c.dy + 7)
      ..lineTo(c.dx - 14, c.dy + 15)
      ..close();
    canvas.drawPath(
      shadow.shift(const Offset(0, 2)),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.4)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );

    final path = ui.Path()
      ..moveTo(c.dx, c.dy - 20)
      ..lineTo(c.dx + 13.5, c.dy + 15)
      ..quadraticBezierTo(c.dx + 4, c.dy + 9, c.dx, c.dy + 7)
      ..quadraticBezierTo(c.dx - 4, c.dy + 9, c.dx - 13.5, c.dy + 15)
      ..close();

    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.6
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawPath(
      path,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: active
              ? const [Color(0xFF80D8FF), Color(0xFF0091EA)]
              : [const Color(0xFFFFD54F), Color(0xFFE65100)],
        ).createShader(Rect.fromCircle(center: c, radius: 24)),
    );

    canvas.drawCircle(
      Offset(c.dx, c.dy - 12),
      2.4,
      Paint()..color = Colors.white.withValues(alpha: 0.95),
    );
  }

  @override
  bool shouldRepaint(covariant _NavArrowPainter old) =>
      old.active != active || old.pulse != pulse;
}

class _DestinationPin extends StatefulWidget {
  const _DestinationPin();

  @override
  State<_DestinationPin> createState() => _DestinationPinState();
}

class _DestinationPinState extends State<_DestinationPin>
    with SingleTickerProviderStateMixin {
  late final AnimationController _bounce;

  @override
  void initState() {
    super.initState();
    _bounce = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _bounce.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _bounce,
      builder: (context, child) {
        final lift = Curves.easeInOut.transform(_bounce.value) * 6;
        return Transform.translate(
          offset: Offset(0, -lift),
          child: child,
        );
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFEF5350), Color(0xFFB71C1C)],
              ),
              borderRadius: BorderRadius.circular(14),
              boxShadow: [
                BoxShadow(
                  color: RasidColors.danger.withValues(alpha: 0.5),
                  blurRadius: 14,
                  spreadRadius: 1,
                ),
              ],
              border: Border.all(color: Colors.white, width: 2),
            ),
            child: const Icon(
              Icons.local_hospital,
              color: Colors.white,
              size: 20,
            ),
          ),
          CustomPaint(
            size: const Size(12, 10),
            painter: _PinTipPainter(RasidColors.danger),
          ),
        ],
      ),
    );
  }
}

class _PinTipPainter extends CustomPainter {
  _PinTipPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final p = ui.Path()
      ..moveTo(0, 0)
      ..lineTo(size.width / 2, size.height)
      ..lineTo(size.width, 0)
      ..close();
    canvas.drawPath(p, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _PinTipPainter old) => old.color != color;
}

class _HazardDot extends StatefulWidget {
  const _HazardDot({required this.kind, required this.label});

  final String kind;
  final String label;

  @override
  State<_HazardDot> createState() => _HazardDotState();
}

class _HazardDotState extends State<_HazardDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: 1800 + (widget.kind.length * 137) % 500),
    )..repeat();
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = hazardColor(widget.kind);
    return Tooltip(
      message: widget.label,
      child: AnimatedBuilder(
        animation: _pulse,
        builder: (context, child) {
          final ring = 1 + _pulse.value * 0.9;
          return Stack(
            alignment: Alignment.center,
            children: [
              Transform.scale(
                scale: ring,
                child: Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: c.withValues(alpha: (1 - _pulse.value) * 0.55),
                      width: 1.6,
                    ),
                  ),
                ),
              ),
              child!,
            ],
          );
        },
        child: Container(
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            color: c,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white70, width: 1.5),
            boxShadow: [
              BoxShadow(color: c.withValues(alpha: 0.5), blurRadius: 8),
            ],
          ),
          child: Icon(hazardIcon(widget.kind), color: Colors.white, size: 14),
        ),
      ),
    );
  }
}

class _HospitalPin extends StatefulWidget {
  const _HospitalPin();

  @override
  State<_HospitalPin> createState() => _HospitalPinState();
}

class _HospitalPinState extends State<_HospitalPin>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();
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
        final glow = 0.35 + 0.2 * math.sin(_pulse.value * 2 * math.pi);
        return Container(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFEF5350), Color(0xFFC62828)],
            ),
            borderRadius: BorderRadius.circular(11),
            boxShadow: [
              BoxShadow(
                color: RasidColors.danger.withValues(alpha: glow),
                blurRadius: 12,
                spreadRadius: 1,
              ),
            ],
            border: Border.all(color: Colors.white70, width: 1.5),
          ),
          child: child,
        );
      },
      child: const Icon(Icons.local_hospital, color: Colors.white, size: 22),
    );
  }
}
