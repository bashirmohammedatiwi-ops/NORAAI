import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:rasid_auto/core/models/detection.dart';
import 'package:rasid_auto/core/models/detection_result.dart';
import 'package:rasid_auto/core/models/sensor_reading.dart';
import 'package:rasid_auto/core/services/accel_impact_classifier.dart';
import 'package:rasid_auto/core/services/mock_segmentation_service.dart';
import 'package:rasid_auto/core/services/offline_speed_limit.dart';
import 'package:rasid_auto/core/services/speed_monitor.dart';
import 'package:rasid_auto/core/services/tracking_service.dart';
import 'package:rasid_auto/core/utils/confidence_calculator.dart';
import 'package:rasid_auto/core/utils/image_preprocessor.dart';
import 'package:rasid_auto/core/utils/mask_to_boxes.dart';
import 'package:image/image.dart' as img;

void main() {
  test('hazard labels still work', () {
    expect(hazardLabelAr('pothole'), 'حفرة');
    expect(classifyHazard('speedbreaker'), HazardKind.bump);
  });

  test('offline speed zones', () {
    const svc = OfflineSpeedLimitService();
    expect(svc.lookup(33.3152, 44.3661).limitKmh, 60);
    expect(svc.lookup(30.5085, 47.7804).zoneNameAr, contains('البصرة'));
  });

  test('speed monitor grace', () {
    final m = SpeedViolationMonitor(
      const SpeedViolationRules(
        graceSeconds: 2,
        cooldownSeconds: 1,
        toleranceKmh: 0,
      ),
    );
    final t0 = 1_000_000.0;
    expect(m.update(100, 80, t0).shouldReport, false);
    expect(m.update(100, 80, t0 + 2500).shouldReport, true);
  });

  test('mask to boxes extracts pothole component', () {
    final mask = Int32List(16);
    mask[5] = 1;
    mask[6] = 1;
    mask[9] = 1;
    mask[10] = 1;
    final boxes = const MaskToBoxes(minArea: 2).extract(
      mask: mask,
      width: 4,
      height: 4,
    );
    expect(boxes.length, 1);
    expect(boxes.first.type, SegClass.pothole);
  });

  test('tracking keeps same id across frames', () {
    final tracker = TrackingService();
    DetectionResult det(double x) => DetectionResult(
          type: SegClass.pothole,
          confidence: 0.9,
          boundingBox: BoundingBox(left: x, top: 10, right: x + 40, bottom: 50),
          centerX: x + 20,
          centerY: 30,
          area: 40 * 40,
          timestamp: DateTime.now(),
        );
    final a = tracker.update([det(100)]);
    final id = a.first.trackId;
    final b = tracker.update([det(105)]);
    expect(b.first.trackId, id);
    expect(b.first.age, greaterThan(1));
  });

  test('mock segmentation returns preview boxes', () async {
    final mock = MockSegmentationService();
    await mock.load(modelPath: '', manifestPath: '');
    final r = await mock.segmentJpeg(
      jpegBytes: [0],
      previewWidth: 720,
      previewHeight: 1280,
    );
    expect(r.detections, isNotEmpty);
    expect(mock.backendName, contains('Mock'));
  });

  test('confidence fusion lowers score without sensor', () {
    const calc = ConfidenceCalculator();
    final withSensor = calc.fuse(
      cameraConfidence: 0.8,
      accel: const AccelFeatures(
        verticalPeak: 5,
        suddenDrop: 3,
        rms: 2,
        variance: 4,
        peak: 5,
      ),
      gyro: const GyroFeatures(),
      speedKmh: 50,
      type: SegClass.pothole,
    );
    final noSensor = calc.fuse(
      cameraConfidence: 0.8,
      accel: const AccelFeatures(),
      gyro: const GyroFeatures(orientationJerk: 4, rollRatePeak: 3),
      speedKmh: 20,
      type: SegClass.pothole,
    );
    expect(withSensor.verified, isTrue);
    expect(noSensor.finalScore, lessThan(withSensor.finalScore));
  });

  test('accel impact classifier prefers pothole on sharp drop', () {
    const c = AccelImpactClassifier();
    final p = c.classify(
      const AccelFeatures(
        peak: 6,
        suddenDrop: 5,
        rebound: 4,
        vibrationDurationMs: 80,
        rms: 2,
        variance: 5,
        verticalPeak: 6,
      ),
      speedKmh: 40,
    );
    expect(p.kind, SegClass.pothole);
  });

  test('accel impact classifier prefers bump on long vibration', () {
    const c = AccelImpactClassifier();
    final b = c.classify(
      const AccelFeatures(
        peak: 4,
        suddenDrop: 0.8,
        rebound: 0.5,
        vibrationDurationMs: 350,
        rms: 3.5,
        variance: 4,
        verticalPeak: 4,
      ),
      speedKmh: 40,
    );
    expect(b.kind, SegClass.speedBump);
  });

  test('preprocessor builds NHWC div255 tensor for U-Net', () {
    final src = img.Image(width: 64, height: 48);
    img.fill(src, color: img.ColorRgb8(255, 128, 0));
    final prep = const ImagePreprocessor(
      netSize: 256,
      letterbox: false,
      normalize: NormalizeMode.div255,
      layout: TensorLayout.nhwc,
    ).fromRgb(src);
    expect(prep.data.length, 256 * 256 * 3);
    expect(prep.layout, TensorLayout.nhwc);
    expect(prep.data[0], closeTo(1.0, 0.02));
    expect(prep.data[1], closeTo(128 / 255, 0.02));
    expect(prep.data[2], closeTo(0.0, 0.02));
  });
}
