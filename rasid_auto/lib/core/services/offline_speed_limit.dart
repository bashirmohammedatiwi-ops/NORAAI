import 'dart:math' as math;

/// Offline Baghdad / Iraqi highway speed zones (approximate polygons as circles).
class SpeedZone {
  const SpeedZone({
    required this.nameAr,
    required this.latitude,
    required this.longitude,
    required this.radiusKm,
    required this.limitKmh,
  });

  final String nameAr;
  final double latitude;
  final double longitude;
  final double radiusKm;
  final double limitKmh;
}

const kSpeedZones = <SpeedZone>[
  SpeedZone(
    nameAr: 'وسط بغداد',
    latitude: 33.3152,
    longitude: 44.3661,
    radiusKm: 4,
    limitKmh: 60,
  ),
  SpeedZone(
    nameAr: 'الكرادة',
    latitude: 33.3100,
    longitude: 44.4000,
    radiusKm: 2.5,
    limitKmh: 50,
  ),
  SpeedZone(
    nameAr: 'المنصور',
    latitude: 33.3150,
    longitude: 44.3300,
    radiusKm: 2.5,
    limitKmh: 60,
  ),
  SpeedZone(
    nameAr: 'مدينة الصدر',
    latitude: 33.3800,
    longitude: 44.4600,
    radiusKm: 3.5,
    limitKmh: 50,
  ),
  SpeedZone(
    nameAr: 'طريق محمد القاسم',
    latitude: 33.3000,
    longitude: 44.4200,
    radiusKm: 5,
    limitKmh: 100,
  ),
  SpeedZone(
    nameAr: 'طريق المطار',
    latitude: 33.2700,
    longitude: 44.2800,
    radiusKm: 6,
    limitKmh: 120,
  ),
  SpeedZone(
    nameAr: 'جسر الأئمة / الأعظمية',
    latitude: 33.3600,
    longitude: 44.3700,
    radiusKm: 2,
    limitKmh: 40,
  ),
  SpeedZone(
    nameAr: 'الدورة',
    latitude: 33.2550,
    longitude: 44.3600,
    radiusKm: 3,
    limitKmh: 60,
  ),
  SpeedZone(
    nameAr: 'الحارثية / اليرموك',
    latitude: 33.3050,
    longitude: 44.3400,
    radiusKm: 2.2,
    limitKmh: 50,
  ),
  SpeedZone(
    nameAr: 'طريق أبو غريب',
    latitude: 33.3100,
    longitude: 44.2200,
    radiusKm: 8,
    limitKmh: 100,
  ),
  SpeedZone(
    nameAr: 'طريق بغداد — حلة',
    latitude: 33.1800,
    longitude: 44.4000,
    radiusKm: 10,
    limitKmh: 100,
  ),
  SpeedZone(
    nameAr: 'طريق بغداد — موصل',
    latitude: 33.4500,
    longitude: 44.3000,
    radiusKm: 12,
    limitKmh: 120,
  ),
  SpeedZone(
    nameAr: 'البصرة — وسط المدينة',
    latitude: 30.5085,
    longitude: 47.7804,
    radiusKm: 5,
    limitKmh: 60,
  ),
  SpeedZone(
    nameAr: 'أربيل — وسط',
    latitude: 36.1911,
    longitude: 44.0092,
    radiusKm: 5,
    limitKmh: 60,
  ),
  SpeedZone(
    nameAr: 'النجف — الكوفة',
    latitude: 32.0250,
    longitude: 44.3460,
    radiusKm: 6,
    limitKmh: 70,
  ),
  SpeedZone(
    nameAr: 'سريع الدورة — السيدية',
    latitude: 33.2900,
    longitude: 44.3300,
    radiusKm: 4,
    limitKmh: 80,
  ),
  SpeedZone(
    nameAr: 'القناة / شارع فلسطين',
    latitude: 33.3400,
    longitude: 44.4300,
    radiusKm: 3,
    limitKmh: 60,
  ),
  SpeedZone(
    nameAr: 'الرستمية / بغداد الجديدة',
    latitude: 33.3300,
    longitude: 44.4700,
    radiusKm: 3.5,
    limitKmh: 60,
  ),
  SpeedZone(
    nameAr: 'الشعلة / الحرية',
    latitude: 33.3700,
    longitude: 44.2900,
    radiusKm: 3,
    limitKmh: 50,
  ),
  SpeedZone(
    nameAr: 'الكاظمية',
    latitude: 33.3800,
    longitude: 44.3400,
    radiusKm: 2.5,
    limitKmh: 50,
  ),
  SpeedZone(
    nameAr: 'سريع بغداد — كركوك',
    latitude: 33.5200,
    longitude: 44.3600,
    radiusKm: 15,
    limitKmh: 120,
  ),
  SpeedZone(
    nameAr: 'الطريق الدولي — الأنبار',
    latitude: 33.3500,
    longitude: 43.8000,
    radiusKm: 25,
    limitKmh: 120,
  ),
  SpeedZone(
    nameAr: 'البصرة — طريق الزبير',
    latitude: 30.3900,
    longitude: 47.7000,
    radiusKm: 10,
    limitKmh: 100,
  ),
  SpeedZone(
    nameAr: 'كربلاء — وسط',
    latitude: 32.6160,
    longitude: 44.0250,
    radiusKm: 5,
    limitKmh: 60,
  ),
  SpeedZone(
    nameAr: 'الموصل — وسط',
    latitude: 36.3350,
    longitude: 43.1300,
    radiusKm: 6,
    limitKmh: 60,
  ),
];

class OfflineSpeedLimitService {
  const OfflineSpeedLimitService({this.fallbackKmh = 40});

  final double fallbackKmh;

  /// Sticky lookup: [currentZone] keeps its limit until we're clearly outside
  /// (hysteresis 25% beyond radius) — prevents flicker on zone borders.
  ({double limitKmh, String zoneNameAr}) lookup(
    double lat,
    double lng, {
    String? currentZone,
  }) {
    if (currentZone != null) {
      for (final z in kSpeedZones) {
        if (z.nameAr == currentZone) {
          final d = _haversineKm(lat, lng, z.latitude, z.longitude);
          if (d <= z.radiusKm * 1.25) {
            return (limitKmh: z.limitKmh.toDouble(), zoneNameAr: z.nameAr);
          }
          break;
        }
      }
    }
    SpeedZone? best;
    var bestDist = double.infinity;
    for (final z in kSpeedZones) {
      final d = _haversineKm(lat, lng, z.latitude, z.longitude);
      if (d <= z.radiusKm && d < bestDist) {
        best = z;
        bestDist = d;
      }
    }
    if (best == null) {
      return (limitKmh: fallbackKmh, zoneNameAr: 'طريق عام');
    }
    return (limitKmh: best.limitKmh.toDouble(), zoneNameAr: best.nameAr);
  }

  static double _haversineKm(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    const r = 6371.0;
    final dLat = _rad(lat2 - lat1);
    final dLon = _rad(lon2 - lon1);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_rad(lat1)) *
            math.cos(_rad(lat2)) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  static double _rad(double d) => d * math.pi / 180;
}
