class ApiException implements Exception {
  ApiException(this.message, {this.userMessage});

  final String message;
  final String? userMessage;

  String get displayMessage => userMessage ?? message;

  factory ApiException.fromResponse(int status, String body) {
    return ApiException('HTTP $status', userMessage: body.length > 120 ? '${body.substring(0, 120)}…' : body);
  }

  factory ApiException.fromError(Object error) {
    final text = error.toString();
    if (text.contains('SocketException') || text.contains('Failed host lookup')) {
      return ApiException(text, userMessage: 'لا اتصال بالسيرفر — تحقق من الشبكة');
    }
    return ApiException(text, userMessage: 'خطأ في الاتصال');
  }
}
