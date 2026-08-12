import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/services/drive_session.dart';
import 'features/shell/app_shell.dart';
import 'theme/rasid_theme.dart';

class RasidAutoApp extends StatelessWidget {
  const RasidAutoApp({super.key, required this.session});

  final DriveSession session;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RASID Auto',
      debugShowCheckedModeBanner: false,
      theme: buildRasidTheme(),
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) {
        return Directionality(
          textDirection: TextDirection.rtl,
          child: child ?? const SizedBox.shrink(),
        );
      },
      home: AppShell(session: session),
    );
  }
}
