import { useEffect, useState } from 'react';
import { api } from '../api';

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'rescue', contact: '', is_available: true });
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(null);

  const load = () => api.get('/teams').then(setTeams).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editId) {
        await api.put(`/teams/${editId}`, form);
      } else {
        await api.post('/teams', form);
      }
      setShowForm(false);
      setEditId(null);
      setForm({ name: '', type: 'rescue', contact: '', is_available: true });
      await load();
    } catch (err) { setError(err.message); }
  };

  const startEdit = (t) => {
    setForm({ name: t.name, type: t.type, contact: t.contact || '', is_available: t.is_available });
    setEditId(t.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this team?')) return;
    try { await api.delete(`/teams/${id}`); await load(); } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="loading-page"><span className="spinner" /> Loading...</div>;

  return (
    <>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>👥 Teams</h1>
          <p>Manage rescue, medical, and volunteer teams.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', type: 'rescue', contact: '', is_available: true }); }}>
          {showForm ? 'Cancel' : '+ Add Team'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <div className="card mb-2" style={{ maxWidth: 500 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Team Name</label>
              <input className="form-control" value={form.name} onChange={set('name')} required />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select className="form-control" value={form.type} onChange={set('type')}>
                <option value="rescue">Rescue</option>
                <option value="medical">Medical</option>
                <option value="volunteer">Volunteer</option>
              </select>
            </div>
            <div className="form-group">
              <label>Contact</label>
              <input className="form-control" value={form.contact} onChange={set('contact')} />
            </div>
            <button className="btn btn-primary btn-sm">{editId ? 'Update' : 'Create'}</button>
          </form>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr><th>ID</th><th>Name</th><th>Type</th><th>Contact</th><th>Available</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td>#{t.id}</td>
                <td>{t.name}</td>
                <td style={{ textTransform: 'capitalize' }}>{t.type}</td>
                <td>{t.contact || '—'}</td>
                <td><span className={`badge ${t.is_available ? 'badge-resolved' : 'badge-high'}`}>{t.is_available ? 'Yes' : 'No'}</span></td>
                <td>
                  <div className="flex gap-1">
                    <button className="btn btn-outline btn-sm" onClick={() => startEdit(t)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
