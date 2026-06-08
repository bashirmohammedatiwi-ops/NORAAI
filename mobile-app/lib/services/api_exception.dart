import 'dart:convert';
import 'dart:io';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.userMessage});

  final String message;
  final int? statusCode;
  final String? userMessage;

  String get displayMessage => userMessage ?? message;

  static ApiException fromResponse(int status, String body) {
    final detail = _parseDetail(body);
    return ApiException(
      detail ?? body,
      statusCode: status,
      userMessage: _friendly(status, detail),
    );
  }

  static ApiException fromError(Object error) {
    if (error is ApiException) return error;
    final text = error.toString();
    if (error is SocketException ||
        text.contains('SocketException') ||
        text.contains('Failed host lookup') ||
        text.contains('Network is unreachable')) {
      return ApiException(
        text,
        userMessage: 'لا يوجد اتصال بالإنترنت أو السيرفر غير متاح',
      );
    }
    if (text.contains('TimeoutException') || text.contains('timed out')) {
      return ApiException(text, userMessage: 'انتهت مهلة الاتصال — تحقق من الشبكة والسيرفر');
    }
    if (text.contains('Connection refused')) {
      return ApiException(text, userMessage: 'السيرفر يرفض الاتصال — تأكد من المنفذ 8080');
    }
    if (text.contains('HandshakeException') || text.contains('CERTIFICATE')) {
      return ApiException(text, userMessage: 'خطأ في شهادة الأمان — استخدم http:// مع المنفذ 8080');
    }
    if (text.contains('MissingPluginException')) {
      return ApiException(
        text,
        userMessage: 'هذه الميزة غير مدعومة على المتصفح — استخدم تطبيق Android/iOS أو وضع السيرفر',
      );
    }
    return ApiException(text, userMessage: 'خطأ في الاتصال: ${error.toString()}');
  }

  static String? _parseDetail(String body) {
    try {
      final json = jsonDecode(body);
      if (json is Map) {
        final d = json['detail'];
        if (d is String) return d;
        if (d is List && d.isNotEmpty) {
          final first = d.first;
          if (first is Map && first['msg'] != null) return first['msg'].toString();
        }
      }
    } catch (_) {}
    if (body.length > 200) return '${body.substring(0, 200)}...';
    return body.isNotEmpty ? body : null;
  }

  static String _friendly(int status, String? detail) {
    switch (status) {
      case 401:
        return 'مفتاح API غير صحيح — انسخ المفتاح من Fleet في لوحة التحكم';
      case 403:
        return 'صلاحية مرفوضة — تحقق من تسجيل الجهاز';
      case 404:
        if (detail != null && detail.toLowerCase().contains('model')) {
          return 'لا يوجد موديل منشور — درّب الموديل ثم زامِن من Mobile App';
        }
        return detail ?? 'المورد غير موجود على السيرفر';
      case 400:
        return detail ?? 'طلب غير صالح';
      case 500:
      case 502:
      case 503:
        return 'خطأ في السيرفر — حاول لاحقاً أو حدّث VPS';
      default:
        return detail ?? 'خطأ HTTP $status';
    }
  }

  @override
  String toString() => displayMessage;
}
