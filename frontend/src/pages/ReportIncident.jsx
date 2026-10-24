import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LifeBuoy,
  HeartPulse,
  Utensils,
  Home,
  HelpCircle,
  UploadCloud,
  X,
  Plus,
  Minus,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { api } from '../api';
import { Button, Input, Textarea, Card } from '../components/ui';

const CATEGORIES = [
  { value: 'rescue', label: 'Rescue', icon: LifeBuoy, desc: 'Trapped, rising waters, evacuation' },
  { value: 'medical', label: 'Medical', icon: HeartPulse, desc: 'Injuries, critical triage, first aid' },
  { value: 'food_water', label: 'Food & water', icon: Utensils, desc: 'Emergency drinking water & rations' },
  { value: 'shelter', label: 'Shelter', icon: Home, desc: 'Displaced families, emergency housing' },
  { value: 'other', label: 'Other', icon: HelpCircle, desc: 'Infrastructure, hazards, general' },
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ReportIncident() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

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
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [submittedIncident, setSubmittedIncident] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const validateAndSetFile = (file) => {
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

  const handleFileChange = (e) => {
    validateAndSetFile(e.target.files?.[0]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const incrementPeople = () => {
    setForm((prev) => ({
      ...prev,
      people_affected: Math.max(1, Number(prev.people_affected) + 1),
    }));
  };

  const decrementPeople = () => {
    setForm((prev) => ({
      ...prev,
      people_affected: Math.max(1, Number(prev.people_affected) - 1),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // ── Client-side pre-validation (mirrors backend schema) ──────────
    const clientErrors = [];
    if (!form.description || form.description.trim().length < 10)
      clientErrors.push('description: Must be at least 10 characters.');
    if (!form.location_text || form.location_text.trim().length < 3)
      clientErrors.push('location or address: Must be at least 3 characters.');
    if (Number(form.people_affected) < 1)
      clientErrors.push('people affected: Must be at least 1.');
    if (clientErrors.length > 0) {
      setError(clientErrors.join('\n'));
      return;
    }

    setLoading(true);

    try {
      let photo_key = null;

      // 1. If photo attached, request presigned URL and PUT to S3
      if (photoFile) {
        setUploadStatus('Requesting storage authorization...');
        const presigned = await api.post('/incidents/photo-upload-url', {
          content_type: photoFile.type,
        });

        setUploadStatus('Uploading photo...');
        if (presigned.upload_url && !presigned.upload_url.includes('stub_upload=true')) {
          const s3Response = await fetch(presigned.upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': photoFile.type },
            body: photoFile,
          });
          if (!s3Response.ok) {
            throw new Error(`Photo upload failed: HTTP ${s3Response.status}`);
          }
        }
        photo_key = presigned.photo_key;
      }

      // 2. Save incident with photo_key
      setUploadStatus('Recording emergency report...');
      const payload = {
        ...form,
        people_affected: Number(form.people_affected),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        photo_key,
      };

      const result = await api.post('/incidents', payload);
      setSubmittedIncident(result);
    } catch (err) {
      setError(err.message || 'Failed to submit emergency report. Please try again.');
    } finally {
      setLoading(false);
      setUploadStatus('');
    }
  };

  // ── Confirmation Screen ─────────────────────────────────────────
  if (submittedIncident) {
    return (
      <div className="main-content-narrow" style={{ margin: '0 auto', paddingTop: '32px' }}>
        <Card padding="lg" style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: 'var(--pill-status-resolved-bg)',
              color: 'var(--pill-status-resolved-text)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <CheckCircle2 size={24} strokeWidth={2} />
          </div>

          <h1 className="ui-page-title" style={{ marginBottom: 8 }}>
            Emergency report submitted
          </h1>
          <p className="ui-page-desc" style={{ marginBottom: 24 }}>
            Incident reference <strong>#{submittedIncident.id}</strong> has been logged into the emergency queue and routed to responders.
          </p>

          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--bg-surface-subdued)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              marginBottom: 24,
              textAlign: 'left',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Reference number:</span>
              <span style={{ fontWeight: 600 }}>#{submittedIncident.id}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Category:</span>
              <span style={{ textTransform: 'capitalize' }}>
                {submittedIncident.category?.replace('_', ' ')}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Location:</span>
              <span>{submittedIncident.location_text}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Initial status:</span>
              <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                {submittedIncident.status?.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setSubmittedIncident(null);
                setForm({
                  category: 'rescue',
                  description: '',
                  location_text: '',
                  latitude: '',
                  longitude: '',
                  people_affected: 1,
                });
                removePhoto();
              }}
            >
              Submit another report
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate('/citizen')}
              icon={ArrowRight}
            >
              Track incident status
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ── Main Report Form ────────────────────────────────────────────
  return (
    <div className="main-content-narrow" style={{ margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="ui-page-title">Report emergency</h1>
        <p className="ui-page-desc">
          Submit details below for automated triage and response team dispatch.
        </p>
      </div>

      <Card padding="lg" className="emergency-form-card">
        {error && (() => {
          // error may be a single message or newline-delimited list of validation errors
          const lines = error.split('\n').map(s => s.trim()).filter(Boolean);
          return (
            <div
              role="alert"
              style={{
                padding: '10px 14px',
                backgroundColor: 'var(--danger-bg)',
                color: 'var(--danger-text)',
                border: '1px solid var(--danger-border)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 20,
                fontSize: '13px',
              }}
            >
              {lines.length === 1 ? (
                lines[0]
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc' }}>
                  {lines.map((line, i) => (
                    <li key={i} style={{ marginBottom: i < lines.length - 1 ? 4 : 0 }}>
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}

        <form onSubmit={handleSubmit} noValidate>
          {/* Category segmented card group */}
          <div className="ui-form-group">
            <label className="ui-label" style={{ marginBottom: 8 }}>
              Type of emergency <span className="ui-required">*</span>
            </label>
            <div className="category-radio-grid">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = form.category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    className={`category-radio-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setForm({ ...form, category: cat.value })}
                    aria-pressed={isSelected}
                  >
                    <Icon size={18} strokeWidth={1.8} className="category-icon" />
                    <span className="category-label">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <Textarea
            label="What is happening?"
            id="desc"
            placeholder="Describe the immediate situation, hazards, trapped persons, or water levels..."
            value={form.description}
            onChange={set('description')}
            required
            rows={3}
            hint="Please provide enough detail for responders to prepare equipment."
          />

          {/* Location */}
          <Input
            label="Location or address"
            id="location"
            placeholder="e.g. Kothrud near Gandhi Bhavan, Pune"
            value={form.location_text}
            onChange={set('location_text')}
            required
            hint="Landmarks, cross streets, or building names help response teams locate you."
          />

          {/* Optional GPS Coordinates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="Latitude (optional)"
              id="lat"
              type="number"
              step="any"
              placeholder="18.5074"
              value={form.latitude}
              onChange={set('latitude')}
            />
            <Input
              label="Longitude (optional)"
              id="lng"
              type="number"
              step="any"
              placeholder="73.8077"
              value={form.longitude}
              onChange={set('longitude')}
            />
          </div>

          {/* People affected stepper */}
          <div className="ui-form-group">
            <label className="ui-label" htmlFor="people-stepper">
              People affected or in danger <span className="ui-required">*</span>
            </label>
            <div className="stepper-control">
              <button
                type="button"
                className="stepper-btn"
                onClick={decrementPeople}
                aria-label="Decrease number of people affected"
                disabled={Number(form.people_affected) <= 1}
              >
                <Minus size={16} strokeWidth={2} />
              </button>
              <input
                id="people-stepper"
                type="number"
                min="1"
                className="stepper-input"
                value={form.people_affected}
                onChange={set('people_affected')}
                required
              />
              <button
                type="button"
                className="stepper-btn"
                onClick={incrementPeople}
                aria-label="Increase number of people affected"
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            </div>
            <span className="ui-hint" style={{ marginTop: 4 }}>
              Used by triage algorithm to calibrate initial priority score.
            </span>
          </div>

          {/* Photo Upload with Drag & Drop */}
          <div className="ui-form-group">
            <label className="ui-label">
              Incident scene photo (optional, max 5 MB)
            </label>
            {!photoPreview ? (
              <div
                className={`photo-dropzone ${isDragging ? 'is-dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud
                  size={24}
                  strokeWidth={1.5}
                  style={{ color: 'var(--text-tertiary)', marginBottom: 6 }}
                />
                <div style={{ fontSize: '13px', fontWeight: 500 }}>
                  Click to upload or drag photo here
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 2 }}>
                  JPEG, PNG, or WebP up to 5 MB (direct upload to Amazon S3)
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </div>
            ) : (
              <div className="photo-preview-box">
                <img
                  src={photoPreview}
                  alt="Incident preview"
                  className="photo-preview-img"
                />
                <button
                  type="button"
                  className="photo-remove-btn"
                  onClick={removePhoto}
                  aria-label="Remove photo"
                  title="Remove photo"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            style={{ width: '100%', minHeight: 48, marginTop: 12 }}
          >
            {loading ? uploadStatus || 'Submitting report...' : 'Submit emergency report'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
