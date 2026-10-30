import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, MapPin, Users, ArrowRight } from 'lucide-react';

export default function IncidentDetailModal({ incident, onClose }) {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!incident) return null;

  const publicCode = incident.public_code ? `#${incident.public_code}` : `#DR-${incident.id}`;
  const locationText = incident.address || incident.location_text || 'Pune area';

  return (
    <div
      className="citizen-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-incident-title"
      onClick={onClose}
    >
      <div
        className="citizen-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="citizen-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span id="modal-incident-title" style={{ fontSize: 16, fontWeight: 700, color: '#F4F7FA' }}>
              {publicCode}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 9999,
                background: 'rgba(1, 174, 253, 0.15)',
                color: '#38BDF8',
                border: '1px solid rgba(1, 174, 253, 0.3)',
                textTransform: 'capitalize',
              }}
            >
              {incident.status?.replace('_', ' ') || 'Reported'}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 9999,
                background: 'rgba(240, 68, 56, 0.15)',
                color: '#FCA5A5',
                border: '1px solid rgba(240, 68, 56, 0.3)',
                textTransform: 'capitalize',
              }}
            >
              {incident.priority || 'Medium'}
            </span>
          </div>

          <button
            type="button"
            className="citizen-modal-close"
            onClick={onClose}
            aria-label="Close details dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#8997A5', marginBottom: 4 }}>
              Description
            </div>
            <p style={{ fontSize: 13, color: '#B8C3CE', lineHeight: 1.5, margin: 0 }}>
              {incident.description || 'No detailed description provided.'}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, background: '#0D151D', padding: 12, borderRadius: 8, border: '1px solid #1C2A35' }}>
            <div>
              <div style={{ fontSize: 10.5, color: '#8997A5', marginBottom: 2 }}>Category</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#F4F7FA', textTransform: 'capitalize' }}>
                {incident.category || 'General'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10.5, color: '#8997A5', marginBottom: 2 }}>People Affected</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#F4F7FA', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Users size={13} style={{ color: '#01AEFD' }} />
                {incident.people_affected || 1}
              </div>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 10.5, color: '#8997A5', marginBottom: 2 }}>Location</div>
              <div style={{ fontSize: 12.5, color: '#B8C3CE', display: 'flex', alignItems: 'center', gap: 5 }}>
                <MapPin size={13} style={{ color: '#01AEFD', flexShrink: 0 }} />
                <span>{locationText}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              className="citizen-view-action-btn"
              onClick={onClose}
              style={{ padding: '7px 14px', fontSize: 12 }}
            >
              Close
            </button>
            <button
              type="button"
              className="citizen-hero-btn"
              onClick={() => {
                onClose();
                navigate(`/citizen/requests?id=${incident.id}`);
              }}
              style={{ padding: '7px 14px', fontSize: 12 }}
            >
              <span>Open in My Requests</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
