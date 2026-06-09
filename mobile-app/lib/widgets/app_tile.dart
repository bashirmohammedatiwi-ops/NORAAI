import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class AppTile extends StatelessWidget {
  const AppTile({
    super.key,
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.color,
    this.onTap,
    this.badge,
    this.disabled = false,
    this.large = false,
  });

  final IconData icon;
  final String label;
  final String subtitle;
  final Color color;
  final VoidCallback? onTap;
  final bool disabled;
  final String? badge;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final inactive = disabled || onTap == null;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: inactive ? null : onTap,
        borderRadius: BorderRadius.circular(22),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: inactive
                  ? [AppColors.bgCard.withValues(alpha: 0.5), AppColors.bgElevated]
                  : [
                      color.withValues(alpha: 0.14),
                      AppColors.bgCard,
                    ],
            ),
            border: Border.all(
              color: inactive ? AppColors.border : color.withValues(alpha: 0.35),
            ),
            boxShadow: inactive
                ? null
                : [
                    BoxShadow(
                      color: color.withValues(alpha: 0.12),
                      blurRadius: 20,
                      offset: const Offset(0, 6),
                    ),
                  ],
          ),
          child: Padding(
            padding: EdgeInsets.all(large ? 20 : 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: large ? 52 : 44,
                      height: large ? 52 : 44,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            color.withValues(alpha: inactive ? 0.15 : 0.35),
                            color.withValues(alpha: inactive ? 0.08 : 0.15),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(
                        icon,
                        color: inactive ? color.withValues(alpha: 0.4) : color,
                        size: large ? 28 : 24,
                      ),
                    ),
                    const Spacer(),
                    if (badge != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.danger,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(color: AppColors.danger.withValues(alpha: 0.4), blurRadius: 8),
                          ],
                        ),
                        child: Text(
                          badge!,
                          style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                        ),
                      ),
                  ],
                ),
                const Spacer(),
                Text(
                  label,
                  style: TextStyle(
                    color: inactive ? AppColors.textMuted : AppColors.textPrimary,
                    fontSize: large ? 18 : 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, height: 1.3),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
