import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../theme/app_colors.dart';

class ConnectionBanner extends StatelessWidget {
  const ConnectionBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: DriveSessionScope.of(context),
      builder: (context, _) {
        final s = DriveSessionScope.of(context);

        if (s.modelSyncError != null && s.online) {
          return _box(
            color: AppColors.warning.withValues(alpha: 0.12),
            border: AppColors.warning.withValues(alpha: 0.35),
            child: Row(
              children: [
                const Icon(Icons.warning_amber_rounded, color: AppColors.warning, size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(s.modelSyncError!, style: const TextStyle(color: Color(0xFFFDE68A), fontSize: 11)),
                ),
                TextButton(
                  onPressed: s.syncModelNow,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.textPrimary,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('إعادة', style: TextStyle(fontSize: 11)),
                ),
              ],
            ),
          );
        }

        if (s.syncPhase == SyncPhase.syncingModel && s.modelSyncProgress > 0) {
          return _box(
            color: AppColors.accent.withValues(alpha: 0.15),
            border: AppColors.accent.withValues(alpha: 0.35),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'تحميل الموديل ${(s.modelSyncProgress * 100).round()}%',
                  style: const TextStyle(color: AppColors.accentBright, fontSize: 11, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                LinearProgressIndicator(
                  value: s.modelSyncProgress,
                  backgroundColor: AppColors.bgDeep.withValues(alpha: 0.5),
                  color: AppColors.accentBright,
                  borderRadius: BorderRadius.circular(4),
                ),
              ],
            ),
          );
        }

        if (s.syncPhase == SyncPhase.syncingConfig || s.syncingModel) {
          return _box(
            color: AppColors.accent.withValues(alpha: 0.15),
            border: AppColors.accent.withValues(alpha: 0.35),
            child: const Row(
              children: [
                SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accentBright)),
                SizedBox(width: 8),
                Text('جاري المزامنة مع السيرفر...', style: TextStyle(color: AppColors.accentBright, fontSize: 11)),
              ],
            ),
          );
        }

        if (!s.online && s.connectionError != null) {
          return _box(
            color: AppColors.danger.withValues(alpha: 0.85),
            child: Row(
              children: [
                const Icon(Icons.cloud_off_rounded, color: Colors.white, size: 16),
                const SizedBox(width: 8),
                Expanded(child: Text(s.connectionError!, style: const TextStyle(color: Colors.white, fontSize: 11))),
                TextButton(
                  onPressed: s.syncAll,
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('إعادة', style: TextStyle(fontSize: 11)),
                ),
              ],
            ),
          );
        }

        if (s.online && s.serverCfg?.modelReady == true) {
          return _box(
            color: AppColors.info.withValues(alpha: 0.1),
            border: AppColors.info.withValues(alpha: 0.35),
            child: Row(
              children: [
                Icon(kIsWeb ? Icons.language_rounded : Icons.cloud_rounded, color: AppColors.info, size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    kIsWeb
                        ? 'وضع المتصفح — الاكتشاف عبر السيرفر'
                        : 'متصل — الاكتشاف عبر السيرفر (${s.serverCfg?.modelName ?? "AI"})',
                    style: const TextStyle(color: Color(0xFFBFDBFE), fontSize: 11),
                  ),
                ),
              ],
            ),
          );
        }

        if (s.online && s.lastSyncText != null) {
          return _box(
            color: AppColors.success.withValues(alpha: 0.1),
            border: AppColors.success.withValues(alpha: 0.35),
            child: Row(
              children: [
                const Icon(Icons.cloud_done_rounded, color: AppColors.success, size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'متصل · آخر مزامنة ${s.lastSyncText}',
                    style: const TextStyle(color: Color(0xFFBBF7D0), fontSize: 11),
                  ),
                ),
                if (s.serverCfg?.modelReady != true)
                  const Text('الموديل غير جاهز', style: TextStyle(color: Color(0xFFFDE68A), fontSize: 10)),
              ],
            ),
          );
        }

        return const SizedBox.shrink();
      },
    );
  }

  Widget _box({required Color color, required Widget child, Color? border}) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(14),
        border: border != null ? Border.all(color: border) : null,
      ),
      child: child,
    );
  }
}
