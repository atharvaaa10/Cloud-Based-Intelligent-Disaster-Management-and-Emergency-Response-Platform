import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
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
      setError(err.message || 'Failed to fetch audit records');
    } finally {
      setLoading(false);
    }
  }, [page, limit, actionFilter, entityFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / limit) || 1;

  const getActionBadgeClass = (action) => {
    if (action.includes('failure') || action.includes('deleted')) return 'badge-critical';
    if (action.includes('success') || action.includes('created')) return 'badge-resolved';
    if (action.includes('auto_triaged')) return 'badge-in_progress';
    return 'badge-assigned';
  };

  const formatActionName = (action) => {
    return action.replace('.', ' → ').toUpperCase();
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>📜 Application Audit Trail</h2>
          <p>Security and administrative operational event logging ({total} total entries)</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchLogs} disabled={loading}>
          {loading ? 'Refreshing...' : '🔄 Refresh Log'}
        </button>
      </div>

      {error && <div className="alert alert-error mb-3">{error}</div>}

      {/* Filter controls */}
      <div className="card mb-3 p-3" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--c-text-muted)' }}>ACTION TYPE</label>
          <select
            className="form-control"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Actions</option>
            <option value="auth.login">Auth Logins (Success/Fail)</option>
            <option value="incident.">Incident Changes</option>
            <option value="incident.auto_triaged">Auto-Triage Operations</option>
            <option value="team.">Team Management</option>
            <option value="resource.">Resource Management</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '180px' }}>
          <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--c-text-muted)' }}>ENTITY TYPE</label>
          <select
            className="form-control"
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Entities</option>
            <option value="incident">Incident</option>
            <option value="user">User</option>
            <option value="team">Team</option>
            <option value="resource">Resource</option>
          </select>
        </div>

        {(actionFilter || entityFilter) && (
          <div style={{ alignSelf: 'flex-end' }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setActionFilter('');
                setEntityFilter('');
                setPage(1);
              }}
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Audit table */}
      <div className="card">
        {loading && logs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--c-text-muted)' }}>
            <span className="spinner" /> Loading audit records...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--c-text-muted)' }}>
            No audit records found matching the criteria.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Entity</th>
                  <th>Client IP</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontSize: '.8rem', whiteSpace: 'nowrap', color: 'var(--c-text-muted)' }}>
                      {new Date(item.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${getActionBadgeClass(item.action)}`}>
                        {formatActionName(item.action)}
                      </span>
                    </td>
                    <td>
                      {item.actor ? (
                        <div>
                          <strong>{item.actor.name}</strong>
                          <div style={{ fontSize: '.75rem', color: 'var(--c-text-muted)' }}>
                            {item.actor.email} ({item.actor_role})
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--c-primary)', fontWeight: 600 }}>
                          🤖 {item.actor_role || 'System'}
                        </span>
                      )}
                    </td>
                    <td>
                      {item.entity_type ? (
                        <span style={{ fontSize: '.85rem' }}>
                          <code>{item.entity_type}</code> #{item.entity_id}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--c-text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '.8rem', fontFamily: 'monospace' }}>
                      {item.ip_address || '—'}
                    </td>
                    <td>
                      {item.details && Object.keys(item.details).length > 0 ? (
                        <div>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ padding: '2px 8px', fontSize: '.75rem' }}
                            onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}
                          >
                            {expandedRow === item.id ? 'Hide' : 'Inspect'}
                          </button>
                          {expandedRow === item.id && (
                            <pre
                              style={{
                                marginTop: '.5rem',
                                padding: '.5rem',
                                background: 'rgba(0,0,0,0.25)',
                                borderRadius: '4px',
                                fontSize: '.75rem',
                                maxWidth: '340px',
                                overflowX: 'auto',
                              }}
                            >
                              {JSON.stringify(item.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--c-text-muted)', fontSize: '.8rem' }}>None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            borderTop: '1px solid var(--c-border)',
          }}
        >
          <div style={{ fontSize: '.85rem', color: 'var(--c-text-muted)' }}>
            Page {page} of {totalPages} ({total} entries)
          </div>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
