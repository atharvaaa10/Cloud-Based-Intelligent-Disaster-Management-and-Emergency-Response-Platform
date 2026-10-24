import { useEffect, useState } from 'react';
import { Plus, Package, Edit2, Trash2 } from 'lucide-react';
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

export default function ResourcesPage() {
  const toast = useToast();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal form state
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'shelter',
    quantity: 0,
    is_available: true,
  });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Confirm delete dialog state
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadResources = () => {
    setLoading(true);
    api
      .get('/resources')
      .then(setResources)
      .catch((err) => toast.error(err.message || 'Failed to load resources'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadResources();
  }, []);

  const openCreate = () => {
    setForm({ name: '', type: 'shelter', quantity: 0, is_available: true });
    setEditId(null);
    setModalOpen(true);
  };

  const openEdit = (resource) => {
    setForm({
      name: resource.name,
      type: resource.type,
      quantity: resource.quantity,
      is_available: resource.is_available,
    });
    setEditId(resource.id);
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, quantity: Number(form.quantity) };
      if (editId) {
        await api.put(`/resources/${editId}`, payload);
        toast.success(`Resource "${form.name}" updated successfully`);
      } else {
        await api.post('/resources', payload);
        toast.success(`Resource "${form.name}" added successfully`);
      }
      setModalOpen(false);
      loadResources();
    } catch (err) {
      toast.error(err.message || 'Failed to save resource');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/resources/${deleteId}`);
      toast.success('Resource deleted successfully');
      setDeleteId(null);
      loadResources();
    } catch (err) {
      toast.error(err.message || 'Failed to delete resource');
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
          <h1 className="ui-page-title">Emergency supplies & fleet</h1>
          <p className="ui-page-desc">
            Track shelter capacity, medical stockpiles, rations, and rescue vehicle inventory.
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={openCreate}>
          Add emergency resource
        </Button>
      </div>

      {/* Main Table */}
      {loading ? (
        <Card padding="none">
          <Table compact>
            <thead>
              <tr>
                <th style={{ width: 70 }}>ID</th>
                <th>Resource name</th>
                <th>Type</th>
                <th>Units in stock</th>
                <th>Availability</th>
                <th style={{ width: 140 }}>Actions</th>
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
          title="No resources logged"
          description="Log emergency shelters, medical kits, food packages, or response vehicles."
          actionLabel="Add resource"
          onAction={openCreate}
        />
      ) : (
        <Card padding="none">
          <Table compact stickyHeader>
            <thead>
              <tr>
                <th style={{ width: 70 }}>ID</th>
                <th>Resource item</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Readiness</th>
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                    #{r.id}
                  </td>
                  <td style={{ fontWeight: 500 }}>{r.name}</td>
                  <td style={{ textTransform: 'capitalize' }}>
                    {r.type.replace('_', ' ')}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {r.quantity.toLocaleString()}
                  </td>
                  <td>
                    <span
                      className={`ui-badge ui-badge-sm ${
                        r.is_available ? 'ui-badge-status-resolved' : 'ui-badge-prio-high'
                      }`}
                    >
                      {r.is_available ? 'Available' : 'Depleted'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(r)}
                        title="Edit resource"
                      >
                        <Edit2 size={13} />
                        <span>Edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteId(r.id)}
                        title="Delete resource"
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
        title={editId ? 'Edit emergency resource' : 'Add emergency resource'}
        description="Update inventory quantities and availability status."
      >
        <form onSubmit={handleSubmit}>
          <Input
            label="Resource or asset name"
            id="resource-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Inflatable Rescue Raft or Emergency Ration Box"
            required
          />

          <Select
            label="Resource classification"
            id="resource-type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            options={[
              { value: 'shelter', label: 'Emergency shelter' },
              { value: 'food', label: 'Food & potable water' },
              { value: 'medical_supply', label: 'Medical supply' },
              { value: 'vehicle', label: 'Emergency rescue vehicle' },
            ]}
          />

          <Input
            label="Quantity / available units"
            id="resource-quantity"
            type="number"
            min="0"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            required
          />

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="resource-avail"
              checked={form.is_available}
              onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
            />
            <label htmlFor="resource-avail" style={{ fontSize: '13px', cursor: 'pointer' }}>
              In stock and available for field dispatch
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
              {editId ? 'Save changes' : 'Add resource'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete emergency resource"
        description="Are you sure you want to remove this item from the active supply catalog?"
        confirmLabel="Delete resource"
        danger
        loading={deleting}
      />
    </div>
  );
}
