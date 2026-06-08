import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:norai_drive/main.dart';

void main() {
  testWidgets('app loads setup or drive screen', (WidgetTester tester) async {
    await tester.pumpWidget(const NoraiDriveApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.textContaining('NURAI Drive').evaluate().isNotEmpty ||
          find.byType(CircularProgressIndicator).evaluate().isNotEmpty,
      isTrue,
    );
  });
}
