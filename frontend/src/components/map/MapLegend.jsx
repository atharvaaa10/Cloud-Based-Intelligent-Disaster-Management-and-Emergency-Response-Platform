import { AlertTriangle, Waves, HeartPulse, Home, Truck, Package, X, ChevronUp, ChevronDown } from 'lucide-react';

export default function MapLegend({ isOpen, onToggle }) {
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
        <span className="legend-title">Map Legend</span>
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
        <div className="legend-item-row">
          <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(240, 68, 56, 0.15)', '--legend-border-color': 'rgba(240, 68, 56, 0.4)' }}>
            <AlertTriangle size={13} strokeWidth={2.2} color="#F04438" />
          </div>
          <span className="legend-item-text">Emergency Incident</span>
        </div>

        <div className="legend-item-row">
          <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(245, 158, 11, 0.15)', '--legend-border-color': 'rgba(245, 158, 11, 0.4)' }}>
            <Waves size={13} strokeWidth={2.2} color="#F59E0B" />
          </div>
          <span className="legend-item-text">Flooded Area</span>
        </div>

        <div className="legend-item-row">
          <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(0, 191, 255, 0.15)', '--legend-border-color': 'rgba(0, 191, 255, 0.4)' }}>
            <HeartPulse size={13} strokeWidth={2.2} color="#00BFFF" />
          </div>
          <span className="legend-item-text">Medical Facility</span>
        </div>

        <div className="legend-item-row">
          <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(34, 197, 94, 0.15)', '--legend-border-color': 'rgba(34, 197, 94, 0.4)' }}>
            <Home size={13} strokeWidth={2.2} color="#22C55E" />
          </div>
          <span className="legend-item-text">Shelter/Relief Camp</span>
        </div>

        <div className="legend-item-row">
          <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(14, 165, 255, 0.15)', '--legend-border-color': 'rgba(14, 165, 255, 0.4)' }}>
            <Truck size={13} strokeWidth={2.2} color="#0EA5FF" />
          </div>
          <span className="legend-item-text">Response Team</span>
        </div>

        <div className="legend-item-row">
          <div className="legend-icon-badge" style={{ '--legend-bg': 'rgba(168, 85, 247, 0.15)', '--legend-border-color': 'rgba(168, 85, 247, 0.4)' }}>
            <Package size={13} strokeWidth={2.2} color="#A855F7" />
          </div>
          <span className="legend-item-text">Relief Supplies</span>
        </div>

        <div className="legend-item-row">
          <div className="legend-region-icon" aria-hidden="true" />
          <span className="legend-item-text">Affected Region (Approx.)</span>
        </div>
      </div>
    </div>
  );
}
