import {
  X,
  MapPin,
  Clock,
  Phone,
  Mail,
  User,
  Compass,
  ArrowRight,
  ShieldAlert,
  AlertTriangle,
  UserCheck,
  Users,
  Home,
  HeartPulse,
  Package,
  Truck,
  CheckCircle2,
  ExternalLink,
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
  adminMode = false,
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
            Click on any marker on the map or an item from the directory to inspect live status, exact coordinates, and emergency response actions.
          </p>
        </div>
      </aside>
    );
  }

  const isAdmin = adminMode || user?.role === 'admin';
  const isIncident = selectedType === 'own' || selectedType === 'public' || (!selectedType && selectedItem.category);
  const isPlace = selectedType === 'place' || Boolean(selectedItem.capacity !== undefined && selectedItem.type);
  const isTeam = selectedType === 'team' || Boolean(selectedItem.status && !selectedItem.category && !selectedItem.capacity);
  const isZone = selectedType === 'zone' || Boolean(selectedItem.radius_meters);

  const displayCode = selectedItem.public_code || (selectedItem.id ? `#DR-${selectedItem.id}` : 'RESOURCE');
  const displayArea = selectedItem.address || selectedItem.location_text || selectedItem.displayArea || 'Pune Metro Area';
  const displayTime = selectedItem.created_at ? formatRelativeTime(selectedItem.created_at) : null;

  const priorityClass = `priority-badge-${selectedItem.priority || 'medium'}`;

  // Image source resolution
  const photoSrc = selectedItem.photo_url ||
    selectedItem.photo_preview ||
    (isPlace && selectedItem.type === 'hospital'
      ? 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80'
      : isPlace && selectedItem.type === 'shelter'
      ? 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&w=800&q=80'
      : isTeam
      ? 'https://images.unsplash.com/photo-1587740896339-96a76170508d?auto=format&fit=crop&w=800&q=80'
      : 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80');

  const lat = selectedItem.latitude ?? selectedItem.displayLat ?? selectedItem.approx_latitude;
  const lon = selectedItem.longitude ?? selectedItem.displayLon ?? selectedItem.approx_longitude;

  return (
    <aside
      className="map-right-panel drawer-open"
      aria-label={`Details for ${displayCode}`}
      role="region"
      tabIndex={0}
    >
      {/* 1. Top Image with close button */}
      <div className="panel-hero-image-wrap">
        <img
          src={photoSrc}
          alt={`Scene view for ${displayCode}`}
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
        {/* 2. Header Row */}
        <div className="panel-meta-row">
          <div className="panel-id-group">
            {isIncident ? (
              <AlertTriangle size={15} className="panel-warning-icon" aria-hidden="true" />
            ) : isPlace ? (
              <Home size={15} style={{ color: 'var(--color-success)' }} />
            ) : isTeam ? (
              <Truck size={15} style={{ color: 'var(--accent-primary)' }} />
            ) : (
              <ShieldAlert size={15} style={{ color: 'var(--color-critical)' }} />
            )}
            <span className="panel-id-text">{displayCode}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {selectedItem.priority && (
              <span className={`priority-badge-pill ${priorityClass}`}>
                {selectedItem.priority.toUpperCase()}
              </span>
            )}
            {selectedItem.status && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: selectedItem.status === 'resolved' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(1, 174, 253, 0.15)',
                  color: selectedItem.status === 'resolved' ? '#22C55E' : '#22C7FF',
                  border: `1px solid ${selectedItem.status === 'resolved' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(1, 174, 253, 0.3)'}`,
                }}
              >
                {selectedItem.status.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>

        {/* 3. Title */}
        <h2 className="panel-item-title">
          {selectedItem.name ||
            selectedItem.title ||
            selectedItem.description ||
            selectedItem.headline ||
            `${(selectedItem.category || 'Incident').replace(/_/g, ' ').toUpperCase()} Incident`}
        </h2>

        {/* 4. Location row */}
        <div className="panel-location-row">
          <div className="panel-location-left">
            <MapPin size={14} className="panel-pin-icon" />
            <span title={displayArea}>{displayArea}</span>
          </div>
          {incidentDistanceKm != null && (
            <span className="panel-distance-tag">{incidentDistanceKm.toFixed(1)} km away</span>
          )}
        </div>

        {/* Exact Coordinates for Admin */}
        {isAdmin && lat != null && lon != null && (
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: -6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Exact GPS:</span>
            <span style={{ color: 'var(--text-secondary)' }}>{Number(lat).toFixed(6)}, {Number(lon).toFixed(6)}</span>
          </div>
        )}

        {/* 5. Reported Time */}
        {displayTime && (
          <div className="panel-time-row">
            <Clock size={13} className="panel-clock-icon" />
            <span>Reported {displayTime}</span>
          </div>
        )}

        {/* Reporter contact information for Admin */}
        {isAdmin && selectedItem.reporter && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
              Reporter Contact
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
              {selectedItem.reporter.full_name || selectedItem.reporter.name}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, fontSize: 11.5, color: 'var(--text-secondary)' }}>
              {selectedItem.reporter.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Phone size={12} color="var(--accent-primary)" />
                  <a href={`tel:${selectedItem.reporter.phone}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                    {selectedItem.reporter.phone}
                  </a>
                </div>
              )}
              {selectedItem.reporter.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mail size={12} color="var(--accent-primary)" />
                  <a href={`mailto:${selectedItem.reporter.email}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                    {selectedItem.reporter.email}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Assigned Response Teams for Admin */}
        {isAdmin && selectedItem.assigned_teams && selectedItem.assigned_teams.length > 0 && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#10B981', marginBottom: 4 }}>
              Assigned Response Teams
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedItem.assigned_teams.map((tm, idx) => (
                <span key={idx} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', background: 'rgba(255, 255, 255, 0.05)', padding: '2px 8px', borderRadius: 4 }}>
                  {tm}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 6. View full details button */}
        {isIncident && (
          <button
            type="button"
            className="panel-view-full-btn"
            style={{ marginTop: 12 }}
            onClick={() => {
              if (isAdmin) {
                window.location.href = `/admin/incidents?selectedId=${selectedItem.id}`;
              } else if (selectedItem.isOwn) {
                window.location.href = `/citizen/requests`;
              } else {
                window.alert(`Viewing summary for incident ${displayCode}`);
              }
            }}
            aria-label={`View full details for incident ${displayCode}`}
          >
            <span>{isAdmin ? 'Manage in Incident Management' : 'View full details'}</span>
            <ArrowRight size={16} />
          </button>
        )}

        {/* Divider */}
        <div className="panel-horizontal-divider" />

        {/* 7. Quick actions */}
        <div className="panel-section-wrap">
          <h3 className="panel-section-title">Quick actions</h3>
          {isAdmin && isIncident ? (
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
                href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`}
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
