import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class GpsStatusBanner extends StatelessWidget {
  const GpsStatusBanner({
    super.key,
    required this.searching,
    this.error,
    this.onRetry,
    this.topPadding = 8,
  });

  final bool searching;
  final String? error;
  final VoidCallback? onRetry;
  final double topPadding;

  @override
  Widget build(BuildContext context) {
    if (!searching && error == null) return const SizedBox.shrink();

    final isError = error != null;

    return Positioned(
      top: MediaQuery.of(context).padding.top + topPadding,
      left: 12,
      right: 12,
      child: Material(
        color: isError ? AppColors.danger : AppColors.bgElevated,
        elevation: 2,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              if (searching && !isError)
                const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent)),
              if (isError) const Icon(Icons.location_off_rounded, color: Colors.white, size: 16),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  error ?? 'جاري تحديد الموقع...',
                  style: TextStyle(color: isError ? Colors.white : AppColors.textPrimary, fontSize: 11),
                ),
              ),
              if (isError && onRetry != null)
                TextButton(
                  onPressed: onRetry,
                  child: const Text('إعادة', style: TextStyle(color: Colors.white, fontSize: 11)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
