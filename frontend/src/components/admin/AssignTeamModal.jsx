import { useState, useEffect } from 'react';
import { Users, Phone, Check, Shield, AlertTriangle } from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../../context/ToastContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';

export default function AssignTeamModal({
  isOpen,
  onClose,
  incidentId,
  incidentCode,
  onAssigned,
}) {
  const toast = useToast();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedTeamId(null);
      setError(null);
      return;
    }

    const fetchTeams = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.get('/teams');
        setTeams(data);
      } catch (err) {
        setError(err.message || 'Failed to load response teams.');
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, [isOpen]);

  const handleAssign = async () => {
    if (!selectedTeamId || !incidentId) return;

    setAssigning(true);
    try {
      const res = await api.post(`/admin/incidents/${incidentId}/assign`, {
        team_id: selectedTeamId,
      });
      toast.success(res.message || 'Response team successfully assigned.');
      if (onAssigned) onAssigned(res);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to assign team.');
    } finally {
      setAssigning(false);
    }
  };

  const availableTeams = teams.filter((t) => t.is_available);
  const busyTeams = teams.filter((t) => !t.is_available);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Response Team"
      description={`Select an available field team to deploy to ${incidentCode || `Incident #${incidentId}`}.`}
      maxWidth={520}
      footer={
        <div className="ui-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={assigning}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleAssign}
            loading={assigning}
            disabled={!selectedTeamId || assigning}
          >
            Deploy & Assign
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '36px 0', gap: 10, color: 'var(--text-secondary)' }}>
            <Spinner size={18} />
            <span style={{ fontSize: 13 }}>Loading response teams...</span>
          </div>
        ) : error ? (
          <div style={{ padding: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, color: '#F04438', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          </div>
        ) : teams.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            No response teams configured in system.
          </div>
        ) : availableTeams.length === 0 ? (
          <div style={{ padding: 14, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 8, color: '#F59E0B', fontSize: 13 }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>No teams currently available</p>
            <p style={{ fontSize: 12, opacity: 0.9 }}>
              All {teams.length} teams are presently deployed on active emergencies.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 2 }}>
              Available Teams ({availableTeams.length})
            </div>
            {availableTeams.map((team) => {
              const isSelected = selectedTeamId === team.id;
              return (
                <div
                  key={team.id}
                  onClick={() => setSelectedTeamId(team.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: `1px solid ${isSelected ? '#01AEFD' : 'var(--border-default)'}`,
                    background: isSelected ? 'rgba(1, 174, 253, 0.08)' : 'var(--bg-surface)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: isSelected ? 'rgba(1, 174, 253, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                        color: isSelected ? '#01AEFD' : '#10B981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Users size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {team.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        <span style={{ textTransform: 'capitalize', color: 'var(--accent-primary)', fontWeight: 500 }}>
                          {team.type}
                        </span>
                        {team.contact && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Phone size={11} />
                            {team.contact}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10B981',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      Ready
                    </span>
                    {isSelected && (
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#01AEFD',
                          color: '#0C1117',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={13} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {busyTeams.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginTop: 10, marginBottom: 2 }}>
                  Deployed / Busy ({busyTeams.length})
                </div>
                {busyTeams.map((team) => (
                  <div
                    key={team.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--border-default)',
                      background: 'rgba(255, 255, 255, 0.02)',
                      opacity: 0.6,
                      cursor: 'not-allowed',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {team.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {team.type} &bull; Dispatched
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 500,
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#EF4444',
                      }}
                    >
                      Busy
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

