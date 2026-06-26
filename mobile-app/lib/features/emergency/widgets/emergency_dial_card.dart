import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../services/emergency_service.dart';

class EmergencyDialCard extends StatelessWidget {
  const EmergencyDialCard({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(compact ? 14 : 18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.danger.withValues(alpha: 0.95),
            const Color(0xFFB91C1C),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: AppColors.danger.withValues(alpha: 0.35),
            blurRadius: compact ? 8 : 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Text(
            EmergencyService.display911,
            style: TextStyle(
              color: Colors.white,
              fontSize: compact ? 36 : 52,
              fontWeight: FontWeight.w900,
              letterSpacing: 2,
              height: 1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            compact ? 'طوارئ · 115 إسعاف · 104' : 'طوارئ — Emergency',
            style: TextStyle(
              color: Colors.white.withValues(alpha: compact ? 0.75 : 0.7),
              fontSize: compact ? 11 : 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (!compact) ...[
            const SizedBox(height: 6),
            const Text(
              'في العراق: اتصل 115 (إسعاف) · 104 (دفاع مدني)',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white60, fontSize: 11),
            ),
          ],
          SizedBox(height: compact ? 12 : 16),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => EmergencyService.dialAmbulance(),
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: AppColors.danger,
                    padding: EdgeInsets.symmetric(vertical: compact ? 10 : 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  icon: Icon(Icons.local_hospital_rounded, size: compact ? 18 : 22),
                  label: Text(
                    '115 إسعاف',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: compact ? 13 : 15),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => EmergencyService.dialCivilDefense(),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white54),
                    padding: EdgeInsets.symmetric(vertical: compact ? 10 : 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  icon: Icon(Icons.local_fire_department_rounded, size: compact ? 18 : 20),
                  label: Text('104', style: TextStyle(fontWeight: FontWeight.w700, fontSize: compact ? 13 : 14)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
