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

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please select an image file (JPEG, PNG, or WebP).');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Image file size must be less than 5 MB.');
      return;
    }

    setError('');
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let photo_key = null;

      // 1. If photo attached, request presigned URL and PUT to S3
      if (photoFile) {
        setUploadStatus('Requesting S3 upload authorization...');
        const presigned = await api.post('/incidents/photo-upload-url', {
          content_type: photoFile.type,
        });

        setUploadStatus('Uploading photo directly to S3...');
        if (presigned.upload_url && !presigned.upload_url.includes('stub_upload=true')) {
          const s3Response = await fetch(presigned.upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': photoFile.type },
            body: photoFile,
          });
          if (!s3Response.ok) {
            throw new Error(`S3 upload failed: HTTP ${s3Response.status}`);
          }
        }
        photo_key = presigned.photo_key;
      }

      // 2. Save incident with photo_key
      setUploadStatus('Saving emergency report...');
      const payload = {
        ...form,
        people_affected: Number(form.people_affected),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        photo_key,
      };
      await api.post('/incidents', payload);
      navigate('/citizen');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setUploadStatus('');
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>🚨 Report Emergency</h1>
        <p>Submit details of the emergency so response teams can be dispatched immediately.</p>
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
            <textarea
              id="inc-desc"
              className="form-control"
              placeholder="Describe the emergency in detail (what happened, immediate dangers)..."
              value={form.description}
              onChange={set('description')}
              required
              minLength={10}
            />
          </div>

          <div className="form-group">
            <label htmlFor="inc-loc">Location</label>
            <input
              id="inc-loc"
              className="form-control"
              placeholder="e.g. Kothrud, Pune, Maharashtra"
              value={form.location_text}
              onChange={set('location_text')}
              required
            />
          </div>

          <div className="flex gap-2">
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="inc-lat">Latitude (optional)</label>
              <input
                id="inc-lat"
                className="form-control"
                type="number"
                step="any"
                placeholder="18.5074"
                value={form.latitude}
                onChange={set('latitude')}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="inc-lng">Longitude (optional)</label>
              <input
                id="inc-lng"
                className="form-control"
                type="number"
                step="any"
                placeholder="73.8077"
                value={form.longitude}
                onChange={set('longitude')}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="inc-ppl">People Affected</label>
            <input
              id="inc-ppl"
              className="form-control"
              type="number"
              min="1"
              value={form.people_affected}
              onChange={set('people_affected')}
              required
            />
          </div>

          {/* ── Photo Upload ── */}
          <div className="form-group">
            <label htmlFor="inc-photo">Incident Photo (optional, max 5 MB)</label>
            <input
              id="inc-photo"
              className="form-control"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              style={{ padding: '.5rem' }}
            />
            <small style={{ color: 'var(--c-text-muted)', display: 'block', marginTop: '.3rem' }}>
              Directly uploaded to Amazon S3 via secure pre-signed URL.
            </small>

            {photoPreview && (
              <div style={{ marginTop: '.8rem', position: 'relative', display: 'inline-block' }}>
                <img
                  src={photoPreview}
                  alt="Incident Preview"
                  style={{
                    maxHeight: 180,
                    maxWidth: '100%',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--c-surface-3)',
                    display: 'block',
                  }}
                />
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={removePhoto}
                  style={{ marginTop: '.4rem' }}
                >
                  ✕ Remove Photo
                </button>
              </div>
            )}
          </div>

          <button className="btn btn-primary btn-lg" disabled={loading} style={{ width: '100%' }}>
            {loading ? (
              <span className="flex items-center gap-1">
                <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></span>
                <span>{uploadStatus || 'Submitting...'}</span>
              </span>
            ) : (
              '📤 Submit Emergency Report'
            )}
          </button>
        </form>
      </div>
    </>
  );
}
