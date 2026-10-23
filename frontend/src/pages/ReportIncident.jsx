import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const CATEGORIES = [
  { value: 'rescue', label: '🚨 Rescue' },
  { value: 'medical', label: '🏥 Medical' },
  { value: 'food_water', label: '🍞 Food & Water' },
  { value: 'shelter', label: '🏠 Shelter' },
  { value: 'other', label: '📋 Other' },
];

export default function ReportIncident() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    category: 'rescue',
    description: '',
    location_text: '',
    latitude: '',
    longitude: '',
    people_affected: 1,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...form,
        people_affected: Number(form.people_affected),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
      };
      await api.post('/incidents', payload);
      navigate('/citizen');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>🚨 Report Emergency</h1>
        <p>Submit details of the emergency so response teams can be dispatched.</p>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="inc-category">Emergency Type</label>
            <select id="inc-category" className="form-control" value={form.category} onChange={set('category')}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="inc-desc">Description</label>
            <textarea id="inc-desc" className="form-control" placeholder="Describe the emergency in detail..." value={form.description} onChange={set('description')} required minLength={10} />
          </div>

          <div className="form-group">
            <label htmlFor="inc-loc">Location</label>
            <input id="inc-loc" className="form-control" placeholder="e.g. Kothrud, Pune, Maharashtra" value={form.location_text} onChange={set('location_text')} required />
          </div>

          <div className="flex gap-2">
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="inc-lat">Latitude (optional)</label>
              <input id="inc-lat" className="form-control" type="number" step="any" placeholder="18.5074" value={form.latitude} onChange={set('latitude')} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="inc-lng">Longitude (optional)</label>
              <input id="inc-lng" className="form-control" type="number" step="any" placeholder="73.8077" value={form.longitude} onChange={set('longitude')} />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="inc-ppl">People Affected</label>
            <input id="inc-ppl" className="form-control" type="number" min="1" value={form.people_affected} onChange={set('people_affected')} required />
          </div>

          <button className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></span> : '📤 Submit Report'}
          </button>
        </form>
      </div>
    </>
  );
}
