import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [incident, setIncident] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedTeam, setSelectedTeam] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [newPriority, setNewPriority] = useState('');

  const isAdmin = user?.role === 'admin';
  const isAdminOrResponder = ['admin', 'responder'].includes(user?.role);

  const load = async () => {
    try {
      const data = await api.get(`/incidents/${id}`);
      setIncident(data);
      setNewPriority(data.priority);
      if (isAdminOrResponder) {
        const t = await api.get('/teams');
        setTeams(t);
      }
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleAssign = async () => {
    if (!selectedTeam) return;
    setError(''); setSuccess('');
    try {
      await api.post(`/incidents/${id}/assign`, { team_id: Number(selectedTeam) });
      setSuccess('Team assigned successfully!');
      await load();
    } catch (err) { setError(err.message); }
  };

  const handleStatusUpdate = async () => {
    if (!newStatus) return;
    setError(''); setSuccess('');
    try {
      await api.patch(`/incidents/${id}/status`, { status: newStatus, note: statusNote || null });
      setSuccess('Status updated!');
      setStatusNote('');
      await load();
    } catch (err) { setError(err.message); }
  };

  const handlePriority = async () => {
    setError(''); setSuccess('');
    try {
      await api.patch(`/incidents/${id}/priority`, { priority: newPriority });
      setSuccess('Priority updated!');
      await load();
    } catch (err) { setError(err.message); }
  };

  const fmtDate = (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  if (loading) return <div className="loading-page"><span className="spinner" /> Loading...</div>;
  if (!incident) return <div className="alert alert-error">Incident not found</div>;

  return (
    <>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>Incident #{incident.id}</h1>
          <p>{incident.location_text}</p>
        </div>
        <button className="btn btn-outline" onClick={() => navigate(-1)}>← Back</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="detail-grid">
        {/* Left column: incident details */}
        <div>
          <div className="card">
            <div className="detail-section">
              <h3>Incident Information</h3>
              <div className="flex gap-2 flex-wrap mb-2">
                <span className={`badge badge-${incident.priority}`}>{incident.priority} priority</span>
                <span className={`badge badge-${incident.status}`}>{incident.status.replace('_', ' ')}</span>
                <span className="badge" style={{ background: 'rgba(139,92,246,.12)', color: '#a78bfa', textTransform: 'capitalize' }}>{incident.category.replace('_', ' ')}</span>
              </div>
              <div className="detail-field">
                <div className="label">Description</div>
                <div className="value">{incident.description}</div>
              </div>
              <div className="flex gap-2">
                <div className="detail-field" style={{ flex: 1 }}>
                  <div className="label">People Affected</div>
                  <div className="value">{incident.people_affected}</div>
                </div>
                <div className="detail-field" style={{ flex: 1 }}>
                  <div className="label">Reported At</div>
                  <div className="value">{fmtDate(incident.created_at)}</div>
                </div>
              </div>
              {incident.latitude && (
                <div className="detail-field">
                  <div className="label">Coordinates</div>
                  <div className="value">{incident.latitude}, {incident.longitude}</div>
                </div>
              )}
              {incident.reporter && (
                <div className="detail-field">
                  <div className="label">Reported By</div>
                  <div className="value">{incident.reporter.name} ({incident.reporter.email})</div>
                </div>
              )}
            </div>
          </div>

          {/* Status history timeline */}
          {incident.status_history?.length > 0 && (
            <div className="card mt-2">
              <h3 style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.75rem' }}>Status Timeline</h3>
              <div className="timeline">
                {incident.status_history.map((h) => (
                  <div key={h.id} className="timeline-item">
                    <div className="status-change">{h.old_status.replace('_', ' ')} → {h.new_status.replace('_', ' ')}</div>
                    {h.note && <div className="note">{h.note}</div>}
                    <div className="time">{fmtDate(h.changed_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: admin actions */}
        <div>
          {isAdmin && (
            <div className="card mb-2">
              <h3 style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.75rem' }}>Set Priority</h3>
              <div className="flex gap-1">
                <select className="form-control" value={newPriority} onChange={(e) => setNewPriority(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <button className="btn btn-warning btn-sm" onClick={handlePriority}>Update</button>
              </div>
            </div>
          )}

          {isAdmin && incident.status !== 'resolved' && (
            <div className="card mb-2">
              <h3 style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.75rem' }}>Assign Team</h3>
              <div className="form-group">
                <select className="form-control" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
                  <option value="">Select an available team...</option>
                  {teams.filter((t) => t.is_available).map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleAssign} disabled={!selectedTeam}>Assign Team</button>
            </div>
          )}

          {isAdminOrResponder && incident.status !== 'resolved' && (
            <div className="card mb-2">
              <h3 style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.75rem' }}>Update Status</h3>
              <div className="form-group">
                <select className="form-control" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                  <option value="">Select new status...</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div className="form-group">
                <textarea className="form-control" placeholder="Optional note..." value={statusNote} onChange={(e) => setStatusNote(e.target.value)} rows={2} />
              </div>
              <button className="btn btn-success btn-sm" onClick={handleStatusUpdate} disabled={!newStatus}>Update Status</button>
            </div>
          )}

          {incident.assignments?.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.75rem' }}>Assigned Teams</h3>
              {incident.assignments.map((a) => {
                const teamObj = teams.find((t) => t.id === a.team_id);
                return (
                  <div key={a.id} style={{ padding: '.5rem 0', borderBottom: '1px solid var(--c-border)', fontSize: '.85rem' }}>
                    <strong>{teamObj ? teamObj.name : `Team #${a.team_id}`}</strong>
                    {teamObj && <span style={{ marginLeft: '.5rem', color: 'var(--c-text-muted)' }}>({teamObj.type})</span>}
                    <div style={{ fontSize: '.75rem', color: 'var(--c-text-muted)' }}>Assigned: {fmtDate(a.assigned_at)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
