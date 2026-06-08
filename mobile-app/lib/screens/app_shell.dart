import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import 'alerts_app_screen.dart';
import 'camera_app_screen.dart';
import 'home_hub_screen.dart';
import 'drive_screen.dart';
import 'maps_app_screen.dart';
import 'model_info_screen.dart';
import '../models/driver_config.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.config, required this.onLogout});

  final DriverConfig config;
  final VoidCallback onLogout;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  late final DriveSession _session;
  int _tab = 0;

  bool get _isCameraTab => _tab == 2 || _tab == 5;

  @override
  void initState() {
    super.initState();
    _session = DriveSession(widget.config, widget.onLogout);
    _session.start();
  }

  @override
  void dispose() {
    _session.dispose();
    super.dispose();
  }

  void _selectTab(int i) {
    final wasCamera = _isCameraTab;
    setState(() => _tab = i);

    if (i == 2 || i == 5) {
      _session.requestCamera(force: kIsWeb);
    } else if (kIsWeb && wasCamera) {
      unawaited(_session.releaseCamera());
    }
  }

  Widget _buildBody() {
    switch (_tab) {
      case 0:
        return HomeHubScreen(onOpenTab: _selectTab);
      case 1:
        return const MapsAppScreen();
      case 2:
        return const CameraAppScreen();
      case 3:
        return const ModelInfoScreen();
      case 4:
        return const AlertsAppScreen();
      case 5:
        return const DriveScreen();
      default:
        return HomeHubScreen(onOpenTab: _selectTab);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DriveSessionScope(
      notifier: _session,
      child: Scaffold(
        backgroundColor: const Color(0xFF0F172A),
        body: _buildBody(),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab > 4 ? 0 : _tab,
          onDestinationSelected: _selectTab,
          backgroundColor: const Color(0xFF1E293B),
          indicatorColor: const Color(0xFF0D9488),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.apps), label: 'الرئيسية'),
            NavigationDestination(icon: Icon(Icons.map_outlined), label: 'خرائط'),
            NavigationDestination(icon: Icon(Icons.videocam_outlined), label: 'كاميرا'),
            NavigationDestination(icon: Icon(Icons.psychology_outlined), label: 'موديل'),
            NavigationDestination(icon: Icon(Icons.notifications_outlined), label: 'تنبيهات'),
          ],
        ),
      ),
    );
  }
}
