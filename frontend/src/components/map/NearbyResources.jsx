import { HeartPulse, Home, Package, Truck, Compass } from 'lucide-react';

export default function NearbyResources({ resources = [], className = '' }) {
  if (!resources || resources.length === 0) {
    return (
      <div className="nearby-resources-empty">
        <Compass size={18} className="nearby-empty-icon" />
        <p>No registered resources within 5 km.</p>
      </div>
    );
  }

  return (
    <div className={`nearby-resources-list ${className}`} role="list" aria-label="Nearby emergency resources">
      {resources.map((res) => {
        const isHospital = res.type === 'hospital';
        const isShelter = res.type === 'shelter';
        const isTeam = res.type === 'team' || res.type === 'response_team';

        const ResIcon = isHospital ? HeartPulse : isShelter ? Home : isTeam ? Truck : Package;
        const tileColor = isHospital ? '#00BFFF' : isShelter ? '#22C55E' : isTeam ? '#0EA5FF' : '#A855F7';

        // Availability pill calculation
        let availStatus = 'available';
        let availText = 'Available';

        if (res.available === false || res.status === 'busy') {
          availStatus = 'full';
          availText = 'Full';
        } else if (res.capacity && res.capacity < 15) {
          availStatus = 'limited';
          availText = 'Limited';
        }

        const distLabel = res.distance_km != null ? `${res.distance_km.toFixed(1)} km away` : 'Nearby';

        return (
          <div
            key={res.id || `${res.type}-${res.name}`}
            className="panel-resource-row"
            role="listitem"
            tabIndex={0}
            aria-label={`${res.name}, ${distLabel}, Status: ${availText}`}
          >
            <div
              className="panel-resource-tile"
              style={{
                background: `color-mix(in srgb, ${tileColor} 14%, transparent)`,
                borderColor: `color-mix(in srgb, ${tileColor} 32%, transparent)`,
                color: tileColor,
              }}
              aria-hidden="true"
            >
              <ResIcon size={18} strokeWidth={2.2} />
            </div>

            <div className="panel-resource-info">
              <div className="panel-resource-name" title={res.name}>
                {res.name}
              </div>
              <div className="panel-resource-dist">{distLabel}</div>
            </div>

            <span className={`availability-pill availability-pill-${availStatus}`}>
              <span className="availability-pill-dot" aria-hidden="true" />
              {availText}
            </span>
          </div>
        );
      })}
    </div>
  );
}
