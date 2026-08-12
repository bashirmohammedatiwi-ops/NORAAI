class DetectionBox {
  const DetectionBox({
    required this.className,
    required this.confidence,
    required this.bbox,
    this.eventType,
  });

  final String className;
  final double confidence;
  final List<double> bbox;
  final String? eventType;

  factory DetectionBox.fromJson(Map<String, dynamic> json) => DetectionBox(
        className: json['class'] as String? ?? json['class_name'] as String? ?? '',
        confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
        bbox: (json['bbox'] as List<dynamic>?)
                ?.map((e) => (e as num).toDouble())
                .toList() ??
            [],
        eventType: json['event_type'] as String?,
      );
}
