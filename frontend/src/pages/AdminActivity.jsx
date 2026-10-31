import { useState, useEffect, useCallback } from 'react';
import {
  RotateCw,
  ChevronRight,
  ChevronDown,
  Shield,
  User,
  Cpu,
  Activity,
  Bell,
  Radio,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import {
  Table,
  Button,
  Card,
  Badge,
  Select,
  EmptyState,
  SkeletonTableRow,
  StatCard,
  formatRelativeTime,
  formatFullTime,
} from '../components/ui';

export default function AdminActivity() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'broadcasts'

  // ── Audit Log State ────────────────────────────────────────────
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);

  // ── Broadcasts / Announcements State ───────────────────────────
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (actionFilter) params.append('action', actionFilter);
      if (entityFilter) params.append('entity_type', entityFilter);

      const res = await api.get(`/admin/audit-log?${params.toString()}`);
      setLogs(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      toast.error(err.message || 'Failed to fetch audit log');
    } finally {
      setLoading(false);
    }
  }, [page, limit, actionFilter, entityFilter, toast]);

  const fetchAnnouncements = useCallback(async () => {
    setAnnouncementsLoading(true);
    try {
      const data = await api.get('/notifications/announcements');
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    } finally {
      setAnnouncementsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const toggleRow = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const getActorBadge = (actor) => {
    if (!actor) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--text-tertiary)',
            fontSize: 'var(--text-xs)',
          }}
        >
          <Cpu size={12} /> System / AI
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--text-primary)',
          fontSize: 'var(--text-xs)',
          fontWeight: 500,
        }}
      >
        <User size={12} /> {actor.name || actor.email}
      </span>
    );
  };

  const getActionBadge = (action) => {
    let variant = 'default';
    if (action.includes('CREATE') || action.includes('REGISTER')) variant = 'success';
    else if (action.includes('UPDATE') || action.includes('ASSIGN')) variant = 'high';
    else if (action.includes('DELETE')) variant = 'critical';
    else if (action.includes('STATUS')) variant = 'medium';

    return <Badge variant={variant}>{action}</Badge>;
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1 className="ui-page-title">Notifications &amp; Audit Trail</h1>
          <p className="ui-page-desc">
            Immutable security ledger, administrative action tracking, and live emergency broadcast advisories.
          </p>
        </div>

        {activeTab === 'audit' && (
          <Button
            variant="secondary"
            icon={RotateCw}
            onClick={fetchLogs}
            disabled={loading}
          >
            Refresh audit log
          </Button>
        )}
      </div>

      {/* Top Stat Cards */}
      <div className="ui-stat-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="Total Audit Events"
          value={total}
          icon={Activity}
          variant="default"
        />
        <StatCard
          label="Active Broadcasts"
          value={announcements.length}
          icon={Radio}
          variant="info"
        />
        <StatCard
          label="Security Ledger"
          value="Encrypted"
          icon={Shield}
          variant="success"
        />
        <StatCard
          label="System Health"
          value="Operational"
          icon={CheckCircle2}
          variant="success"
        />
      </div>

      {/* Unified Tab Switcher */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          borderBottom: '1px solid var(--border)',
          marginBottom: 20,
          paddingBottom: 2,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            fontSize: 'var(--text-sm)',
            fontWeight: activeTab === 'audit' ? 600 : 500,
            color: activeTab === 'audit' ? '#22C7FF' : 'var(--text-secondary)',
            background: activeTab === 'audit' ? 'rgba(1, 174, 253, 0.12)' : 'transparent',
            border: activeTab === 'audit' ? '1px solid rgba(1, 174, 253, 0.35)' : '1px solid transparent',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Shield size={16} />
          <span>Audit Trail</span>
          <span
            style={{
              padding: '2px 7px',
              borderRadius: 10,
              fontSize: 11,
              background: activeTab === 'audit' ? 'rgba(1, 174, 253, 0.25)' : 'var(--panel)',
              color: activeTab === 'audit' ? '#FFF' : 'var(--text-muted)',
            }}
          >
            {total}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('broadcasts')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            fontSize: 'var(--text-sm)',
            fontWeight: activeTab === 'broadcasts' ? 600 : 500,
            color: activeTab === 'broadcasts' ? '#22C7FF' : 'var(--text-secondary)',
            background: activeTab === 'broadcasts' ? 'rgba(1, 174, 253, 0.12)' : 'transparent',
            border: activeTab === 'broadcasts' ? '1px solid rgba(1, 174, 253, 0.35)' : '1px solid transparent',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Radio size={16} />
          <span>Emergency Broadcasts &amp; Alerts</span>
          <span
            style={{
              padding: '2px 7px',
              borderRadius: 10,
              fontSize: 11,
              background: activeTab === 'broadcasts' ? 'rgba(1, 174, 253, 0.25)' : 'var(--panel)',
              color: activeTab === 'broadcasts' ? '#FFF' : 'var(--text-muted)',
            }}
          >
            {announcements.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Audit Log */}
      {activeTab === 'audit' && (
        <>
          {/* Filters Bar */}
          <div className="filters-bar" style={{ marginBottom: 16 }}>
            <Select
              id="action-filter"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'All actions' },
                { value: 'CREATE', label: 'Create events' },
                { value: 'UPDATE', label: 'Update events' },
                { value: 'DELETE', label: 'Delete events' },
                { value: 'STATUS_CHANGE', label: 'Status changes' },
                { value: 'ASSIGN', label: 'Assignments' },
              ]}
            />

            <Select
              id="entity-filter"
              value={entityFilter}
              onChange={(e) => {
                setEntityFilter(e.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'All entity types' },
                { value: 'incident', label: 'Incidents' },
                { value: 'team', label: 'Teams' },
                { value: 'resource', label: 'Resources' },
                { value: 'user', label: 'Users' },
              ]}
            />
          </div>

          {/* Audit Trail Table */}
          {loading ? (
            <Card padding="none">
              <Table compact>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th style={{ width: 80 }}>ID</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Actor</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  <SkeletonTableRow columns={6} />
                  <SkeletonTableRow columns={6} />
                  <SkeletonTableRow columns={6} />
                  <SkeletonTableRow columns={6} />
                  <SkeletonTableRow columns={6} />
                </tbody>
              </Table>
            </Card>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No audit records found"
              description="System modifications, incident triage updates, and administrative actions will be recorded here."
            />
          ) : (
            <Card padding="none">
              <Table compact hoverable>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th style={{ width: 80 }}>ID</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Actor</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const isExpanded = expandedRow === log.id;
                    return (
                      <tr
                        key={log.id}
                        style={{
                          borderBottom: isExpanded ? 'none' : '1px solid var(--border-default)',
                        }}
                      >
                        <td
                          style={{
                            cursor: 'pointer',
                            textAlign: 'center',
                            color: 'var(--text-tertiary)',
                          }}
                          onClick={() => toggleRow(log.id)}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-tertiary)',
                          }}
                        >
                          #{log.id}
                        </td>
                        <td>{getActionBadge(log.action)}</td>
                        <td style={{ textTransform: 'capitalize' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--bg-surface-hover)',
                              fontSize: 'var(--text-xs)',
                            }}
                          >
                            {log.entity_type} {log.entity_id ? `(#${log.entity_id})` : ''}
                          </span>
                        </td>
                        <td>{getActorBadge(log.actor)}</td>
                        <td
                          style={{ fontSize: 'var(--text-xs)' }}
                          title={formatFullTime(log.created_at)}
                        >
                          {formatRelativeTime(log.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    Showing page {page} of {totalPages} ({total} events)
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* Tab 2: Broadcasts & Announcements */}
      {activeTab === 'broadcasts' && (
        <div>
          {announcementsLoading ? (
            <Card padding="none">
              <Table compact>
                <thead>
                  <tr>
                    <th>Title &amp; Message</th>
                    <th>Authority</th>
                    <th>Severity</th>
                    <th>Issued</th>
                  </tr>
                </thead>
                <tbody>
                  <SkeletonTableRow columns={4} />
                  <SkeletonTableRow columns={4} />
                  <SkeletonTableRow columns={4} />
                </tbody>
              </Table>
            </Card>
          ) : announcements.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No active emergency broadcasts"
              description="Public announcements and alerts issued to citizens will appear here."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {announcements.map((ann) => (
                <Card
                  key={ann.id}
                  style={{
                    borderLeft: `4px solid ${
                      ann.severity === 'critical'
                        ? 'var(--color-critical)'
                        : ann.severity === 'warning'
                        ? 'var(--color-high)'
                        : 'var(--primary)'
                    }`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 8,
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Radio size={16} color="var(--primary)" />
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {ann.title}
                      </h3>
                    </div>
                    <Badge variant={ann.severity}>{ann.severity}</Badge>
                  </div>

                  <p
                    style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                      marginBottom: 12,
                    }}
                  >
                    {ann.message}
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                      borderTop: '1px solid var(--border-subtle)',
                      paddingTop: 8,
                    }}
                  >
                    <span>Issued by: {ann.source}</span>
                    <span>{formatRelativeTime(ann.issued_at)}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
