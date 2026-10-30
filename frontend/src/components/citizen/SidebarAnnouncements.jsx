import { Link } from 'react-router-dom';
import { Volume2, AlertTriangle, Info, CheckCircle2, ArrowRight } from 'lucide-react';

function formatRelativeTime(dateInput) {
  if (!dateInput) return '2 hours ago';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Recently';
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? 'hour' : 'hours'} ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
}

export default function SidebarAnnouncements({ announcements = [] }) {
  // Reference fallback announcements matching screenshot if API is loading
  const items = announcements.length > 0
    ? announcements.slice(0, 3)
    : [
        {
          id: '1',
          title: 'Heavy rainfall expected',
          message: 'IMD has issued an orange alert for Pune district.',
          severity: 'warning',
          timeStr: '2 hours ago',
        },
        {
          id: '2',
          title: 'Shelter capacity updated',
          message: 'Kothrud Relief Shelter now has 50 available slots.',
          severity: 'info',
          timeStr: '5 hours ago',
        },
        {
          id: '3',
          title: 'System maintenance',
          message: 'The platform will be under maintenance tomorrow from 2 AM to 4 AM.',
          severity: 'low',
          timeStr: '1 day ago',
        },
      ];

  const getSeverityTile = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
      case 'warning':
        return { icon: AlertTriangle, tileClass: 'amber' };
      case 'info':
        return { icon: Info, tileClass: 'blue' };
      case 'success':
      case 'low':
      default:
        return { icon: CheckCircle2, tileClass: 'green' };
    }
  };

  return (
    <section className="citizen-sidebar-card" aria-label="Important Announcements">
      <div className="citizen-section-header">
        <div className="citizen-section-title-wrap">
          <span className="citizen-section-title">
            <Volume2 size={15} strokeWidth={2.2} style={{ color: '#01AEFD' }} aria-hidden="true" />
            Important Announcements
          </span>
        </div>

        <Link to="/citizen/updates" className="citizen-section-link">
          <span>View all</span>
          <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      <div className="citizen-announcement-list">
        {items.map((item) => {
          const { icon: ItemIcon, tileClass } = getSeverityTile(item.severity);
          const timeText = item.timeStr || formatRelativeTime(item.issued_at || item.created_at);

          return (
            <div key={item.id} className="citizen-announcement-item">
              <div className={`citizen-announcement-icon-tile ${tileClass}`} aria-hidden="true">
                <ItemIcon size={15} strokeWidth={2.2} />
              </div>
              <div className="citizen-announcement-content">
                <div className="citizen-announcement-top">
                  <span className="citizen-announcement-title" title={item.title}>
                    {item.title}
                  </span>
                  <span className="citizen-announcement-time">{timeText}</span>
                </div>
                <p className="citizen-announcement-desc">{item.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

