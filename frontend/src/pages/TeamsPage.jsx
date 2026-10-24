import { useEffect, useState } from 'react';
import { Plus, Users, Edit2, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import {
  Table,
  Button,
  Card,
  Modal,
  ConfirmDialog,
  Input,
  Select,
  EmptyState,
  SkeletonTableRow,
} from '../components/ui';

export default function TeamsPage() {
  const toast = useToast();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal form state
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'rescue',
    contact: '',
    is_available: true,
  });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Confirm delete dialog state
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadTeams = () => {
    setLoading(true);
    api
      .get('/teams')
      .then(setTeams)
      .catch((err) => toast.error(err.message || 'Failed to load teams'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTeams();
  }, []);

  const openCreate = () => {
    setForm({ name: '', type: 'rescue', contact: '', is_available: true });
    setEditId(null);
    setModalOpen(true);
  };

  const openEdit = (team) => {
    setForm({
      name: team.name,
      type: team.type,
      contact: team.contact || '',
      is_available: team.is_available,
    });
    setEditId(team.id);
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/teams/${editId}`, form);
        toast.success(`Team "${form.name}" updated successfully`);
      } else {
        await api.post('/teams', form);
        toast.success(`Team "${form.name}" created successfully`);
      }
      setModalOpen(false);
      loadTeams();
    } catch (err) {
      toast.error(err.message || 'Failed to save team');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/teams/${deleteId}`);
      toast.success('Team deleted successfully');
      setDeleteId(null);
      loadTeams();
    } catch (err) {
      toast.error(err.message || 'Failed to delete team');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1 className="ui-page-title">Response teams & fleet</h1>
          <p className="ui-page-desc">
            Manage field deployment teams, specialization types, and dispatch readiness.
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={openCreate}>
          Add response team
        </Button>
      </div>

      {/* Main Table */}
      {loading ? (
        <Card padding="none">
          <Table compact>
            <thead>
              <tr>
                <th style={{ width: 70 }}>ID</th>
                <th>Team name</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Status</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTableRow columns={6} />
              <SkeletonTableRow columns={6} />
              <SkeletonTableRow columns={6} />
            </tbody>
          </Table>
        </Card>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No teams registered"
          description="Register your first search-and-rescue, medical, or volunteer fleet unit."
          actionLabel="Add team"
          onAction={openCreate}
        />
      ) : (
        <Card padding="none">
          <Table compact stickyHeader>
            <thead>
              <tr>
                <th style={{ width: 70 }}>ID</th>
                <th>Team name</th>
                <th>Specialization</th>
                <th>Contact info</th>
                <th>Readiness</th>
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                    #{t.id}
                  </td>
                  <td style={{ fontWeight: 500 }}>{t.name}</td>
                  <td style={{ textTransform: 'capitalize' }}>{t.type}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {t.contact || '—'}
                  </td>
                  <td>
                    <span
                      className={`ui-badge ui-badge-sm ${
                        t.is_available ? 'ui-badge-status-resolved' : 'ui-badge-prio-high'
                      }`}
                    >
                      {t.is_available ? 'Available' : 'Dispatched'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(t)}
                        title="Edit team"
                      >
                        <Edit2 size={13} />
                        <span>Edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteId(t.id)}
                        title="Delete team"
                        style={{ color: 'var(--danger-text)' }}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Edit response team' : 'Register new response team'}
        description="Configure unit specialization and dispatch availability."
      >
        <form onSubmit={handleSubmit}>
          <Input
            label="Team name"
            id="team-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Pune NDRF Unit 1"
            required
          />

          <Select
            label="Specialization type"
            id="team-type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            options={[
              { value: 'rescue', label: 'Search and rescue' },
              { value: 'medical', label: 'Medical first response' },
              { value: 'volunteer', label: 'Volunteer logistics' },
            ]}
          />

          <Input
            label="Direct contact number or radio channel"
            id="team-contact"
            value={form.contact}
            onChange={(e) => setForm({ ...form, contact: e.target.value })}
            placeholder="e.g. +91 98230 00000 or VHF Ch 16"
          />

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="team-avail"
              checked={form.is_available}
              onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
            />
            <label htmlFor="team-avail" style={{ fontSize: '13px', cursor: 'pointer' }}>
              Available for immediate dispatch
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 24,
            }}
          >
            <Button
              variant="ghost"
              size="md"
              type="button"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" loading={saving}>
              {editId ? 'Save changes' : 'Create team'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete response team"
        description="Are you sure you want to delete this team? Active incident assignments linked to this unit may be affected."
        confirmLabel="Delete team"
        danger
        loading={deleting}
      />
    </div>
  );
}
