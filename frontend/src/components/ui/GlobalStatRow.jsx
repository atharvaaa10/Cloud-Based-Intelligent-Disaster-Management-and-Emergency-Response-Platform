import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Users,
  Truck,
  Home,
  Package,
} from 'lucide-react';
import api from '../../api';
import Skeleton from './Skeleton';

/**
 * GlobalStatRow — 5-Card Tinted KPI Stat Row matching the reference design:
 * 1. Active Incidents (red tint): count, trend "% from last 24h"
 * 2. People Affected (amber tint): ONE value with label "estimated, from public reports"
 * 3. Response Teams (green tint): total, "on ground" count
 * 4. Shelters (blue tint): total, "nearby" count (only if location is allowed)
 * 5. Relief Supplies (purple tint): count of supply points, plus stock-level word (Low / Adequate / Good)
 *
 * All numbers fetched live from backend GET /citizen/stats/global (no hardcoded data).
 */
export default function GlobalStatRow({ userCoords = null, className = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        let url = '/citizen/stats/global';
        if (userCoords?.latitude && userCoords?.longitude) {
          url += `?lat=${encodeURIComponent(userCoords.latitude)}&lon=${encodeURIComponent(userCoords.longitude)}`;
        }
        const res = await api.get(url);
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load global stat cards:', err);
          setError('Unable to load live telemetry metrics');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchStats();

    // Auto-refresh metrics every 30s
    const timer = setInterval(fetchStats, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userCoords?.latitude, userCoords?.longitude]);

  if (loading && !data) {
    return (
      <div className={`global-stat-row ${className}`} aria-label="Loading disaster metrics">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="stat-card-tinted" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton width="90px" height="14px" />
              <Skeleton width="28px" height="28px" borderRadius="8px" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
              <Skeleton width="48px" height="24px" />
              <Skeleton width="60px" height="12px" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Trend formatting
  const trend = data?.incident_trend_pct ?? 0;
  const trendSign = trend > 0 ? '+' : '';
  const trendText = `${trendSign}${trend}% from last 24h`;

  // Stock status badge class
  const stockClass =
    data?.stock_level_status === 'Good'
      ? 'stock-good'
      : data?.stock_level_status === 'Low'
      ? 'stock-low'
      : 'stock-adequate';

  return (
    <section className={`global-stat-row ${className}`} aria-label="Live disaster management KPIs">
      {/* 1. Active Incidents (Red Tint) */}
      <div className="stat-card-tinted stat-tint-red" id="stat-card-active-incidents">
        <div className="stat-tint-top">
          <span className="stat-tint-label">Active Incidents</span>
          <div className="stat-tint-icon-wrap" aria-hidden="true">
            <AlertTriangle size={15} strokeWidth={2} />
          </div>
        </div>
        <div className="stat-tint-body">
          <span className="stat-tint-value">{data?.active_incidents ?? 0}</span>
          <span className="stat-tint-sub stat-tint-trend">{trendText}</span>
        </div>
      </div>

      {/* 2. People Affected (Amber Tint) — ONE value only with label "estimated, from public reports" */}
      <div className="stat-card-tinted stat-tint-amber" id="stat-card-people-affected">
        <div className="stat-tint-top">
          <span className="stat-tint-label">People Affected</span>
          <div className="stat-tint-icon-wrap" aria-hidden="true">
            <Users size={15} strokeWidth={2} />
          </div>
        </div>
        <div className="stat-tint-body">
          <span className="stat-tint-value">{data?.people_affected ?? 0}</span>
          <span className="stat-tint-sub" title="Estimated from active civilian incident reports">
            estimated, from public reports
          </span>
        </div>
      </div>

      {/* 3. Response Teams (Green Tint) */}
      <div className="stat-card-tinted stat-tint-green" id="stat-card-response-teams">
        <div className="stat-tint-top">
          <span className="stat-tint-label">Response Teams</span>
          <div className="stat-tint-icon-wrap" aria-hidden="true">
            <Truck size={15} strokeWidth={2} />
          </div>
        </div>
        <div className="stat-tint-body">
          <span className="stat-tint-value">{data?.total_response_teams ?? 0}</span>
          <span className="stat-tint-sub">
            {data?.teams_on_ground ?? 0} on ground
          </span>
        </div>
      </div>

      {/* 4. Shelters (Blue Tint) — "nearby" count only if location allowed */}
      <div className="stat-card-tinted stat-tint-blue" id="stat-card-shelters">
        <div className="stat-tint-top">
          <span className="stat-tint-label">Shelters</span>
          <div className="stat-tint-icon-wrap" aria-hidden="true">
            <Home size={15} strokeWidth={2} />
          </div>
        </div>
        <div className="stat-tint-body">
          <span className="stat-tint-value">{data?.total_shelters ?? 0}</span>
          <span className="stat-tint-sub">
            {data?.nearby_shelters_count != null
              ? `${data.nearby_shelters_count} nearby`
              : 'total available'}
          </span>
        </div>
      </div>

      {/* 5. Relief Supplies (Purple Tint) — count of supply points + stock-level word */}
      <div className="stat-card-tinted stat-tint-purple" id="stat-card-relief-supplies">
        <div className="stat-tint-top">
          <span className="stat-tint-label">Relief Supplies</span>
          <div className="stat-tint-icon-wrap" aria-hidden="true">
            <Package size={15} strokeWidth={2} />
          </div>
        </div>
        <div className="stat-tint-body">
          <span className="stat-tint-value">{data?.total_supply_points ?? 0}</span>
          <span className={`stat-stock-badge ${stockClass}`}>
            {data?.stock_level_status ?? 'Adequate'}
          </span>
        </div>
      </div>
    </section>
  );
}
