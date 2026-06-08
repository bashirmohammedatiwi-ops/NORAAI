import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../utils/event_meta.dart';
import '../utils/platform_support.dart';

class ModelInfoScreen extends StatelessWidget {
  const ModelInfoScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: DriveSessionScope.of(context),
      builder: (context, _) {
        final s = DriveSessionScope.of(context);
        final cfg = s.serverCfg;
        final classes = cfg?.classes ?? [];
        final modelClasses = cfg?.modelClasses ?? [];

        return CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(16, MediaQuery.of(context).padding.top + 8, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'معلومات الموديل',
                      style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'الكلاسات والإعدادات الحالية',
                      style: TextStyle(color: Color(0xFF64748B), fontSize: 12),
                    ),
                    const SizedBox(height: 16),
                    _statusCard(cfg?.modelReady == true, s.modelStatus),
                    const SizedBox(height: 8),
                    _connectionRow(s),
                    const SizedBox(height: 12),
                    _infoGrid([
                      _InfoItem('اسم الموديل', cfg?.modelName ?? '—'),
                      _InfoItem('الإصدار', cfg?.modelVersion ?? '—'),
                      _InfoItem('وضع الاكتشاف', inferenceModeLabel(cfg?.inferenceMode)),
                      _InfoItem('حد الثقة', '${((cfg?.minConfidence ?? 0.45) * 100).round()}%'),
                      _InfoItem('FPS المسح', '${cfg?.scanFps ?? 12}'),
                      _InfoItem('SHA256', _short(cfg?.modelSha256)),
                    ]),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: s.syncingModel ? null : () => s.syncModelNow(),
                            icon: s.syncingModel
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                  )
                                : const Icon(Icons.sync),
                            label: Text(s.syncingModel ? 'جاري المزامنة...' : 'مزامنة الموديل'),
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF0D9488),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          onPressed: s.syncConfig,
                          icon: const Icon(Icons.refresh),
                          style: IconButton.styleFrom(backgroundColor: const Color(0xFF334155)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    _sectionTitle('كلاسات الاكتشاف (${classes.length})'),
                    const SizedBox(height: 8),
                    if (classes.isEmpty)
                      _emptyBox('لا توجد كلاسات — أضفها من لوحة التحكم')
                    else
                      ...classes.map((name) => _classRow(name, s.classMeta, active: true)),
                    const SizedBox(height: 16),
                    _sectionTitle('كلاسات الموديل (${modelClasses.length})'),
                    const SizedBox(height: 8),
                    if (modelClasses.isEmpty)
                      _emptyBox('لم يُحمَّل الموديل بعد')
                    else
                      ...modelClasses.map((name) {
                        final active = classes.any(
                          (c) => c.toLowerCase() == name.toLowerCase(),
                        );
                        return _classRow(name, s.classMeta, active: active);
                      }),
                    const SizedBox(height: 16),
                    _sectionTitle('إعدادات السرعة'),
                    const SizedBox(height: 8),
                    _infoGrid([
                      _InfoItem('مفعّل', cfg?.speedViolation.enabled == true ? 'نعم' : 'لا'),
                      _InfoItem('سماحية', '${cfg?.speedViolation.toleranceKmh.round() ?? 5} كم/س'),
                      _InfoItem('مدة التجاوز', '${cfg?.speedViolation.graceSeconds.round() ?? 3} ث'),
                      _InfoItem('الاحتياطي', '${s.config.speedLimit.round()} كم/س'),
                    ]),
                    const SizedBox(height: 100),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _connectionRow(DriveSession s) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: s.online ? const Color(0xFF1E293B) : const Color(0x33EF4444),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: s.online ? const Color(0xFF334155) : const Color(0x66EF4444)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                s.online ? Icons.cloud_done : Icons.cloud_off,
                color: s.online ? const Color(0xFF22C55E) : const Color(0xFFF87171),
                size: 18,
              ),
              const SizedBox(width: 8),
              Text(
                s.connectionLabel,
                style: TextStyle(
                  color: s.online ? Colors.white : const Color(0xFFF87171),
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
              const Spacer(),
              if (!s.online)
                TextButton(
                  onPressed: s.syncAll,
                  child: const Text('إعادة الاتصال', style: TextStyle(fontSize: 11)),
                ),
            ],
          ),
          if (s.lastConfigSync != null)
            Text(
              'آخر مزامنة إعدادات: ${_formatTime(s.lastConfigSync!)}',
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
            ),
          if (s.lastModelSync != null)
            Text(
              'آخر تحميل موديل: ${_formatTime(s.lastModelSync!)}',
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
            ),
          if (s.syncingModel && s.modelSyncProgress > 0) ...[
            const SizedBox(height: 6),
            LinearProgressIndicator(
              value: s.modelSyncProgress,
              backgroundColor: const Color(0xFF334155),
              color: const Color(0xFF0D9488),
            ),
          ],
        ],
      ),
    );
  }

  String _formatTime(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inSeconds < 60) return 'منذ ${diff.inSeconds} ثانية';
    if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} دقيقة';
    return 'منذ ${diff.inHours} ساعة';
  }

  String _short(String? sha) {
    if (sha == null || sha.isEmpty) return '—';
    if (sha.length <= 16) return sha;
    return '${sha.substring(0, 8)}…${sha.substring(sha.length - 6)}';
  }

  Widget _statusCard(bool ready, String status) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ready ? const Color(0x3322C55E) : const Color(0x33EF4444),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ready ? const Color(0xFF22C55E) : const Color(0xFFEF4444)),
      ),
      child: Row(
        children: [
          Icon(ready ? Icons.check_circle : Icons.error_outline,
              color: ready ? const Color(0xFF22C55E) : const Color(0xFFEF4444), size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ready ? 'الموديل جاهز' : 'الموديل غير جاهز',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                ),
                Text(status, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String text) {
    return Text(text, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold));
  }

  Widget _emptyBox(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(text, style: const TextStyle(color: Color(0xFF64748B), fontSize: 12)),
    );
  }

  Widget _classRow(String name, Map<String, EventMeta> meta, {required bool active}) {
    final m = getEventMeta(name, meta);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: m.color.withValues(alpha: active ? 0.6 : 0.2)),
      ),
      child: Row(
        children: [
          Text(m.icon, style: const TextStyle(fontSize: 20)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(m.labelAr, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                Text(name, style: const TextStyle(color: Color(0xFF64748B), fontSize: 10)),
              ],
            ),
          ),
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(color: m.color, shape: BoxShape.circle),
          ),
          if (!active) ...[
            const SizedBox(width: 8),
            const Text('غير مفعّل', style: TextStyle(color: Color(0xFF64748B), fontSize: 9)),
          ],
        ],
      ),
    );
  }

  Widget _infoGrid(List<_InfoItem> items) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: items
          .map(
            (i) => Container(
              width: 160,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(i.label, style: const TextStyle(color: Color(0xFF64748B), fontSize: 10)),
                  const SizedBox(height: 2),
                  Text(
                    i.value,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          )
          .toList(),
    );
  }
}

class _InfoItem {
  const _InfoItem(this.label, this.value);
  final String label;
  final String value;
}
