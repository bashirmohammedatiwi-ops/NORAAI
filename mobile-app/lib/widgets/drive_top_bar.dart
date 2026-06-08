import 'package:flutter/material.dart';

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
      left: 12,
      right: 12,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0xE60F172A),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFF334155)),
        ),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: const Color(0xFF0D9488),
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: const Text(
                'N',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'NURAI Drive',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    vehicleId,
                    style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 10),
                  ),
                ],
              ),
            ),
            _pill(
              online ? 'متصل' : 'غير متصل',
              online ? const Color(0xFF22C55E) : const Color(0xFF64748B),
            ),
            const SizedBox(width: 4),
            _pill('$eventsCount حدث', const Color(0xFF0D9488)),
            IconButton(
              onPressed: onAlerts,
              icon: Badge(
                isLabelVisible: alertsCount > 0,
                label: Text('$alertsCount'),
                child: const Icon(Icons.notifications_outlined, color: Colors.white, size: 20),
              ),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
            ),
            if (onToggleFollow != null)
              IconButton(
                onPressed: onToggleFollow,
                icon: Icon(
                  followMode ? Icons.my_location : Icons.location_searching,
                  color: followMode ? const Color(0xFF2DD4BF) : const Color(0xFF94A3B8),
                  size: 20,
                ),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
              ),
            IconButton(
              onPressed: onLocate,
              icon: const Icon(Icons.gps_fixed, color: Color(0xFF2DD4BF), size: 20),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
            ),
            IconButton(
              onPressed: onLogout,
              icon: const Icon(Icons.logout, color: Color(0xFFF87171), size: 20),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
            ),
          ],
        ),
      ),
    );
  }

  Widget _pill(String text, Color color) {
    return Container(
      margin: const EdgeInsets.only(left: 4),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        text,
        style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w600),
      ),
    );
  }
}
