import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/services/config_storage.dart';
import 'core/services/drive_session.dart';
import 'features/onboarding/setup_screen.dart';
import 'features/shell/app_shell.dart';
import 'theme/rasid_theme.dart';

class RasidAutoApp extends StatefulWidget {
  const RasidAutoApp({super.key, required this.session});

  final DriveSession session;

  @override
  State<RasidAutoApp> createState() => _RasidAutoAppState();
}

class _RasidAutoAppState extends State<RasidAutoApp> {
  bool _checking = true;
  bool _setupDone = false;

  @override
  void initState() {
    super.initState();
    _loadSetup();
  }

  Future<void> _loadSetup() async {
    final done = await ConfigStorage.isSetupDone();
    if (done) await widget.session.reloadApiConfig();
    if (!mounted) return;
    setState(() {
      _setupDone = done;
      _checking = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return MaterialApp(
        theme: buildRasidTheme(),
        home: const Scaffold(body: Center(child: CircularProgressIndicator())),
      );
    }
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
      home: _setupDone
          ? AppShell(session: widget.session)
          : SetupScreen(
              onReady: (_) async {
                await widget.session.reloadApiConfig();
                if (!mounted) return;
                setState(() => _setupDone = true);
              },
            ),
    );
  }
}
