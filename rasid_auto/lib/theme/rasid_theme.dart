import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Night-drive safety palette — asphalt, amber road signs, emergency red.
class RasidColors {
  static const asphalt = Color(0xFF0B0F14);
  static const asphaltElevated = Color(0xFF141A22);
  static const asphaltCard = Color(0xFF1A222D);
  static const lane = Color(0xFF2A3544);
  static const amber = Color(0xFFF5B301);
  static const amberDim = Color(0xFFB88400);
  static const safety = Color(0xFF00C2A8);
  static const danger = Color(0xFFE53935);
  static const warning = Color(0xFFFF8A00);
  static const info = Color(0xFF3D9CF0);
  static const mist = Color(0xFFC5D0DC);
  static const mistDim = Color(0xFF8A96A5);
  static const white = Color(0xFFF7F9FC);
}

ThemeData buildRasidTheme() {
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: RasidColors.asphalt,
    colorScheme: const ColorScheme.dark(
      primary: RasidColors.amber,
      secondary: RasidColors.safety,
      surface: RasidColors.asphaltElevated,
      error: RasidColors.danger,
      onPrimary: Color(0xFF1A1400),
      onSecondary: Color(0xFF00241F),
      onSurface: RasidColors.white,
      onError: Colors.white,
    ),
  );

  final textTheme = GoogleFonts.cairoTextTheme(base.textTheme).apply(
    bodyColor: RasidColors.white,
    displayColor: RasidColors.white,
  );

  return base.copyWith(
    textTheme: textTheme,
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: GoogleFonts.cairo(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: RasidColors.white,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: RasidColors.asphaltElevated,
      indicatorColor: RasidColors.amber.withValues(alpha: 0.22),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return GoogleFonts.cairo(
          fontSize: 12,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          color: selected ? RasidColors.amber : RasidColors.mistDim,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          color: selected ? RasidColors.amber : RasidColors.mistDim,
          size: 22,
        );
      }),
    ),
    cardTheme: CardThemeData(
      color: RasidColors.asphaltCard,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: RasidColors.amber,
        foregroundColor: const Color(0xFF1A1400),
        textStyle: GoogleFonts.cairo(fontWeight: FontWeight.w700, fontSize: 15),
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: RasidColors.mist,
        side: const BorderSide(color: RasidColors.lane),
        textStyle: GoogleFonts.cairo(fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: RasidColors.asphaltCard,
      contentTextStyle: GoogleFonts.cairo(color: RasidColors.white),
      behavior: SnackBarBehavior.floating,
    ),
    dividerColor: RasidColors.lane,
  );
}
