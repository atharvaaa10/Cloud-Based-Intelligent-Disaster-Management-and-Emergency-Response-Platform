import { useState, useRef, useCallback } from 'react';
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
  LocateFixed,
  MapPin,
  AlertCircle,
  RefreshCw,
  Image,
} from 'lucide-react';
import { api } from '../api';
import { Button, Input, Textarea, Card } from '../components/ui';

// ── Constants ──────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'rescue',     label: 'Rescue',      icon: LifeBuoy,   desc: 'Trapped, rising waters, evacuation' },
  { value: 'medical',    label: 'Medical',      icon: HeartPulse, desc: 'Injuries, critical triage, first aid' },
  { value: 'food_water', label: 'Food & water', icon: Utensils,   desc: 'Emergency drinking water & rations' },
  { value: 'shelter',    label: 'Shelter',      icon: Home,       desc: 'Displaced families, emergency housing' },
  { value: 'other',      label: 'Other',        icon: HelpCircle, desc: 'Infrastructure, hazards, general' },
];

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES  = ['image/jpeg', 'image/png', 'image/webp'];

const EMPTY_FORM = {
  category:        'rescue',
  description:     '',
  location_text:   '',
  latitude:        '',
  longitude:       '',
  people_affected: 1,
};

// ── Small helpers ──────────────────────────────────────────────────────────────
function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <p role="alert" style={{ display:'flex', alignItems:'center', gap:5, fontSize:12,
      color:'var(--danger-text)', marginTop:4 }}>
      <AlertCircle size={12} strokeWidth={2} />{msg}
    </p>
  );
}

function fmt(bytes) {
  return bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Upload via XMLHttpRequest (gives progress events) ─────────────────────────
function uploadWithProgress(url, method, body, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);

    // For local direct upload, send auth token
    const token = localStorage.getItem('token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {});
      } else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
    xhr.send(body);
  });
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ReportIncident() {
  const navigate    = useNavigate();
  const fileInputRef = useRef(null);

  const [form, setForm]           = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [globalError, setGlobalError] = useState('');

  // Photo state
  const [photoFile, setPhotoFile]         = useState(null);
  const [photoPreview, setPhotoPreview]   = useState(null);
  const [isDragging, setIsDragging]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // null | 0-100
  const [photoError, setPhotoError]       = useState('');

  // Submission state
  const [loading, setLoading]               = useState(false);
  const [uploadStatus, setUploadStatus]     = useState('');
  const [submittedIncident, setSubmittedIncident] = useState(null);

  // Geolocation state
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError]     = useState('');

  const set = (k) => (e) => {
    setForm((p) => ({ ...p, [k]: e.target.value }));
    if (fieldErrors[k]) setFieldErrors((p) => ({ ...p, [k]: '' }));
  };

  // ── Geolocation ──────────────────────────────────────────────────────────────
  const handleUseLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setGeoLoading(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((p) => ({
          ...p,
          latitude:  pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setFieldErrors((p) => ({ ...p, latitude: '', longitude: '' }));
        setGeoLoading(false);
      },
      (err) => {
        setGeoLoading(false);
        const msgs = {
          [err.PERMISSION_DENIED]:
            'Location access denied. Enable it in browser settings or enter coordinates manually.',
          [err.POSITION_UNAVAILABLE]: 'Location unavailable. Please enter coordinates manually.',
          [err.TIMEOUT]: 'Location request timed out. Please try again.',
        };
        setGeoError(msgs[err.code] || 'Unable to retrieve location.');
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // ── Photo helpers ─────────────────────────────────────────────────────────────
  const setFile = (file) => {
    if (!file) return;
    setPhotoError('');
    if (!ALLOWED_TYPES.includes(file.type)) {
      setPhotoError('Only JPEG, PNG, or WebP images are accepted.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setPhotoError(`File is too large (${fmt(file.size)}). Maximum is 5 MB.`);
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setUploadProgress(null);
    setPhotoError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── People stepper ───────────────────────────────────────────────────────────
  const incPeople = () => setForm((p) => ({ ...p, people_affected: Math.min(1000, +p.people_affected + 1) }));
  const decPeople = () => setForm((p) => ({ ...p, people_affected: Math.max(1,    +p.people_affected - 1) }));

  // ── Validation ────────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.description || form.description.trim().length < 10)
      e.description = 'Describe the situation (at least 10 characters).';
    if (!form.location_text || form.location_text.trim().length < 3)
      e.location_text = 'Location must be at least 3 characters.';
    const pa = Number(form.people_affected);
    if (!pa || pa < 1 || pa > 1000)
      e.people_affected = 'People affected must be between 1 and 1000.';
    const lat = form.latitude  !== '' ? Number(form.latitude)  : null;
    const lon = form.longitude !== '' ? Number(form.longitude) : null;
    if ((lat !== null) !== (lon !== null)) {
      e.latitude  = 'Both latitude and longitude are required together.';
      e.longitude = 'Both latitude and longitude are required together.';
    } else if (lat !== null) {
      if (lat < 15.6 || lat > 22.1) e.latitude  = `Latitude ${lat} is outside Maharashtra (15.6–22.1).`;
      if (lon < 72.6 || lon > 80.9) e.longitude = `Longitude ${lon} is outside Maharashtra (72.6–80.9).`;
    }
    return e;
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setGlobalError('');

    const errs = validate();
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setLoading(true);

    try {
      let photo_key = null;

      // ── Step 1: Upload photo via StorageService ────────────────────────────
      if (photoFile) {
        setUploadStatus('Requesting upload authorisation…');
        setUploadProgress(0);

        // Ask backend for upload target (local direct-upload or S3 presigned URL)
        const presign = await api.post('/uploads/presign', {
          content_type: photoFile.type,
          incident_id:  null,
        });

        setUploadStatus(`Uploading photo… (${fmt(photoFile.size)})`);

        if (presign.method === 'PUT') {
          // S3: plain PUT with raw bytes — use XHR for progress
          await uploadWithProgress(
            presign.upload_url,
            'PUT',
            photoFile,
            photoFile.type,
            setUploadProgress,
          );
        } else {
          // Local: POST raw bytes to /uploads/direct?key=…
          const directUrl = `${presign.upload_url}?key=${encodeURIComponent(presign.photo_key)}`;
          await uploadWithProgress(
            directUrl,
            'POST',
            photoFile,
            photoFile.type,
            setUploadProgress,
          );
        }

        photo_key = presign.photo_key;
        setUploadProgress(100);
      }

      // ── Step 2: Create incident (only stores photo_key) ────────────────────
      setUploadStatus('Recording emergency report…');
      const payload = {
        category:        form.category,
        description:     form.description,
        location_text:   form.location_text,
        people_affected: Number(form.people_affected),
        latitude:        form.latitude  !== '' ? Number(form.latitude)  : null,
        longitude:       form.longitude !== '' ? Number(form.longitude) : null,
        photo_key,
      };

      const result = await api.post('/incidents', payload);
      setSubmittedIncident(result);
    } catch (err) {
      if (err.validationErrors) {
        const fe = {};
        err.validationErrors.forEach((ve) => {
          const field = Array.isArray(ve.loc) && ve.loc.length > 1
            ? ve.loc[ve.loc.length - 1] : null;
          if (field && field in EMPTY_FORM) fe[field] = ve.msg;
        });
        if (Object.keys(fe).length) { setFieldErrors(fe); }
        else setGlobalError(err.message);
      } else {
        setGlobalError(
          err.message || 'Connection failed. Your report data is safe — please try again.'
        );
      }
      setUploadProgress(null);
    } finally {
      setLoading(false);
      setUploadStatus('');
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────────
  if (submittedIncident) {
    return (
      <div className="main-content-narrow" style={{ margin:'0 auto', paddingTop:32 }}>
        <Card padding="lg" style={{ textAlign:'center' }}>
          <div style={{
            width:56, height:56, borderRadius:'50%',
            background:'linear-gradient(135deg,#166534 0%,#15803d 100%)',
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            marginBottom:16, boxShadow:'0 0 0 8px rgba(22,101,52,0.12)',
          }}>
            <CheckCircle2 size={28} strokeWidth={2} color="#fff" />
          </div>

          <h1 className="ui-page-title" style={{ marginBottom:6 }}>Emergency report submitted</h1>
          <p className="ui-page-desc" style={{ marginBottom:24 }}>
            Your report is logged and routed to responders. Keep your tracking code safe.
          </p>

          <div style={{
            padding:'16px 20px', background:'var(--bg-surface-subdued)',
            border:'1px solid var(--border-default)', borderRadius:'var(--radius-md)',
            marginBottom:24, textAlign:'left', display:'flex',
            flexDirection:'column', gap:10, fontSize:13,
          }}>
            {[
              ['Public reference', submittedIncident.public_code],
              ['Tracking code',    submittedIncident.tracking_code],
              ['Category',         submittedIncident.category?.replace('_', ' ')],
              ['Location',         submittedIncident.location_text || submittedIncident.address],
              ['People affected',  submittedIncident.people_affected],
              ['Status',           submittedIncident.status?.replace('_', ' ')],
              ...(submittedIncident.photo_key ? [['Photo', 'Attached ✓']] : []),
            ].map(([label, value]) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
                <span style={{ color:'var(--text-secondary)', flexShrink:0 }}>{label}</span>
                <span style={{ fontWeight:600, textAlign:'right', textTransform:'capitalize',
                  wordBreak:'break-all' }}>{value ?? '—'}</span>
              </div>
            ))}
          </div>

          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
            <Button variant="secondary" onClick={() => {
              setSubmittedIncident(null); setForm(EMPTY_FORM);
              setFieldErrors({}); setGlobalError(''); removePhoto();
            }}>
              Submit another report
            </Button>
            <Button variant="primary" onClick={() => navigate('/citizen')} icon={ArrowRight}>
              Track this request
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────────
  return (
    <div className="main-content-narrow" style={{ margin:'0 auto' }}>
      <div style={{ marginBottom:24 }}>
        <h1 className="ui-page-title">Report emergency</h1>
        <p className="ui-page-desc">Submit details below for automated triage and response team dispatch.</p>
      </div>

      <Card padding="lg" className="emergency-form-card">

        {/* Global error */}
        {globalError && (
          <div role="alert" style={{
            display:'flex', alignItems:'flex-start', gap:10,
            padding:'12px 14px', backgroundColor:'var(--danger-bg)',
            color:'var(--danger-text)', border:'1px solid var(--danger-border)',
            borderRadius:'var(--radius-md)', marginBottom:20, fontSize:13,
          }}>
            <RefreshCw size={14} strokeWidth={2} style={{ flexShrink:0, marginTop:1 }} />
            <span>{globalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>

          {/* Category */}
          <div className="ui-form-group">
            <label className="ui-label" style={{ marginBottom:8 }}>
              Type of emergency <span className="ui-required">*</span>
            </label>
            <div className="category-radio-grid">
              {CATEGORIES.map(({ value, label, icon: Icon }) => {
                const sel = form.category === value;
                return (
                  <button key={value} type="button" aria-pressed={sel}
                    className={`category-radio-item ${sel ? 'is-selected' : ''}`}
                    onClick={() => setForm((p) => ({ ...p, category: value }))}>
                    <Icon size={18} strokeWidth={1.8} className="category-icon" />
                    <span className="category-label">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <Textarea label="What is happening?" id="desc" required rows={3}
            placeholder="Describe the immediate situation, hazards, trapped persons, or water levels…"
            value={form.description} onChange={set('description')}
            hint="Provide enough detail for responders to prepare equipment."
            error={fieldErrors.description} />

          {/* Location */}
          <Input label="Location or address" id="location" required
            placeholder="e.g. Kothrud near Gandhi Bhavan, Pune"
            value={form.location_text} onChange={set('location_text')}
            hint="Landmarks, cross streets, or building names help response teams."
            error={fieldErrors.location_text} />

          {/* Coordinates + geolocation */}
          <div className="ui-form-group">
            <div style={{ display:'flex', alignItems:'center',
              justifyContent:'space-between', marginBottom:8 }}>
              <label className="ui-label" style={{ margin:0 }}>
                GPS coordinates{' '}
                <span style={{ color:'var(--text-tertiary)', fontWeight:400 }}>(optional)</span>
              </label>
              <button type="button" id="btn-use-location" onClick={handleUseLocation}
                disabled={geoLoading} style={{
                  display:'inline-flex', alignItems:'center', gap:5,
                  fontSize:12, fontWeight:500,
                  color: geoLoading ? 'var(--text-tertiary)' : 'var(--accent)',
                  cursor: geoLoading ? 'not-allowed' : 'pointer',
                  padding:'4px 8px', borderRadius:'var(--radius-sm)',
                  border:'1px solid var(--border-default)', background:'var(--bg-surface)',
                }}>
                {geoLoading
                  ? <><span className="ui-spinner" style={{ width:11, height:11 }} /> Locating…</>
                  : <><LocateFixed size={12} strokeWidth={2} /> Use my location</>}
              </button>
            </div>

            {geoError && (
              <p style={{ display:'flex', gap:6, fontSize:12,
                color:'var(--danger-text)', marginBottom:8 }}>
                <MapPin size={12} strokeWidth={2} style={{ flexShrink:0, marginTop:1 }} />
                {geoError}
              </p>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Input label="Latitude" id="lat" type="number" step="any" placeholder="18.5074"
                value={form.latitude} onChange={set('latitude')} error={fieldErrors.latitude} />
              <Input label="Longitude" id="lng" type="number" step="any" placeholder="73.8077"
                value={form.longitude} onChange={set('longitude')} error={fieldErrors.longitude} />
            </div>
            <span className="ui-hint" style={{ marginTop:4, display:'block' }}>
              Must be within Maharashtra (lat 15.6–22.1, lon 72.6–80.9).
            </span>
          </div>

          {/* People affected */}
          <div className="ui-form-group">
            <label className="ui-label" htmlFor="people-stepper">
              People affected or in danger <span className="ui-required">*</span>
            </label>
            <div className="stepper-control">
              <button type="button" className="stepper-btn" onClick={decPeople}
                aria-label="Decrease" disabled={+form.people_affected <= 1}>
                <Minus size={16} strokeWidth={2} />
              </button>
              <input id="people-stepper" type="number" min="1" max="1000"
                className="stepper-input" value={form.people_affected}
                onChange={set('people_affected')} required />
              <button type="button" className="stepper-btn" onClick={incPeople}
                aria-label="Increase" disabled={+form.people_affected >= 1000}>
                <Plus size={16} strokeWidth={2} />
              </button>
            </div>
            {fieldErrors.people_affected && <FieldError msg={fieldErrors.people_affected} />}
            <span className="ui-hint" style={{ marginTop:4 }}>1–1000 · used for triage priority scoring.</span>
          </div>

          {/* Photo upload with progress */}
          <div className="ui-form-group">
            <label className="ui-label">
              Incident scene photo{' '}
              <span style={{ color:'var(--text-tertiary)', fontWeight:400 }}>(optional, max 5 MB)</span>
            </label>

            {!photoPreview ? (
              <div
                className={`photo-dropzone ${isDragging ? 'is-dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); setFile(e.dataTransfer.files?.[0]); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud size={24} strokeWidth={1.5}
                  style={{ color:'var(--text-tertiary)', marginBottom:6 }} />
                <div style={{ fontSize:13, fontWeight:500 }}>Click to upload or drag photo here</div>
                <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2 }}>
                  JPEG, PNG, or WebP · max 5 MB
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0])} style={{ display:'none' }} />
              </div>
            ) : (
              <div className="photo-preview-box" style={{ position:'relative' }}>
                <img src={photoPreview} alt="Incident preview" className="photo-preview-img" />

                {/* File info bar */}
                <div style={{
                  display:'flex', alignItems:'center', gap:8,
                  padding:'8px 12px', background:'var(--bg-surface-subdued)',
                  borderTop:'1px solid var(--border-default)', fontSize:12,
                  color:'var(--text-secondary)',
                }}>
                  <Image size={13} strokeWidth={1.8} />
                  <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {photoFile?.name}
                  </span>
                  <span>{fmt(photoFile?.size ?? 0)}</span>
                </div>

                {/* Upload progress bar */}
                {uploadProgress !== null && (
                  <div style={{ padding:'6px 12px 8px', background:'var(--bg-surface-subdued)',
                    borderTop:'1px solid var(--border-default)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between',
                      fontSize:11, color:'var(--text-secondary)', marginBottom:4 }}>
                      <span>{uploadProgress < 100 ? 'Uploading…' : 'Upload complete ✓'}</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div style={{ height:4, borderRadius:2, background:'var(--border-default)', overflow:'hidden' }}>
                      <div style={{
                        height:'100%', borderRadius:2,
                        background: uploadProgress === 100
                          ? 'var(--pill-status-resolved-text)'
                          : 'var(--accent)',
                        width:`${uploadProgress}%`,
                        transition:'width 0.2s ease',
                      }} />
                    </div>
                  </div>
                )}

                <button type="button" className="photo-remove-btn" onClick={removePhoto}
                  aria-label="Remove photo" title="Remove photo">
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            )}

            {photoError && <FieldError msg={photoError} />}
          </div>

          {/* Submit */}
          <Button type="submit" id="btn-submit-report" variant="primary" size="lg"
            loading={loading} disabled={loading}
            style={{ width:'100%', minHeight:48, marginTop:12 }}>
            {loading
              ? (uploadStatus || 'Submitting report…')
              : globalError
                ? 'Retry submission'
                : 'Submit emergency report'}
          </Button>

          {globalError && (
            <p style={{ textAlign:'center', fontSize:12, color:'var(--text-tertiary)', marginTop:8 }}>
              Your typed data has been preserved — click <strong>Retry submission</strong> to try again.
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
