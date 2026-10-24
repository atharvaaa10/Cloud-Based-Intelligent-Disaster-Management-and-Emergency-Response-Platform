import { useState, useEffect, useCallback } from 'react';
import {
  RotateCw,
  Filter,
  ChevronRight,
  ChevronDown,
  Terminal,
  Shield,
  User,
  Cpu,
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
  formatRelativeTime,
  formatFullTime,
} from '../components/ui';

export default function AuditLog() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);

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
      toast.error(err.message || 'Failed to fetch audit log records');
    } finally {
      setLoading(false);
    }
  }, [page, limit, actionFilter, entityFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / limit) || 1;

  const getActionPill = (action) => {
    const isCritical = action.includes('failure') || action.includes('deleted');
    const isSuccess = action.includes('success') || action.includes('created');
    const isAutoTriage = action.includes('auto_triaged');

    let className = 'ui-badge ui-badge-sm ';
    if (isCritical) className += 'ui-badge-prio-critical';
    else if (isSuccess) className += 'ui-badge-status-resolved';
    else if (isAutoTriage) className += 'ui-badge-autotriage';
    else className += 'ui-badge-status-assigned';

    return (
      <span className={className}>
        {action.replace('.', ' → ')}
      </span>
    );
  };

  return (
    <div>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1 className="ui-page-title">Security & operational audit trail</h1>
          <p className="ui-page-desc">
            Immutable regulatory logging of all authentication events, triage executions, and state changes ({total} total entries).
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          icon={RotateCw}
          onClick={fetchLogs}
          loading={loading}
        >
          Refresh log
        </Button>
      </div>

      {/* Filter Controls */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div style={{ minWidth: 200, flex: 1 }}>
          <Select
            id="action-filter"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All action types' },
              { value: 'auth.login', label: 'Auth logins (success & failure)' },
              { value: 'incident.', label: 'Incident status & priority' },
              { value: 'incident.auto_triaged', label: 'Serverless auto-triage' },
              { value: 'team.', label: 'Team fleet operations' },
              { value: 'resource.', label: 'Resource allocations' },
            ]}
          />
        </div>

        <div style={{ minWidth: 160 }}>
          <Select
            id="entity-filter"
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All entity types' },
              { value: 'incident', label: 'Incident' },
              { value: 'user', label: 'User' },
              { value: 'team', label: 'Team' },
              { value: 'resource', label: 'Resource' },
            ]}
          />
        </div>

        {(actionFilter || entityFilter) && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setActionFilter('');
              setEntityFilter('');
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Main Table */}
      {loading && logs.length === 0 ? (
        <Card padding="none">
          <Table compact>
            <thead>
              <tr>
                <th style={{ width: 150 }}>Timestamp</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Entity</th>
                <th>Client IP</th>
                <th style={{ width: 80 }}>Details</th>
              </tr>
            </thead>
            <tbody>
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
          description="No administrative or operational log events match the selected criteria."
          actionLabel={actionFilter || entityFilter ? 'Clear filters' : undefined}
          onAction={() => {
            setActionFilter('');
            setEntityFilter('');
          }}
        />
      ) : (
        <Card padding="none">
          <Table compact stickyHeader>
            <thead>
              <tr>
                <th style={{ width: 140 }}>Timestamp</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Target entity</th>
                <th>IP address</th>
                <th style={{ width: 90 }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((item) => {
                const isExpanded = expandedRow === item.id;
                const hasDetails = item.details && Object.keys(item.details).length > 0;

                return (
                  <tr
                    key={item.id}
                    style={{
                      backgroundColor: isExpanded ? 'var(--bg-surface-subdued)' : undefined,
                    }}
                  >
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span
                          title={formatFullTime(item.created_at)}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {formatRelativeTime(item.created_at)}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            color: 'var(--text-tertiary)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {new Date(item.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                    </td>

                    <td>{getActionPill(item.action)}</td>

                    <td>
                      {item.actor ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '12px', fontWeight: 500 }}>
                            {item.actor.name}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {item.actor_role}
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontSize: '12px', fontWeight: 500 }}>
                          <Cpu size={13} />
                          <span>{item.actor_role || 'System'}</span>
                        </div>
                      )}
                    </td>

                    <td>
                      {item.entity_type ? (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {item.entity_type} #{item.entity_id}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>

                    <td
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {item.ip_address || '—'}
                    </td>

                    <td>
                      {hasDetails ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedRow(isExpanded ? null : item.id)}
                          style={{ padding: '2px 6px', fontSize: '11px' }}
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                        </Button>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                          None
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          {/* Details inspection drawer when row is expanded */}
          {expandedRow && (
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface-subdued)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Payload metadata (Log #{expandedRow})
                </span>
                <Button variant="ghost" size="sm" onClick={() => setExpandedRow(null)}>
                  Close inspection
                </Button>
              </div>
              <pre
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  lineHeight: 1.5,
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  overflowX: 'auto',
                  margin: 0,
                }}
              >
                {JSON.stringify(
                  logs.find((l) => l.id === expandedRow)?.details || {},
                  null,
                  2
                )}
              </pre>
            </div>
          )}

          {/* Pagination Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderTop: '1px solid var(--border-default)',
              backgroundColor: 'var(--bg-surface-subdued)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}
          >
            <span>
              Page {page} of {totalPages} ({total.toLocaleString()} total entries)
            </span>

            <div style={{ display: 'flex', gap: 6 }}>
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
