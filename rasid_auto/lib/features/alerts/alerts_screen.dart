import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../core/models/detection.dart';
import '../../core/services/drive_session.dart';
import '../../theme/rasid_theme.dart';

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key, required this.session});

  final DriveSession session;

  String _sourceLabel(String source) {
    return switch (source) {
      'server' => 'لوحة التحكم',
      'citizen' => 'تبليغ مواطن',
      'ai' => 'كشف كاميرا',
      'sensor' => 'حساس',
      'speed' => 'سرعة',
      _ => source,
    };
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('yyyy/MM/dd HH:mm');
    return Scaffold(
      appBar: AppBar(
        title: const Text('التنبيهات'),
        actions: [
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 4),
            child: Icon(
              session.online ? Icons.cloud_done_rounded : Icons.cloud_off_rounded,
              color: session.online ? RasidColors.safety : RasidColors.danger,
              size: 20,
            ),
          ),
          IconButton(
            tooltip: 'مزامنة مع السيرفر',
            onPressed: () => session.syncServerEvents(),
            icon: const Icon(Icons.sync_rounded),
          ),
        ],
      ),
      body: session.events.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'لا توجد تنبيهات بعد',
                    style: TextStyle(color: RasidColors.mistDim),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => session.syncServerEvents(),
                    icon: const Icon(Icons.sync_rounded),
                    label: const Text('تحديث من لوحة التحكم'),
                  ),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: session.syncServerEvents,
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                itemCount: session.events.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final e = session.events[i];
                  final c = hazardColor(e.kind);
                  final isLocal = e.source == 'speed' || e.source == 'sensor';
                  return Dismissible(
                    key: ValueKey(e.id),
                    background: Container(
                      alignment: Alignment.centerLeft,
                      padding: const EdgeInsets.only(left: 20),
                      color: RasidColors.danger,
                      child: const Icon(Icons.delete, color: Colors.white),
                    ),
                    onDismissed: isLocal ? (_) => session.deleteEvent(e.id) : null,
                    confirmDismiss: isLocal
                        ? null
                        : (_) async {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  'تنبيهات السيرفر تُدار من لوحة التحكم',
                                  style: GoogleFonts.cairo(),
                                ),
                              ),
                            );
                            return false;
                          },
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: RasidColors.asphaltCard,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: c.withValues(alpha: 0.35)),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: c.withValues(alpha: 0.18),
                            child: Icon(hazardIcon(e.kind), color: c),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  e.labelAr,
                                  style: GoogleFonts.cairo(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 15,
                                  ),
                                ),
                                Text(
                                  '${fmt.format(e.createdAt)} · '
                                  '${(e.confidence * 100).round()}% · '
                                  '${_sourceLabel(e.source)}',
                                  style: const TextStyle(
                                    color: RasidColors.mistDim,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (e.speedKmh != null)
                            Text(
                              '${e.speedKmh!.toStringAsFixed(0)} كم/س',
                              style: const TextStyle(color: RasidColors.amber),
                            ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
