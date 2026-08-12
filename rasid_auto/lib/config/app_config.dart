import 'package:latlong2/latlong.dart';

const String kDefaultServerUrl = 'http://187.127.88.146:8080';

const String kDefaultDriverName = 'سائق راصد';

const LatLng kDefaultMapCenter = LatLng(33.3152, 44.3661);

String normalizeServerUrl(String raw) {
  var url = raw.trim();
  while (url.endsWith('/')) {
    url = url.substring(0, url.length - 1);
  }
  final uri = Uri.tryParse(url);
  if (uri == null || uri.host.isEmpty) return url;
  if (!uri.hasPort && (uri.scheme == 'http' || uri.scheme == 'https')) {
    final host = uri.host;
    if (host == '187.127.88.146' || host == 'localhost' || host == '127.0.0.1') {
      return '${uri.scheme}://$host:8080';
    }
  }
  return url;
}
