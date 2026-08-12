import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/services/drive_session.dart';
import '../../theme/rasid_theme.dart';
import '../../widgets/nav_hud.dart';
import '../../widgets/rasid_map.dart';
import '../../widgets/speed_display.dart';
import '../../widgets/speed_gauge.dart';
import 'detection_overlay.dart';

class DriveScreen extends StatelessWidget {
  const DriveScreen({super.key, required this.session});

  final DriveSession session;

  @override
  Widget build(BuildContext context) {
    final landscape =
        MediaQuery.orientationOf(context) == Orientation.landscape;
    return Scaffold(
      backgroundColor: RasidColors.asphalt,
      body: landscape ? _landscape(context) : _portrait(context),
    );
  }

  Widget _cameraStack(BuildContext context, {required bool expanded}) {
    final cam = session.camera;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (cam != null && cam.value.isInitialized)
          FittedBox(
            fit: BoxFit.cover,
            child: SizedBox(
              width: cam.value.previewSize?.height ?? 1280,
              height: cam.value.previewSize?.width ?? 720,
              child: CameraPreview(cam),
            ),
          )
        else
          const ColoredBox(
            color: RasidColors.asphalt,
            child: Center(
              child: Text(
                'الكاميرا غير متاحة',
                style: TextStyle(color: RasidColors.mistDim),
              ),
            ),
          ),
        DetectionOverlay(
          tracks: session.tracked,
          cloudBoxes: session.cloudBoxes,
          referenceWidth: session.previewWidth > 0 ? session.previewWidth : 1280,
          referenceHeight: session.previewHeight > 0 ? session.previewHeight : 720,
          maskBytes: session.liveMask,
          maskWidth: session.liveMaskWidth,
          maskHeight: session.liveMaskHeight,
          debugMode: session.debugMode,
          cameraFps: session.cameraFps,
          inferenceFps: session.pipelineFps,
          preprocessMs: session.preprocessMs,
          inferenceMs: session.inferenceMs,
          postprocessMs: session.postprocessMs,
          totalLatencyMs: session.totalLatencyMs,
          accelPeak: session.accel.latest.verticalPeak,
          gyroShake: session.gyro.latest.shakeScore,
          droppedBusy: 0,
          droppedSkip: 0,
        ),
        Positioned(
          top: MediaQuery.paddingOf(context).top + 8,
          left: 12,
          right: 12,
          child: Row(
            children: [
              _Pill(
                text: session.detecting
                    ? 'Cloud · ${session.lastLatencyMs}ms'
                    : 'الكشف متوقف',
                color: session.detecting
                    ? RasidColors.safety
                    : RasidColors.mistDim,
              ),
              const Spacer(),
              _Pill(
                text: '${session.speedKmh.toStringAsFixed(0)} / ${session.limitKmh.toStringAsFixed(0)}',
                color: session.speedKmh > session.limitKmh
                    ? RasidColors.danger
                    : RasidColors.amber,
              ),
            ],
          ),
        ),
        if (session.lastAlert != null)
          Positioned(
            left: 12,
            right: expanded ? 12 : 12,
            bottom: 12,
            child: _AlertBanner(
              title: session.lastAlert!.labelAr,
              conf: session.lastAlert!.finalConfidence ??
                  session.lastAlert!.confidence,
              verified: session.lastAlert!.sensorVerified,
            ),
          ),
      ],
    );
  }

  Widget _controls({required bool compact}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (session.navigating) ...[
          NavHud(session: session, compact: true),
          const SizedBox(height: 8),
        ],
        if (!compact) ...[
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: RasidMap(
                session: session,
                compact: true,
                followUser: true,
              ),
            ),
          ),
          const SizedBox(height: 10),
        ] else ...[
          SizedBox(
            height: 132,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: RasidMap(
                session: session,
                compact: true,
                followUser: true,
              ),
            ),
          ),
          const SizedBox(height: 10),
        ],
        Row(
          children: [
            SpeedGauge(
              speed: session.speedKmh,
              limit: session.limitKmh,
              size: compact ? 72 : 96,
            ),
            const SizedBox(width: 10),
            SpeedLimitSign(limit: session.limitKmh, size: compact ? 44 : 52),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                session.navigating
                    ? (session.navigationTarget?.nameAr ?? session.zoneNameAr)
                    : session.zoneNameAr,
                style: GoogleFonts.cairo(
                  color: RasidColors.mist,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        FilledButton(
          onPressed: () {
            if (session.driving) {
              session.stopDriving();
            } else {
              session.startDriving();
            }
          },
          style: FilledButton.styleFrom(
            backgroundColor:
                session.driving ? RasidColors.danger : RasidColors.amber,
            foregroundColor:
                session.driving ? Colors.white : const Color(0xFF1A1400),
            minimumSize: const Size.fromHeight(48),
          ),
          child: Text(session.driving ? 'إيقاف القيادة' : 'ابدأ القيادة'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: () async {
            if (session.detecting) {
              await session.stopDetection();
            } else {
              await session.startDetection();
            }
          },
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(44),
          ),
          child: Text(session.detecting ? 'إيقاف الكشف' : 'تشغيل الكشف'),
        ),
      ],
    );
  }

  Widget _landscape(BuildContext context) {
    return Row(
      children: [
        Expanded(flex: 7, child: _cameraStack(context, expanded: true)),
        Container(
          width: 300,
          color: RasidColors.asphaltElevated,
          padding: EdgeInsets.fromLTRB(
            12,
            MediaQuery.paddingOf(context).top + 8,
            12,
            MediaQuery.paddingOf(context).bottom + 12,
          ),
          child: _controls(compact: true),
        ),
      ],
    );
  }

  Widget _portrait(BuildContext context) {
    return Column(
      children: [
        Expanded(flex: 6, child: _cameraStack(context, expanded: false)),
        Expanded(
          flex: 4,
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              12,
              10,
              12,
              MediaQuery.paddingOf(context).bottom + 12,
            ),
            child: _controls(compact: false),
          ),
        ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        text,
        style: GoogleFonts.cairo(
          color: color,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _AlertBanner extends StatelessWidget {
  const _AlertBanner({
    required this.title,
    required this.conf,
    required this.verified,
  });

  final String title;
  final double conf;
  final bool verified;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RasidColors.danger.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: Colors.white),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '$title · ${(conf * 100).round()}%'
              '${verified ? ' · مؤكد بالحساس' : ''}',
              style: GoogleFonts.cairo(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
