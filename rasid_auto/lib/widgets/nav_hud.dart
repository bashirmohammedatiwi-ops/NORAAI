import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../core/services/drive_session.dart';
import '../theme/rasid_theme.dart';

/// Compact navigation banner: destination, distance, ETA, cancel.
class NavHud extends StatelessWidget {
  const NavHud({
    super.key,
    required this.session,
    this.compact = false,
  });

  final DriveSession session;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final t = session.navigationTarget;
    if (!session.navigating || t == null) return const SizedBox.shrink();

    final remM = session.remainingRouteMeters;
    final remLabel = remM >= 1000
        ? '${(remM / 1000).toStringAsFixed(1)} كم'
        : '${remM.round()} م';
    final speed = session.speedKmh > 8 ? session.speedKmh : 28.0;
    final etaMin = (remM / (speed / 3.6) / 60).ceil().clamp(1, 999);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 10 : 14,
        vertical: compact ? 8 : 12,
      ),
      decoration: BoxDecoration(
        color: const Color(0xE6121A28),
        borderRadius: BorderRadius.circular(compact ? 12 : 16),
        border: Border.all(color: const Color(0xFF1E88E5).withValues(alpha: 0.55)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: compact ? 36 : 42,
            height: compact ? 36 : 42,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF42A5F5), Color(0xFF1565C0)],
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.navigation_rounded, color: Colors.white),
          ),
          SizedBox(width: compact ? 8 : 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  t.nameAr,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.cairo(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: compact ? 13 : 14,
                  ),
                ),
                Text(
                  '$remLabel · ≈ $etaMin د',
                  style: GoogleFonts.cairo(
                    color: const Color(0xFF90CAF9),
                    fontWeight: FontWeight.w600,
                    fontSize: compact ? 11 : 12,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'إلغاء التوجيه',
            visualDensity: VisualDensity.compact,
            onPressed: session.clearNavigation,
            icon: const Icon(Icons.close_rounded, color: RasidColors.mistDim),
          ),
        ],
      ),
    );
  }
}
