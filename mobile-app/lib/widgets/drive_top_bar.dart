import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class DriveTopBar extends StatelessWidget {
  const DriveTopBar({
    super.key,
    required this.vehicleId,
    required this.online,
    required this.eventsCount,
    required this.alertsCount,
    required this.onAlerts,
    required this.onLocate,
    required this.onLogout,
    this.onToggleFollow,
    this.followMode = true,
  });

  final String vehicleId;
  final bool online;
  final int eventsCount;
  final int alertsCount;
  final VoidCallback onAlerts;
  final VoidCallback onLocate;
  final VoidCallback onLogout;
  final VoidCallback? onToggleFollow;
  final bool followMode;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return Positioned(
      top: top + 6,
      left: 10,
      right: 10,
      child: Material(
        color: AppColors.bgElevated.withValues(alpha: 0.94),
        elevation: 2,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(
            children: [
              const Text('NURAI', style: TextStyle(color: AppColors.accentBright, fontWeight: FontWeight.w900, fontSize: 12)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(vehicleId, style: const TextStyle(color: AppColors.textMuted, fontSize: 10), overflow: TextOverflow.ellipsis),
              ),
              _dot(online),
              const SizedBox(width: 6),
              Text('$eventsCount', style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
              IconButton(
                onPressed: onAlerts,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                icon: Badge(
                  isLabelVisible: alertsCount > 0,
                  backgroundColor: AppColors.danger,
                  label: Text('$alertsCount', style: const TextStyle(fontSize: 8)),
                  child: const Icon(Icons.notifications_outlined, color: AppColors.textPrimary, size: 18),
                ),
              ),
              if (onToggleFollow != null)
                IconButton(
                  onPressed: onToggleFollow,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                  icon: Icon(
                    followMode ? Icons.my_location : Icons.location_searching,
                    color: followMode ? AppColors.accent : AppColors.textMuted,
                    size: 18,
                  ),
                ),
              IconButton(
                onPressed: onLocate,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                icon: const Icon(Icons.gps_fixed, color: AppColors.accentBright, size: 18),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _dot(bool online) {
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(color: online ? AppColors.success : AppColors.textMuted, shape: BoxShape.circle),
    );
  }
}
