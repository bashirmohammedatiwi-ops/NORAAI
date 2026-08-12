import 'dart:convert';

class ApiException implements Exception {
  ApiException(this.message, {this.userMessage});

  final String message;
  final String? userMessage;

  String get displayMessage => userMessage ?? message;

  factory ApiException.fromResponse(int status, String body) {
    final parsed = _parseDetail(body);
    if (status == 404) {
      return ApiException(
        'HTTP 404',
        userMessage: parsed ?? 'السيرفر قديم — حدّث VPS ثم أعد المحاولة',
      );
    }
    if (status == 401) {
      return ApiException('HTTP 401', userMessage: parsed ?? 'مفتاح الجهاز غير صالح');
    }
    return ApiException(
      'HTTP $status',
      userMessage: parsed ?? (body.length > 120 ? '${body.substring(0, 120)}…' : body),
    );
  }

  factory ApiException.fromError(Object error) {
    final text = error.toString();
    if (text.contains('SocketException') || text.contains('Failed host lookup')) {
      return ApiException(text, userMessage: 'لا اتصال بالسيرفر — تحقق من الشبكة');
    }
    return ApiException(text, userMessage: 'خطأ في الاتصال');
  }

  static String? _parseDetail(String body) {
    final trimmed = body.trim();
    if (trimmed.isEmpty) return null;
    try {
      final json = jsonDecode(trimmed);
      if (json is Map) {
        final detail = json['detail'];
        if (detail is String && detail.isNotEmpty) return detail;
        if (detail is List && detail.isNotEmpty) {
          return detail.map((e) => e.toString()).join('؛ ');
        }
      }
    } catch (_) {}
    return trimmed.length <= 160 ? trimmed : '${trimmed.substring(0, 160)}…';
  }
}
