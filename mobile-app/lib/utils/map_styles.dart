enum MapStyle {
  waze,
  navigation,
  streets,
  dark,
  terrain,
  satellite,
}

extension MapStyleConfig on MapStyle {
  String get labelAr {
    switch (this) {
      case MapStyle.waze:
        return 'ويز';
      case MapStyle.navigation:
        return 'ملاحة';
      case MapStyle.streets:
        return 'شوارع';
      case MapStyle.dark:
        return 'ليلي';
      case MapStyle.terrain:
        return 'تضاريس';
      case MapStyle.satellite:
        return 'قمر صناعي';
    }
  }

  String get urlTemplate {
    switch (this) {
      case MapStyle.waze:
        return 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
      case MapStyle.navigation:
        return 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
      case MapStyle.streets:
        return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      case MapStyle.dark:
        return 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      case MapStyle.terrain:
        return 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
      case MapStyle.satellite:
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    }
  }

  List<String> get subdomains {
    switch (this) {
      case MapStyle.satellite:
      case MapStyle.streets:
        return const [];
      case MapStyle.terrain:
        return const ['a', 'b', 'c'];
      default:
        return const ['a', 'b', 'c', 'd'];
    }
  }

  String? get labelOverlayTemplate {
    if (this == MapStyle.satellite) {
      return 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png';
    }
    return null;
  }

  String get attribution {
    switch (this) {
      case MapStyle.streets:
        return '© OpenStreetMap';
      case MapStyle.terrain:
        return '© OpenTopoMap · OSM';
      case MapStyle.satellite:
        return '© Esri · CARTO · OSM';
      default:
        return '© CARTO · OpenStreetMap';
    }
  }

  int get maxZoom {
    switch (this) {
      case MapStyle.terrain:
        return 17;
      case MapStyle.streets:
        return 19;
      default:
        return 20;
    }
  }

  bool get useRetina => this != MapStyle.streets && this != MapStyle.terrain;
}
