class DriverConfig {
  const DriverConfig({
    required this.serverUrl,
    required this.projectId,
    required this.deviceId,
    required this.vehicleId,
    required this.apiKey,
    this.speedLimit = 80,
  });

  final String serverUrl;
  final String projectId;
  final String deviceId;
  final String vehicleId;
  final String apiKey;
  final double speedLimit;

  Map<String, dynamic> toJson() => {
        'serverUrl': serverUrl,
        'projectId': projectId,
        'deviceId': deviceId,
        'vehicleId': vehicleId,
        'apiKey': apiKey,
        'speedLimit': speedLimit,
      };

  factory DriverConfig.fromJson(Map<String, dynamic> json) => DriverConfig(
        serverUrl: json['serverUrl'] as String,
        projectId: json['projectId'] as String,
        deviceId: json['deviceId'] as String,
        vehicleId: json['vehicleId'] as String,
        apiKey: json['apiKey'] as String,
        speedLimit: (json['speedLimit'] as num?)?.toDouble() ?? 80,
      );
}
