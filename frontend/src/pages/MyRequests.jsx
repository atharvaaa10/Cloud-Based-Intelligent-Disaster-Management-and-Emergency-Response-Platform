import { useEffect, useState } from 'react';
import { api } from '../api';

export default function MyRequests() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [details, setDetails] = useState({});

  useEffect(() => {
    api.get('/incidents/mine').then(setIncidents).finally(() => setLoading(false));
  }, []);

  const toggleDetail = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    if (!details[id]) {
      try {
        const data = await api.get(`/incidents/${id}`);
        setDetails((prev) => ({ ...prev, [id]: data }));
      } catch { /* ignore */ }
    }
    setExpanded(id);
  };

  const fmtDate = (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  if (loading) return <div className="loading-page"><span className="spinner" /> Loading...</div>;

  return (
    <>
      <div className="page-header">
        <h1>📋 My Requests</h1>
        <p>Track the status of your emergency reports.</p>
      </div>

      {incidents.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📭</div>
          <h3>No Reports Yet</h3>
          <p>You haven't submitted any emergency reports. Use "Report Emergency" to submit one.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Category</th>
                <th>Location</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Reported</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <>
                  <tr key={inc.id} className="clickable-row" onClick={() => toggleDetail(inc.id)}>
                    <td>#{inc.id}</td>
                    <td style={{ textTransform: 'capitalize' }}>{inc.category.replace('_', ' ')}</td>
                    <td>{inc.location_text}</td>
                    <td><span className={`badge badge-${inc.priority}`}>{inc.priority}</span></td>
                    <td><span className={`badge badge-${inc.status}`}>{inc.status.replace('_', ' ')}</span></td>
                    <td>{fmtDate(inc.created_at)}</td>
                  </tr>
                  {expanded === inc.id && details[inc.id] && (
                    <tr key={`detail-${inc.id}`}>
                      <td colSpan={6} style={{ background: 'var(--c-surface-2)', padding: '1.25rem' }}>
                        <div style={{ marginBottom: '1rem' }}>
                          <strong>Description:</strong>
                          <p style={{ marginTop: '.25rem', color: 'var(--c-text-muted)', fontSize: '.85rem' }}>{details[inc.id].description}</p>
                        </div>
                        {details[inc.id].status_history?.length > 0 && (
                          <div>
                            <strong>Status History:</strong>
                            <div className="timeline mt-1">
                              {details[inc.id].status_history.map((h) => (
                                <div key={h.id} className="timeline-item">
                                  <div className="status-change">
                                    {h.old_status.replace('_', ' ')} → {h.new_status.replace('_', ' ')}
                                  </div>
                                  {h.note && <div className="note">{h.note}</div>}
                                  <div className="time">{fmtDate(h.changed_at)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
