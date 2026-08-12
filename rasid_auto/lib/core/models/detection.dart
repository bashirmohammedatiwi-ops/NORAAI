import 'package:flutter/material.dart';

import '../../theme/rasid_theme.dart';

enum HazardKind {
  pothole,
  bump,
  accident,
  manhole,
  closed,
  barrier,
  speed,
  other,
}

HazardKind classifyHazard(String raw) {
  final n = raw.toLowerCase().replaceAll(' ', '_');
  if (n.contains('accident') ||
      n.contains('حادث') ||
      n.contains('severe') ||
      n.contains('moderate') ||
      n.contains('vehicle_damage')) {
    return HazardKind.accident;
  }
  if (n.contains('pothole') ||
      n.contains('حفر') ||
      n.contains('حفرة') ||
      n == 'd40' ||
      n.contains('d20')) {
    return HazardKind.pothole;
  }
  if (n.contains('speedbreaker') ||
      n.contains('bump') ||
      n.contains('مطب') ||
      n.contains('speed_bump')) {
    return HazardKind.bump;
  }
  if (n.contains('manhole')) return HazardKind.manhole;
  if (n.contains('closed') || n.contains('مغلق')) return HazardKind.closed;
  if (n.contains('barrier') || n.contains('construction')) {
    return HazardKind.barrier;
  }
  if (n.contains('speed') || n.contains('violation') || n.contains('مخالف')) {
    return HazardKind.speed;
  }
  return HazardKind.other;
}

String hazardLabelAr(String raw) {
  switch (classifyHazard(raw)) {
    case HazardKind.pothole:
      return 'حفرة';
    case HazardKind.bump:
      return 'مطب';
    case HazardKind.accident:
      return 'حادث';
    case HazardKind.manhole:
      return 'منهل';
    case HazardKind.closed:
      return 'طريق مغلق';
    case HazardKind.barrier:
      return 'حاجز';
    case HazardKind.speed:
      return 'تجاوز سرعة';
    case HazardKind.other:
      return raw;
  }
}

Color hazardColor(String raw) {
  switch (classifyHazard(raw)) {
    case HazardKind.accident:
      return RasidColors.danger;
    case HazardKind.pothole:
      return RasidColors.warning;
    case HazardKind.bump:
      return RasidColors.amber;
    case HazardKind.manhole:
      return RasidColors.info;
    case HazardKind.closed:
      return RasidColors.danger;
    case HazardKind.barrier:
      return const Color(0xFF9C6ADE);
    case HazardKind.speed:
      return RasidColors.amber;
    case HazardKind.other:
      return RasidColors.safety;
  }
}

IconData hazardIcon(String raw) {
  switch (classifyHazard(raw)) {
    case HazardKind.pothole:
      return Icons.warning_amber_rounded;
    case HazardKind.bump:
      return Icons.landscape_rounded;
    case HazardKind.accident:
      return Icons.car_crash_rounded;
    case HazardKind.manhole:
      return Icons.circle_outlined;
    case HazardKind.closed:
      return Icons.block_rounded;
    case HazardKind.barrier:
      return Icons.construction_rounded;
    case HazardKind.speed:
      return Icons.speed_rounded;
    case HazardKind.other:
      return Icons.info_outline_rounded;
  }
}

class SpeedViolationRules {
  const SpeedViolationRules({
    this.enabled = true,
    this.toleranceKmh = 3,
    this.graceSeconds = 5,
    this.cooldownSeconds = 60,
    this.fallbackLimitKmh = 40,
    this.fineAmountIqd = 200000,
  });

  final bool enabled;
  final double toleranceKmh;
  final double graceSeconds;
  final int cooldownSeconds;
  final double fallbackLimitKmh;
  final int fineAmountIqd;
}
