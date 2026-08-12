enum HospitalType { publicHospital, teaching, privateHospital, specialty }

class Hospital {
  const Hospital({
    required this.id,
    required this.nameAr,
    required this.nameEn,
    required this.latitude,
    required this.longitude,
    required this.addressAr,
    this.phone,
    this.type = HospitalType.publicHospital,
    this.hasEmergency = true,
    this.hasTrauma = false,
    this.beds,
    this.notesAr,
  });

  final String id;
  final String nameAr;
  final String nameEn;
  final double latitude;
  final double longitude;
  final String addressAr;
  final String? phone;
  final HospitalType type;
  final bool hasEmergency;
  final bool hasTrauma;
  final int? beds;
  final String? notesAr;

  String get typeLabelAr {
    switch (type) {
      case HospitalType.teaching:
        return 'تعليمي';
      case HospitalType.privateHospital:
        return 'خاص';
      case HospitalType.specialty:
        return 'تخصصي';
      case HospitalType.publicHospital:
        return 'حكومي';
    }
  }
}
