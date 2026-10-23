import { useEffect, useState } from 'react';
import { api } from '../api';

export default function ResourcesPage() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'shelter', quantity: 0, is_available: true });
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(null);

  const load = () => api.get('/resources').then(setResources).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form, quantity: Number(form.quantity) };
      if (editId) {
        await api.put(`/resources/${editId}`, payload);
      } else {
        await api.post('/resources', payload);
      }
      setShowForm(false);
      setEditId(null);
      setForm({ name: '', type: 'shelter', quantity: 0, is_available: true });
      await load();
    } catch (err) { setError(err.message); }
  };

  const startEdit = (r) => {
    setForm({ name: r.name, type: r.type, quantity: r.quantity, is_available: r.is_available });
    setEditId(r.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this resource?')) return;
    try { await api.delete(`/resources/${id}`); await load(); } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="loading-page"><span className="spinner" /> Loading...</div>;

  return (
    <>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>📦 Resources</h1>
          <p>Manage shelters, food, medical supplies, and vehicles.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', type: 'shelter', quantity: 0, is_available: true }); }}>
          {showForm ? 'Cancel' : '+ Add Resource'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <div className="card mb-2" style={{ maxWidth: 500 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Resource Name</label>
              <input className="form-control" value={form.name} onChange={set('name')} required />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select className="form-control" value={form.type} onChange={set('type')}>
                <option value="shelter">Shelter</option>
                <option value="food">Food</option>
                <option value="medical_supply">Medical Supply</option>
                <option value="vehicle">Vehicle</option>
              </select>
            </div>
            <div className="form-group">
              <label>Quantity</label>
              <input className="form-control" type="number" min="0" value={form.quantity} onChange={set('quantity')} required />
            </div>
            <button className="btn btn-primary btn-sm">{editId ? 'Update' : 'Create'}</button>
          </form>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr><th>ID</th><th>Name</th><th>Type</th><th>Quantity</th><th>Available</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.id}>
                <td>#{r.id}</td>
                <td>{r.name}</td>
                <td style={{ textTransform: 'capitalize' }}>{r.type.replace('_', ' ')}</td>
                <td>{r.quantity}</td>
                <td><span className={`badge ${r.is_available ? 'badge-resolved' : 'badge-high'}`}>{r.is_available ? 'Yes' : 'No'}</span></td>
                <td>
                  <div className="flex gap-1">
                    <button className="btn btn-outline btn-sm" onClick={() => startEdit(r)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>Delete</button>
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
