import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', priority: '', category: '' });

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.category) params.set('category', filters.category);
      const qs = params.toString();
      const data = await api.get(`/incidents${qs ? '?' + qs : ''}`);
      setIncidents(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchIncidents(); }, [filters]);

  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const fmtDate = (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const counts = {
    reported: incidents.filter((i) => i.status === 'reported').length,
    assigned: incidents.filter((i) => i.status === 'assigned').length,
    in_progress: incidents.filter((i) => i.status === 'in_progress').length,
    resolved: incidents.filter((i) => i.status === 'resolved').length,
  };

  return (
    <>
      <div className="page-header">
        <h1>📊 Admin Dashboard</h1>
        <p>Overview of all reported incidents and their current status.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card reported">
          <div className="stat-label">Reported</div>
          <div className="stat-value">{counts.reported}</div>
        </div>
        <div className="stat-card assigned">
          <div className="stat-label">Assigned</div>
          <div className="stat-value">{counts.assigned}</div>
        </div>
        <div className="stat-card in_progress">
          <div className="stat-label">In Progress</div>
          <div className="stat-value">{counts.in_progress}</div>
        </div>
        <div className="stat-card resolved">
          <div className="stat-label">Resolved</div>
          <div className="stat-value">{counts.resolved}</div>
        </div>
      </div>

      <div className="filters-bar">
        <select className="form-control" value={filters.status} onChange={setFilter('status')}>
          <option value="">All Statuses</option>
          <option value="reported">Reported</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <select className="form-control" value={filters.priority} onChange={setFilter('priority')}>
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="form-control" value={filters.category} onChange={setFilter('category')}>
          <option value="">All Categories</option>
          <option value="rescue">Rescue</option>
          <option value="medical">Medical</option>
          <option value="food_water">Food & Water</option>
          <option value="shelter">Shelter</option>
          <option value="other">Other</option>
        </select>
      </div>

      {loading ? (
        <div className="loading-page"><span className="spinner" /> Loading incidents...</div>
      ) : incidents.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📭</div>
          <h3>No Incidents Found</h3>
          <p>No incidents match the selected filters.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Category</th>
                <th>Location</th>
                <th>Affected</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Reported</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr key={inc.id} className="clickable-row" onClick={() => navigate(`/admin/incidents/${inc.id}`)}>
                  <td>#{inc.id}</td>
                  <td style={{ textTransform: 'capitalize' }}>{inc.category.replace('_', ' ')}</td>
                  <td>{inc.location_text}</td>
                  <td>{inc.people_affected}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`badge badge-${inc.priority}`}>{inc.priority}</span>
                      {inc.auto_triaged_at && (
                        <span
                          className="badge"
                          title={`Auto-triaged (Score: ${inc.triage_score ?? 'N/A'})\n${inc.triage_reason || ''}`}
                          style={{ fontSize: '10px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.4)' }}
                        >
                          ⚡ Auto-triaged
                        </span>
                      )}
                    </div>
                  </td>
                  <td><span className={`badge badge-${inc.status}`}>{inc.status.replace('_', ' ')}</span></td>
                  <td>{fmtDate(inc.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
