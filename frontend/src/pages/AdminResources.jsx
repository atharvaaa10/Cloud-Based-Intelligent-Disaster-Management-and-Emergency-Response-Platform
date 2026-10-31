import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Users,
  Truck,
  Package,
  Home,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  RotateCcw,
  ShieldAlert,
  LifeBuoy,
  HeartPulse,
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
  ErrorBoundary,
} from '../components/ui';

// ── Helpers ─────────────────────────────────────────────────────────

const VEHICLE_TYPE_META = {
  ambulance: { label: 'Ambulance', icon: HeartPulse, color: '#EF4444' },
  fire_truck: { label: 'Fire Truck', icon: Flame, color: '#F97316' },
  boat: { label: 'Rescue Boat', icon: LifeBuoy, color: '#01AEFD' },
  supply_truck: { label: 'Supply Truck', icon: Truck, color: '#10B981' },
  suv_4x4: { label: '4x4 Rapid SUV', icon: ShieldAlert, color: '#8B5CF6' },
};

const SUPPLY_CAT_META = {
  food: { label: 'Food', color: 'border-orange-500/30 text-orange-400 bg-orange-500/10' },
  water: { label: 'Water', color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' },
  medical: { label: 'Medical', color: 'border-red-500/30 text-red-400 bg-red-500/10' },
  other: { label: 'Logistics', color: 'border-slate-500/30 text-slate-300 bg-slate-500/10' },
};

export default function AdminResources() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('teams'); // 'teams' | 'vehicles' | 'supplies' | 'shelters'

  // ── Summary State ──────────────────────────────────────────────────
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // ── Data State ─────────────────────────────────────────────────────
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);

  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);

  const [supplies, setSupplies] = useState([]);
  const [suppliesLoading, setSuppliesLoading] = useState(true);

  const [shelters, setShelters] = useState([]);
  const [sheltersLoading, setSheltersLoading] = useState(true);

  // Incidents for Dispatch Modal
  const [incidents, setIncidents] = useState([]);

  // Search & Filter state per tab
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // ── Modals State ───────────────────────────────────────────────────
  // Team Modal
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [teamForm, setTeamForm] = useState({
    name: '',
    contact: '',
    members_count: 5,
    latitude: '',
    longitude: '',
    status: 'available',
  });
  const [savingTeam, setSavingTeam] = useState(false);

  // Vehicle Modal
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [vehicleForm, setVehicleForm] = useState({
    name: '',
    type: 'ambulance',
    plate: '',
    status: 'available',
    assigned_team_id: '',
  });
  const [savingVehicle, setSavingVehicle] = useState(false);

  // Supply Modal
  const [supplyModalOpen, setSupplyModalOpen] = useState(false);
  const [editingSupply, setEditingSupply] = useState(null);
  const [supplyForm, setSupplyForm] = useState({
    item: '',
    category: 'medical',
    quantity: 0,
    unit: 'kits',
    low_stock_threshold: 10,
    location: '',
  });
  const [savingSupply, setSavingSupply] = useState(false);

  // Shelter Modal
  const [shelterModalOpen, setShelterModalOpen] = useState(false);
  const [editingShelter, setEditingShelter] = useState(null);
  const [shelterForm, setShelterForm] = useState({
    name: '',
    address: '',
    latitude: 18.5204,
    longitude: 73.8567,
    capacity: 200,
    current_occupancy: 0,
    available: true,
    contact: '',
  });
  const [savingShelter, setSavingShelter] = useState(false);

  // Dispatch / Assign to Incident Modal
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [dispatchForm, setDispatchForm] = useState({
    incident_id: '',
    team_id: '',
    vehicle_ids: [],
    supplies: [], // [{ supply_id, quantity, item, max }]
  });
  const [dispatching, setDispatching] = useState(false);

  // Release Modal
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [releaseIncidentId, setReleaseIncidentId] = useState('');
  const [releasing, setReleasing] = useState(false);

  // Delete Confirm Dialog
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    type: '', // 'team' | 'vehicle' | 'supply' | 'shelter'
    id: null,
    name: '',
  });
  const [deleting, setDeleting] = useState(false);

  // ── Data Fetching ──────────────────────────────────────────────────

  const loadSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      const data = await api.get('/admin/resources/summary');
      setSummary(data);
    } catch (err) {
      console.error('Failed to load resources summary', err);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadTeams = useCallback(async () => {
    try {
      setTeamsLoading(true);
      const data = await api.get('/admin/resources/teams');
      setTeams(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load teams');
    } finally {
      setTeamsLoading(false);
    }
  }, [toast]);

  const loadVehicles = useCallback(async () => {
    try {
      setVehiclesLoading(true);
      const data = await api.get('/admin/resources/vehicles');
      setVehicles(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load vehicles');
    } finally {
      setVehiclesLoading(false);
    }
  }, [toast]);

  const loadSupplies = useCallback(async () => {
    try {
      setSuppliesLoading(true);
      const data = await api.get('/admin/resources/supplies');
      setSupplies(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load supplies');
    } finally {
      setSuppliesLoading(false);
    }
  }, [toast]);

  const loadShelters = useCallback(async () => {
    try {
      setSheltersLoading(true);
      const data = await api.get('/admin/resources/shelters');
      setShelters(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load shelters');
    } finally {
      setSheltersLoading(false);
    }
  }, [toast]);

  const loadIncidents = useCallback(async () => {
    try {
      const data = await api.get('/admin/incidents?limit=50&status=reported,under_review,assigned,in_progress');
      setIncidents(data.items || []);
    } catch (err) {
      console.warn('Could not fetch active incidents for resource dispatch', err);
    }
  }, []);

  const reloadAll = useCallback(() => {
    loadSummary();
    loadTeams();
    loadVehicles();
    loadSupplies();
    loadShelters();
    loadIncidents();
  }, [loadSummary, loadTeams, loadVehicles, loadSupplies, loadShelters, loadIncidents]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  // Reset filters when changing tabs
  useEffect(() => {
    setSearchTerm('');
    setStatusFilter('');
    setCategoryFilter('');
    setLowStockOnly(false);
  }, [activeTab]);

  // ── Quick Stock & Occupancy Handlers ────────────────────────────────

  const handleStockDelta = async (supplyId, delta) => {
    try {
      const updated = await api.patch(`/admin/resources/supplies/${supplyId}`, { delta });
      setSupplies((prev) =>
        prev.map((s) => (s.id === supplyId ? updated : s))
      );
      toast.success(`Updated stock for ${updated.item} (${updated.quantity} ${updated.unit})`);
      loadSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to update stock');
    }
  };

  const handleShelterDelta = async (shelterId, deltaOccupancy) => {
    try {
      const updated = await api.patch(`/admin/resources/shelters/${shelterId}`, { delta_occupancy: deltaOccupancy });
      setShelters((prev) =>
        prev.map((s) => (s.id === shelterId ? updated : s))
      );
      toast.success(`Updated occupancy for ${updated.name} (${updated.current_occupancy}/${updated.capacity})`);
      loadSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to update occupancy');
    }
  };

  const handleToggleTeamStatus = async (team) => {
    const newStatus = team.status === 'available' ? 'busy' : 'available';
    try {
      const updated = await api.patch(`/admin/resources/teams/${team.id}`, { status: newStatus });
      setTeams((prev) => prev.map((t) => (t.id === team.id ? updated : t)));
      toast.success(`Team "${team.name}" marked as ${newStatus}`);
      loadSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to update team status');
    }
  };

  const handleVehicleStatusChange = async (vehicleId, newStatus) => {
    try {
      const updated = await api.patch(`/admin/resources/vehicles/${vehicleId}`, { status: newStatus });
      setVehicles((prev) => prev.map((v) => (v.id === vehicleId ? updated : v)));
      toast.success(`Vehicle status changed to ${newStatus}`);
      loadSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to update vehicle status');
    }
  };

  const handleToggleShelterAvailable = async (shelter) => {
    const newAvailable = !shelter.available;
    try {
      const updated = await api.patch(`/admin/resources/shelters/${shelter.id}`, { available: newAvailable });
      setShelters((prev) => prev.map((s) => (s.id === shelter.id ? updated : s)));
      toast.success(`Shelter "${shelter.name}" is now ${newAvailable ? 'open' : 'closed'}`);
      loadSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to update shelter availability');
    }
  };

  // ── Team Handlers ──────────────────────────────────────────────────

  const openCreateTeam = () => {
    setEditingTeam(null);
    setTeamForm({
      name: '',
      contact: '',
      members_count: 5,
      latitude: 18.5204,
      longitude: 73.8567,
      status: 'available',
    });
    setTeamModalOpen(true);
  };

  const openEditTeam = (team) => {
    setEditingTeam(team);
    setTeamForm({
      name: team.name,
      contact: team.contact || '',
      members_count: team.members_count || 5,
      latitude: team.latitude || '',
      longitude: team.longitude || '',
      status: team.status || 'available',
    });
    setTeamModalOpen(true);
  };

  const handleSaveTeam = async (e) => {
    e.preventDefault();
    if (!teamForm.name.trim()) {
      toast.error('Team name is required');
      return;
    }
    setSavingTeam(true);
    try {
      const payload = {
        name: teamForm.name.trim(),
        contact: teamForm.contact.trim() || null,
        members_count: parseInt(teamForm.members_count, 10) || 5,
        latitude: teamForm.latitude ? parseFloat(teamForm.latitude) : null,
        longitude: teamForm.longitude ? parseFloat(teamForm.longitude) : null,
        status: teamForm.status,
      };

      if (editingTeam) {
        await api.put(`/admin/resources/teams/${editingTeam.id}`, payload);
        toast.success(`Team "${payload.name}" updated successfully`);
      } else {
        await api.post('/admin/resources/teams', payload);
        toast.success(`Team "${payload.name}" created successfully`);
      }
      setTeamModalOpen(false);
      loadTeams();
      loadSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to save team');
    } finally {
      setSavingTeam(false);
    }
  };

  // ── Vehicle Handlers ───────────────────────────────────────────────

  const openCreateVehicle = () => {
    setEditingVehicle(null);
    setVehicleForm({
      name: '',
      type: 'ambulance',
      plate: '',
      status: 'available',
      assigned_team_id: '',
    });
    setVehicleModalOpen(true);
  };

  const openEditVehicle = (veh) => {
    setEditingVehicle(veh);
    setVehicleForm({
      name: veh.name,
      type: veh.type,
      plate: veh.plate,
      status: veh.status,
      assigned_team_id: veh.assigned_team_id || '',
    });
    setVehicleModalOpen(true);
  };

  const handleSaveVehicle = async (e) => {
    e.preventDefault();
    if (!vehicleForm.name.trim() || !vehicleForm.plate.trim()) {
      toast.error('Vehicle name and license plate are required');
      return;
    }
    setSavingVehicle(true);
    try {
      const payload = {
        name: vehicleForm.name.trim(),
        type: vehicleForm.type,
        plate: vehicleForm.plate.trim().toUpperCase(),
        status: vehicleForm.status,
        assigned_team_id: vehicleForm.assigned_team_id ? parseInt(vehicleForm.assigned_team_id, 10) : null,
      };

      if (editingVehicle) {
        await api.put(`/admin/resources/vehicles/${editingVehicle.id}`, payload);
        toast.success(`Vehicle "${payload.name}" updated successfully`);
      } else {
        await api.post('/admin/resources/vehicles', payload);
        toast.success(`Vehicle "${payload.name}" registered successfully`);
      }
      setVehicleModalOpen(false);
      loadVehicles();
      loadSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to save vehicle');
    } finally {
      setSavingVehicle(false);
    }
  };

  // ── Supply Handlers ────────────────────────────────────────────────

  const openCreateSupply = () => {
    setEditingSupply(null);
    setSupplyForm({
      item: '',
      category: 'medical',
      quantity: 50,
      unit: 'kits',
      low_stock_threshold: 15,
      location: 'Pune Central Warehouse',
    });
    setSupplyModalOpen(true);
  };

  const openEditSupply = (sup) => {
    setEditingSupply(sup);
    setSupplyForm({
      item: sup.item,
      category: sup.category,
      quantity: sup.quantity,
      unit: sup.unit,
      low_stock_threshold: sup.low_stock_threshold,
      location: sup.location,
    });
    setSupplyModalOpen(true);
  };

  const handleSaveSupply = async (e) => {
    e.preventDefault();
    if (!supplyForm.item.trim() || !supplyForm.location.trim()) {
      toast.error('Item name and location are required');
      return;
    }
    setSavingSupply(true);
    try {
      const payload = {
        item: supplyForm.item.trim(),
        category: supplyForm.category,
        quantity: parseInt(supplyForm.quantity, 10) || 0,
        unit: supplyForm.unit.trim() || 'units',
        low_stock_threshold: parseInt(supplyForm.low_stock_threshold, 10) || 10,
        location: supplyForm.location.trim(),
      };

      if (editingSupply) {
        await api.put(`/admin/resources/supplies/${editingSupply.id}`, payload);
        toast.success(`Supply "${payload.item}" updated successfully`);
      } else {
        await api.post('/admin/resources/supplies', payload);
        toast.success(`Supply "${payload.item}" created successfully`);
      }
      setSupplyModalOpen(false);
      loadSupplies();
      loadSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to save supply');
    } finally {
      setSavingSupply(false);
    }
  };

  // ── Shelter Handlers ───────────────────────────────────────────────

  const openCreateShelter = () => {
    setEditingShelter(null);
    setShelterForm({
      name: '',
      address: '',
      latitude: 18.5204,
      longitude: 73.8567,
      capacity: 250,
      current_occupancy: 0,
      available: true,
      contact: '',
    });
    setShelterModalOpen(true);
  };

  const openEditShelter = (sh) => {
    setEditingShelter(sh);
    setShelterForm({
      name: sh.name,
      address: sh.address,
      latitude: sh.latitude,
      longitude: sh.longitude,
      capacity: sh.capacity,
      current_occupancy: sh.current_occupancy,
      available: sh.available,
      contact: sh.contact || '',
    });
    setShelterModalOpen(true);
  };

  const handleSaveShelter = async (e) => {
    e.preventDefault();
    if (!shelterForm.name.trim() || !shelterForm.address.trim()) {
      toast.error('Shelter name and address are required');
      return;
    }
    setSavingShelter(true);
    try {
      const payload = {
        name: shelterForm.name.trim(),
        address: shelterForm.address.trim(),
        latitude: parseFloat(shelterForm.latitude) || 18.5204,
        longitude: parseFloat(shelterForm.longitude) || 73.8567,
        capacity: parseInt(shelterForm.capacity, 10) || 100,
        current_occupancy: parseInt(shelterForm.current_occupancy, 10) || 0,
        available: Boolean(shelterForm.available),
        contact: shelterForm.contact.trim() || null,
      };

      if (editingShelter) {
        await api.put(`/admin/resources/shelters/${editingShelter.id}`, payload);
        toast.success(`Shelter "${payload.name}" updated successfully`);
      } else {
        await api.post('/admin/resources/shelters', payload);
        toast.success(`Shelter "${payload.name}" registered successfully`);
      }
      setShelterModalOpen(false);
      loadShelters();
      loadSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to save shelter');
    } finally {
      setSavingShelter(false);
    }
  };

  // ── Delete Handler ─────────────────────────────────────────────────

  const confirmDelete = (type, id, name) => {
    setDeleteDialog({ open: true, type, id, name });
  };

  const handleDelete = async () => {
    const { type, id } = deleteDialog;
    setDeleting(true);
    try {
      if (type === 'team') {
        await api.delete(`/admin/resources/teams/${id}`);
        toast.success('Team deleted');
        loadTeams();
      } else if (type === 'vehicle') {
        await api.delete(`/admin/resources/vehicles/${id}`);
        toast.success('Vehicle deleted');
        loadVehicles();
      } else if (type === 'supply') {
        await api.delete(`/admin/resources/supplies/${id}`);
        toast.success('Supply item deleted');
        loadSupplies();
      } else if (type === 'shelter') {
        await api.delete(`/admin/resources/shelters/${id}`);
        toast.success('Shelter deleted');
        loadShelters();
      }
      loadSummary();
      setDeleteDialog({ open: false, type: '', id: null, name: '' });
    } catch (err) {
      toast.error(err.message || 'Failed to delete record');
    } finally {
      setDeleting(false);
    }
  };

  // ── Combined Dispatch / Assign Resources Handler ───────────────────

  const openDispatchModal = (preselected = {}) => {
    loadIncidents();
    setDispatchForm({
      incident_id: preselected.incident_id || (incidents[0]?.id ? String(incidents[0].id) : ''),
      team_id: preselected.team_id ? String(preselected.team_id) : '',
      vehicle_ids: preselected.vehicle_id ? [preselected.vehicle_id] : [],
      supplies: preselected.supply_id
        ? [
            {
              supply_id: preselected.supply_id,
              quantity: 10,
              item: preselected.supply_name || 'Supplies',
              max: preselected.supply_max || 100,
            },
          ]
        : [],
    });
    setDispatchModalOpen(true);
  };

  const handleToggleDispatchVehicle = (vehId) => {
    setDispatchForm((prev) => {
      const exists = prev.vehicle_ids.includes(vehId);
      return {
        ...prev,
        vehicle_ids: exists
          ? prev.vehicle_ids.filter((id) => id !== vehId)
          : [...prev.vehicle_ids, vehId],
      };
    });
  };

  const handleAddDispatchSupply = (sup) => {
    if (dispatchForm.supplies.some((s) => s.supply_id === sup.id)) return;
    setDispatchForm((prev) => ({
      ...prev,
      supplies: [
        ...prev.supplies,
        {
          supply_id: sup.id,
          item: sup.item,
          quantity: Math.min(10, sup.quantity),
          max: sup.quantity,
        },
      ],
    }));
  };

  const handleRemoveDispatchSupply = (supId) => {
    setDispatchForm((prev) => ({
      ...prev,
      supplies: prev.supplies.filter((s) => s.supply_id !== supId),
    }));
  };

  const handleDispatchSupplyQtyChange = (supId, qty) => {
    const val = parseInt(qty, 10) || 0;
    setDispatchForm((prev) => ({
      ...prev,
      supplies: prev.supplies.map((s) =>
        s.supply_id === supId ? { ...s, quantity: Math.max(1, Math.min(s.max, val)) } : s
      ),
    }));
  };

  const handleDispatchSubmit = async (e) => {
    e.preventDefault();
    if (!dispatchForm.incident_id) {
      toast.error('Please select an incident to dispatch resources to');
      return;
    }
    if (!dispatchForm.team_id && dispatchForm.vehicle_ids.length === 0 && dispatchForm.supplies.length === 0) {
      toast.error('Please select at least one team, vehicle, or supply item to allocate');
      return;
    }

    setDispatching(true);
    try {
      const payload = {
        team_id: dispatchForm.team_id ? parseInt(dispatchForm.team_id, 10) : null,
        vehicle_ids: dispatchForm.vehicle_ids.map((id) => parseInt(id, 10)),
        supplies: dispatchForm.supplies.map((s) => ({
          supply_id: s.supply_id,
          quantity: s.quantity,
        })),
      };

      const res = await api.post(`/admin/incidents/${dispatchForm.incident_id}/resources`, payload);
      toast.success(res.message || 'Emergency resources successfully dispatched!');
      setDispatchModalOpen(false);
      reloadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to dispatch resources');
    } finally {
      setDispatching(false);
    }
  };

  // ── Release Resources Handler ──────────────────────────────────────

  const handleReleaseSubmit = async (e) => {
    e.preventDefault();
    if (!releaseIncidentId) {
      toast.error('Please select an incident to release resources from');
      return;
    }
    setReleasing(true);
    try {
      const res = await api.post(`/admin/incidents/${releaseIncidentId}/resources/release`);
      toast.success(res.message || 'Resources successfully freed');
      setReleaseModalOpen(false);
      reloadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to release resources');
    } finally {
      setReleasing(false);
    }
  };

  // ── Filtered Collections ───────────────────────────────────────────

  const filteredTeams = useMemo(() => {
    return teams.filter((t) => {
      const matchesSearch =
        !searchTerm ||
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.contact && t.contact.includes(searchTerm)) ||
        (t.current_incident_code && t.current_incident_code.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = !statusFilter || t.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [teams, searchTerm, statusFilter]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const matchesSearch =
        !searchTerm ||
        v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.assigned_team_name && v.assigned_team_name.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = !statusFilter || v.status === statusFilter;
      const matchesCat = !categoryFilter || v.type === categoryFilter;
      return matchesSearch && matchesStatus && matchesCat;
    });
  }, [vehicles, searchTerm, statusFilter, categoryFilter]);

  const filteredSupplies = useMemo(() => {
    return supplies.filter((s) => {
      const matchesSearch =
        !searchTerm ||
        s.item.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.location.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = !categoryFilter || s.category === categoryFilter;
      const matchesLowStock = !lowStockOnly || s.is_low_stock;
      return matchesSearch && matchesCat && matchesLowStock;
    });
  }, [supplies, searchTerm, categoryFilter, lowStockOnly]);

  const filteredShelters = useMemo(() => {
    return shelters.filter((sh) => {
      const matchesSearch =
        !searchTerm ||
        sh.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sh.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (sh.contact && sh.contact.includes(searchTerm));
      const matchesStatus =
        statusFilter === ''
          ? true
          : statusFilter === 'available'
          ? sh.available
          : !sh.available;
      return matchesSearch && matchesStatus;
    });
  }, [shelters, searchTerm, statusFilter]);

  return (
    <ErrorBoundary>
      <div className="space-y-6 pb-12">
        {/* ── Page Header ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Truck className="h-7 w-7 text-cyan-400" />
              Rescue Teams & Resources
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Command personnel, dispatch vehicles, manage relief inventory, and track shelter intake.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReleaseModalOpen(true)}
              className="border-slate-700 hover:border-slate-600 text-slate-300"
            >
              <RotateCcw className="h-4 w-4 mr-1.5 text-slate-400" />
              Release Resources
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => openDispatchModal()}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold shadow-lg shadow-cyan-500/20"
            >
              <Send className="h-4 w-4 mr-1.5" />
              Dispatch to Incident
            </Button>
          </div>
        </div>

        {/* ── Top Summary Strip ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Available Teams"
            value={summaryLoading ? '...' : `${summary?.available_teams ?? 0} / ${summary?.total_teams ?? 0}`}
            subtext="Ready for emergency deployment"
            icon={Users}
            variant="cyan"
            loading={summaryLoading}
          />
          <StatCard
            label="Vehicles in Use"
            value={summaryLoading ? '...' : `${summary?.vehicles_in_use ?? 0} / ${summary?.total_vehicles ?? 0}`}
            subtext="Deployed on active operations"
            icon={Truck}
            variant="default"
            loading={summaryLoading}
          />
          <StatCard
            label="Low-Stock Supplies"
            value={summaryLoading ? '...' : `${summary?.low_stock_items ?? 0}`}
            subtext={summary?.low_stock_items > 0 ? 'Urgent restock needed' : 'All stock levels healthy'}
            icon={AlertTriangle}
            variant={summary?.low_stock_items > 0 ? 'rose' : 'emerald'}
            loading={summaryLoading}
          />
          <StatCard
            label="Free Shelter Beds"
            value={summaryLoading ? '...' : (summary?.free_shelter_beds ?? 0).toLocaleString()}
            subtext={`Across ${summary?.total_shelters ?? 0} emergency shelters`}
            icon={Home}
            variant="cyan"
            loading={summaryLoading}
          />
        </div>

        {/* ── Tabs Navigation Bar ────────────────────────────────────── */}
        <Card className="p-2 border-[#243442] bg-[#111C26]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setActiveTab('teams')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'teams'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Users className="h-4 w-4" />
                <span>Teams</span>
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300 font-mono">
                  {teams.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('vehicles')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'vehicles'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Truck className="h-4 w-4" />
                <span>Vehicles</span>
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300 font-mono">
                  {vehicles.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('supplies')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'supplies'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Package className="h-4 w-4" />
                <span>Supplies</span>
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300 font-mono">
                  {supplies.length}
                </span>
                {summary?.low_stock_items > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Low stock items detected" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('shelters')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'shelters'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Home className="h-4 w-4" />
                <span>Shelters</span>
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300 font-mono">
                  {shelters.length}
                </span>
              </button>
            </div>

            {/* Contextual Action Button */}
            <div className="flex items-center gap-2 justify-end">
              {activeTab === 'teams' && (
                <Button size="sm" onClick={openCreateTeam} className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium">
                  <Plus className="h-4 w-4 mr-1" /> Add Team
                </Button>
              )}
              {activeTab === 'vehicles' && (
                <Button size="sm" onClick={openCreateVehicle} className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium">
                  <Plus className="h-4 w-4 mr-1" /> Add Vehicle
                </Button>
              )}
              {activeTab === 'supplies' && (
                <Button size="sm" onClick={openCreateSupply} className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium">
                  <Plus className="h-4 w-4 mr-1" /> Add Supply Item
                </Button>
              )}
              {activeTab === 'shelters' && (
                <Button size="sm" onClick={openCreateShelter} className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium">
                  <Plus className="h-4 w-4 mr-1" /> Add Shelter
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* ── Search & Filter Controls ────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full pl-9 pr-4 py-2 bg-[#111C26] border border-[#243442] rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {activeTab === 'teams' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#111C26] border border-[#243442] rounded-lg text-sm text-slate-300 px-3 py-2 focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Statuses</option>
              <option value="available">Available Only</option>
              <option value="busy">Busy Only</option>
            </select>
          )}

          {activeTab === 'vehicles' && (
            <>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-[#111C26] border border-[#243442] rounded-lg text-sm text-slate-300 px-3 py-2 focus:outline-none focus:border-cyan-500"
              >
                <option value="">All Types</option>
                <option value="ambulance">Ambulance</option>
                <option value="fire_truck">Fire Truck</option>
                <option value="boat">Rescue Boat</option>
                <option value="supply_truck">Supply Truck</option>
                <option value="suv_4x4">4x4 SUV</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#111C26] border border-[#243442] rounded-lg text-sm text-slate-300 px-3 py-2 focus:outline-none focus:border-cyan-500"
              >
                <option value="">All Statuses</option>
                <option value="available">Available</option>
                <option value="in_use">In Use</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </>
          )}

          {activeTab === 'supplies' && (
            <>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-[#111C26] border border-[#243442] rounded-lg text-sm text-slate-300 px-3 py-2 focus:outline-none focus:border-cyan-500"
              >
                <option value="">All Categories</option>
                <option value="medical">Medical</option>
                <option value="water">Water</option>
                <option value="food">Food</option>
                <option value="other">Logistics / Other</option>
              </select>
              <button
                type="button"
                onClick={() => setLowStockOnly(!lowStockOnly)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                  lowStockOnly
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-[#111C26] text-slate-400 border-[#243442] hover:text-slate-200'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Low Stock Only
              </button>
            </>
          )}

          {activeTab === 'shelters' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#111C26] border border-[#243442] rounded-lg text-sm text-slate-300 px-3 py-2 focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Shelters</option>
              <option value="available">Open & Available</option>
              <option value="closed">Closed / Full</option>
            </select>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={reloadAll}
            title="Reload data"
            className="text-slate-400 hover:text-slate-200"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* ── TAB 1: TEAMS ────────────────────────────────────────────── */}
        {activeTab === 'teams' && (
          <Card className="border-[#243442] bg-[#111C26] overflow-hidden">
            <Table>
              <thead>
                <tr className="border-b border-[#243442] text-xs font-semibold text-slate-400 uppercase tracking-wider text-left bg-slate-900/40">
                  <th className="py-3 px-4">Team Name & Unit</th>
                  <th className="py-3 px-4">Personnel</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Assigned Incident</th>
                  <th className="py-3 px-4">Vehicles</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C2A35] text-sm">
                {teamsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow key={i} columns={7} />
                  ))
                ) : filteredTeams.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12">
                      <EmptyState
                        icon={Users}
                        title="No teams found"
                        description={searchTerm || statusFilter ? 'Try clearing your filters' : 'Register your first emergency response unit.'}
                        actionLabel="Add Team"
                        onAction={openCreateTeam}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredTeams.map((team) => (
                    <tr key={team.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{team.name}</div>
                        <div className="text-xs text-slate-500 font-mono">ID #{team.id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Users className="h-3.5 w-3.5 text-cyan-400" />
                          <span>{team.members_count} responders</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-xs">
                        {team.contact || '—'}
                      </td>
                      <td className="py-3 px-4">
                        {team.status === 'available' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Available
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Busy / Deployed
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {team.current_incident_code ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-800/50">
                            {team.current_incident_code}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-xs">
                        {team.assigned_vehicle_count > 0 ? (
                          <span className="text-cyan-400 font-medium">{team.assigned_vehicle_count} active</span>
                        ) : (
                          <span className="text-slate-500">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {team.status === 'available' && (
                            <button
                              type="button"
                              onClick={() => openDispatchModal({ team_id: team.id })}
                              className="px-2 py-1 text-xs rounded bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 transition-colors"
                              title="Dispatch to incident"
                            >
                              Dispatch
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleTeamStatus(team)}
                            className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
                            title={team.status === 'available' ? 'Mark busy' : 'Mark available'}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditTeam(team)}
                            className="p-1.5 text-slate-400 hover:text-cyan-400 rounded hover:bg-slate-800 transition-colors"
                            title="Edit team"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDelete('team', team.id, team.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                            title="Delete team"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
        )}

        {/* ── TAB 2: VEHICLES ─────────────────────────────────────────── */}
        {activeTab === 'vehicles' && (
          <Card className="border-[#243442] bg-[#111C26] overflow-hidden">
            <Table>
              <thead>
                <tr className="border-b border-[#243442] text-xs font-semibold text-slate-400 uppercase tracking-wider text-left bg-slate-900/40">
                  <th className="py-3 px-4">Vehicle & License Plate</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Assigned Team</th>
                  <th className="py-3 px-4">Active Incident</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C2A35] text-sm">
                {vehiclesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow key={i} columns={6} />
                  ))
                ) : filteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12">
                      <EmptyState
                        icon={Truck}
                        title="No vehicles found"
                        description={searchTerm || statusFilter ? 'Try clearing your filters' : 'Register your emergency fleet vehicles.'}
                        actionLabel="Add Vehicle"
                        onAction={openCreateVehicle}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredVehicles.map((veh) => {
                    const meta = VEHICLE_TYPE_META[veh.type] || { label: veh.type, icon: Truck, color: '#94A3B8' };
                    const IconComp = meta.icon;

                    return (
                      <tr key={veh.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-200">{veh.name}</div>
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-slate-800/80 border border-slate-700/60 rounded text-xs font-mono text-cyan-300">
                            {veh.plate}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                            <IconComp className="h-3.5 w-3.5" style={{ color: meta.color }} />
                            <span>{meta.label}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={veh.status}
                            onChange={(e) => handleVehicleStatusChange(veh.id, e.target.value)}
                            className={`text-xs font-medium px-2 py-1 rounded border transition-colors bg-slate-900 ${
                              veh.status === 'available'
                                ? 'text-emerald-400 border-emerald-500/30'
                                : veh.status === 'in_use'
                                ? 'text-cyan-400 border-cyan-500/30'
                                : 'text-amber-400 border-amber-500/30'
                            }`}
                          >
                            <option value="available">Available</option>
                            <option value="in_use">In Use</option>
                            <option value="maintenance">Maintenance</option>
                          </select>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-400">
                          {veh.assigned_team_name || 'Unassigned'}
                        </td>
                        <td className="py-3 px-4">
                          {veh.current_incident_code ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-800/50">
                              {veh.current_incident_code}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">None</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {veh.status === 'available' && (
                              <button
                                type="button"
                                onClick={() => openDispatchModal({ vehicle_id: veh.id })}
                                className="px-2 py-1 text-xs rounded bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 transition-colors"
                                title="Dispatch vehicle"
                              >
                                Dispatch
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditVehicle(veh)}
                              className="p-1.5 text-slate-400 hover:text-cyan-400 rounded hover:bg-slate-800 transition-colors"
                              title="Edit vehicle"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => confirmDelete('vehicle', veh.id, veh.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                              title="Delete vehicle"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </Card>
        )}

        {/* ── TAB 3: SUPPLIES ─────────────────────────────────────────── */}
        {activeTab === 'supplies' && (
          <Card className="border-[#243442] bg-[#111C26] overflow-hidden">
            <Table>
              <thead>
                <tr className="border-b border-[#243442] text-xs font-semibold text-slate-400 uppercase tracking-wider text-left bg-slate-900/40">
                  <th className="py-3 px-4">Supply Item</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Current Stock</th>
                  <th className="py-3 px-4">Threshold & Warning</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C2A35] text-sm">
                {suppliesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow key={i} columns={6} />
                  ))
                ) : filteredSupplies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12">
                      <EmptyState
                        icon={Package}
                        title="No supplies found"
                        description={searchTerm || categoryFilter ? 'Try clearing your filters' : 'Add relief supplies and inventory items.'}
                        actionLabel="Add Supply Item"
                        onAction={openCreateSupply}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredSupplies.map((sup) => {
                    const catMeta = SUPPLY_CAT_META[sup.category] || SUPPLY_CAT_META.other;

                    return (
                      <tr key={sup.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-200">{sup.item}</div>
                          <div className="text-xs text-slate-500 font-mono">ID #{sup.id}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${catMeta.color}`}>
                            {catMeta.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-xs">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-slate-500 shrink-0" />
                            <span>{sup.location}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-200 text-sm">
                              {sup.quantity.toLocaleString()} {sup.unit}
                            </span>
                            {/* Quick stock +/- controls */}
                            <div className="flex items-center gap-0.5 bg-slate-900 border border-slate-700 rounded p-0.5">
                              <button
                                type="button"
                                onClick={() => handleStockDelta(sup.id, -5)}
                                className="px-1.5 py-0.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded font-mono"
                                title="Subtract 5"
                              >
                                -5
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStockDelta(sup.id, -1)}
                                className="px-1.5 py-0.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded font-mono"
                                title="Subtract 1"
                              >
                                -1
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStockDelta(sup.id, 1)}
                                className="px-1.5 py-0.5 text-xs text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded font-mono"
                                title="Add 1"
                              >
                                +1
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStockDelta(sup.id, 5)}
                                className="px-1.5 py-0.5 text-xs text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded font-mono"
                                title="Add 5"
                              >
                                +5
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">Min: {sup.low_stock_threshold}</span>
                            {sup.is_low_stock && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                                <AlertTriangle className="h-3 w-3" />
                                Low stock
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {sup.quantity > 0 && (
                              <button
                                type="button"
                                onClick={() => openDispatchModal({ supply_id: sup.id, supply_name: sup.item, supply_max: sup.quantity })}
                                className="px-2 py-1 text-xs rounded bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 transition-colors"
                                title="Allocate to incident"
                              >
                                Allocate
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditSupply(sup)}
                              className="p-1.5 text-slate-400 hover:text-cyan-400 rounded hover:bg-slate-800 transition-colors"
                              title="Edit item"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => confirmDelete('supply', sup.id, sup.item)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                              title="Delete item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </Card>
        )}

        {/* ── TAB 4: SHELTERS ─────────────────────────────────────────── */}
        {activeTab === 'shelters' && (
          <Card className="border-[#243442] bg-[#111C26] overflow-hidden">
            <Table>
              <thead>
                <tr className="border-b border-[#243442] text-xs font-semibold text-slate-400 uppercase tracking-wider text-left bg-slate-900/40">
                  <th className="py-3 px-4">Shelter & Address</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4 min-w-[200px]">Capacity & Occupancy</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Quick Occupancy</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C2A35] text-sm">
                {sheltersLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow key={i} columns={6} />
                  ))
                ) : filteredShelters.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12">
                      <EmptyState
                        icon={Home}
                        title="No shelters found"
                        description={searchTerm || statusFilter ? 'Try clearing your filters' : 'Register your emergency shelters and evacuation points.'}
                        actionLabel="Add Shelter"
                        onAction={openCreateShelter}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredShelters.map((sh) => (
                    <tr key={sh.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{sh.name}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 text-slate-500 shrink-0" />
                          <span>{sh.address}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-xs">
                        {sh.contact || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-medium text-slate-200">
                              {sh.current_occupancy} / {sh.capacity} beds
                            </span>
                            <span className="text-cyan-400 font-mono font-semibold">
                              {sh.free_beds} free ({sh.occupancy_pct}%)
                            </span>
                          </div>
                          {/* Capacity Bar */}
                          <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-700/50">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.min(100, sh.occupancy_pct)}%`,
                                backgroundColor:
                                  sh.occupancy_pct > 90
                                    ? '#EF4444'
                                    : sh.occupancy_pct > 70
                                    ? '#F59E0B'
                                    : '#01AEFD',
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleShelterAvailable(sh)}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                            sh.available
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                          }`}
                        >
                          {sh.available ? 'Open / Accepting' : 'Closed / Full'}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleShelterDelta(sh.id, -10)}
                            className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 font-mono"
                            title="Discharge 10"
                          >
                            -10
                          </button>
                          <button
                            type="button"
                            onClick={() => handleShelterDelta(sh.id, 10)}
                            className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 font-mono"
                            title="Intake 10"
                          >
                            +10
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEditShelter(sh)}
                            className="p-1.5 text-slate-400 hover:text-cyan-400 rounded hover:bg-slate-800 transition-colors"
                            title="Edit shelter"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDelete('shelter', sh.id, sh.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                            title="Delete shelter"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
        )}

        {/* ── MODAL: TEAM ADD / EDIT ──────────────────────────────────── */}
        <Modal
          isOpen={teamModalOpen}
          onClose={() => setTeamModalOpen(false)}
          title={editingTeam ? 'Edit Response Team' : 'Register Response Team'}
        >
          <form onSubmit={handleSaveTeam} className="space-y-4">
            <Input
              label="Team Name"
              required
              value={teamForm.name}
              onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
              placeholder="e.g. Pune Fire Brigade - Unit 4"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Emergency Contact"
                value={teamForm.contact}
                onChange={(e) => setTeamForm({ ...teamForm, contact: e.target.value })}
                placeholder="+91 20 2544 0101"
              />
              <Input
                label="Members Count"
                type="number"
                min="1"
                required
                value={teamForm.members_count}
                onChange={(e) => setTeamForm({ ...teamForm, members_count: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Latitude"
                type="number"
                step="any"
                value={teamForm.latitude}
                onChange={(e) => setTeamForm({ ...teamForm, latitude: e.target.value })}
                placeholder="18.5204"
              />
              <Input
                label="Longitude"
                type="number"
                step="any"
                value={teamForm.longitude}
                onChange={(e) => setTeamForm({ ...teamForm, longitude: e.target.value })}
                placeholder="73.8567"
              />
            </div>
            <Select
              label="Availability Status"
              value={teamForm.status}
              onChange={(e) => setTeamForm({ ...teamForm, status: e.target.value })}
              options={[
                { value: 'available', label: 'Available for Dispatch' },
                { value: 'busy', label: 'Busy / Deployed on Field' },
              ]}
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" onClick={() => setTeamModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={savingTeam}>
                {editingTeam ? 'Save Changes' : 'Create Team'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── MODAL: VEHICLE ADD / EDIT ───────────────────────────────── */}
        <Modal
          isOpen={vehicleModalOpen}
          onClose={() => setVehicleModalOpen(false)}
          title={editingVehicle ? 'Edit Vehicle' : 'Register Fleet Vehicle'}
        >
          <form onSubmit={handleSaveVehicle} className="space-y-4">
            <Input
              label="Vehicle Name"
              required
              value={vehicleForm.name}
              onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })}
              placeholder="e.g. Kothrud High-Water Fire Tender"
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Vehicle Type"
                value={vehicleForm.type}
                onChange={(e) => setVehicleForm({ ...vehicleForm, type: e.target.value })}
                options={[
                  { value: 'ambulance', label: 'Ambulance' },
                  { value: 'fire_truck', label: 'Fire Truck' },
                  { value: 'boat', label: 'Rescue Boat' },
                  { value: 'supply_truck', label: 'Supply Truck' },
                  { value: 'suv_4x4', label: '4x4 Rapid SUV' },
                ]}
              />
              <Input
                label="License Plate"
                required
                value={vehicleForm.plate}
                onChange={(e) => setVehicleForm({ ...vehicleForm, plate: e.target.value })}
                placeholder="MH-12-AB-1234"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Status"
                value={vehicleForm.status}
                onChange={(e) => setVehicleForm({ ...vehicleForm, status: e.target.value })}
                options={[
                  { value: 'available', label: 'Available' },
                  { value: 'in_use', label: 'In Use / Deployed' },
                  { value: 'maintenance', label: 'Maintenance' },
                ]}
              />
              <Select
                label="Assigned Team"
                value={vehicleForm.assigned_team_id}
                onChange={(e) => setVehicleForm({ ...vehicleForm, assigned_team_id: e.target.value })}
                options={[
                  { value: '', label: 'None (Reserve Pool)' },
                  ...teams.map((t) => ({ value: String(t.id), label: t.name })),
                ]}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" onClick={() => setVehicleModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={savingVehicle}>
                {editingVehicle ? 'Save Changes' : 'Register Vehicle'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── MODAL: SUPPLY ADD / EDIT ────────────────────────────────── */}
        <Modal
          isOpen={supplyModalOpen}
          onClose={() => setSupplyModalOpen(false)}
          title={editingSupply ? 'Edit Supply Item' : 'Add Emergency Supply'}
        >
          <form onSubmit={handleSaveSupply} className="space-y-4">
            <Input
              label="Item Name"
              required
              value={supplyForm.item}
              onChange={(e) => setSupplyForm({ ...supplyForm, item: e.target.value })}
              placeholder="e.g. Trauma Surgical Kits"
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Category"
                value={supplyForm.category}
                onChange={(e) => setSupplyForm({ ...supplyForm, category: e.target.value })}
                options={[
                  { value: 'medical', label: 'Medical' },
                  { value: 'water', label: 'Water' },
                  { value: 'food', label: 'Food' },
                  { value: 'other', label: 'Logistics / Other' },
                ]}
              />
              <Input
                label="Unit of Measure"
                required
                value={supplyForm.unit}
                onChange={(e) => setSupplyForm({ ...supplyForm, unit: e.target.value })}
                placeholder="kits, boxes, liters"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Current Quantity"
                type="number"
                min="0"
                required
                value={supplyForm.quantity}
                onChange={(e) => setSupplyForm({ ...supplyForm, quantity: e.target.value })}
              />
              <Input
                label="Low-Stock Threshold"
                type="number"
                min="0"
                required
                value={supplyForm.low_stock_threshold}
                onChange={(e) => setSupplyForm({ ...supplyForm, low_stock_threshold: e.target.value })}
              />
            </div>
            <Input
              label="Storage Location / Warehouse"
              required
              value={supplyForm.location}
              onChange={(e) => setSupplyForm({ ...supplyForm, location: e.target.value })}
              placeholder="e.g. Swargate Central Relief Depot"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" onClick={() => setSupplyModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={savingSupply}>
                {editingSupply ? 'Save Changes' : 'Add Item'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── MODAL: SHELTER ADD / EDIT ───────────────────────────────── */}
        <Modal
          isOpen={shelterModalOpen}
          onClose={() => setShelterModalOpen(false)}
          title={editingShelter ? 'Edit Emergency Shelter' : 'Register Shelter'}
        >
          <form onSubmit={handleSaveShelter} className="space-y-4">
            <Input
              label="Shelter Name"
              required
              value={shelterForm.name}
              onChange={(e) => setShelterForm({ ...shelterForm, name: e.target.value })}
              placeholder="e.g. Balewadi Sports Complex Refuge Center"
            />
            <Input
              label="Full Address"
              required
              value={shelterForm.address}
              onChange={(e) => setShelterForm({ ...shelterForm, address: e.target.value })}
              placeholder="Balewadi Stadium Road, Pune"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Total Capacity (Beds)"
                type="number"
                min="1"
                required
                value={shelterForm.capacity}
                onChange={(e) => setShelterForm({ ...shelterForm, capacity: e.target.value })}
              />
              <Input
                label="Current Occupancy"
                type="number"
                min="0"
                required
                value={shelterForm.current_occupancy}
                onChange={(e) => setShelterForm({ ...shelterForm, current_occupancy: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Latitude"
                type="number"
                step="any"
                required
                value={shelterForm.latitude}
                onChange={(e) => setShelterForm({ ...shelterForm, latitude: e.target.value })}
              />
              <Input
                label="Longitude"
                type="number"
                step="any"
                required
                value={shelterForm.longitude}
                onChange={(e) => setShelterForm({ ...shelterForm, longitude: e.target.value })}
              />
            </div>
            <Input
              label="Shelter Coordinator Contact"
              value={shelterForm.contact}
              onChange={(e) => setShelterForm({ ...shelterForm, contact: e.target.value })}
              placeholder="+91 20 2737 4000"
            />
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="shelter-available-check"
                checked={shelterForm.available}
                onChange={(e) => setShelterForm({ ...shelterForm, available: e.target.checked })}
                className="h-4 w-4 rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-cyan-500"
              />
              <label htmlFor="shelter-available-check" className="text-sm text-slate-300">
                Shelter is actively open and accepting evacuated citizens
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" onClick={() => setShelterModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={savingShelter}>
                {editingShelter ? 'Save Changes' : 'Register Shelter'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── MODAL: COMBINED DISPATCH TO INCIDENT ────────────────────── */}
        <Modal
          isOpen={dispatchModalOpen}
          onClose={() => setDispatchModalOpen(false)}
          title="Dispatch Emergency Resources to Incident"
        >
          <form onSubmit={handleDispatchSubmit} className="space-y-4">
            {/* Incident Picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Target Incident *
              </label>
              <select
                value={dispatchForm.incident_id}
                onChange={(e) => setDispatchForm({ ...dispatchForm, incident_id: e.target.value })}
                required
                className="w-full bg-[#111C26] border border-[#243442] rounded-lg text-sm text-slate-200 px-3 py-2.5 focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="">-- Select Active Emergency Incident --</option>
                {incidents.map((inc) => (
                  <option key={inc.id} value={inc.id}>
                    [{inc.public_code}] {inc.category.toUpperCase()} &mdash; {inc.address} ({inc.priority})
                  </option>
                ))}
              </select>
            </div>

            {/* Select Team */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Assign Response Team (Optional)
              </label>
              <select
                value={dispatchForm.team_id}
                onChange={(e) => setDispatchForm({ ...dispatchForm, team_id: e.target.value })}
                className="w-full bg-[#111C26] border border-[#243442] rounded-lg text-sm text-slate-200 px-3 py-2.5 focus:outline-none focus:border-cyan-500"
              >
                <option value="">-- No Team (Supplies / Vehicles Only) --</option>
                {teams
                  .filter((t) => t.status === 'available' || String(t.id) === dispatchForm.team_id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.members_count} responders)
                    </option>
                  ))}
              </select>
            </div>

            {/* Select Vehicles (Checkboxes) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Assign Fleet Vehicles ({dispatchForm.vehicle_ids.length} selected)
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 bg-[#0C1117] border border-[#243442] rounded-lg">
                {vehicles
                  .filter((v) => v.status === 'available' || dispatchForm.vehicle_ids.includes(v.id))
                  .map((v) => {
                    const isChecked = dispatchForm.vehicle_ids.includes(v.id);
                    return (
                      <label
                        key={v.id}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                          isChecked ? 'bg-cyan-950/60 border border-cyan-800/60' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleDispatchVehicle(v.id)}
                            className="h-4 w-4 rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-cyan-500"
                          />
                          <span className="text-sm font-medium text-slate-200">{v.name}</span>
                        </div>
                        <span className="text-xs font-mono text-cyan-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                          {v.plate}
                        </span>
                      </label>
                    );
                  })}
                {vehicles.filter((v) => v.status === 'available').length === 0 && (
                  <div className="text-xs text-slate-500 p-2 text-center">No available vehicles in reserve</div>
                )}
              </div>
            </div>

            {/* Allocate Supplies */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Allocate Supplies
                </label>
                <div className="relative">
                  <select
                    onChange={(e) => {
                      const sup = supplies.find((s) => String(s.id) === e.target.value);
                      if (sup) handleAddDispatchSupply(sup);
                      e.target.value = '';
                    }}
                    defaultValue=""
                    className="text-xs bg-slate-800 border border-slate-700 text-cyan-300 rounded px-2 py-1"
                  >
                    <option value="" disabled>
                      + Add item from inventory...
                    </option>
                    {supplies
                      .filter((s) => s.quantity > 0 && !dispatchForm.supplies.some((ds) => ds.supply_id === s.id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.item} ({s.quantity} {s.unit} in stock)
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {dispatchForm.supplies.length === 0 ? (
                <div className="p-3 bg-[#0C1117] border border-[#243442] rounded-lg text-center text-xs text-slate-500">
                  No supplies attached. Select an item above to decrement from warehouse.
                </div>
              ) : (
                <div className="space-y-2 p-2 bg-[#0C1117] border border-[#243442] rounded-lg">
                  {dispatchForm.supplies.map((item) => (
                    <div key={item.supply_id} className="flex items-center justify-between gap-2 p-1.5 bg-slate-900 rounded border border-slate-800">
                      <span className="text-xs text-slate-200 font-medium truncate flex-1">{item.item}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400">Qty:</span>
                        <input
                          type="number"
                          min="1"
                          max={item.max}
                          value={item.quantity}
                          onChange={(e) => handleDispatchSupplyQtyChange(item.supply_id, e.target.value)}
                          className="w-16 px-1.5 py-0.5 text-xs bg-slate-800 border border-slate-700 rounded text-center text-cyan-300 font-mono"
                        />
                        <span className="text-xs text-slate-500 font-mono">/ {item.max}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDispatchSupply(item.supply_id)}
                          className="p-1 text-slate-500 hover:text-rose-400"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" onClick={() => setDispatchModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={dispatching} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold">
                <Send className="h-4 w-4 mr-1.5" /> Confirm Dispatch
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── MODAL: RELEASE RESOURCES ────────────────────────────────── */}
        <Modal
          isOpen={releaseModalOpen}
          onClose={() => setReleaseModalOpen(false)}
          title="Release Resources From Incident"
        >
          <form onSubmit={handleReleaseSubmit} className="space-y-4">
            <p className="text-xs text-slate-400">
              Select an incident to free all assigned rescue teams and fleet vehicles back into the available reserve.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Target Incident *
              </label>
              <select
                value={releaseIncidentId}
                onChange={(e) => setReleaseIncidentId(e.target.value)}
                required
                className="w-full bg-[#111C26] border border-[#243442] rounded-lg text-sm text-slate-200 px-3 py-2.5 focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="">-- Select Incident --</option>
                {incidents.map((inc) => (
                  <option key={inc.id} value={inc.id}>
                    [{inc.public_code}] {inc.address} ({inc.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" onClick={() => setReleaseModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={releasing}>
                Release Resources
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── DELETE CONFIRMATION DIALOG ──────────────────────────────── */}
        <ConfirmDialog
          isOpen={deleteDialog.open}
          onClose={() => setDeleteDialog({ open: false, type: '', id: null, name: '' })}
          onConfirm={handleDelete}
          title={`Delete ${deleteDialog.type}`}
          message={`Are you sure you want to permanently delete "${deleteDialog.name}"? This action cannot be undone.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete'}
          variant="danger"
        />
      </div>
    </ErrorBoundary>
  );
}
