import { useEffect, useState } from 'react';
import {
  Users,
  Package,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Truck,
} from 'lucide-react';
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
  StatCard,
} from '../components/ui';

export default function AdminResources() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('teams'); // 'teams' | 'supplies'

  // ── Teams State ────────────────────────────────────────────────
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamForm, setTeamForm] = useState({
    name: '',
    type: 'rescue',
    contact: '',
    is_available: true,
  });
  const [editTeamId, setEditTeamId] = useState(null);
  const [savingTeam, setSavingTeam] = useState(false);
  const [deleteTeamId, setDeleteTeamId] = useState(null);
  const [deletingTeam, setDeletingTeam] = useState(false);

  // ── Supplies & Vehicles State ──────────────────────────────────
  const [resources, setResources] = useState([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [resourceForm, setResourceForm] = useState({
    name: '',
    type: 'shelter',
    quantity: 0,
    is_available: true,
  });
  const [editResourceId, setEditResourceId] = useState(null);
  const [savingResource, setSavingResource] = useState(false);
  const [deleteResourceId, setDeleteResourceId] = useState(null);
  const [deletingResource, setDeletingResource] = useState(false);

  // ── Data Fetching ──────────────────────────────────────────────
  const loadTeams = () => {
    setTeamsLoading(true);
    api
      .get('/teams')
      .then(setTeams)
      .catch((err) => toast.error(err.message || 'Failed to load teams'))
      .finally(() => setTeamsLoading(false));
  };

  const loadResources = () => {
    setResourcesLoading(true);
    api
      .get('/resources')
      .then(setResources)
      .catch((err) => toast.error(err.message || 'Failed to load resources'))
      .finally(() => setResourcesLoading(false));
  };

  useEffect(() => {
    loadTeams();
    loadResources();
  }, []);

  // ── Team Handlers ──────────────────────────────────────────────
  const openCreateTeam = () => {
    setTeamForm({ name: '', type: 'rescue', contact: '', is_available: true });
    setEditTeamId(null);
    setTeamModalOpen(true);
  };

  const openEditTeam = (team) => {
    setTeamForm({
      name: team.name,
      type: team.type,
      contact: team.contact || '',
      is_available: team.is_available,
    });
    setEditTeamId(team.id);
    setTeamModalOpen(true);
  };

  const handleSaveTeam = async (e) => {
    e.preventDefault();
    setSavingTeam(true);
    try {
      if (editTeamId) {
        await api.put(`/teams/${editTeamId}`, teamForm);
        toast.success(`Team "${teamForm.name}" updated successfully`);
      } else {
        await api.post('/teams', teamForm);
        toast.success(`Team "${teamForm.name}" created successfully`);
      }
      setTeamModalOpen(false);
      loadTeams();
    } catch (err) {
      toast.error(err.message || 'Failed to save team');
    } finally {
      setSavingTeam(false);
    }
  };

  const confirmDeleteTeam = async () => {
    if (!deleteTeamId) return;
    setDeletingTeam(true);
    try {
      await api.delete(`/teams/${deleteTeamId}`);
      toast.success('Team deleted successfully');
      setDeleteTeamId(null);
      loadTeams();
    } catch (err) {
      toast.error(err.message || 'Failed to delete team');
    } finally {
      setDeletingTeam(false);
    }
  };

  // ── Resource Handlers ──────────────────────────────────────────
  const openCreateResource = () => {
    setResourceForm({ name: '', type: 'shelter', quantity: 0, is_available: true });
    setEditResourceId(null);
    setResourceModalOpen(true);
  };

  const openEditResource = (resource) => {
    setResourceForm({
      name: resource.name,
      type: resource.type,
      quantity: resource.quantity,
      is_available: resource.is_available,
    });
    setEditResourceId(resource.id);
    setResourceModalOpen(true);
  };

  const handleSaveResource = async (e) => {
    e.preventDefault();
    setSavingResource(true);
    try {
      const payload = { ...resourceForm, quantity: Number(resourceForm.quantity) };
      if (editResourceId) {
        await api.put(`/resources/${editResourceId}`, payload);
        toast.success(`Resource "${resourceForm.name}" updated successfully`);
      } else {
        await api.post('/resources', payload);
        toast.success(`Resource "${resourceForm.name}" added successfully`);
      }
      setResourceModalOpen(false);
      loadResources();
    } catch (err) {
      toast.error(err.message || 'Failed to save resource');
    } finally {
      setSavingResource(false);
    }
  };

  const confirmDeleteResource = async () => {
    if (!deleteResourceId) return;
    setDeletingResource(true);
    try {
      await api.delete(`/resources/${deleteResourceId}`);
      toast.success('Resource deleted successfully');
      setDeleteResourceId(null);
      loadResources();
    } catch (err) {
      toast.error(err.message || 'Failed to delete resource');
    } finally {
      setDeletingResource(false);
    }
  };

  // ── Computed Stats ─────────────────────────────────────────────
  const availableTeamsCount = teams.filter((t) => t.is_available).length;
  const availableResourcesCount = resources.filter((r) => r.is_available).length;

  return (
    <div>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1 className="ui-page-title">Rescue Teams &amp; Resources</h1>
          <p className="ui-page-desc">
            Manage rescue personnel units, field equipment, stockpiles, and emergency deployment assets.
          </p>
        </div>

        <div>
          {activeTab === 'teams' ? (
            <Button variant="primary" icon={Plus} onClick={openCreateTeam}>
              Add response team
            </Button>
          ) : (
            <Button variant="primary" icon={Plus} onClick={openCreateResource}>
              Add supply / vehicle
            </Button>
          )}
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="ui-stat-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="Total Rescue Teams"
          value={teams.length}
          icon={Users}
          variant="default"
        />
        <StatCard
          label="Ready Teams"
          value={availableTeamsCount}
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          label="Supply Depots & Assets"
          value={resources.length}
          icon={Package}
          variant="default"
        />
        <StatCard
          label="Available Supplies"
          value={availableResourcesCount}
          icon={Truck}
          variant="info"
        />
      </div>

      {/* Unified Tab Switcher */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          borderBottom: '1px solid var(--border)',
          marginBottom: 20,
          paddingBottom: 2,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('teams')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            fontSize: 'var(--text-sm)',
            fontWeight: activeTab === 'teams' ? 600 : 500,
            color: activeTab === 'teams' ? '#22C7FF' : 'var(--text-secondary)',
            background: activeTab === 'teams' ? 'rgba(1, 174, 253, 0.12)' : 'transparent',
            border: activeTab === 'teams' ? '1px solid rgba(1, 174, 253, 0.35)' : '1px solid transparent',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Users size={16} />
          <span>Rescue Teams</span>
          <span
            style={{
              padding: '2px 7px',
              borderRadius: 10,
              fontSize: 11,
              background: activeTab === 'teams' ? 'rgba(1, 174, 253, 0.25)' : 'var(--panel)',
              color: activeTab === 'teams' ? '#FFF' : 'var(--text-muted)',
            }}
          >
            {teams.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('supplies')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            fontSize: 'var(--text-sm)',
            fontWeight: activeTab === 'supplies' ? 600 : 500,
            color: activeTab === 'supplies' ? '#22C7FF' : 'var(--text-secondary)',
            background: activeTab === 'supplies' ? 'rgba(1, 174, 253, 0.12)' : 'transparent',
            border: activeTab === 'supplies' ? '1px solid rgba(1, 174, 253, 0.35)' : '1px solid transparent',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Package size={16} />
          <span>Supplies &amp; Vehicles</span>
          <span
            style={{
              padding: '2px 7px',
              borderRadius: 10,
              fontSize: 11,
              background: activeTab === 'supplies' ? 'rgba(1, 174, 253, 0.25)' : 'var(--panel)',
              color: activeTab === 'supplies' ? '#FFF' : 'var(--text-muted)',
            }}
          >
            {resources.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Teams Management */}
      {activeTab === 'teams' && (
        <>
          {teamsLoading ? (
            <Card padding="none">
              <Table compact>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>ID</th>
                    <th>Team name</th>
                    <th>Specialization</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Actions</th>
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
              title="No response teams registered"
              description="Deploy and track specialized rescue, medical, and relief teams by adding your first unit."
              action={
                <Button variant="primary" icon={Plus} onClick={openCreateTeam}>
                  Add response team
                </Button>
              }
            />
          ) : (
            <Card padding="none">
              <Table compact hoverable>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>ID</th>
                    <th>Team name</th>
                    <th>Specialization</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                        #{team.id}
                      </td>
                      <td style={{ fontWeight: 500 }}>{team.name}</td>
                      <td style={{ textTransform: 'capitalize' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-surface-hover)',
                            fontSize: 'var(--text-xs)',
                          }}
                        >
                          {team.type?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>{team.contact || '—'}</td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 'var(--text-xs)',
                            fontWeight: 500,
                            color: team.is_available ? 'var(--color-success)' : 'var(--text-muted)',
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: team.is_available
                                ? 'var(--color-success)'
                                : 'var(--border)',
                            }}
                          />
                          {team.is_available ? 'Available' : 'Dispatched / Off-duty'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Edit2}
                            onClick={() => openEditTeam(team)}
                            title="Edit team"
                          />
                          <Button
                            variant="danger"
                            size="sm"
                            icon={Trash2}
                            onClick={() => setDeleteTeamId(team.id)}
                            title="Delete team"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Tab 2: Supplies & Vehicles */}
      {activeTab === 'supplies' && (
        <>
          {resourcesLoading ? (
            <Card padding="none">
              <Table compact>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>ID</th>
                    <th>Resource / asset name</th>
                    <th>Category</th>
                    <th>Quantity / stock</th>
                    <th>Status</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <SkeletonTableRow columns={6} />
                  <SkeletonTableRow columns={6} />
                  <SkeletonTableRow columns={6} />
                </tbody>
              </Table>
            </Card>
          ) : resources.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No emergency supplies registered"
              description="Keep track of ration stocks, emergency vehicles, and medical supply caches by registering resources."
              action={
                <Button variant="primary" icon={Plus} onClick={openCreateResource}>
                  Add supply / vehicle
                </Button>
              }
            />
          ) : (
            <Card padding="none">
              <Table compact hoverable>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>ID</th>
                    <th>Resource / asset name</th>
                    <th>Category</th>
                    <th>Quantity / stock</th>
                    <th>Status</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((resource) => (
                    <tr key={resource.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                        #{resource.id}
                      </td>
                      <td style={{ fontWeight: 500 }}>{resource.name}</td>
                      <td style={{ textTransform: 'capitalize' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-surface-hover)',
                            fontSize: 'var(--text-xs)',
                          }}
                        >
                          {resource.type?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {resource.quantity != null ? resource.quantity.toLocaleString() : '—'}
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 'var(--text-xs)',
                            fontWeight: 500,
                            color: resource.is_available
                              ? 'var(--color-success)'
                              : 'var(--text-muted)',
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: resource.is_available
                                ? 'var(--color-success)'
                                : 'var(--border)',
                            }}
                          />
                          {resource.is_available ? 'In Stock / Ready' : 'Depleted / Unavailable'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Edit2}
                            onClick={() => openEditResource(resource)}
                            title="Edit resource"
                          />
                          <Button
                            variant="danger"
                            size="sm"
                            icon={Trash2}
                            onClick={() => setDeleteResourceId(resource.id)}
                            title="Delete resource"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Team Modal */}
      <Modal
        open={teamModalOpen}
        onClose={() => setTeamModalOpen(false)}
        title={editTeamId ? 'Edit response team' : 'Add response team'}
      >
        <form onSubmit={handleSaveTeam}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input
              id="team-name"
              label="Team name"
              value={teamForm.name}
              onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
              placeholder="e.g. NDRF Unit 04"
              required
            />

            <Select
              id="team-type"
              label="Specialization"
              value={teamForm.type}
              onChange={(e) => setTeamForm({ ...teamForm, type: e.target.value })}
              options={[
                { value: 'rescue', label: 'Rescue' },
                { value: 'medical', label: 'Medical' },
                { value: 'food_water', label: 'Food & water relief' },
                { value: 'shelter', label: 'Shelter & logistics' },
                { value: 'fire', label: 'Fire & hazard control' },
              ]}
            />

            <Input
              id="team-contact"
              label="Contact details"
              value={teamForm.contact}
              onChange={(e) => setTeamForm({ ...teamForm, contact: e.target.value })}
              placeholder="e.g. +91 98765 43210 or Radio Channel 4"
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <input
                type="checkbox"
                id="team-available"
                checked={teamForm.is_available}
                onChange={(e) =>
                  setTeamForm({ ...teamForm, is_available: e.target.checked })
                }
                style={{ cursor: 'pointer', width: 16, height: 16 }}
              />
              <label
                htmlFor="team-available"
                style={{ fontSize: 'var(--text-sm)', cursor: 'pointer' }}
              >
                Unit is available for immediate dispatch
              </label>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 12,
              }}
            >
              <Button
                variant="secondary"
                type="button"
                onClick={() => setTeamModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={savingTeam}>
                {editTeamId ? 'Save changes' : 'Create team'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Team Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTeamId)}
        onClose={() => setDeleteTeamId(null)}
        onConfirm={confirmDeleteTeam}
        title="Delete response team"
        message="Are you sure you want to remove this response team? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={deletingTeam}
      />

      {/* Resource Modal */}
      <Modal
        open={resourceModalOpen}
        onClose={() => setResourceModalOpen(false)}
        title={editResourceId ? 'Edit emergency asset' : 'Add emergency asset'}
      >
        <form onSubmit={handleSaveResource}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input
              id="res-name"
              label="Resource name"
              value={resourceForm.name}
              onChange={(e) =>
                setResourceForm({ ...resourceForm, name: e.target.value })
              }
              placeholder="e.g. Emergency Life Jackets Cache"
              required
            />

            <Select
              id="res-type"
              label="Resource category"
              value={resourceForm.type}
              onChange={(e) =>
                setResourceForm({ ...resourceForm, type: e.target.value })
              }
              options={[
                { value: 'shelter', label: 'Shelter' },
                { value: 'food_water', label: 'Food & water supply' },
                { value: 'medical', label: 'Medical kits' },
                { value: 'vehicle', label: 'Vehicles / Boats' },
                { value: 'tools', label: 'Rescue equipment' },
              ]}
            />

            <Input
              id="res-qty"
              label="Quantity in stock"
              type="number"
              min="0"
              value={resourceForm.quantity}
              onChange={(e) =>
                setResourceForm({ ...resourceForm, quantity: e.target.value })
              }
              required
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <input
                type="checkbox"
                id="res-available"
                checked={resourceForm.is_available}
                onChange={(e) =>
                  setResourceForm({ ...resourceForm, is_available: e.target.checked })
                }
                style={{ cursor: 'pointer', width: 16, height: 16 }}
              />
              <label
                htmlFor="res-available"
                style={{ fontSize: 'var(--text-sm)', cursor: 'pointer' }}
              >
                Stock is currently ready and deployable
              </label>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 12,
              }}
            >
              <Button
                variant="secondary"
                type="button"
                onClick={() => setResourceModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={savingResource}>
                {editResourceId ? 'Save changes' : 'Add asset'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Resource Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteResourceId)}
        onClose={() => setDeleteResourceId(null)}
        onConfirm={confirmDeleteResource}
        title="Delete emergency asset"
        message="Are you sure you want to remove this resource record from inventory?"
        confirmText="Delete"
        variant="danger"
        loading={deletingResource}
      />
    </div>
  );
}
