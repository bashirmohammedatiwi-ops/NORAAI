import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/models/detection.dart';
import '../../core/models/detection_box.dart';
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
  }

  Future<void> _scan() async {
    if (_preview == null || _busy) return;
    setState(() {
      _busy = true;
      _message = 'جاري المسح عبر Rasid Cloud…';
    });
    try {
      final result = await widget.session.submitCitizenScan(_preview!);
      if (!mounted) return;
      setState(() {
        _results = result.boxes;
        _message = result.eventsCreated > 0
            ? 'تم — ${result.eventsCreated} بلاغ · ${result.boxes.length} كشف'
            : (result.boxes.isEmpty ? 'لم يُكتشف شيء — جرّب زاوية أوضح' : 'تم المسح — ${result.boxes.length} كشف');
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _message = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
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
          final panel = _controlPanel();
          return Padding(
            padding: EdgeInsets.all(wide ? 20 : 14),
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
                      Expanded(child: panel),
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
                ],
              ),
      ),
    );
  }

  Widget _controlPanel() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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
          onPressed: _busy || _preview == null ? null : _scan,
          style: FilledButton.styleFrom(backgroundColor: RasidColors.safety),
          icon: _busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Icon(Icons.document_scanner_outlined),
          label: const Text('مسح وإرسال'),
        ),
        if (_message != null) ...[
          const SizedBox(height: 12),
          Text(_message!, style: GoogleFonts.cairo(color: RasidColors.safety, fontSize: 13)),
        ],
        const SizedBox(height: 12),
        Expanded(
          child: ListView(
            children: _results
                .map(
                  (d) => ListTile(
                    dense: true,
                    title: Text(d.className, style: GoogleFonts.cairo(fontWeight: FontWeight.w700)),
                    subtitle: Text('${(d.confidence * 100).toStringAsFixed(0)}%'),
                    leading: Icon(Icons.check_circle, color: hazardColor(d.className)),
                  ),
                )
                .toList(),
          ),
        ),
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

