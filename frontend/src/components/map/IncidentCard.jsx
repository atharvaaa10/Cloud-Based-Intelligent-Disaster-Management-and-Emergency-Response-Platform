import {
  AlertTriangle,
  Activity,
  HeartPulse,
  Home,
  Users,
  HelpCircle,
  Clock,
  MapPin,
} from 'lucide-react';
import { formatRelativeTime } from '../ui/Timeline';

const CATEGORY_ICONS = {
  rescue: AlertTriangle,
  waterlogging: Activity,
  flood: Activity,
  medical: HeartPulse,
  food_water: Users,
  shelter: Home,
  other: HelpCircle,
};

const CATEGORY_COLORS = {
  rescue: '#F04438',
  waterlogging: '#F59E0B',
  flood: '#F59E0B',
  medical: '#00BFFF',
  food_water: '#FACC15',
  shelter: '#22C55E',
  other: '#01AEFD',
};

const PRIORITY_BADGE_CLASSES = {
  critical: 'priority-badge-critical',
  high: 'priority-badge-high',
  medium: 'priority-badge-medium',
  low: 'priority-badge-low',
};

export default function IncidentCard({ incident, isSelected, onClick }) {
  const CatIcon = CATEGORY_ICONS[incident.category] || HelpCircle;
  const catColor = CATEGORY_COLORS[incident.category] || '#01AEFD';
  const priorityClass = PRIORITY_BADGE_CLASSES[incident.priority] || 'priority-badge-medium';

  const displayCode = incident.public_code || `#DR-${incident.id}`;
  const displayTitle = incident.isOwn
    ? (incident.title || incident.description || 'Emergency Incident')
    : (incident.headline || `${(incident.category || 'Incident').replace('_', ' ')} incident in ${incident.displayArea}`);
  const displayTime = formatRelativeTime(incident.created_at);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(incident);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Incident ${displayCode}: ${displayTitle}, Priority ${incident.priority}, Location ${incident.displayArea}`}
      className={`map-incident-card-item ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onClick(incident)}
      onKeyDown={handleKeyDown}
      id={`incident-card-${incident.id}`}
    >
      {/* 52px rounded icon tile tinted by category */}
      <div
        className="map-card-cat-tile"
        style={{
          background: `color-mix(in srgb, ${catColor} 15%, transparent)`,
          borderColor: `color-mix(in srgb, ${catColor} 30%, transparent)`,
          color: catColor,
        }}
        aria-hidden="true"
      >
        <CatIcon size={24} strokeWidth={2.2} />
      </div>

      <div className="map-card-content">
        {/* First line: #DR-1023 in Inter + Pill priority badge + optional Mine tag + right-aligned relative time */}
        <div className="map-card-top-row">
          <div className="map-card-code-group">
            <span className="map-card-code">{displayCode}</span>
            <span className={`priority-badge-pill ${priorityClass}`}>
              {incident.priority ? (incident.priority.charAt(0).toUpperCase() + incident.priority.slice(1)) : 'Medium'}
            </span>
            {incident.isOwn && <span className="map-tag-mine">Mine</span>}
          </div>
          <span className="map-card-time">{displayTime}</span>
        </div>

        {/* Second line: Bold 17px title */}
        <div className="map-card-title" title={displayTitle}>
          {displayTitle}
        </div>

        {/* Third line: Muted location */}
        <div className="map-card-loc">
          <MapPin size={13} strokeWidth={2} className="map-loc-pin" />
          <span>{incident.displayArea}</span>
        </div>
      </div>
    </div>
  );
}
