class DriverConfig {
  const DriverConfig({
    required this.serverUrl,
    required this.projectId,
    required this.deviceId,
    required this.vehicleId,
    required this.apiKey,
    required this.driverName,
    this.phoneNumber = '',
    this.speedLimit = 80,
  });

  final String serverUrl;
  final String projectId;
  final String deviceId;
  final String vehicleId;
  final String apiKey;
  final String driverName;
  final String phoneNumber;
  final double speedLimit;

  DriverConfig copyWith({
    String? serverUrl,
    String? projectId,
    String? deviceId,
    String? vehicleId,
    String? apiKey,
    String? driverName,
    String? phoneNumber,
    double? speedLimit,
  }) {
    return DriverConfig(
      serverUrl: serverUrl ?? this.serverUrl,
      projectId: projectId ?? this.projectId,
      deviceId: deviceId ?? this.deviceId,
      vehicleId: vehicleId ?? this.vehicleId,
      apiKey: apiKey ?? this.apiKey,
      driverName: driverName ?? this.driverName,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      speedLimit: speedLimit ?? this.speedLimit,
    );
  }

  Map<String, dynamic> toJson() => {
        'serverUrl': serverUrl,
        'projectId': projectId,
        'deviceId': deviceId,
        'vehicleId': vehicleId,
        'apiKey': apiKey,
        'driverName': driverName,
        'phoneNumber': phoneNumber,
        'speedLimit': speedLimit,
      };

  factory DriverConfig.fromJson(Map<String, dynamic> json) => DriverConfig(
        serverUrl: json['serverUrl'] as String,
        projectId: json['projectId'] as String,
        deviceId: json['deviceId'] as String,
        vehicleId: json['vehicleId'] as String,
        apiKey: json['apiKey'] as String,
        driverName: json['driverName'] as String? ?? '',
        phoneNumber: json['phoneNumber'] as String? ?? '',
        speedLimit: (json['speedLimit'] as num?)?.toDouble() ?? 80,
      );
}
