import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';

import 'models/driver_config.dart';
import 'screens/drive_screen.dart';
import 'screens/setup_screen.dart';
import 'services/config_storage.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
  ]);
  runApp(const NoraiDriveApp());
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
      return const MaterialApp(
        home: Scaffold(
          backgroundColor: Color(0xFF0F172A),
          body: Center(child: CircularProgressIndicator(color: Color(0xFF0D9488))),
        ),
      );
    }

    return MaterialApp(
      title: 'NURAI Drive',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0D9488), brightness: Brightness.dark),
        useMaterial3: true,
      ),
      home: _config == null
          ? SetupScreen(
              onReady: (c) => setState(() => _config = c),
            )
          : DriveScreen(
              config: _config!,
              onLogout: () => setState(() => _config = null),
            ),
    );
  }
}
