import {
  X,
  MapPin,
  Clock,
  Phone,
  Compass,
  ArrowRight,
  ShieldAlert,
  AlertTriangle,
  UserCheck,
  Users,
} from 'lucide-react';
import { formatRelativeTime } from '../ui/Timeline';
import NearbyResources from './NearbyResources';

export default function DetailPanel({
  selectedItem,
  selectedType,
  onClose,
  incidentDistanceKm,
  nearbyResources,
  user,
  onMarkResponding,
  onAssignTeam,
  actionLoading,
}) {
  if (!selectedItem) {
    return (
      <aside className="map-right-panel is-empty" aria-label="No item selected">
        <div className="panel-empty-state">
          <div className="panel-empty-icon-wrap" aria-hidden="true">
            <Compass size={28} strokeWidth={1.8} />
          </div>
          <h3 className="panel-empty-title">Select an Incident or Resource</h3>
          <p className="panel-empty-desc">
            Click on any marker on the map or an incident from the directory to inspect live status, nearby emergency resources, and dispatch actions.
          </p>
        </div>
      </aside>
    );
  }

  const isIncident = selectedType === 'own' || selectedType === 'public';
  const isOwn = selectedItem.isOwn;
  const isAdmin = user?.role === 'admin';

  const displayCode = selectedItem.public_code || `#DR-${selectedItem.id}`;
  const displayTitle = isOwn
    ? (selectedItem.title || selectedItem.description || 'Emergency Incident')
    : (selectedItem.headline || `${(selectedItem.category || 'Incident').replace('_', ' ').toUpperCase()} Incident`);
  const displayArea = selectedItem.displayArea || selectedItem.location_text || selectedItem.address || 'Pune Area';
  const displayTime = formatRelativeTime(selectedItem.created_at);

  const priorityClass = `priority-badge-${selectedItem.priority || 'medium'}`;

  // Public incident photo fallback or real photo for own incidents
  const photoSrc = isOwn && selectedItem.photo_url
    ? selectedItem.photo_url
    : selectedItem.photo_preview || 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80';

  return (
    <aside
      className="map-right-panel drawer-open"
      aria-label={`Details for ${displayCode}`}
      role="region"
      tabIndex={0}
    >
      {/* 1. Top: 180px image with a red rounded close button in top-right */}
      <div className="panel-hero-image-wrap">
        <img
          src={photoSrc}
          alt={`Scene photograph for ${displayCode}`}
          className="panel-hero-image"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80';
          }}
        />
        <button
          type="button"
          onClick={onClose}
          className="panel-close-circle-btn"
          title="Close details panel"
          aria-label="Close details panel"
        >
          <X size={15} strokeWidth={2.5} />
        </button>
      </div>

      <div className="panel-scroll-content">
        {/* 2. Below: "#DR-xxxx" with a PILL priority badge */}
        <div className="panel-meta-row">
          <div className="panel-id-group">
            <AlertTriangle size={15} className="panel-warning-icon" aria-hidden="true" />
            <span className="panel-id-text">{displayCode}</span>
          </div>
          <span className={`priority-badge-pill ${priorityClass}`}>
            {selectedItem.priority ? selectedItem.priority.toUpperCase() : 'MEDIUM'}
          </span>
        </div>

        {/* 3. Bold 22px title */}
        <h2 className="panel-item-title">{displayTitle}</h2>

        {/* 4. Location row with an icon and the distance right-aligned */}
        <div className="panel-location-row">
          <div className="panel-location-left">
            <MapPin size={14} className="panel-pin-icon" />
            <span title={displayArea}>{displayArea}</span>
          </div>
          {incidentDistanceKm != null && (
            <span className="panel-distance-tag">{incidentDistanceKm.toFixed(1)} km away</span>
          )}
        </div>

        {/* 5. "Reported ..." row with a clock icon */}
        <div className="panel-time-row">
          <Clock size={13} className="panel-clock-icon" />
          <span>Reported {displayTime}</span>
        </div>

        {/* 6. Full-width primary "View full details" button (44px tall) */}
        <button
          type="button"
          className="panel-view-full-btn"
          onClick={() => {
            if (isOwn) {
              window.location.href = `/citizen/requests`;
            } else {
              window.alert(`Viewing summary for incident ${displayCode}`);
            }
          }}
          aria-label={`View full details for incident ${displayCode}`}
        >
          <span>View full details</span>
          <ArrowRight size={16} />
        </button>

        {/* Divider */}
        <div className="panel-horizontal-divider" />

        {/* 7. Quick actions (citizen: Get directions and Call 112 only) */}
        <div className="panel-section-wrap">
          <h3 className="panel-section-title">Quick actions</h3>
          {isAdmin ? (
            <div className="panel-actions-grid">
              <button
                type="button"
                className="panel-admin-action-btn primary"
                onClick={() => onMarkResponding(selectedItem.id)}
                disabled={actionLoading || selectedItem.status === 'in_progress'}
                aria-label="Mark incident as responding"
              >
                <UserCheck size={14} />
                <span>{selectedItem.status === 'in_progress' ? 'Responding' : 'Mark as responding'}</span>
              </button>
              <button
                type="button"
                className="panel-admin-action-btn secondary"
                onClick={() => onAssignTeam(selectedItem.id)}
                disabled={actionLoading}
                aria-label="Assign emergency team"
              >
                <Users size={14} />
                <span>Assign team</span>
              </button>
            </div>
          ) : (
            <div className="panel-actions-grid">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selectedItem.displayLat || selectedItem.latitude},${selectedItem.displayLon || selectedItem.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="panel-action-btn"
                aria-label="Open maps for directions"
              >
                <Compass size={15} />
                <span>Get directions</span>
              </a>
              <a
                href="tel:112"
                className="panel-action-btn"
                aria-label="Emergency call 112"
              >
                <Phone size={15} />
                <span>Call 112</span>
              </a>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="panel-horizontal-divider" />

        {/* 8. "Nearby resources (within 5 km)" Section */}
        <div className="panel-section-wrap">
          <h3 className="panel-section-title">Nearby resources (within 5 km)</h3>
          <NearbyResources resources={nearbyResources} />
        </div>
      </div>
    </aside>
  );
}
