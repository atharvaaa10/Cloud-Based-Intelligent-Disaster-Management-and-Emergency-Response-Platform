import { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Users,
  Calendar,
  User,
  Phone,
  Mail,
  Zap,
  Shield,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info,
  Clock,
  Send,
  UserPlus,
  Flame,
} from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../../context/ToastContext';
import {
  Badge,
  Button,
  Card,
  Select,
  Textarea,
  Timeline,
  Spinner,
  formatRelativeTime,
  formatFullTime,
} from '../ui';
import AssignTeamModal from './AssignTeamModal';

const ALLOWED_STATUS_TRANSITIONS = {
  reported: ['under_review', 'assigned', 'cancelled'],
  under_review: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: [],
  cancelled: [],
};

const STATUS_LABELS = {
  reported: 'Reported',
  under_review: 'Under Review',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
};

const PRIORITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export default function IncidentDetailDrawer({
  incidentId,
  isOpen,
  onClose,
  onIncidentUpdated,
}) {
  const toast = useToast();

  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Form states
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');

  // Assign team modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  // Photo modal / lightbox
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const fetchIncidentDetails = async () => {
    if (!incidentId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/admin/incidents/${incidentId}`);
      setIncident(data);
      setPriority(data.priority?.toLowerCase() || 'medium');
      setStatus(data.status?.toLowerCase() || 'reported');
      setNote('');
      setNoteError('');
    } catch (err) {
      setError(err.message || 'Failed to load incident details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && incidentId) {
      fetchIncidentDetails();
    } else {
      setIncident(null);
      setError(null);
    }
  }, [isOpen, incidentId]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !assignModalOpen && !showPhotoModal) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, assignModalOpen, showPhotoModal]);

  if (!isOpen) return null;

  const currentStatus = incident?.status?.toLowerCase() || 'reported';
  const currentPriority = incident?.priority?.toLowerCase() || 'medium';

  const isStatusChanged = status !== currentStatus;
  const isPriorityChanged = priority !== currentPriority;
  const hasChanges = isStatusChanged || isPriorityChanged;

  // Allowed next status options
  const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  const statusOptions = [
    { value: currentStatus, label: `${STATUS_LABELS[currentStatus] || currentStatus} (Current)` },
    ...allowedNext.map((st) => ({
      value: st,
      label: STATUS_LABELS[st] || st.replace(/_/g, ' '),
    })),
  ];

  const handleStatusChange = (e) => {
    const nextSt = e.target.value;
    setStatus(nextSt);
    if (nextSt !== currentStatus && !note.trim()) {
      setNoteError('A note explaining this status change is required.');
    } else {
      setNoteError('');
    }
  };

  const handleNoteChange = (e) => {
    const val = e.target.value;
    setNote(val);
    if (isStatusChanged && !val.trim()) {
      setNoteError('A note explaining this status change is required.');
    } else {
      setNoteError('');
    }
  };

  const handleSave = async () => {
    if (isStatusChanged && !note.trim()) {
      setNoteError('A note explaining this status change is required.');
      toast.error('Please enter a note for the status change.');
      return;
    }

    setSaving(true);
    try {
      const payload = {};
      if (isPriorityChanged) payload.priority = priority;
      if (isStatusChanged) {
        payload.status = status;
        payload.note = note.trim();
      } else if (note.trim()) {
        payload.note = note.trim();
      }

      const updated = await api.patch(`/admin/incidents/${incidentId}`, payload);
      setIncident(updated);
      setPriority(updated.priority?.toLowerCase() || priority);
      setStatus(updated.status?.toLowerCase() || status);
      setNote('');
      setNoteError('');
      toast.success('Incident successfully updated.');
      if (onIncidentUpdated) onIncidentUpdated(updated);
    } catch (err) {
      toast.error(err.message || 'Failed to update incident.');
    } finally {
      setSaving(false);
    }
  };

  const handleAcceptSuggestion = (suggestedPrio) => {
    if (suggestedPrio) {
      setPriority(suggestedPrio.toLowerCase());
      toast.info(`Suggested priority applied: ${PRIORITY_LABELS[suggestedPrio.toLowerCase()] || suggestedPrio}`);
    }
  };

  const handleTeamAssigned = (assignRes) => {
    fetchIncidentDetails();
    if (onIncidentUpdated) onIncidentUpdated();
  };

  const suggested = incident?.suggested_priority;
  const breakdown = suggested?.breakdown;

  return (
    <>
      {/* Backdrop */}
      <div
        className="incident-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <aside
        className="incident-drawer"
        role="dialog"
        aria-label={`Incident details for ${incident?.public_code || `#${incidentId}`}`}
      >
        {/* Header */}
        <header className="incident-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="incident-drawer-code">
                  {incident?.public_code || `INC-${incidentId}`}
                </span>
                {incident?.category && (
                  <span className="incident-category-badge">
                    {incident.category.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Tracking: {incident?.tracking_code || `TRK-${incidentId}`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="incident-drawer-close-btn"
              onClick={onClose}
              aria-label="Close details drawer"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="incident-drawer-body">
          {loading ? (
            <div className="incident-drawer-loading">
              <Spinner size={24} />
              <p>Loading incident details...</p>
            </div>
          ) : error ? (
            <div className="incident-drawer-error">
              <AlertTriangle size={24} color="#EF4444" />
              <h3>Failed to load incident</h3>
              <p>{error}</p>
              <Button variant="secondary" size="sm" icon={RotateCcw} onClick={fetchIncidentDetails}>
                Retry
              </Button>
            </div>
          ) : !incident ? (
            <div className="incident-drawer-empty">
              <p>No incident found.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Badges & Quick Status Banner */}
              <div className="incident-quick-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Status:</span>
                  <Badge variant="status" value={incident.status} size="sm" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Priority:</span>
                  <Badge variant="priority" value={incident.priority} size="sm" />
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <Clock size={12} />
                  <span title={formatFullTime(incident.created_at)}>
                    {formatRelativeTime(incident.created_at)}
                  </span>
                </div>
              </div>

              {/* 1. Description & Core Info */}
              <section className="incident-detail-section">
                <h4 className="incident-section-title">Description & Report</h4>
                <p className="incident-description-text">
                  {incident.description || 'No description provided.'}
                </p>

                <div className="incident-meta-grid">
                  <div className="incident-meta-item">
                    <span className="incident-meta-label">
                      <MapPin size={13} /> Location
                    </span>
                    <span className="incident-meta-value" title={incident.address || incident.location_text}>
                      {incident.address || incident.location_text || '—'}
                    </span>
                    {incident.latitude != null && incident.longitude != null && (
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
                      </span>
                    )}
                  </div>

                  <div className="incident-meta-item">
                    <span className="incident-meta-label">
                      <Users size={13} /> People Affected
                    </span>
                    <span className="incident-meta-value" style={{ fontWeight: 600, color: incident.people_affected > 5 ? '#F04438' : 'var(--text-primary)' }}>
                      {incident.people_affected != null ? incident.people_affected : 'Unspecified'}
                    </span>
                  </div>
                </div>
              </section>

              {/* Photo Preview if attached */}
              {incident.photo_url && (
                <section className="incident-detail-section">
                  <h4 className="incident-section-title">Incident Photo</h4>
                  <div className="incident-photo-container" onClick={() => setShowPhotoModal(true)}>
                    <img
                      src={incident.photo_url}
                      alt="Incident scene photograph"
                      className="incident-photo-preview"
                    />
                    <div className="incident-photo-overlay">
                      <ExternalLink size={16} /> Click to expand full image
                    </div>
                  </div>
                </section>
              )}

              {/* Reporter Contact Info */}
              <section className="incident-detail-section">
                <h4 className="incident-section-title">Reporter Information</h4>
                {incident.reporter ? (
                  <div className="incident-reporter-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="incident-reporter-avatar">
                        <User size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {incident.reporter.full_name || incident.reporter.name || 'Citizen Reporter'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Citizen ID #{incident.reporter.id}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, fontSize: 12 }}>
                      {incident.reporter.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                          <Phone size={13} color="var(--accent-primary)" />
                          <a href={`tel:${incident.reporter.phone}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                            {incident.reporter.phone}
                          </a>
                        </div>
                      )}
                      {incident.reporter.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                          <Mail size={13} color="var(--accent-primary)" />
                          <a href={`mailto:${incident.reporter.email}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                            {incident.reporter.email}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Reported anonymously or reporter contact not on file.
                  </div>
                )}
              </section>

              {/* 2. Rule-Based Suggested Priority (NOT AI) */}
              {suggested && (
                <section className="incident-detail-section incident-suggested-priority-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="incident-scoring-badge-icon">
                        <Shield size={15} />
                      </div>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          Suggested Priority
                        </span>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Deterministic rule-based scoring (not AI)
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge variant="priority" value={suggested.suggested_priority} size="sm" />
                      <span className="incident-score-pill">
                        {suggested.score} / {suggested.max_score || 100}
                      </span>
                    </div>
                  </div>

                  {/* Breakdown details */}
                  {breakdown && (
                    <div className="incident-breakdown-box">
                      <div className="incident-breakdown-row">
                        <span>Category Urgency ({breakdown.category || incident.category})</span>
                        <strong style={{ color: 'var(--text-primary)' }}>+{breakdown.category_score} pts</strong>
                      </div>
                      <div className="incident-breakdown-row">
                        <span>People Affected ({breakdown.people_affected_count} persons)</span>
                        <strong style={{ color: 'var(--text-primary)' }}>+{breakdown.people_affected_score} pts</strong>
                      </div>
                      <div className="incident-breakdown-row">
                        <span>Keyword Urgency Signals</span>
                        <strong style={{ color: 'var(--text-primary)' }}>+{breakdown.keyword_score} pts</strong>
                      </div>

                      {breakdown.matched_keywords && breakdown.matched_keywords.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Keywords:</span>
                          {breakdown.matched_keywords.map((kw, idx) => (
                            <span key={idx} className="incident-kw-chip">
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {priority !== suggested.suggested_priority?.toLowerCase() && (
                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Sparkles}
                        onClick={() => handleAcceptSuggestion(suggested.suggested_priority)}
                      >
                        Apply Suggested Priority ({suggested.suggested_priority})
                      </Button>
                    </div>
                  )}
                </section>
              )}

              {/* 3. Triage & Status Controls */}
              <section className="incident-detail-section incident-controls-card">
                <h4 className="incident-section-title">Update Status & Priority</h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="ui-label" htmlFor="drawer-priority-select">
                        Priority Level
                      </label>
                      <Select
                        id="drawer-priority-select"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        options={[
                          { value: 'critical', label: 'Critical' },
                          { value: 'high', label: 'High' },
                          { value: 'medium', label: 'Medium' },
                          { value: 'low', label: 'Low' },
                        ]}
                      />
                    </div>

                    <div>
                      <label className="ui-label" htmlFor="drawer-status-select">
                        Incident Status
                      </label>
                      <Select
                        id="drawer-status-select"
                        value={status}
                        onChange={handleStatusChange}
                        options={statusOptions}
                        disabled={allowedNext.length === 0}
                      />
                      {allowedNext.length === 0 && (
                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                          Terminal status (cannot transition further).
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status Note Input */}
                  <div>
                    <label className="ui-label" htmlFor="drawer-note-input">
                      Update Note {isStatusChanged && <span style={{ color: '#F04438' }}>* (Required for status changes)</span>}
                    </label>
                    <Textarea
                      id="drawer-note-input"
                      rows={2}
                      placeholder={
                        isStatusChanged
                          ? 'Explain the reason or action taken for this status transition...'
                          : 'Add an optional note to this record...'
                      }
                      value={note}
                      onChange={handleNoteChange}
                    />
                    {noteError && (
                      <p style={{ fontSize: 11.5, color: '#F04438', marginTop: 4 }}>
                        {noteError}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons: Save & Assign Team */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={UserPlus}
                      onClick={() => setAssignModalOpen(true)}
                    >
                      Assign Response Team
                    </Button>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSave}
                      loading={saving}
                      disabled={!hasChanges && !note.trim() || saving || (isStatusChanged && !note.trim())}
                    >
                      Save Changes
                    </Button>
                  </div>
                </div>
              </section>

              {/* 4. Active Assignments */}
              {incident.assignments && incident.assignments.length > 0 && (
                <section className="incident-detail-section">
                  <h4 className="incident-section-title">Assigned Response Teams</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {incident.assignments.map((asg) => (
                      <div key={asg.id} className="incident-assignment-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="incident-assignment-icon">
                            <Users size={16} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {asg.team_name || `Team #${asg.team_id}`}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              Assigned {formatRelativeTime(asg.assigned_at)}
                            </div>
                          </div>
                        </div>
                        <span className="incident-assigned-pill">Dispatched</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 5. Status History Timeline */}
              <section className="incident-detail-section">
                <h4 className="incident-section-title">Status Audit Timeline</h4>
                {incident.status_history && incident.status_history.length > 0 ? (
                  <Timeline items={incident.status_history} />
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No status transitions recorded yet.
                  </p>
                )}
              </section>
            </div>
          )}
        </div>
      </aside>

      {/* Assign Team Modal */}
      <AssignTeamModal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        incidentId={incident?.id}
        incidentCode={incident?.public_code}
        onAssigned={handleTeamAssigned}
      />

      {/* Photo Lightbox Modal */}
      {showPhotoModal && incident?.photo_url && (
        <div
          className="incident-drawer-backdrop"
          onClick={() => setShowPhotoModal(false)}
          style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              background: '#0D151D',
              border: '1px solid var(--border-default)',
              borderRadius: 12,
              overflow: 'hidden',
              position: 'relative',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{incident.public_code} - Scene Photo</span>
              <button
                type="button"
                onClick={() => setShowPhotoModal(false)}
                className="incident-drawer-close-btn"
              >
                <X size={16} />
              </button>
            </div>
            <img
              src={incident.photo_url}
              alt="Full size incident photo"
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', display: 'block' }}
            />
          </div>
        </div>
      )}
    </>
  );
}

