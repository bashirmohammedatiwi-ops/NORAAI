import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:geolocator/geolocator.dart';

import 'models/driver_config.dart';
import 'screens/app_shell.dart';
import 'screens/setup_screen.dart';
import 'services/config_storage.dart';
import 'theme/app_colors.dart';
import 'theme/app_theme.dart';
import 'widgets/nurai_background.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    debugPrint('FlutterError: ${details.exceptionAsString()}');
  };

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);

  runZonedGuarded(
    () => runApp(const NoraiDriveApp()),
    (error, stack) => debugPrint('Unhandled: $error\n$stack'),
  );
}

class NoraiDriveApp extends StatefulWidget {
  const NoraiDriveApp({super.key});

  @override
  State<NoraiDriveApp> createState() => _NoraiDriveAppState();
}

class _NoraiDriveAppState extends State<NoraiDriveApp> {
  DriverConfig? _config;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    await _ensureLocationPermission();
    final cfg = await ConfigStorage.load();
    setState(() {
      _config = cfg;
      _ready = true;
    });
  }

  Future<void> _ensureLocationPermission() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        await Geolocator.requestPermission();
      }
    } catch (_) {
      // Desktop/web may lack location services — setup screen still works.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: AppTheme.dark(),
        home: NuraiBackground(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    gradient: AppColors.accentGradient(),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  alignment: Alignment.center,
                  child: const Text('N', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
                ),
                const SizedBox(height: 20),
                const Text(
                  'NURAI Drive',
                  style: TextStyle(color: AppColors.textPrimary, fontSize: 22, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 20),
                const CircularProgressIndicator(color: AppColors.accent, strokeWidth: 2.5),
              ],
            ),
          ),
        ),
      );
    }

    return MaterialApp(
      title: 'NURAI Drive',
      debugShowCheckedModeBanner: false,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: AppTheme.dark(),
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child ?? const SizedBox.shrink(),
      ),
      home: _config == null
          ? SetupScreen(
              onReady: (c) => setState(() => _config = c),
            )
          : AppShell(
              config: _config!,
              onLogout: () => setState(() => _config = null),
            ),
    );
  }
}
