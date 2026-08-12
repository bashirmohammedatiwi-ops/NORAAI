import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/models/detection.dart';
import '../../core/models/detection_box.dart';
import '../../core/services/api_exception.dart';
import '../../core/services/drive_session.dart';
import '../../theme/rasid_theme.dart';

class ManualScanScreen extends StatefulWidget {
  const ManualScanScreen({super.key, required this.session});

  final DriveSession session;

  @override
  State<ManualScanScreen> createState() => _ManualScanScreenState();
}

class _ManualScanScreenState extends State<ManualScanScreen> {
  final _picker = ImagePicker();
  Uint8List? _preview;
  List<DetectionBox> _results = const [];
  bool _busy = false;
  String? _message;
  Color _messageColor = RasidColors.safety;

  DriveSession get session => widget.session;

  void _showFeedback(String text, {Color? color, bool snack = true}) {
    setState(() {
      _message = text;
      _messageColor = color ?? RasidColors.safety;
    });
    if (!snack || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text, style: GoogleFonts.cairo()),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 4),
      ),
    );
  }

  Future<void> _capture(CameraDevice device) async {
    final file = await _picker.pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: device,
      imageQuality: 85,
      maxWidth: 1280,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() {
      _preview = bytes;
      _results = const [];
      _message = null;
    });
    _showFeedback('تم التقاط الصورة — اضغط «مسح وإرسال»', snack: false);
  }

  Future<void> _scan() async {
    if (_preview == null || _busy) return;
    if (session.api == null) {
      _showFeedback('غير متصل بالسيرفر — تحقق من الشبكة ثم أعد فتح التطبيق', color: RasidColors.danger);
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    _showFeedback('جاري المسح عبر Rasid Cloud… قد يستغرق حتى 90 ثانية', snack: false);
    try {
      final result = await session.submitCitizenScan(_preview!);
      if (!mounted) return;
      final serverMsg = result.message?.trim();
      if (serverMsg != null && serverMsg.isNotEmpty) {
        _showFeedback(serverMsg, color: RasidColors.amber);
      } else if (result.eventsCreated > 0) {
        _showFeedback(
          'تم الإرسال — ${result.eventsCreated} بلاغ · ${result.boxes.length} كشف',
          color: RasidColors.info,
        );
      } else if (result.boxes.isEmpty) {
        _showFeedback('لم يُكتشف شيء — جرّب زاوية أوضح أو تقرّب من العيب', color: RasidColors.amber);
      } else {
        _showFeedback('تم المسح — ${result.boxes.length} كشف (بدون بلاغ جديد)', color: RasidColors.info);
      }
      setState(() => _results = result.boxes);
    } on ApiException catch (e) {
      if (!mounted) return;
      _showFeedback(e.displayMessage, color: RasidColors.danger);
    } catch (e) {
      if (!mounted) return;
      _showFeedback(ApiException.fromError(e).displayMessage, color: RasidColors.danger);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final connected = session.api != null;
    return Scaffold(
      backgroundColor: RasidColors.asphalt,
      appBar: AppBar(
        title: const Text('تبليغ يدوي'),
        backgroundColor: RasidColors.asphalt,
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth > 700;
          final preview = _previewSection();
          final panel = _controlPanel(connected);
          return SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              wide ? 20 : 14,
              14,
              wide ? 20 : 14,
              14 + MediaQuery.viewInsetsOf(context).bottom,
            ),
            child: wide
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(flex: 3, child: preview),
                      const SizedBox(width: 16),
                      Expanded(flex: 2, child: panel),
                    ],
                  )
                : Column(
                    children: [
                      preview,
                      const SizedBox(height: 14),
                      panel,
                    ],
                  ),
          );
        },
      ),
    );
  }

  Widget _previewSection() {
    return AspectRatio(
      aspectRatio: 3 / 4,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: RasidColors.lane),
        ),
        clipBehavior: Clip.antiAlias,
        child: _preview == null
            ? Center(
                child: Text(
                  'التقط صورة للشارع',
                  style: GoogleFonts.cairo(color: RasidColors.mistDim),
                ),
              )
            : Stack(
                fit: StackFit.expand,
                children: [
                  Image.memory(_preview!, fit: BoxFit.contain),
                  if (_results.isNotEmpty)
                    CustomPaint(
                      painter: _ScanBoxPainter(boxes: _results),
                      child: const SizedBox.expand(),
                    ),
                  if (_busy)
                    Container(
                      color: Colors.black54,
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const CircularProgressIndicator(color: RasidColors.safety),
                            const SizedBox(height: 12),
                            Text(
                              'جاري التحليل…',
                              style: GoogleFonts.cairo(color: Colors.white),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
      ),
    );
  }

  Widget _controlPanel(bool connected) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!connected)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: RasidColors.danger.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: RasidColors.danger.withValues(alpha: 0.4)),
            ),
            child: Text(
              'غير متصل بالسيرفر — لن يعمل المسح حتى يظهر «متصل» في الإعدادات',
              style: GoogleFonts.cairo(color: RasidColors.danger, fontSize: 13),
            ),
          ),
        Text(
          'التقط صورة · المسح · يصل للخريطة ولوحة التحكم',
          style: GoogleFonts.cairo(color: RasidColors.mistDim, fontSize: 13),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: _busy ? null : () => _capture(CameraDevice.rear),
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('كاميرا خلفية'),
            ),
            OutlinedButton.icon(
              onPressed: _busy ? null : () => _capture(CameraDevice.front),
              icon: const Icon(Icons.camera_front_outlined),
              label: const Text('كاميرا أمامية'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: _busy || _preview == null || !connected ? null : _scan,
          style: FilledButton.styleFrom(backgroundColor: RasidColors.safety),
          icon: _busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Icon(Icons.document_scanner_outlined),
          label: Text(_busy ? 'جاري المسح…' : 'مسح وإرسال'),
        ),
        if (_message != null) ...[
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: _messageColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _messageColor.withValues(alpha: 0.35)),
            ),
            child: Text(
              _message!,
              style: GoogleFonts.cairo(color: _messageColor, fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
        ],
        if (_results.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('النتائج', style: GoogleFonts.cairo(fontWeight: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 8),
          ..._results.map(
            (d) => ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text(d.className, style: GoogleFonts.cairo(fontWeight: FontWeight.w700)),
              subtitle: Text('${(d.confidence * 100).toStringAsFixed(0)}%'),
              leading: Icon(Icons.check_circle, color: hazardColor(d.className)),
            ),
          ),
        ],
      ],
    );
  }
}

class _ScanBoxPainter extends CustomPainter {
  _ScanBoxPainter({required this.boxes});

  final List<DetectionBox> boxes;

  @override
  void paint(Canvas canvas, Size size) {
    for (final box in boxes) {
      if (box.bbox.length < 4) continue;
      final maxVal = box.bbox.reduce((a, b) => a > b ? a : b);
      late Rect rect;
      if (maxVal <= 1.0) {
        rect = Rect.fromLTRB(
          box.bbox[0] * size.width,
          box.bbox[1] * size.height,
          box.bbox[2] * size.width,
          box.bbox[3] * size.height,
        );
      } else {
        const refW = 1280.0;
        const refH = 960.0;
        rect = Rect.fromLTRB(
          box.bbox[0] * size.width / refW,
          box.bbox[1] * size.height / refH,
          box.bbox[2] * size.width / refW,
          box.bbox[3] * size.height / refH,
        );
      }
      final color = hazardColor(box.className);
      canvas.drawRect(rect, Paint()..color = color.withValues(alpha: 0.2));
      canvas.drawRect(
        rect,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ScanBoxPainter old) => old.boxes != boxes;
}
