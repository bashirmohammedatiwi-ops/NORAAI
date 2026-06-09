import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Ambient mesh background for screens.
class NuraiBackground extends StatelessWidget {
  const NuraiBackground({super.key, required this.child, this.showOrbs = false});

  final Widget child;
  final bool showOrbs;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: AppColors.gradientMesh,
            ),
          ),
        ),
        if (showOrbs) ...[
          Positioned(
            top: -80,
            right: -60,
            child: _orb(AppColors.accent.withValues(alpha: 0.12), 220),
          ),
          Positioned(
            bottom: 120,
            left: -100,
            child: _orb(AppColors.info.withValues(alpha: 0.08), 260),
          ),
        ],
        child,
      ],
    );
  }

  Widget _orb(Color color, double size) {
    return ImageFiltered(
      imageFilter: ImageFilter.blur(sigmaX: 60, sigmaY: 60),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
    );
  }
}

/// Frosted glass surface card.
class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.borderRadius = 20,
    this.borderColor,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final double borderRadius;
  final Color? borderColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: Container(
          margin: margin,
          padding: padding,
          decoration: BoxDecoration(
            color: AppColors.bgGlass,
            borderRadius: BorderRadius.circular(borderRadius),
            border: Border.all(color: borderColor ?? AppColors.borderLight.withValues(alpha: 0.6)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 24,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: child,
        ),
      ),
    );

    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(onTap: onTap, borderRadius: BorderRadius.circular(borderRadius), child: card),
    );
  }
}
