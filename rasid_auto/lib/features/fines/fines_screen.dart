import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../core/models/road_event.dart';
import '../../core/services/drive_session.dart';
import '../../theme/rasid_theme.dart';

class FinesScreen extends StatelessWidget {
  const FinesScreen({super.key, required this.session});

  final DriveSession session;

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('yyyy/MM/dd HH:mm');
    final open = session.fines.where((f) => !f.resolved).length;
    return Scaffold(
      appBar: AppBar(
        title: const Text('مخالفات السرعة'),
        actions: [
          if (session.fines.isNotEmpty)
            TextButton(
              onPressed: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('مسح السجل؟'),
                    content: const Text('سيتم حذف كل المخالفات المحفوظة محلياً.'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('إلغاء'),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text('مسح'),
                      ),
                    ],
                  ),
                );
                if (ok == true) {
                  for (final f in [...session.fines]) {
                    await session.deleteFine(f.id);
                  }
                }
              },
              child: const Text('مسح'),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: RasidColors.asphaltCard,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                'مفتوحة: $open · الكل: ${session.fines.length}\n'
                'التسجيل محلي بالكامل — يمكنك التعديل أو الإغلاق يدوياً.',
                style: GoogleFonts.cairo(height: 1.4),
              ),
            ),
          ),
          Expanded(
            child: session.fines.isEmpty
                ? const Center(
                    child: Text(
                      'لا توجد مخالفات مسجّلة',
                      style: TextStyle(color: RasidColors.mistDim),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: session.fines.length,
                    itemBuilder: (context, i) {
                      final f = session.fines[i];
                      return _FineTile(
                        fine: f,
                        date: fmt.format(f.createdAt),
                        onEdit: () => _editFine(context, f),
                        onToggle: () async {
                          await session.updateFine(
                            f.copyWith(resolved: !f.resolved),
                          );
                        },
                        onDelete: () => session.deleteFine(f.id),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _editFine(BuildContext context, SpeedFine f) async {
    final speedCtrl =
        TextEditingController(text: f.speedKmh.toStringAsFixed(0));
    final limitCtrl =
        TextEditingController(text: f.limitKmh.toStringAsFixed(0));
    final noteCtrl = TextEditingController(text: f.note ?? '');
    var resolved = f.resolved;

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          backgroundColor: RasidColors.asphaltElevated,
          title: Text(
            'تحرير المخالفة',
            style: GoogleFonts.cairo(fontWeight: FontWeight.w800),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: speedCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'السرعة',
                          suffixText: 'كم/س',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: limitCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'الحد',
                          suffixText: 'كم/س',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: noteCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'ملاحظة',
                    hintText: 'سبب، ظرف، اعتراض…',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('مغلقة / تمت المعالجة'),
                  value: resolved,
                  onChanged: (v) => setLocal(() => resolved = v),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('حفظ'),
            ),
          ],
        ),
      ),
    );

    if (saved == true) {
      final speed = double.tryParse(speedCtrl.text) ?? f.speedKmh;
      final limit = double.tryParse(limitCtrl.text) ?? f.limitKmh;
      await session.updateFine(
        f.copyWith(
          speedKmh: speed.clamp(0, 300),
          limitKmh: limit.clamp(10, 200),
          note: noteCtrl.text.trim(),
          resolved: resolved,
        ),
      );
    }
  }
}

class _FineTile extends StatelessWidget {
  const _FineTile({
    required this.fine,
    required this.date,
    required this.onEdit,
    required this.onToggle,
    required this.onDelete,
  });

  final SpeedFine fine;
  final String date;
  final VoidCallback onEdit;
  final VoidCallback onToggle;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: RasidColors.asphaltCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: fine.resolved
              ? RasidColors.safety.withValues(alpha: 0.35)
              : RasidColors.amber.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                fine.resolved ? Icons.check_circle : Icons.speed_rounded,
                color: fine.resolved ? RasidColors.safety : RasidColors.amber,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${fine.speedKmh.toStringAsFixed(0)} / ${fine.limitKmh.toStringAsFixed(0)} كم/س · ${fine.amountIqd} د.ع',
                  style: GoogleFonts.cairo(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
              ),
              Text(
                '+${fine.excess.toStringAsFixed(0)}',
                style: const TextStyle(
                  color: RasidColors.danger,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(date, style: const TextStyle(color: RasidColors.mistDim, fontSize: 12)),
          if (fine.note != null && fine.note!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(fine.note!),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              TextButton(onPressed: onEdit, child: const Text('تحرير')),
              TextButton(
                onPressed: onToggle,
                child: Text(fine.resolved ? 'إعادة فتح' : 'إغلاق'),
              ),
              const Spacer(),
              IconButton(
                onPressed: onDelete,
                icon: const Icon(Icons.delete_outline, color: RasidColors.danger),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
