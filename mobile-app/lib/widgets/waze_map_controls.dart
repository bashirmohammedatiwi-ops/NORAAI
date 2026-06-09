import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../utils/map_styles.dart';

/// Waze-style floating map controls — light, rounded, minimal.
class WazeMapControls extends StatelessWidget {
  const WazeMapControls({
    super.key,
    required this.onZoomIn,
    required this.onZoomOut,
    required this.onLocate,
    required this.onToggleFollow,
    required this.onToggleHeading,
    required this.onCycleStyle,
    required this.followActive,
    required this.headingUp,
    required this.mapStyle,
    this.hasGps = true,
  });

  final VoidCallback onZoomIn;
  final VoidCallback onZoomOut;
  final VoidCallback onLocate;
  final VoidCallback onToggleFollow;
  final VoidCallback onToggleHeading;
  final VoidCallback onCycleStyle;
  final bool followActive;
  final bool headingUp;
  final MapStyle mapStyle;
  final bool hasGps;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _WazeFabGroup(
          children: [
            _WazeFab(icon: Icons.add_rounded, onTap: onZoomIn, tooltip: 'تكبير'),
            _WazeDivider(),
            _WazeFab(icon: Icons.remove_rounded, onTap: onZoomOut, tooltip: 'تصغير'),
          ],
        ),
        const SizedBox(height: 10),
        _WazeFab(
          icon: hasGps ? Icons.navigation_rounded : Icons.location_searching_rounded,
          onTap: onLocate,
          tooltip: 'موقعي',
          accent: hasGps,
        ),
        const SizedBox(height: 10),
        _WazeFab(
          icon: followActive ? Icons.gps_fixed_rounded : Icons.gps_not_fixed_rounded,
          onTap: onToggleFollow,
          tooltip: followActive ? 'تتبع مفعّل' : 'تتبع موقوف',
          active: followActive,
        ),
        const SizedBox(height: 10),
        _WazeFab(
          icon: headingUp ? Icons.explore_rounded : Icons.map_rounded,
          onTap: onToggleHeading,
          tooltip: headingUp ? 'اتجاه القيادة' : 'شمال للأعلى',
          active: headingUp,
        ),
        const SizedBox(height: 10),
        _WazeFab(
          icon: Icons.layers_rounded,
          onTap: onCycleStyle,
          tooltip: mapStyle.labelAr,
          label: mapStyle.labelAr,
        ),
      ],
    );
  }
}

class _WazeFabGroup extends StatelessWidget {
  const _WazeFabGroup({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.14),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: children),
    );
  }
}

class _WazeDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(height: 1, margin: const EdgeInsets.symmetric(horizontal: 10), color: const Color(0xFFE8ECF0));
  }
}

class _WazeFab extends StatelessWidget {
  const _WazeFab({
    required this.icon,
    required this.onTap,
    required this.tooltip,
    this.active = false,
    this.accent = false,
    this.label,
  });

  final IconData icon;
  final VoidCallback onTap;
  final String tooltip;
  final bool active;
  final bool accent;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final iconColor = active || accent ? AppColors.info : const Color(0xFF334155);
    final bg = active ? const Color(0xFFE8F4FF) : Colors.white;

    return Tooltip(
      message: tooltip,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(label != null ? 16 : 28),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(label != null ? 16 : 28),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: label != null ? 14 : 0,
              vertical: label != null ? 10 : 12,
            ),
            child: label != null
                ? Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(icon, color: iconColor, size: 20),
                      const SizedBox(width: 8),
                      Text(
                        label!,
                        style: TextStyle(color: iconColor, fontSize: 12, fontWeight: FontWeight.w700),
                      ),
                    ],
                  )
                : SizedBox(
                    width: 44,
                    height: 44,
                    child: Icon(icon, color: iconColor, size: 22),
                  ),
          ),
        ),
      ),
    );
  }
}

/// Speed limit badge — Waze-style white circle on the map.
class WazeSpeedLimitBadge extends StatelessWidget {
  const WazeSpeedLimitBadge({
    super.key,
    required this.limit,
    this.overLimit = false,
  });

  final double limit;
  final bool overLimit;

  @override
  Widget build(BuildContext context) {
    if (limit <= 0) return const SizedBox.shrink();

    final border = overLimit ? AppColors.danger : const Color(0xFFCBD5E1);

    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: border, width: overLimit ? 3 : 2.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 12,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: Text(
        '${limit.round()}',
        style: TextStyle(
          color: overLimit ? AppColors.danger : const Color(0xFF1E293B),
          fontSize: 20,
          fontWeight: FontWeight.w900,
          height: 1,
        ),
      ),
    );
  }
}
