import { useNavigate } from 'react-router-dom';
import { Zap, AlertTriangle, ClipboardList, Map as MapIcon, Bell, ChevronRight } from 'lucide-react';

export default function QuickActions() {
  const navigate = useNavigate();

  const actions = [
    {
      id: 'report',
      title: 'Report Emergency',
      desc: 'Submit a new request',
      icon: AlertTriangle,
      tileClass: 'red',
      isDanger: true,
      route: '/citizen/report',
      ariaLabel: 'Quick action: Report Emergency. Submit a new request.',
    },
    {
      id: 'requests',
      title: 'My Requests',
      desc: 'Track your reports',
      icon: ClipboardList,
      tileClass: 'blue',
      route: '/citizen/requests',
      ariaLabel: 'Quick action: My Requests. Track your submitted reports.',
    },
    {
      id: 'map',
      title: 'Live Map',
      desc: 'View incidents on map',
      icon: MapIcon,
      tileClass: 'green',
      hasChevron: true,
      route: '/citizen/map',
      ariaLabel: 'Quick action: Live Map. View real-time incidents on the map.',
    },
    {
      id: 'notifications',
      title: 'Updates',
      desc: 'Check latest updates',
      icon: Bell,
      tileClass: 'purple',
      route: '/citizen/updates',
      ariaLabel: 'Quick action: Updates. Check latest emergency updates.',
    },
  ];

  return (
    <section aria-label="Quick navigation actions">
      <div className="citizen-section-header">
        <div className="citizen-section-title-wrap">
          <span className="citizen-section-title">
            <Zap size={15} strokeWidth={2.4} style={{ color: '#22C7FF' }} aria-hidden="true" />
            Quick Actions
          </span>
          <span className="citizen-section-sub">Get help quickly or access important pages</span>
        </div>
      </div>

      <div className="citizen-quick-actions-grid">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <div
              key={act.id}
              className={`citizen-action-card ${act.isDanger ? 'report-danger' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => navigate(act.route)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(act.route);
                }
              }}
              aria-label={act.ariaLabel}
            >
              <div className="citizen-action-left">
                <div className={`citizen-action-icon-tile ${act.tileClass}`} aria-hidden="true">
                  <Icon size={17} strokeWidth={2.2} />
                </div>
                <div className="citizen-action-info">
                  <span className="citizen-action-title">{act.title}</span>
                  <span className="citizen-action-desc">{act.desc}</span>
                </div>
              </div>
              {act.hasChevron && (
                <ChevronRight size={14} strokeWidth={2} className="citizen-action-chevron" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

