import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Users,
  Calendar,
  User,
  Zap,
  Shield,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Button,
  Card,
  Badge,
  Select,
  Textarea,
  Timeline,
  Skeleton,
  formatRelativeTime,
  formatFullTime,
} from '../components/ui';

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [incident, setIncident] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [selectedTeam, setSelectedTeam] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [newPriority, setNewPriority] = useState('');

  const isAdmin = user?.role === 'admin';
  const isAdminOrResponder = ['admin', 'responder'].includes(user?.role);

  const loadIncident = async () => {
    try {
      const data = await api.get(`/incidents/${id}`);
      setIncident(data);
      setNewPriority(data.priority);

      // Fetch presigned photo URL if photo_key exists
      if (data.photo_key) {
        try {
          const photoData = await api.get(`/incidents/${id}/photo-url`);
          setPhotoUrl(photoData.photo_url);
        } catch {
          setPhotoUrl(null);
        }
      } else {
        setPhotoUrl(null);
      }

      if (isAdminOrResponder) {
        const teamList = await api.get('/teams');
        setTeams(teamList);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load incident details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncident();
  }, [id]);

  const handlePriorityUpdate = async () => {
    if (!newPriority || newPriority === incident?.priority) return;
    setActionLoading(true);
    try {
      await api.patch(`/incidents/${id}/priority`, { priority: newPriority });
      toast.success('Incident priority updated');
      await loadIncident();
    } catch (err) {
      toast.error(err.message || 'Failed to update priority');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignTeam = async () => {
    if (!selectedTeam) return;
    setActionLoading(true);
    try {
      await api.post(`/incidents/${id}/assign`, { team_id: Number(selectedTeam) });
      toast.success('Response team assigned successfully');
      setSelectedTeam('');
      await loadIncident();
    } catch (err) {
      toast.error(err.message || 'Failed to assign team');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!newStatus) return;
    setActionLoading(true);
    try {
      await api.patch(`/incidents/${id}/status`, {
        status: newStatus,
        note: statusNote.trim() || null,
      });
      toast.success('Incident status updated');
      setNewStatus('');
      setStatusNote('');
      await loadIncident();
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Skeleton width="180px" height="28px" />
        </div>
        <div className="incident-detail-grid">
          <Card padding="lg">
            <Skeleton count={4} height="20px" style={{ marginBottom: 12 }} />
          </Card>
          <Card padding="lg">
            <Skeleton count={3} height="28px" style={{ marginBottom: 12 }} />
          </Card>
        </div>
      </div>
    );
  }

  if (!incident) {
    return (
      <Card padding="lg" style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
          Incident #{id} could not be found.
        </p>
        <Button variant="secondary" onClick={() => navigate('/admin')}>
          Return to dashboard
        </Button>
      </Card>
    );
  }

  const score = incident.triage_score != null ? Math.min(100, Math.max(0, incident.triage_score)) : 0;
  let meterColor = 'var(--text-tertiary)';
  if (score >= 80) meterColor = 'var(--danger-solid)';
  else if (score >= 60) meterColor = '#f97316';
  else if (score >= 40) meterColor = '#f59e0b';
  else if (score > 0) meterColor = '#10b981';

  return (
    <div>
      {/* Top Bar with Back Button and Quick Badges */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            variant="ghost"
            size="sm"
            icon={ArrowLeft}
            onClick={() => navigate(-1)}
          >
            Back
          </Button>
          <h1 className="ui-page-title" style={{ fontSize: '18px' }}>
            Incident #{incident.id}
          </h1>
          <Badge variant="priority" value={incident.priority} />
          <Badge variant="status" value={incident.status} />
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Reported {formatRelativeTime(incident.created_at)} ({formatFullTime(incident.created_at)})
        </div>
      </div>

      {/* Two-Column Layout */}
      <div className="incident-detail-grid">
        {/* Left Column: Description, Media, Metadata, Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Main Incident Card */}
          <Card padding="md">
            <div style={{ marginBottom: 16 }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Category
              </span>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 500,
                  textTransform: 'capitalize',
                  color: 'var(--text-primary)',
                  marginTop: 2,
                }}
              >
                {incident.category.replace('_', ' ')}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Description
              </span>
              <p
                style={{
                  fontSize: '14px',
                  lineHeight: 1.6,
                  color: 'var(--text-primary)',
                  marginTop: 4,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {incident.description}
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 16,
                paddingTop: 12,
                borderTop: '1px solid var(--border-default)',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                  }}
                >
                  Location
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: '13px' }}>
                  <MapPin size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span>{incident.location_text}</span>
                </div>
                {incident.latitude && incident.longitude && (
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: 2, marginLeft: 20 }}>
                    GPS: {incident.latitude}, {incident.longitude}
                  </div>
                )}
              </div>

              <div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                  }}
                >
                  People affected
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: '13px' }}>
                  <Users size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span>{incident.people_affected} persons reported</span>
                </div>
              </div>

              {incident.reporter && (
                <div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Reported by
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: '13px' }}>
                    <User size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    <span>{incident.reporter.name}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Attached Photo */}
            {photoUrl && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Attached scene photo
                  </span>
                  <a
                    href={photoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <span>View full size</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
                <img
                  src={photoUrl}
                  alt={`Incident #${incident.id} Scene`}
                  style={{
                    maxHeight: 260,
                    maxWidth: '100%',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    display: 'block',
                  }}
                />
              </div>
            )}
          </Card>

          {/* Status Timeline Card */}
          <Card
            title="Status transition history"
            subtitle="Immutable operational event log for this incident"
            padding="md"
          >
            <Timeline items={incident.status_history || []} />
          </Card>
        </div>

        {/* Right Column: Sticky Action Panel, Auto-Triage Assessment, Team Dispatch */}
        <div className="detail-actions-panel">
          {/* Auto-Triage Assessment */}
          {incident.auto_triaged_at && (
            <Card padding="md">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={15} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Auto-triage evaluation
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: meterColor,
                  }}
                >
                  Score: {incident.triage_score ?? 'n/a'}/100
                </span>
              </div>

              {/* Meter */}
              <div className="triage-score-bar-bg">
                <div
                  className="triage-score-bar-fill"
                  style={{
                    width: `${score}%`,
                    backgroundColor: meterColor,
                  }}
                />
              </div>

              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 8 }}>
                {incident.triage_reason || 'Evaluated based on emergency category, population count, and severity indicators.'}
              </p>

              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: 8 }}>
                Evaluated {formatRelativeTime(incident.auto_triaged_at)}
              </div>
            </Card>
          )}

          {/* Priority Adjustment */}
          {isAdmin && (
            <Card title="Incident priority" padding="md">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Select
                    id="new-priority"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    options={[
                      { value: 'low', label: 'Low priority' },
                      { value: 'medium', label: 'Medium priority' },
                      { value: 'high', label: 'High priority' },
                      { value: 'critical', label: 'Critical priority' },
                    ]}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handlePriorityUpdate}
                  disabled={actionLoading || newPriority === incident.priority}
                >
                  Update
                </Button>
              </div>
            </Card>
          )}

          {/* Assign Rescue Team */}
          {isAdmin && incident.status !== 'resolved' && (
            <Card title="Assign response team" padding="md">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Select
                  id="assign-team"
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                >
                  <option value="">Select an available team...</option>
                  {teams
                    .filter((t) => t.is_available)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.type})
                      </option>
                    ))}
                </Select>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleAssignTeam}
                  disabled={actionLoading || !selectedTeam}
                  style={{ width: '100%' }}
                >
                  Assign team
                </Button>
              </div>
            </Card>
          )}

          {/* Update Status */}
          {isAdminOrResponder && incident.status !== 'resolved' && (
            <Card title="Update status" padding="md">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Select
                  id="status-update"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option value="">Choose new status...</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                </Select>

                <Textarea
                  id="status-note"
                  placeholder="Optional operational note (e.g. team dispatched, arrival confirmed)..."
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  rows={2}
                />

                <Button
                  variant="primary"
                  size="md"
                  onClick={handleStatusUpdate}
                  disabled={actionLoading || !newStatus}
                  style={{ width: '100%' }}
                >
                  Confirm status update
                </Button>
              </div>
            </Card>
          )}

          {/* Currently Assigned Teams */}
          {incident.assignments?.length > 0 && (
            <Card title="Assigned teams" padding="md">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {incident.assignments.map((a) => {
                  const teamObj = teams.find((t) => t.id === a.team_id);
                  return (
                    <div
                      key={a.id}
                      style={{
                        padding: '8px 10px',
                        backgroundColor: 'var(--bg-surface-subdued)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-default)',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {teamObj ? teamObj.name : `Team #${a.team_id}`}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                        {teamObj?.type && (
                          <span style={{ textTransform: 'capitalize' }}>{teamObj.type} • </span>
                        )}
                        Assigned {formatRelativeTime(a.assigned_at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
