import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../theme/app_colors.dart';
import 'alerts_app_screen.dart';
import 'camera_app_screen.dart';
import 'home_hub_screen.dart';
import 'drive_screen.dart';
import 'maps_app_screen.dart';
import 'model_info_screen.dart';
import '../models/driver_config.dart';
import '../utils/responsive.dart';

const _navTabs = <int>[0, 1, 5, 2, 4];

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

  int get _navIndex {
    final i = _navTabs.indexOf(_tab);
    return i >= 0 ? i : 0;
  }

  @override
  void initState() {
    super.initState();
    _session = DriveSession(widget.config, widget.onLogout);
    _session.onNavigateTab = _selectTab;
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
      _session.requestCamera();
    } else if (wasCamera) {
      unawaited(_session.releaseCamera());
    }
  }

  void _selectNav(int navIndex) {
    if (navIndex >= 0 && navIndex < _navTabs.length) {
      _selectTab(_navTabs[navIndex]);
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
    final landscape = isLandscape(context);

    return DriveSessionScope(
      notifier: _session,
      child: Scaffold(
        backgroundColor: AppColors.bgDeep,
        extendBody: false,
        body: landscape
            ? Row(
                children: [
                  NavigationRail(
                    extended: MediaQuery.sizeOf(context).width > 900,
                    minExtendedWidth: 88,
                    selectedIndex: _navIndex,
                    onDestinationSelected: _selectNav,
                    labelType: NavigationRailLabelType.none,
                    destinations: const [
                      NavigationRailDestination(icon: Icon(Icons.home_rounded), label: Text('الرئيسية')),
                      NavigationRailDestination(icon: Icon(Icons.map_rounded), label: Text('خرائط')),
                      NavigationRailDestination(icon: Icon(Icons.dashboard_rounded), label: Text('قيادة')),
                      NavigationRailDestination(icon: Icon(Icons.videocam_rounded), label: Text('كاميرا')),
                      NavigationRailDestination(icon: Icon(Icons.notifications_rounded), label: Text('تنبيهات')),
                    ],
                  ),
                  const VerticalDivider(width: 1, thickness: 1),
                  Expanded(child: _buildBody()),
                ],
              )
            : _buildBody(),
        bottomNavigationBar: landscape
            ? null
            : NavigationBar(
                height: 64,
                selectedIndex: _navIndex,
                onDestinationSelected: _selectNav,
                backgroundColor: AppColors.bgElevated,
                indicatorColor: AppColors.accent.withValues(alpha: 0.2),
                labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.home_outlined),
                    selectedIcon: Icon(Icons.home_rounded),
                    label: 'الرئيسية',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.map_outlined),
                    selectedIcon: Icon(Icons.map_rounded),
                    label: 'خرائط',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.dashboard_outlined),
                    selectedIcon: Icon(Icons.dashboard_rounded),
                    label: 'قيادة',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.videocam_outlined),
                    selectedIcon: Icon(Icons.videocam_rounded),
                    label: 'كاميرا',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.notifications_outlined),
                    selectedIcon: Icon(Icons.notifications_rounded),
                    label: 'تنبيهات',
                  ),
                ],
              ),
      ),
    );
  }
}
