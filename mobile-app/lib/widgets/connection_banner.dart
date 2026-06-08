import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';

class ConnectionBanner extends StatelessWidget {
  const ConnectionBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: DriveSessionScope.of(context),
      builder: (context, _) {
        final s = DriveSessionScope.of(context);

        if (s.syncPhase == SyncPhase.syncingModel && s.modelSyncProgress > 0) {
          return _box(
            color: const Color(0xFF0D9488),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'تحميل الموديل ${(s.modelSyncProgress * 100).round()}%',
                  style: const TextStyle(color: Colors.white, fontSize: 11),
                ),
                const SizedBox(height: 4),
                LinearProgressIndicator(
                  value: s.modelSyncProgress,
                  backgroundColor: const Color(0x33000000),
                  color: Colors.white,
                ),
              ],
            ),
          );
        }

        if (s.syncPhase == SyncPhase.syncingConfig || s.syncingModel) {
          return _box(
            color: const Color(0xFF0D9488),
            child: const Row(
              children: [
                SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                ),
                SizedBox(width: 8),
                Text('جاري المزامنة مع السيرفر...', style: TextStyle(color: Colors.white, fontSize: 11)),
              ],
            ),
          );
        }

        if (!s.online && s.connectionError != null) {
          return _box(
            color: const Color(0xE6DC2626),
            child: Row(
              children: [
                const Icon(Icons.cloud_off, color: Colors.white, size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    s.connectionError!,
                    style: const TextStyle(color: Colors.white, fontSize: 11),
                  ),
                ),
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

        if (kIsWeb && s.online) {
          return _box(
            color: const Color(0x332563EB),
            border: const Color(0x663B82F6),
            child: const Row(
              children: [
                Icon(Icons.language, color: Color(0xFF93C5FD), size: 16),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'وضع المتصفح — الاكتشاف عبر السيرفر (بدون تحميل ONNX)',
                    style: TextStyle(color: Color(0xFFBFDBFE), fontSize: 11),
                  ),
                ),
              ],
            ),
          );
        }

        if (s.online && s.lastSyncText != null) {
          return _box(
            color: const Color(0x3322C55E),
            border: const Color(0x6622C55E),
            child: Row(
              children: [
                const Icon(Icons.cloud_done, color: Color(0xFF22C55E), size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'متصل · آخر مزامنة ${s.lastSyncText}',
                    style: const TextStyle(color: Color(0xFFBBF7D0), fontSize: 11),
                  ),
                ),
                if (s.serverCfg?.modelReady != true)
                  const Text(
                    'الموديل غير جاهز',
                    style: TextStyle(color: Color(0xFFFDE68A), fontSize: 10),
                  ),
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
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(10),
        border: border != null ? Border.all(color: border) : null,
      ),
      child: child,
    );
  }
}
