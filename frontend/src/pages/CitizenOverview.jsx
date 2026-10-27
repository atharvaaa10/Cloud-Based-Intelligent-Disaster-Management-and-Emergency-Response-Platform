import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  MapPin,
  Phone,
  ExternalLink,
  ShieldAlert,
  LifeBuoy,
  HeartPulse,
  Utensils,
  Home,
  HelpCircle,
  Users,
  Bell,
  Compass,
  RotateCcw,
  ArrowRight,
  Info,
  Clock,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Card,
  Badge,
  Button,
  EmptyState,
  SkeletonStatCard,
  GlobalStatRow,
  formatRelativeTime,
} from '../components/ui';

const CATEGORY_ICONS = {
  rescue: LifeBuoy,
  medical: HeartPulse,
  food_water: Utensils,
  shelter: Home,
  other: HelpCircle,
};

const CATEGORY_LABELS = {
  rescue: 'Rescue',
  medical: 'Medical',
  food_water: 'Food & Water',
  shelter: 'Shelter',
  other: 'Other',
};

export default function CitizenOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detectingGps, setDetectingGps] = useState(false);
  const [userCoords, setUserCoords] = useState(null);

  // Fetch overview data
  const fetchOverview = useCallback(async (coords = null) => {
    try {
      setLoading(true);
      setError('');
      let path = '/citizen/overview';
      if (coords && coords.latitude && coords.longitude) {
        path += `?lat=${coords.latitude}&lon=${coords.longitude}`;
      }
      const res = await api.get(path);
      setData(res);
    } catch (err) {
      console.error('[CITIZEN_OVERVIEW] Failed to load data:', err);
      setError(err.message || 'Unable to load citizen overview. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview(userCoords);
  }, [fetchOverview, userCoords]);

  // Request browser geolocation for shelter proximity
  const handleUseGps = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDetectingGps(false);
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserCoords(coords);
        toast.success('Location updated. Showing nearest relief shelters.');
      },
      (geoErr) => {
        setDetectingGps(false);
        console.warn('[GEO_ERR]', geoErr);
        toast.error('Location permission was denied. Defaulting to Pune city center.');
      },
      { timeout: 8000 }
    );
  };

  const getPriorityBadgeVariant = (priority) => {
    switch (priority) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      case 'low':
        return 'neutral';
      case 'pending':
      default:
        return 'neutral';
    }
  };

  const getPriorityLabel = (priority) => {
    if (!priority || priority === 'pending') return 'Pending review';
    return priority.charAt(0).toUpperCase() + priority.slice(1);
  };

  return (
    <div className="citizen-overview-layout">
      {/* ── 1. Prominent "Report Emergency" Hero Banner ── */}
      <section className="emergency-hero-banner" aria-label="Emergency response quick action">
        <div className="emergency-hero-left">
          <div className="emergency-live-pill">
            <span className="emergency-live-dot" />
            <span>24x7 Civilian Emergency Response</span>
          </div>
          <h1 className="emergency-hero-title">
            Disaster Response & Safety Hub
          </h1>
          <p className="emergency-hero-desc">
            Immediate assistance dispatch for rescue, medical trauma, flood evacuation, and relief supplies in Pune district.
          </p>
        </div>

        <div className="emergency-hero-right">
          <button
            type="button"
            className="btn-report-emergency-hero"
            onClick={() => navigate('/citizen/report')}
            id="btn-report-emergency-quick"
          >
            <AlertTriangle size={20} strokeWidth={2.2} />
            <span>Report Emergency</span>
          </button>

          <div className="hero-helpline-badges">
            <a href="tel:112" className="hero-helpline-pill" title="National Emergency Call">
              <span>Police: <strong>112</strong></span>
            </a>
            <a href="tel:108" className="hero-helpline-pill" title="Medical Ambulance">
              <span>Ambulance: <strong>108</strong></span>
            </a>
            <a href="tel:1077" className="hero-helpline-pill" title="Disaster Relief Helpline">
              <span>Disaster: <strong>1077</strong></span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Error Banner ── */}
      {error && (
        <div className="ui-alert ui-alert-danger" role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <strong>Error loading overview:</strong> {error}
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchOverview(userCoords)}>
            <RotateCcw size={14} /> Retry
          </Button>
        </div>
      )}

      {/* ── Global Disaster Operations Stat Row (5 Tinted KPIs) ── */}
      <GlobalStatRow userCoords={userCoords} />

      {/* ── 2. Summary Cards for User's Own Requests (Total, Active, Resolved) ── */}
      <section aria-label="My emergency requests summary">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            My Requests Overview
          </span>
          <div className="live-indicator-wrap">
            <span className="live-indicator-dot" />
            <span>Live Sync · Updated just now</span>
          </div>
        </div>

        {loading && !data ? (
          <div className="ui-stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </div>
        ) : (
          <div className="ui-stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {/* Total Requests - Blue Tinted */}
            <div
              className="stat-card-tinted stat-tint-blue stat-card-gradient-border is-clickable"
              onClick={() => navigate('/citizen/requests')}
              role="button"
              tabIndex={0}
              id="stat-card-total"
              style={{ cursor: 'pointer' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/citizen/requests');
                }
              }}
            >
              <div className="stat-tint-top">
                <span className="stat-tint-label" style={{ color: 'var(--text-secondary)' }}>Total Requests</span>
                <div className="stat-tint-icon-wrap">
                  <ClipboardList size={16} strokeWidth={2} />
                </div>
              </div>
              <div className="stat-tint-value" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '8px 0 4px' }}>
                {data?.stats?.total ?? 0}
              </div>
              <div className="stat-tint-trend" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Submitted by you &bull; View all &rarr;
              </div>
            </div>

            {/* Active Requests - Red Tinted with pulse */}
            <div
              className="stat-card-tinted stat-tint-red stat-card-gradient-border is-clickable"
              onClick={() => navigate('/citizen/requests?status=reported')}
              role="button"
              tabIndex={0}
              id="stat-card-active"
              style={{ cursor: 'pointer' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/citizen/requests?status=reported');
                }
              }}
            >
              <div className="stat-tint-top">
                <span className="stat-tint-label" style={{ color: 'var(--text-secondary)' }}>Active Emergencies</span>
                <div className="stat-tint-icon-wrap critical-pulse-badge">
                  <AlertTriangle size={16} strokeWidth={2} />
                </div>
              </div>
              <div className="stat-tint-value" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '8px 0 4px' }}>
                {data?.stats?.active ?? 0}
              </div>
              <div className="stat-tint-trend" style={{ fontSize: 11, color: '#EF4444' }}>
                Awaiting / in active response &rarr;
              </div>
            </div>

            {/* Resolved Requests - Green Tinted */}
            <div
              className="stat-card-tinted stat-tint-green stat-card-gradient-border is-clickable"
              onClick={() => navigate('/citizen/requests?status=resolved')}
              role="button"
              tabIndex={0}
              id="stat-card-resolved"
              style={{ cursor: 'pointer' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/citizen/requests?status=resolved');
                }
              }}
            >
              <div className="stat-tint-top">
                <span className="stat-tint-label" style={{ color: 'var(--text-secondary)' }}>Resolved Cases</span>
                <div className="stat-tint-icon-wrap">
                  <CheckCircle2 size={16} strokeWidth={2} />
                </div>
              </div>
              <div className="stat-tint-value" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '8px 0 4px' }}>
                {data?.stats?.resolved ?? 0}
              </div>
              <div className="stat-tint-trend" style={{ fontSize: 11, color: '#10B981' }}>
                Completed relief cases &rarr;
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 3. Main Two-Column Content Grid ── */}
      <div className="overview-grid">
        {/* ── Left Column: Recent Requests & Announcements ── */}
        <div className="overview-col">
          {/* Recent Requests Section (3 most recent) */}
          <Card>
            <div className="ui-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 className="ui-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-base)' }}>
                  <Clock size={18} className="text-accent" />
                  <span>My Recent Requests</span>
                </h2>
                <small style={{ color: 'var(--text-muted)' }}>Latest reports filed from your account</small>
              </div>

              {data?.stats?.total > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/citizen/requests')}
                  id="btn-view-all-requests"
                >
                  <span>View all</span>
                  <ArrowRight size={14} />
                </Button>
              )}
            </div>

            <div className="ui-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {loading && !data ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <span className="ui-spinner" style={{ width: 22, height: 22, marginBottom: 8 }} />
                  <div>Loading your requests...</div>
                </div>
              ) : !data?.recent_requests || data.recent_requests.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No emergency requests filed"
                  description="You have not reported any incidents yet. If you or someone nearby is in danger, report it immediately."
                  action={
                    <Button variant="danger" size="sm" onClick={() => navigate('/citizen/report')}>
                      <AlertTriangle size={15} />
                      <span>Report emergency now</span>
                    </Button>
                  }
                />
              ) : (
                data.recent_requests.map((req) => {
                  const CatIcon = CATEGORY_ICONS[req.category] || HelpCircle;
                  return (
                    <div key={req.id} className="recent-request-item" id={`recent-req-${req.id}`}>
                      <div className="recent-request-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="recent-request-code">{req.public_code}</span>
                          <span
                            className="ui-badge"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <CatIcon size={12} strokeWidth={2} />
                            <span>{CATEGORY_LABELS[req.category] || req.category}</span>
                          </span>
                        </div>

                        <div className="recent-request-badges">
                          <span className={`ui-badge ui-badge-prio-${req.priority || 'pending'}`}>
                            {getPriorityLabel(req.priority)}
                          </span>
                          <span className={`ui-badge ui-badge-status-${req.status || 'reported'}`}>
                            {req.status?.replace(/_/g, ' ') || 'Reported'}
                          </span>
                        </div>
                      </div>

                      <p className="recent-request-desc" title={req.description}>
                        {req.description}
                      </p>

                      <div className="recent-request-bottom">
                        <span className="recent-request-loc" title={req.location_text || req.address}>
                          <MapPin size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                          <span>{req.location_text || req.address}</span>
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span>{formatRelativeTime(req.created_at)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            style={{ padding: '2px 6px', fontSize: 12 }}
                            onClick={() => navigate(`/citizen/requests?search=${req.public_code}`)}
                          >
                            <span>Track</span>
                            <ArrowRight size={12} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Important Announcements / Alerts */}
          <Card>
            <div className="ui-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 className="ui-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-base)' }}>
                  <Bell size={18} style={{ color: '#f59e0b' }} />
                  <span>Important Announcements & Alerts</span>
                </h2>
                <small style={{ color: 'var(--text-muted)' }}>Official emergency cell broadcasts & civic advisories</small>
              </div>

              <span
                className="ui-badge"
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#f59e0b',
                  borderColor: 'rgba(245, 158, 11, 0.3)',
                }}
              >
                Official Bulletin
              </span>
            </div>

            <div className="ui-card-body">
              {loading && !data ? (
                <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <span className="ui-spinner" style={{ width: 20, height: 20 }} />
                </div>
              ) : (
                <div className="announcements-list">
                  {data?.announcements?.map((ann) => (
                    <article
                      key={ann.id}
                      className={`announcement-item severity-${ann.severity}`}
                      id={`announcement-${ann.id}`}
                    >
                      <div className="announcement-header">
                        <h3 className="announcement-title">{ann.title}</h3>
                        <span
                          className="ui-badge"
                          style={{
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            fontWeight: 700,
                            padding: '2px 6px',
                          }}
                        >
                          {ann.severity}
                        </span>
                      </div>

                      <p className="announcement-msg">{ann.message}</p>

                      <div className="announcement-meta">
                        <span>Issued by: <strong>{ann.source}</strong></span>
                        <span>{formatRelativeTime(ann.issued_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Right Column: Nearby Shelters (3 closest) & Help Info ── */}
        <div className="overview-col">
          {/* Nearby Shelters */}
          <Card>
            <div className="ui-card-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <h2 className="ui-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-base)' }}>
                  <Home size={18} style={{ color: '#3b82f6' }} />
                  <span>Nearby Shelters</span>
                </h2>
                <small style={{ color: 'var(--text-muted)' }}>3 closest relief refuges & temporary bedding</small>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleUseGps}
                disabled={detectingGps}
                title="Refresh proximity using device GPS"
                style={{ padding: '4px 8px', fontSize: 11 }}
                id="btn-update-shelter-gps"
              >
                <Compass size={13} className={detectingGps ? 'animate-spin' : ''} />
                <span>{detectingGps ? 'Locating...' : 'GPS Proximity'}</span>
              </Button>
            </div>

            <div className="ui-card-body">
              {loading && !data ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <span className="ui-spinner" style={{ width: 22, height: 22, marginBottom: 8 }} />
                  <div>Finding closest shelters...</div>
                </div>
              ) : !data?.nearby_shelters || data.nearby_shelters.length === 0 ? (
                <EmptyState
                  icon={Home}
                  title="No active shelters nearby"
                  description="Check back shortly or contact the emergency helpline for shelter dispatch."
                />
              ) : (
                <div className="shelters-list">
                  {data.nearby_shelters.map((shelter) => (
                    <div key={shelter.id} className="shelter-item" id={`shelter-${shelter.id}`}>
                      <div className="shelter-header-row">
                        <h3 className="shelter-name">{shelter.name}</h3>
                        <span className="shelter-dist-tag">
                          <MapPin size={11} />
                          <span>{shelter.distance_km} km</span>
                        </span>
                      </div>

                      <p className="shelter-address">
                        <MapPin size={13} style={{ flexShrink: 0, marginTop: 2, color: 'var(--text-muted)' }} />
                        <span>{shelter.address}</span>
                      </p>

                      <div className="shelter-details-row">
                        <div className="shelter-capacity">
                          <Users size={13} />
                          <span>Cap: <strong>{shelter.capacity}</strong></span>
                          <span style={{ color: '#10b981', fontWeight: 600, marginLeft: 4 }}>&bull; Open</span>
                        </div>

                        <div className="shelter-actions">
                          {shelter.contact && (
                            <a
                              href={`tel:${shelter.contact.replace(/\s+/g, '')}`}
                              className="ui-btn ui-btn-outline ui-btn-sm"
                              style={{ padding: '2px 8px', fontSize: 11, textDecoration: 'none' }}
                              title={`Call ${shelter.contact}`}
                            >
                              <Phone size={11} />
                              <span>Call</span>
                            </a>
                          )}
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${shelter.latitude},${shelter.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ui-btn ui-btn-secondary ui-btn-sm"
                            style={{ padding: '2px 8px', fontSize: 11, textDecoration: 'none' }}
                            title="Open directions in Google Maps"
                          >
                            <ExternalLink size={11} />
                            <span>Map</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Quick Safety & Citizen Helpline Guide */}
          <Card>
            <div className="ui-card-header">
              <h2 className="ui-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-base)' }}>
                <ShieldAlert size={18} style={{ color: 'var(--accent)' }} />
                <span>Emergency Helplines</span>
              </h2>
            </div>
            <div className="ui-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', paddingBottom: 6, borderBottom: '1px solid var(--border-subdued)' }}>
                <span>PMC Disaster Control Room:</span>
                <a href="tel:02025501269" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>020-25501269</a>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', paddingBottom: 6, borderBottom: '1px solid var(--border-subdued)' }}>
                <span>Flood Rescue & Relief Cell:</span>
                <a href="tel:02025506800" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>020-25506800</a>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', paddingBottom: 6, borderBottom: '1px solid var(--border-subdued)' }}>
                <span>NDRF Control (Toll-Free):</span>
                <a href="tel:1077" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>1077</a>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)' }}>
                <span>Police / Fire / Ambulance:</span>
                <a href="tel:112" style={{ color: 'var(--critical-default)', fontWeight: 700, textDecoration: 'none' }}>112</a>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
