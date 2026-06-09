import 'package:flutter/material.dart';

/// NURAI Drive design tokens.
abstract final class AppColors {
  static const bgDeep = Color(0xFF06080F);
  static const bgBase = Color(0xFF0A0F1C);
  static const bgElevated = Color(0xFF111827);
  static const bgCard = Color(0xFF151D2E);
  static const bgGlass = Color(0xCC111827);

  static const accent = Color(0xFF14B8A6);
  static const accentBright = Color(0xFF2DD4BF);
  static const accentDim = Color(0xFF0D9488);

  static const textPrimary = Color(0xFFF8FAFC);
  static const textSecondary = Color(0xFF94A3B8);
  static const textMuted = Color(0xFF64748B);

  static const border = Color(0xFF1E293B);
  static const borderLight = Color(0xFF334155);

  static const success = Color(0xFF22C55E);
  static const warning = Color(0xFFF59E0B);
  static const danger = Color(0xFFEF4444);
  static const info = Color(0xFF3B82F6);
  static const purple = Color(0xFF8B5CF6);
  static const orange = Color(0xFFF97316);

  static const gradientHero = [Color(0xFF0D4F4A), Color(0xFF0F766E), Color(0xFF14B8A6)];
  static const gradientMesh = [Color(0xFF0A0F1C), Color(0xFF0F172A), Color(0xFF0A1628)];

  static LinearGradient accentGradient({Alignment begin = Alignment.topLeft, Alignment end = Alignment.bottomRight}) {
    return LinearGradient(colors: gradientHero, begin: begin, end: end);
  }
}
