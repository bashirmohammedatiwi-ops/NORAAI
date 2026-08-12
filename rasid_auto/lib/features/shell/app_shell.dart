import 'package:flutter/material.dart';

import '../../core/services/drive_session.dart';
import '../../theme/rasid_theme.dart';
import '../alerts/alerts_screen.dart';
import '../drive/drive_screen.dart';
import '../fines/fines_screen.dart';
import '../home/home_screen.dart';
import '../hospitals/hospitals_screen.dart';
import '../map/map_screen.dart';
import '../scan/manual_scan_screen.dart';
import '../settings/settings_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.session});

  final DriveSession session;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onSession);
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSession);
    super.dispose();
  }

  void _onSession() {
    final tab = widget.session.consumeTabRequest();
    if (tab != null && mounted && tab != _index) {
      setState(() => _index = tab);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.session,
      builder: (context, _) {
        final session = widget.session;
        final pages = [
          HomeScreen(
            session: session,
            onOpenDrive: () => setState(() => _index = 1),
            onOpenMap: () => setState(() => _index = 3),
            onOpenScan: () => setState(() => _index = 2),
            onOpenHospitals: () => _push(
              HospitalsScreen(session: session),
            ),
            onOpenFines: () => _push(FinesScreen(session: session)),
            onOpenSettings: () => _push(SettingsScreen(session: session)),
          ),
          DriveScreen(session: session),
          ManualScanScreen(session: session),
          MapScreen(session: session),
          AlertsScreen(session: session),
          FinesScreen(session: session),
        ];

        return Scaffold(
          body: IndexedStack(index: _index, children: pages),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (i) => setState(() => _index = i),
            destinations: [
              const NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home_rounded),
                label: 'الرئيسية',
              ),
              NavigationDestination(
                icon: Icon(
                  Icons.directions_car_outlined,
                  color: session.driving ? RasidColors.safety : null,
                ),
                selectedIcon: const Icon(Icons.directions_car_filled),
                label: 'قيادة',
              ),
              const NavigationDestination(
                icon: Icon(Icons.document_scanner_outlined),
                selectedIcon: Icon(Icons.document_scanner_rounded),
                label: 'تبليغ',
              ),
              const NavigationDestination(
                icon: Icon(Icons.map_outlined),
                selectedIcon: Icon(Icons.map_rounded),
                label: 'خريطة',
              ),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: session.lastAlert != null,
                  backgroundColor: RasidColors.danger,
                  child: const Icon(Icons.notifications_outlined),
                ),
                selectedIcon: const Icon(Icons.notifications_rounded),
                label: 'تنبيهات',
              ),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: session.fines.any((f) => !f.resolved),
                  label: Text(
                    '${session.fines.where((f) => !f.resolved).length}',
                  ),
                  child: const Icon(Icons.gavel_outlined),
                ),
                selectedIcon: const Icon(Icons.gavel_rounded),
                label: 'غرامات',
              ),
            ],
          ),
        );
      },
    );
  }

  void _push(Widget page) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => page),
    );
  }
}
