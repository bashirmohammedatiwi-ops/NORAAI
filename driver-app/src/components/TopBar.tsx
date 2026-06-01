interface Props {
  onLocate: () => void;
  onLogout: () => void;
  onAlerts: () => void;
  locating: boolean;
  gpsOk: boolean;
  online: boolean;
  mapEvents: number;
  alertCount: number;
  alertsOpen: boolean;
  vehicle: string;
}

export default function TopBar({
  onLocate,
  onLogout,
  onAlerts,
  locating,
  gpsOk,
  online,
  mapEvents,
  alertCount,
  alertsOpen,
  vehicle,
}: Props) {
  return (
    <header className="nx-top">
      <div className="nx-top__brand">
        <div className="nx-top__logo">N</div>
        <div>
          <strong>NURAI</strong>
          <span>Driver · {vehicle}</span>
        </div>
      </div>

      <div className="nx-top__pills">
        <span className={`nx-top__pill${online ? ' nx-top__pill--ok' : ''}`}>
          {online ? 'متصل' : 'غير متصل'}
        </span>
        <span className="nx-top__pill nx-top__pill--soft">{mapEvents} حدث</span>
        {alertCount > 0 && (
          <span className="nx-top__pill nx-top__pill--warn">{alertCount} تنبيه</span>
        )}
      </div>

      <div className="nx-top__actions">
        <button
          type="button"
          className={`nx-top__btn${alertsOpen ? ' nx-top__btn--on' : ''}`}
          onClick={onAlerts}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3a5 5 0 00-5 5v4l-2 3h14l-2-3V8a5 5 0 00-5-5z" /><path d="M10 21h4" />
          </svg>
          <span>تنبيهات</span>
        </button>

        <button
          type="button"
          className={`nx-top__gps${locating ? ' nx-top__gps--busy' : ''}${gpsOk ? ' nx-top__gps--ok' : ''}`}
          onClick={onLocate}
          disabled={locating}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          GPS
        </button>

        <button type="button" className="nx-top__btn nx-top__btn--ghost" onClick={onLogout}>
          خروج
        </button>
      </div>
    </header>
  );
}
