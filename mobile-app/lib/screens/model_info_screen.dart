import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../theme/app_colors.dart';
import '../utils/event_meta.dart';
import '../utils/platform_support.dart';
import '../widgets/nurai_background.dart';
import '../widgets/nurai_header.dart';

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

        final topPad = MediaQuery.of(context).padding.top;

        return NuraiBackground(
          child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(20, topPad + 16, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const NuraiHeader(
                      title: 'معلومات الموديل',
                      subtitle: 'الكلاسات والإعدادات الحالية',
                    ),
                    const SizedBox(height: 16),
                    _statusCard(cfg?.modelReady == true, s.modelStatus),
                    const SizedBox(height: 8),
                    _connectionRow(s),
                    const SizedBox(height: 12),
                    if (s.usesLocalInference) ...[
                      _statusCard(s.localInferenceReady, s.localInferenceReady
                          ? 'ONNX محلي · جاهز (${s.lastLatencyMs ?? "—"}ms)'
                          : (s.localInferenceError ?? 'جاري تحميل ONNX...')),
                      const SizedBox(height: 8),
                    ],
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
                              backgroundColor: AppColors.accent,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          onPressed: s.syncConfig,
                          icon: const Icon(Icons.refresh),
                          style: IconButton.styleFrom(backgroundColor: AppColors.bgElevated),
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
        ),
        );
      },
    );
  }

  Widget _connectionRow(DriveSession s) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: s.online ? AppColors.bgCard.withValues(alpha: 0.8) : AppColors.danger.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: s.online ? AppColors.borderLight : AppColors.danger.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                s.online ? Icons.cloud_done : Icons.cloud_off,
                color: s.online ? AppColors.success : AppColors.danger,
                size: 18,
              ),
              const SizedBox(width: 8),
              Text(
                s.connectionLabel,
                style: TextStyle(
                  color: s.online ? AppColors.textPrimary : AppColors.danger,
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
              style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
            ),
          if (s.lastModelSync != null)
            Text(
              'آخر تحميل موديل: ${_formatTime(s.lastModelSync!)}',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
            ),
          if (s.syncingModel) ...[
            const SizedBox(height: 6),
            LinearProgressIndicator(
              value: s.modelSyncProgress > 0 ? s.modelSyncProgress : null,
              backgroundColor: AppColors.border,
              color: AppColors.accent,
            ),
            const SizedBox(height: 4),
            Text(
              s.modelSyncProgress > 0
                  ? 'تحميل الموديل ${(s.modelSyncProgress * 100).round()}%'
                  : 'جاري التحضير...',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
            ),
          ],
          if (s.modelSyncError != null && !s.syncingModel) ...[
            const SizedBox(height: 6),
            Text(
              s.modelSyncError!,
              style: const TextStyle(color: AppColors.danger, fontSize: 10),
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
        color: ready ? AppColors.success.withValues(alpha: 0.1) : AppColors.danger.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: ready ? AppColors.success.withValues(alpha: 0.4) : AppColors.danger.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(ready ? Icons.check_circle : Icons.error_outline,
              color: ready ? AppColors.success : AppColors.danger, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ready ? 'الموديل جاهز' : 'الموديل غير جاهز',
                  style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold),
                ),
                Text(status, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String text) {
    return Text(text, style: const TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold));
  }

  Widget _emptyBox(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.bgCard.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(text, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
    );
  }

  Widget _classRow(String name, Map<String, EventMeta> meta, {required bool active}) {
    final m = getEventMeta(name, meta);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.bgCard.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(14),
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
                Text(m.labelAr, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600)),
                Text(name, style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
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
            const Text('غير مفعّل', style: TextStyle(color: AppColors.textMuted, fontSize: 9)),
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
                color: AppColors.bgCard.withValues(alpha: 0.7),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(i.label, style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
                  const SizedBox(height: 2),
                  Text(
                    i.value,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
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
