/// Detection & map reporting toggles.
abstract final class DetectionConfig {
  /// Push detections to server / show hazard pins on map — disabled for AR focus.
  static const bool mapEventReporting = false;

  /// Target overlay refresh (Hz).
  static const double overlayRefreshHz = 60;

  /// Minimum ms between local inference runs when pipeline is fast.
  static const int localDetectFloorMs = 16;

  /// Remove overlay box after N missed detection frames (0 = immediate).
  static const int maxTrackMissFrames = 1;
}
