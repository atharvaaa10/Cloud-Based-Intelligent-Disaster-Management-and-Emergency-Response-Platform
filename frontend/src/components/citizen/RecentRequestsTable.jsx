import { Link } from 'react-router-dom';
import {
  FileText,
  MapPin,
  HeartPulse,
  Utensils,
  Home,
  HelpCircle,
  Waves,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';

const CATEGORY_MAP = {
  rescue: { label: 'Rescue', icon: AlertTriangle, color: '#F04438' },
  flooding: { label: 'Flooding', icon: Waves, color: '#F59E0B' },
  medical: { label: 'Medical', icon: HeartPulse, color: '#01AEFD' },
  food_water: { label: 'Food & Water', icon: Utensils, color: '#F59E0B' },
  shelter: { label: 'Shelter', icon: Home, color: '#34D399' },
  other: { label: 'Other', icon: HelpCircle, color: '#8997A5' },
};

function formatTimeAgo(dateInput) {
  if (!dateInput) return 'Just now';
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

export default function RecentRequestsTable({
  requests = [],
  loading = false,
  isDemo = false,
  onSelectIncident,
}) {
  const getPriorityClass = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'critical':
        return 'priority-critical';
      case 'high':
        return 'priority-high';
      case 'medium':
        return 'priority-medium';
      case 'low':
      default:
        return 'priority-low';
    }
  };

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'under_review':
        return 'status-under-review';
      case 'assigned':
      case 'in_progress':
        return 'status-in-progress';
      case 'resolved':
        return 'status-resolved';
      case 'reported':
      default:
        return 'status-reported';
    }
  };

  const formatStatusLabel = (status) => {
    if (!status) return 'Reported';
    switch (status.toLowerCase()) {
      case 'under_review':
        return 'Under Review';
      case 'in_progress':
      case 'assigned':
        return 'In Progress';
      case 'resolved':
        return 'Resolved';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  return (
    <section className="citizen-table-card" aria-label="Recent Emergency Requests">
      <div className="citizen-section-header">
        <div className="citizen-section-title-wrap">
          <span className="citizen-section-title">
            <FileText size={15} strokeWidth={2.2} style={{ color: '#01AEFD' }} aria-hidden="true" />
            Recent Emergency Requests
            {isDemo && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#FCD34D',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  marginLeft: 6,
                }}
              >
                Demo Data
              </span>
            )}
          </span>
          <span className="citizen-section-sub">Your latest submitted requests</span>
        </div>

        <Link to="/citizen/requests" className="citizen-section-link">
          <span>View all requests</span>
          <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      <div className="citizen-table-wrapper">
        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#8997A5', fontSize: 13 }}>
            Loading your submitted requests...
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#8997A5' }}>
            <p style={{ margin: '0 0 12px 0', fontSize: 13 }}>You have not submitted any emergency reports yet.</p>
            <Link
              to="/citizen/report"
              className="citizen-hero-btn"
              style={{ display: 'inline-flex', padding: '7px 14px', fontSize: 12 }}
            >
              Report Emergency
            </Link>
          </div>
        ) : (
          <table className="citizen-table">
            <thead>
              <tr>
                <th scope="col" style={{ width: '12%' }}>ID</th>
                <th scope="col" style={{ width: '18%' }}>Category</th>
                <th scope="col" style={{ width: '26%' }}>Location</th>
                <th scope="col" style={{ width: '14%' }}>Priority</th>
                <th scope="col" style={{ width: '14%' }}>Status</th>
                <th scope="col" style={{ width: '16%' }}>Reported</th>
                <th scope="col" style={{ width: '10%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const catInfo = CATEGORY_MAP[r.category] || CATEGORY_MAP.other;
                const CatIcon = catInfo.icon;
                const publicCode = r.public_code ? `#${r.public_code}` : `#DR-${r.id}`;
                const locationText = r.address || r.location_text || 'Pune';

                return (
                  <tr key={r.id}>
                    <td className="citizen-table-id">{publicCode}</td>
                    <td>
                      <div className="citizen-category-cell">
                        <CatIcon size={14} strokeWidth={2.2} style={{ color: catInfo.color }} className="citizen-category-icon" aria-hidden="true" />
                        <span>{catInfo.label}</span>
                      </div>
                    </td>
                    <td>
                      <div className="citizen-location-cell" title={locationText}>
                        <MapPin size={12} strokeWidth={2} style={{ color: '#8997A5', flexShrink: 0 }} aria-hidden="true" />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>
                          {locationText}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`citizen-badge-pill ${getPriorityClass(r.priority)}`}>
                        {r.priority ? r.priority.charAt(0).toUpperCase() + r.priority.slice(1) : 'Low'}
                      </span>
                    </td>
                    <td>
                      <span className={`citizen-badge-pill ${getStatusClass(r.status)}`}>
                        {formatStatusLabel(r.status)}
                      </span>
                    </td>
                    <td style={{ color: '#8997A5' }}>
                      {r.reported_time || formatTimeAgo(r.created_at)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="citizen-view-action-btn"
                        onClick={() => onSelectIncident?.(r)}
                        aria-label={`View details for request ${publicCode}`}
                      >
                        <span>View</span>
                        <ArrowRight size={11} strokeWidth={2.2} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
