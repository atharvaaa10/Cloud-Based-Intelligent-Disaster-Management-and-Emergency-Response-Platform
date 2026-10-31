import { AlertTriangle, Waves, HeartPulse, Home, Truck, Package, X, ChevronUp, Flame } from 'lucide-react';

export default function MapLegend({ isOpen, onToggle, adminMode = false }) {
  if (!isOpen) {
    return (
      <button
        type="button"
        className="map-floating-legend-toggle"
        onClick={() => onToggle(true)}
        title="Open map legend"
        aria-label="Open map legend"
      >
        <span className="legend-toggle-icon" aria-hidden="true">🗺️</span>
        <span>Map Legend</span>
        <ChevronUp size={13} style={{ marginLeft: 4 }} />
      </button>
    );
  }

  return (
    <div
      className="map-floating-legend"
      role="region"
      aria-label="Map legend"
      tabIndex={0}
    >
      <div className="legend-header">
        <span className="legend-title">{adminMode ? 'Priority & Layer Legend' : 'Map Legend'}</span>
        <button
          type="button"
          onClick={() => onToggle(false)}
          className="legend-close-btn"
          title="Collapse map legend"
          aria-label="Collapse map legend"
        >
          <X size={14} />
        </button>
      </div>

      <div className="legend-items-list">
        {adminMode ? (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
              Incidents (By Priority)
            </div>
            <div className="legend-item-row">
              <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(240, 68, 56, 0.2)', '--legend-border-color': '#F04438' }}>
                <Flame size={13} strokeWidth={2.2} color="#F04438" />
              </div>
              <span className="legend-item-text" style={{ color: '#F04438', fontWeight: 600 }}>Critical Priority</span>
            </div>

            <div className="legend-item-row">
              <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(245, 158, 11, 0.2)', '--legend-border-color': '#F59E0B' }}>
                <AlertTriangle size={13} strokeWidth={2.2} color="#F59E0B" />
              </div>
              <span className="legend-item-text" style={{ color: '#F59E0B', fontWeight: 500 }}>High Priority</span>
            </div>

            <div className="legend-item-row">
              <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(250, 204, 21, 0.2)', '--legend-border-color': '#FACC15' }}>
                <AlertTriangle size={13} strokeWidth={2.2} color="#FACC15" />
              </div>
              <span className="legend-item-text" style={{ color: '#FACC15' }}>Medium Priority</span>
            </div>

            <div className="legend-item-row">
              <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(1, 174, 253, 0.2)', '--legend-border-color': '#01AEFD' }}>
                <AlertTriangle size={13} strokeWidth={2.2} color="#01AEFD" />
              </div>
              <span className="legend-item-text" style={{ color: '#22C7FF' }}>Low Priority</span>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 6, marginBottom: 2 }}>
              Emergency Infrastructure
            </div>
          </>
        ) : (
          <div className="legend-item-row">
            <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(240, 68, 56, 0.15)', '--legend-border-color': 'rgba(240, 68, 56, 0.4)' }}>
              <AlertTriangle size={13} strokeWidth={2.2} color="#F04438" />
            </div>
            <span className="legend-item-text">Emergency Incident</span>
          </div>
        )}

        <div className="legend-item-row">
          <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(34, 197, 94, 0.15)', '--legend-border-color': 'rgba(34, 197, 94, 0.4)' }}>
            <Home size={13} strokeWidth={2.2} color="#22C55E" />
          </div>
          <span className="legend-item-text">Shelter / Relief Camp</span>
        </div>

        <div className="legend-item-row">
          <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(0, 191, 255, 0.15)', '--legend-border-color': 'rgba(0, 191, 255, 0.4)' }}>
            <HeartPulse size={13} strokeWidth={2.2} color="#00BFFF" />
          </div>
          <span className="legend-item-text">Medical Facility</span>
        </div>

        <div className="legend-item-row">
          <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(14, 165, 255, 0.15)', '--legend-border-color': 'rgba(14, 165, 255, 0.4)' }}>
            <Truck size={13} strokeWidth={2.2} color="#0EA5FF" />
          </div>
          <span className="legend-item-text">Response Team (Field GPS)</span>
        </div>

        <div className="legend-item-row">
          <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(168, 85, 247, 0.15)', '--legend-border-color': 'rgba(168, 85, 247, 0.4)' }}>
            <Package size={13} strokeWidth={2.2} color="#A855F7" />
          </div>
          <span className="legend-item-text">Relief Supplies Depot</span>
        </div>

        <div className="legend-item-row">
          <div className="legend-region-icon" aria-hidden="true" />
          <span className="legend-item-text">Affected Zone Perimeter</span>
        </div>
      </div>
    </div>
  );
}
