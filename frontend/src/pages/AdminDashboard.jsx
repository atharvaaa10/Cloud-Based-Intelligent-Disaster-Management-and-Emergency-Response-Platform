import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Inbox,
  Clock,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Eye,
  TrendingUp,
  Flame,
  ArrowRight,
  ShieldAlert,
  Users,
  MapPin,
  AlertCircle,
} from 'lucide-react';
import { api } from '../api';
import {
  Table,
  Badge,
  Card,
  Button,
  EmptyState,
  SkeletonTableRow,
  formatRelativeTime,
  formatFullTime,
} from '../components/ui';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchOverview = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const res = await api.get('/admin/overview');
      setData(res);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err.message || 'Unable to load operational dashboard metrics.');
    } finally {
      setLoading(false);
      if (manual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    // 30-second polling
    const timer = setInterval(() => {
      fetchOverview();
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchOverview]);

  // Format YYYY-MM-DD for XAxis and Tooltips
  const formatDateLabel = (dStr) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length < 3) return dStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[parseInt(parts[1], 10) - 1] || parts[1];
    const day = parseInt(parts[2], 10);
    return `${month} ${day}`;
  };

  const chartData = useMemo(() => {
    if (!data?.incidents_per_day) return [];
    return data.incidents_per_day.map((item) => ({
      ...item,
      label: formatDateLabel(item.date),
    }));
  }, [data]);

  const total14DayCount = useMemo(() => {
    if (!chartData.length) return 0;
    return chartData.reduce((sum, item) => sum + (item.count || 0), 0);
  }, [chartData]);

  // Formatted last updated time hh:mm:ss
  const formattedTime = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '—';

  // ── Custom Dark Tooltip ────────────────────────────────────────
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            backgroundColor: '#0D151D',
            border: '1px solid #243442',
            padding: '8px 12px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
            {label}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#22C7FF' }}>
            {payload[0].value} incident{payload[0].value === 1 ? '' : 's'}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      {/* Page Header with 30s Polling Indicator */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 className="ui-page-title">Operations Dashboard</h1>
          <p className="ui-page-desc">
            Real-time incident telemetry, emergency trends, and rapid triage command.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              background: 'var(--bg-surface-hover)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: error ? 'var(--color-critical)' : 'var(--color-success)',
                display: 'inline-block',
              }}
            />
            Last updated {formattedTime}
          </span>

          <Button
            variant="secondary"
            size="sm"
            icon={RotateCw}
            onClick={() => fetchOverview(true)}
            loading={isRefreshing}
            title="Refresh dashboard metrics"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && !loading && (
        <Card
          style={{
            borderLeft: '4px solid var(--color-critical)',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertCircle size={20} color="var(--color-critical)" />
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-critical)' }}>
                Telemetry Sync Error
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{error}</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => fetchOverview(true)}>
            Retry Connection
          </Button>
        </Card>
      )}

      {/* 5 Tinted StatCards (Total, Pending, Active, Resolved, Critical) */}
      {loading ? (
        <div className="global-stat-row" style={{ marginBottom: 20 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="stat-card-tinted"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', minHeight: 88 }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--bg-surface-active)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <div style={{ width: 40, height: 24, borderRadius: 4, background: 'var(--bg-surface-active)' }} />
                <div style={{ width: 70, height: 12, borderRadius: 4, background: 'var(--bg-surface-active)' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <section
          className="global-stat-row"
          style={{ marginBottom: 20 }}
          aria-label="Operations KPI Metrics"
        >
          {/* 1. Total (Blue / Cyan Tint) */}
          <div
            className="stat-card-tinted stat-tint-blue"
            id="stat-card-total-incidents"
            tabIndex={0}
            role="button"
            onClick={() => navigate('/admin/incidents')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/admin/incidents')}
            style={{ cursor: 'pointer' }}
            aria-label="Total Incidents: click to view in Incident Management"
          >
            <div className="stat-tint-icon-wrap" aria-hidden="true">
              <Inbox size={22} strokeWidth={2.2} />
            </div>
            <div className="stat-tint-center">
              <span className="stat-tint-number">{data?.total_incidents ?? 0}</span>
              <span className="stat-tint-label">Total Incidents</span>
            </div>
            <div className="stat-tint-right">
              <span className="stat-right-top">All time</span>
              <span className="stat-right-bottom">all records</span>
            </div>
          </div>

          {/* 2. Pending (Amber Tint) */}
          <div
            className="stat-card-tinted stat-tint-amber"
            id="stat-card-pending-reports"
            tabIndex={0}
            role="button"
            onClick={() => navigate('/admin/incidents?status=pending')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/admin/incidents?status=pending')}
            style={{ cursor: 'pointer' }}
            aria-label="Pending Reports: click to filter Incident Management"
          >
            <div className="stat-tint-icon-wrap" aria-hidden="true">
              <Clock size={22} strokeWidth={2.2} />
            </div>
            <div className="stat-tint-center">
              <span className="stat-tint-number">{data?.pending_reports ?? 0}</span>
              <span className="stat-tint-label">Pending</span>
            </div>
            <div className="stat-tint-right">
              <span className="stat-right-top">Awaiting</span>
              <span className="stat-right-bottom">triage check</span>
            </div>
          </div>

          {/* 3. Active (Purple Tint) */}
          <div
            className="stat-card-tinted stat-tint-purple"
            id="stat-card-active-emergencies"
            tabIndex={0}
            role="button"
            onClick={() => navigate('/admin/incidents?status=active')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/admin/incidents?status=active')}
            style={{ cursor: 'pointer' }}
            aria-label="Active Emergencies: click to filter Incident Management"
          >
            <div className="stat-tint-icon-wrap" aria-hidden="true">
              <Zap size={22} strokeWidth={2.2} />
            </div>
            <div className="stat-tint-center">
              <span className="stat-tint-number">{data?.active_emergencies ?? 0}</span>
              <span className="stat-tint-label">Active</span>
            </div>
            <div className="stat-tint-right">
              <span className="stat-right-top">In action</span>
              <span className="stat-right-bottom">units dispatched</span>
            </div>
          </div>

          {/* 4. Resolved (Green Tint) */}
          <div
            className="stat-card-tinted stat-tint-green"
            id="stat-card-resolved-cases"
            tabIndex={0}
            role="button"
            onClick={() => navigate('/admin/incidents?status=resolved')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/admin/incidents?status=resolved')}
            style={{ cursor: 'pointer' }}
            aria-label="Resolved Cases: click to filter Incident Management"
          >
            <div className="stat-tint-icon-wrap" aria-hidden="true">
              <CheckCircle2 size={22} strokeWidth={2.2} />
            </div>
            <div className="stat-tint-center">
              <span className="stat-tint-number">{data?.resolved_cases ?? 0}</span>
              <span className="stat-tint-label">Resolved</span>
            </div>
            <div className="stat-tint-right">
              <span className="stat-right-top">Closed</span>
              <span className="stat-right-bottom">stabilized</span>
            </div>
          </div>

          {/* 5. Critical (Red Tint) */}
          <div
            className="stat-card-tinted stat-tint-red"
            id="stat-card-critical-alerts"
            tabIndex={0}
            role="button"
            onClick={() => navigate('/admin/incidents?priority=critical')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/admin/incidents?priority=critical')}
            style={{ cursor: 'pointer' }}
            aria-label="Critical Alerts: click to filter Incident Management"
          >
            <div className="stat-tint-icon-wrap" aria-hidden="true">
              <AlertTriangle size={22} strokeWidth={2.2} />
            </div>
            <div className="stat-tint-center">
              <span className="stat-tint-number">{data?.critical_alerts ?? 0}</span>
              <span className="stat-tint-label">Critical</span>
            </div>
            <div className="stat-tint-right">
              <span className="stat-right-top" style={{ color: 'var(--color-critical)' }}>
                Urgent
              </span>
              <span className="stat-right-bottom">high triage</span>
            </div>
          </div>
        </section>
      )}

      {/* Incident Trend Chart & Category Breakdown Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 16,
          marginBottom: 20,
        }}
      >
        {/* Trend Area Chart (Recharts) */}
        <Card style={{ padding: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={18} color="var(--primary)" />
                <h2 style={{ fontSize: 15, fontWeight: 600 }}>14-Day Incident Volume</h2>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Daily reported emergency distribution over the past two weeks ({total14DayCount} total)
              </p>
            </div>
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                background: 'var(--panel)',
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid var(--border-subtle)',
              }}
            >
              14 Days Trend
            </span>
          </div>

          {loading ? (
            <div
              style={{
                height: 220,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-surface-hover)',
                borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading telemetry trend...</span>
            </div>
          ) : chartData.length === 0 ? (
            <div
              style={{
                height: 220,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              No trend telemetry recorded in the last 14 days
            </div>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C2A35" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#8997A5"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#243442' }}
                  />
                  <YAxis
                    stroke="#8997A5"
                    fontSize={11}
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={{ stroke: '#243442' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#01AEFD"
                    strokeWidth={2}
                    fill="rgba(1, 174, 253, 0.12)"
                    dot={{ r: 2.5, fill: '#01AEFD' }}
                    activeDot={{ r: 5, fill: '#22C7FF', stroke: '#0C1117', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Count by Category Snapshot */}
        <Card style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>Incidents by Category</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Breakdown across emergency response sectors
            </p>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  style={{ height: 26, background: 'var(--bg-surface-hover)', borderRadius: 4 }}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(data?.by_category || {}).map(([cat, count]) => {
                const total = data?.total_incidents || 1;
                const pct = Math.round((count / total) * 100);
                const colors = {
                  rescue: '#F04438',
                  medical: '#01AEFD',
                  food_water: '#F59E0B',
                  shelter: '#22C55E',
                  other: '#A855F7',
                };
                const color = colors[cat] || '#8997A5';

                return (
                  <div
                    key={cat}
                    onClick={() => navigate(`/admin/incidents?category=${cat}`)}
                    style={{
                      cursor: 'pointer',
                      padding: '6px 8px',
                      borderRadius: 6,
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>
                        {cat.replace(/_/g, ' ')}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {count}{' '}
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({pct}%)</span>
                      </span>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: 5,
                        backgroundColor: 'var(--panel)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          backgroundColor: color,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Critical Incidents Needing Attention */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Flame size={18} color="var(--color-critical)" />
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>
              Critical Incidents Needing Attention
            </h2>
            {data?.critical_incidents?.length > 0 && (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'rgba(240, 68, 56, 0.15)',
                  color: '#F04438',
                  border: '1px solid rgba(240, 68, 56, 0.3)',
                }}
              >
                {data.critical_incidents.length} active
              </span>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/incidents?priority=critical')}
          >
            Manage all critical ({data?.critical_alerts ?? 0}) &rarr;
          </Button>
        </div>

        {loading ? (
          <Card padding="none">
            <Table compact>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>ID</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Affected</th>
                  <th>Status</th>
                  <th>Reported</th>
                  <th style={{ width: 90, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                <SkeletonTableRow columns={7} />
                <SkeletonTableRow columns={7} />
                <SkeletonTableRow columns={7} />
              </tbody>
            </Table>
          </Card>
        ) : !data?.critical_incidents || data.critical_incidents.length === 0 ? (
          <Card style={{ padding: 32, textAlign: 'center' }}>
            <CheckCircle2
              size={36}
              color="var(--color-success)"
              style={{ margin: '0 auto 10px' }}
            />
            <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
              No critical incidents needing attention
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              All critical severity emergencies have been resolved or mitigated.
            </p>
          </Card>
        ) : (
          <Card padding="none">
            <Table compact hoverable>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>ID</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Affected</th>
                  <th>Status</th>
                  <th>Reported</th>
                  <th style={{ width: 90, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.critical_incidents.map((incident) => (
                  <tr
                    key={incident.id}
                    onClick={() => navigate(`/admin/incidents/${incident.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#F04438' }}>
                      #{incident.id}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(240, 68, 56, 0.12)',
                          color: '#F04438',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 500,
                        }}
                      >
                        {incident.category?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td
                      style={{
                        maxWidth: 240,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={incident.location_text || incident.address}
                    >
                      {incident.location_text || incident.address || '—'}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {incident.people_affected != null
                        ? incident.people_affected
                        : (incident.affected_count != null ? incident.affected_count : '—')}
                    </td>
                    <td>
                      <Badge variant={incident.status}>{incident.status}</Badge>
                    </td>
                    <td title={formatFullTime(incident.created_at)}>
                      {formatRelativeTime(incident.created_at)}
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Eye}
                        onClick={() => navigate(`/admin/incidents/${incident.id}`)}
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      {/* Quick Access Operational Links */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <Card
          hoverable
          onClick={() => navigate('/admin/map')}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(1, 174, 253, 0.12)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MapPin size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>Live Disaster Map</h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  GIS spatial deployment &amp; markers
                </p>
              </div>
            </div>
            <ArrowRight size={16} color="var(--text-tertiary)" />
          </div>
        </Card>

        <Card
          hoverable
          onClick={() => navigate('/admin/resources')}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(1, 174, 253, 0.12)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Users size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>Rescue Teams &amp; Stock</h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Fleet units &amp; relief supplies
                </p>
              </div>
            </div>
            <ArrowRight size={16} color="var(--text-tertiary)" />
          </div>
        </Card>

        <Card
          hoverable
          onClick={() => navigate('/admin/activity')}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(1, 174, 253, 0.12)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldAlert size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>Security &amp; Audit Trail</h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Immutable event ledger &amp; alerts
                </p>
              </div>
            </div>
            <ArrowRight size={16} color="var(--text-tertiary)" />
          </div>
        </Card>
      </div>
    </div>
  );
}
