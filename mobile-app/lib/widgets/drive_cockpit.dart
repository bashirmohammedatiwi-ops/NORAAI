import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../models/nearby_event.dart';
import '../models/road_speed.dart';
import '../services/following_distance_estimator.dart';
import '../theme/app_colors.dart';
import '../utils/event_meta.dart';
import '../utils/map_geo.dart';

/// Large radial speedometer for the cockpit dashboard.
class RadialSpeedometer extends StatelessWidget {
  const RadialSpeedometer({
    super.key,
    required this.speed,
    required this.limit,
    this.size = 132,
    this.maxSpeed = 180,
  });

  final double? speed;
  final double limit;
  final double size;
  final double maxSpeed;

  Color _color(double ratio) {
    if (ratio >= 1) return AppColors.danger;
    if (ratio >= 0.92) return AppColors.orange;
    if (ratio >= 0.78) return AppColors.warning;
    return AppColors.accentBright;
  }

  @override
  Widget build(BuildContext context) {
    final v = speed?.round();
    final ratio = (v != null && limit > 0) ? v / limit : 0.0;
    final color = v != null ? _color(ratio) : AppColors.textMuted;
    final fill = (v ?? 0) / maxSpeed;

    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _RadialPainter(fill: fill.clamp(0, 1), color: color),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(height: size * 0.12),
              Text(
                v?.toString() ?? '--',
                style: TextStyle(
                  color: v != null ? AppColors.textPrimary : AppColors.textMuted,
                  fontSize: size * 0.34,
                  fontWeight: FontWeight.w900,
                  height: 1,
                  shadows: [
                    Shadow(color: color.withValues(alpha: 0.6), blurRadius: 18),
                  ],
                ),
              ),
              Text(
                'كم/س',
                style: TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: size * 0.085,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RadialPainter extends CustomPainter {
  _RadialPainter({required this.fill, required this.color});

  final double fill;
  final Color color;

  static const _start = math.pi * 0.75; // 135°
  static const _sweep = math.pi * 1.5; // 270°

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 10;
    final rect = Rect.fromCircle(center: center, radius: radius);

    // Track
    canvas.drawArc(
      rect,
      _start,
      _sweep,
      false,
      Paint()
        ..color = AppColors.border.withValues(alpha: 0.5)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 8
        ..strokeCap = StrokeCap.round,
    );

    // Tick marks
    const ticks = 12;
    final tickPaint = Paint()
      ..color = AppColors.borderLight.withValues(alpha: 0.6)
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;
    for (var i = 0; i <= ticks; i++) {
      final a = _start + _sweep * (i / ticks);
      final outer = center + Offset(math.cos(a), math.sin(a)) * (radius - 14);
      final inner = center + Offset(math.cos(a), math.sin(a)) * (radius - 20);
      canvas.drawLine(inner, outer, tickPaint);
    }

    // Glow underlay for progress
    canvas.drawArc(
      rect,
      _start,
      _sweep * fill,
      false,
      Paint()
        ..color = color.withValues(alpha: 0.5)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 12
        ..strokeCap = StrokeCap.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );

    // Progress arc with gradient
    canvas.drawArc(
      rect,
      _start,
      _sweep * fill,
      false,
      Paint()
        ..shader = ui.Gradient.sweep(
          center,
          [AppColors.accent, color],
          null,
          TileMode.clamp,
          _start,
          _start + _sweep,
        )
        ..style = PaintingStyle.stroke
        ..strokeWidth = 8
        ..strokeCap = StrokeCap.round,
    );

    // Needle dot at the tip
    if (fill > 0.001) {
      final a = _start + _sweep * fill;
      final tip = center + Offset(math.cos(a), math.sin(a)) * radius;
      canvas.drawCircle(tip, 6, Paint()..color = color.withValues(alpha: 0.35));
      canvas.drawCircle(tip, 3.5, Paint()..color = Colors.white);
    }
  }

  @override
  bool shouldRepaint(covariant _RadialPainter old) =>
      old.fill != fill || old.color != color;
}

/// European-style circular speed-limit sign.
class SpeedLimitSign extends StatelessWidget {
  const SpeedLimitSign({
    super.key,
    required this.limit,
    this.fromRoad = false,
    this.size = 70,
  });

  final double limit;
  final bool fromRoad;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white,
            border: Border.all(color: AppColors.danger, width: size * 0.1),
            boxShadow: [
              BoxShadow(
                color: AppColors.danger.withValues(alpha: 0.35),
                blurRadius: 16,
              ),
            ],
          ),
          alignment: Alignment.center,
          child: Text(
            limit > 0 ? limit.round().toString() : '--',
            style: TextStyle(
              color: const Color(0xFF0A0F1C),
              fontSize: size * 0.42,
              fontWeight: FontWeight.w900,
              height: 1,
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          fromRoad ? 'GPS' : 'الحد',
          style: TextStyle(
            color: fromRoad ? AppColors.success : AppColors.textMuted,
            fontSize: 9,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }
}

/// Premium horizontal cockpit dashboard placed under the camera/map.
class CockpitBar extends StatelessWidget {
  const CockpitBar({
    super.key,
    required this.speed,
    required this.roadSpeed,
    required this.placeName,
    required this.modelStatus,
    this.heading,
    this.latencyMs,
    this.scanning = false,
    this.detectionCount = 0,
    this.localInference = false,
    this.nearestEvent,
    this.classMeta = const {},
    this.followingDistance,
    this.vibrationLevel,
    this.vibrationAvailable = true,
    this.compact = false,
  });

  final double? speed;
  final RoadSpeedResult roadSpeed;
  final String? placeName;
  final String modelStatus;
  final double? heading;
  final int? latencyMs;
  final bool scanning;
  final int detectionCount;
  final bool localInference;
  final NearbyEvent? nearestEvent;
  final Map<String, EventMeta> classMeta;
  final FollowingDistanceState? followingDistance;
  final int? vibrationLevel;
  final bool vibrationAvailable;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final hazard = nearestEvent;
    EventMeta? hazardMeta;
    if (hazard != null) hazardMeta = getEventMeta(hazard.eventType, classMeta);

    final now = TimeOfDay.now();
    final time =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    final gaugeSize = compact ? 108.0 : 132.0;
    final signSize = compact ? 58.0 : 70.0;

    return Container(
      padding: EdgeInsets.fromLTRB(14, compact ? 8 : 12, 14, compact ? 8 : 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF0C1322), Color(0xFF080C16)],
        ),
        border: Border(
          top: BorderSide(color: AppColors.accent.withValues(alpha: 0.22)),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.4),
            blurRadius: 20,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            RadialSpeedometer(
              speed: speed,
              limit: roadSpeed.limit,
              size: gaugeSize,
            ),
            const SizedBox(width: 12),
            SpeedLimitSign(
              limit: roadSpeed.limit,
              fromRoad: roadSpeed.fromRoad,
              size: signSize,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.place_rounded,
                          color: AppColors.accentBright, size: 15),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          placeName?.isNotEmpty == true
                              ? placeName!
                              : (roadSpeed.roadName?.isNotEmpty == true
                                  ? roadSpeed.roadName!
                                  : 'جاري تحديد الموقع...'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      Text(
                        time,
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          fontFeatures: [ui.FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _AiPill(
                        scanning: scanning,
                        latencyMs: latencyMs,
                        local: localInference,
                      ),
                      _chip(
                        Icons.center_focus_strong_rounded,
                        '$detectionCount كشف',
                        detectionCount > 0
                            ? AppColors.accentBright
                            : AppColors.textMuted,
                      ),
                      if (heading != null)
                        _chip(Icons.navigation_rounded, '${heading!.round()}°',
                            AppColors.info),
                      if (vibrationLevel != null && vibrationAvailable)
                        _chip(Icons.vibration_rounded, '$vibrationLevel%',
                            _vibColor(vibrationLevel!)),
                      if (followingDistance?.distanceM != null)
                        _chip(
                          Icons.social_distance_rounded,
                          '${followingDistance!.distanceM!.round()} م',
                          followingDistance!.tooClose
                              ? AppColors.danger
                              : AppColors.success,
                        ),
                    ],
                  ),
                  if (hazard != null && hazardMeta != null) ...[
                    const SizedBox(height: 8),
                    _hazardRow(hazard, hazardMeta),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color _vibColor(int level) {
    if (level >= 70) return AppColors.danger;
    if (level >= 40) return AppColors.warning;
    return AppColors.success;
  }

  Widget _hazardRow(NearbyEvent hazard, EventMeta meta) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            meta.color.withValues(alpha: 0.22),
            meta.color.withValues(alpha: 0.05),
          ],
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: meta.color.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Text(meta.icon, style: const TextStyle(fontSize: 15)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              meta.labelAr,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  color: meta.color, fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
          Text(
            formatDistanceKm(hazard.distanceKm),
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
          ),
        ],
      ),
    );
  }

  Widget _chip(IconData icon, String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
                color: color, fontSize: 10, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _AiPill extends StatefulWidget {
  const _AiPill({required this.scanning, this.latencyMs, this.local = false});

  final bool scanning;
  final int? latencyMs;
  final bool local;

  @override
  State<_AiPill> createState() => _AiPillState();
}

class _AiPillState extends State<_AiPill> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.scanning ? AppColors.accentBright : AppColors.textMuted;
    final label = widget.scanning
        ? (widget.local ? 'AI محلي' : 'AI سحابي')
        : (widget.latencyMs != null ? '${widget.latencyMs}ms' : 'AI');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [
          color.withValues(alpha: 0.22),
          AppColors.info.withValues(alpha: 0.12),
        ]),
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity: widget.scanning
                ? _c
                : const AlwaysStoppedAnimation(0.6),
            child: Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                boxShadow: [BoxShadow(color: color, blurRadius: 6)],
              ),
            ),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
                color: color, fontSize: 10, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

/// Floating glass header for the cockpit camera/map panels.
class CockpitTopBar extends StatelessWidget {
  const CockpitTopBar({
    super.key,
    required this.vehicleId,
    required this.online,
    required this.connectionLabel,
    required this.alertsCount,
    required this.onAlerts,
    required this.onLogout,
  });

  final String vehicleId;
  final bool online;
  final String connectionLabel;
  final int alertsCount;
  final VoidCallback onAlerts;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 14, sigmaY: 14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(14),
            border:
                Border.all(color: AppColors.accent.withValues(alpha: 0.25)),
          ),
          child: Row(
            children: [
              ShaderMask(
                shaderCallback: (r) => const LinearGradient(
                  colors: [AppColors.accentBright, AppColors.info],
                ).createShader(r),
                child: const Text(
                  'NURAI',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 15,
                    letterSpacing: 1.5,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Container(width: 1, height: 16, color: AppColors.borderLight),
              const SizedBox(width: 10),
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  color: online ? AppColors.success : AppColors.textMuted,
                  shape: BoxShape.circle,
                  boxShadow: online
                      ? [const BoxShadow(color: AppColors.success, blurRadius: 6)]
                      : null,
                ),
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  connectionLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: AppColors.textSecondary, fontSize: 11),
                ),
              ),
              const Spacer(),
              IconButton(
                onPressed: onAlerts,
                padding: EdgeInsets.zero,
                constraints:
                    const BoxConstraints(minWidth: 34, minHeight: 34),
                icon: Badge(
                  isLabelVisible: alertsCount > 0,
                  backgroundColor: AppColors.danger,
                  label: Text('$alertsCount',
                      style: const TextStyle(fontSize: 8)),
                  child: const Icon(Icons.notifications_rounded,
                      color: AppColors.textPrimary, size: 19),
                ),
              ),
              IconButton(
                onPressed: onLogout,
                padding: EdgeInsets.zero,
                constraints:
                    const BoxConstraints(minWidth: 34, minHeight: 34),
                icon: const Icon(Icons.logout_rounded,
                    color: AppColors.textMuted, size: 18),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Small circular glass action button for floating map/camera controls.
class CockpitIconButton extends StatelessWidget {
  const CockpitIconButton({
    super.key,
    required this.icon,
    required this.onTap,
    this.active = false,
    this.activeColor = AppColors.accentBright,
  });

  final IconData icon;
  final VoidCallback onTap;
  final bool active;
  final Color activeColor;

  @override
  Widget build(BuildContext context) {
    return ClipOval(
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Material(
          color: active
              ? activeColor.withValues(alpha: 0.25)
              : Colors.black.withValues(alpha: 0.4),
          shape: CircleBorder(
            side: BorderSide(
              color: active
                  ? activeColor
                  : AppColors.borderLight.withValues(alpha: 0.6),
            ),
          ),
          child: InkWell(
            onTap: onTap,
            customBorder: const CircleBorder(),
            child: SizedBox(
              width: 40,
              height: 40,
              child: Icon(icon,
                  size: 19,
                  color: active ? activeColor : AppColors.textPrimary),
            ),
          ),
        ),
      ),
    );
  }
}
