import '../../../utils/map_geo.dart';
import '../data/baghdad_hospitals.dart';
import '../models/hospital.dart';

class HospitalWithDistance {
  const HospitalWithDistance({required this.hospital, required this.distanceM});

  final Hospital hospital;
  final double distanceM;

  String get distanceLabel => formatDistanceKm(distanceM / 1000);
}

class HospitalRepository {
  static List<Hospital> get all => kBaghdadHospitals;

  static List<HospitalWithDistance> nearest(
    double latitude,
    double longitude, {
    int limit = 8,
  }) {
    final ranked = kBaghdadHospitals
        .map((h) => HospitalWithDistance(
              hospital: h,
              distanceM: distanceMeters(latitude, longitude, h.latitude, h.longitude),
            ))
        .toList()
      ..sort((a, b) => a.distanceM.compareTo(b.distanceM));
    return ranked.take(limit).toList();
  }

  static Hospital? byId(String id) {
    for (final h in kBaghdadHospitals) {
      if (h.id == id) return h;
    }
    return null;
  }
}
