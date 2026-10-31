import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  AlertTriangle,
  RotateCcw,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  ChevronLeft,
  ChevronRight,
  Flame,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import {
  Table,
  Badge,
  AutoTriagedTag,
  Card,
  Input,
  Button,
  EmptyState,
  SkeletonTableRow,
  formatRelativeTime,
  formatFullTime,
} from '../components/ui';
import IncidentDetailDrawer from '../components/admin/IncidentDetailDrawer';

const STATUS_CHIPS = [
  { id: '', label: 'All Statuses' },
  { id: 'pending', label: 'Pending' },
  { id: 'active', label: 'Active' },
  { id: 'reported', label: 'Reported' },
  { id: 'under_review', label: 'Under Review' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_CHIPS = [
  { id: '', label: 'All Priorities' },
  { id: 'critical', label: 'Critical' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

const CATEGORY_CHIPS = [
  { id: '', label: 'All Categories' },
  { id: 'rescue', label: 'Rescue' },
  { id: 'medical', label: 'Medical' },
  { id: 'food_water', label: 'Food & Water' },
  { id: 'shelter', label: 'Shelter' },
  { id: 'other', label: 'Other' },
];

export default function AdminIncidents() {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const [incidents, setIncidents] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters from searchParams or defaults
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [limit] = useState(20);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get('priority') || '');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '');

  // Sorting
  const [sortBy, setSortBy] = useState(searchParams.get('sort_by') || 'created_at');
  const [sortOrder, setSortOrder] = useState(searchParams.get('sort_order') || 'desc');

  // Drawer detail state
  const [selectedIncidentId, setSelectedIncidentId] = useState(
    searchParams.get('selectedId') ? Number(searchParams.get('selectedId')) : null
  );
  const [drawerOpen, setDrawerOpen] = useState(Boolean(searchParams.get('selectedId')));

  // Search input debounce (350ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  // Sync searchParams
  useEffect(() => {
    const sp = new URLSearchParams();
    if (page > 1) sp.set('page', String(page));
    if (debouncedSearch) sp.set('search', debouncedSearch);
    if (statusFilter) sp.set('status', statusFilter);
    if (priorityFilter) sp.set('priority', priorityFilter);
    if (categoryFilter) sp.set('category', categoryFilter);
    if (sortBy !== 'created_at') sp.set('sort_by', sortBy);
    if (sortOrder !== 'desc') sp.set('sort_order', sortOrder);
    if (selectedIncidentId) sp.set('selectedId', String(selectedIncidentId));

    setSearchParams(sp, { replace: true });
  }, [page, debouncedSearch, statusFilter, priorityFilter, categoryFilter, sortBy, sortOrder, selectedIncidentId, setSearchParams]);

  // Fetch incidents list from backend API
  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (sortBy) params.set('sort_by', sortBy);
      if (sortOrder) params.set('sort_order', sortOrder);

      const data = await api.get(`/admin/incidents?${params.toString()}`);
      setIncidents(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      setError(err.message || 'Failed to load emergency incidents.');
      toast.error(err.message || 'Error loading incident data.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, statusFilter, priorityFilter, categoryFilter, sortBy, sortOrder, toast]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // Sort toggle handler
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const renderSortIcon = (field) => {
    if (sortBy !== field) {
      return <ArrowUpDown size={12} className="sort-icon-idle" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} className="sort-icon-active" />
    ) : (
      <ArrowDown size={12} className="sort-icon-active" />
    );
  };

  const handleResetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatusFilter('');
    setPriorityFilter('');
    setCategoryFilter('');
    setSortBy('created_at');
    setSortOrder('desc');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    debouncedSearch.trim() || statusFilter || priorityFilter || categoryFilter
  );

  const handleOpenDetail = (incidentId) => {
    setSelectedIncidentId(incidentId);
    setDrawerOpen(true);
  };

  const handleCloseDetail = () => {
    setDrawerOpen(false);
    setSelectedIncidentId(null);
  };

  const handleIncidentUpdated = () => {
    fetchIncidents();
  };

  return (
    <div className="admin-incidents-page">
      {/* Page Header */}
      <div className="admin-incidents-header">
        <div>
          <h1 className="ui-page-title">Incident Management</h1>
          <p className="ui-page-desc">
            Monitor, triage, assign response teams, and update emergency reports.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button
            variant="secondary"
            size="sm"
            icon={RotateCcw}
            onClick={fetchIncidents}
            loading={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Controls & Search */}
      <div className="admin-incidents-controls">
        {/* Search bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <Input
              id="admin-incidents-search"
              placeholder="Search by ID, location, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={Search}
            />
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={RotateCcw}
              onClick={handleResetFilters}
            >
              Reset Filters
            </Button>
          )}
        </div>

        {/* Filter Chips: Status */}
        <div className="filter-chips-section">
          <span className="filter-chips-label">Status:</span>
          <div className="filter-chips-row">
            {STATUS_CHIPS.map((chip) => {
              const active = statusFilter === chip.id;
              return (
                <button
                  key={chip.id || 'all-status'}
                  type="button"
                  className={`filter-chip-pill ${active ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter(chip.id);
                    setPage(1);
                  }}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter Chips: Priority & Category */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {/* Priority chips */}
          <div className="filter-chips-section" style={{ flex: 1, minWidth: 240 }}>
            <span className="filter-chips-label">Priority:</span>
            <div className="filter-chips-row">
              {PRIORITY_CHIPS.map((chip) => {
                const active = priorityFilter === chip.id;
                return (
                  <button
                    key={chip.id || 'all-priority'}
                    type="button"
                    className={`filter-chip-pill ${active ? 'active' : ''}`}
                    onClick={() => {
                      setPriorityFilter(chip.id);
                      setPage(1);
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category chips */}
          <div className="filter-chips-section" style={{ flex: 1, minWidth: 280 }}>
            <span className="filter-chips-label">Category:</span>
            <div className="filter-chips-row">
              {CATEGORY_CHIPS.map((chip) => {
                const active = categoryFilter === chip.id;
                return (
                  <button
                    key={chip.id || 'all-cat'}
                    type="button"
                    className={`filter-chip-pill ${active ? 'active' : ''}`}
                    onClick={() => {
                      setCategoryFilter(chip.id);
                      setPage(1);
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Incidents Table / States */}
      {error ? (
        <Card style={{ padding: 32, textAlign: 'center', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <AlertTriangle size={36} color="#EF4444" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#EF4444', marginBottom: 6 }}>
            Failed to Load Incidents
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            {error}
          </p>
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={fetchIncidents}>
            Try Again
          </Button>
        </Card>
      ) : loading ? (
        <Card padding="none">
          <Table compact>
            <thead>
              <tr>
                <th style={{ width: 85 }}>ID</th>
                <th>Category</th>
                <th>Location</th>
                <th>Affected</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Triage</th>
                <th>Reported</th>
                <th style={{ width: 100, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTableRow columns={9} />
              <SkeletonTableRow columns={9} />
              <SkeletonTableRow columns={9} />
              <SkeletonTableRow columns={9} />
              <SkeletonTableRow columns={9} />
              <SkeletonTableRow columns={9} />
            </tbody>
          </Table>
        </Card>
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title={hasActiveFilters ? 'No matching incidents found' : 'No incidents reported'}
          description={
            hasActiveFilters
              ? 'Try widening your search terms or clearing your status, priority, or category filters.'
              : 'Citizen reports will appear here in real-time as emergency dispatches are submitted.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" onClick={handleResetFilters}>
                Clear All Filters
              </Button>
            ) : null
          }
        />
      ) : (
        <Card padding="none">
          <div style={{ overflowX: 'auto' }}>
            <Table compact hoverable>
              <thead>
                <tr>
                  <th
                    style={{ width: 90, cursor: 'pointer' }}
                    onClick={() => handleSort('id')}
                    title="Sort by Incident ID"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      ID {renderSortIcon('id')}
                    </div>
                  </th>

                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('category')}
                    title="Sort by Category"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      Category {renderSortIcon('category')}
                    </div>
                  </th>

                  <th>Location</th>

                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('people_affected')}
                    title="Sort by People Affected"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      Affected {renderSortIcon('people_affected')}
                    </div>
                  </th>

                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('priority')}
                    title="Sort by Priority"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      Priority {renderSortIcon('priority')}
                    </div>
                  </th>

                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('status')}
                    title="Sort by Status"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      Status {renderSortIcon('status')}
                    </div>
                  </th>

                  <th>Triage</th>

                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('created_at')}
                    title="Sort by Reported Time"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      Reported {renderSortIcon('created_at')}
                    </div>
                  </th>

                  <th style={{ width: 100, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => {
                  const isSelected = selectedIncidentId === incident.id && drawerOpen;
                  return (
                    <tr
                      key={incident.id}
                      onClick={() => handleOpenDetail(incident.id)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'rgba(1, 174, 253, 0.08)' : undefined,
                      }}
                    >
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-primary)' }}>
                        {incident.public_code || `#${incident.id}`}
                      </td>

                      <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>
                        <span className="incident-cat-cell">
                          {incident.category?.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td
                        style={{
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={incident.address || incident.location_text}
                      >
                        {incident.address || incident.location_text || '—'}
                      </td>

                      <td style={{ fontWeight: 500 }}>
                        {incident.people_affected != null ? (
                          <span style={{ color: incident.people_affected > 5 ? '#F04438' : 'var(--text-primary)' }}>
                            {incident.people_affected}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td>
                        <Badge variant="priority" value={incident.priority} size="sm" />
                      </td>

                      <td>
                        <Badge variant="status" value={incident.status} size="sm" />
                      </td>

                      <td>
                        <AutoTriagedTag incident={incident} />
                      </td>

                      <td title={formatFullTime(incident.created_at)} style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {formatRelativeTime(incident.created_at)}
                      </td>

                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Eye}
                          onClick={() => handleOpenDetail(incident.id)}
                        >
                          Manage
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          {/* Pagination Footer */}
          <div className="admin-incidents-pagination">
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Showing {total > 0 ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, total)} of {total} incidents
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Button
                variant="ghost"
                size="sm"
                icon={ChevronLeft}
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>

              <span style={{ fontSize: 12, fontWeight: 500, padding: '0 8px', color: 'var(--text-primary)' }}>
                Page {page} of {totalPages}
              </span>

              <Button
                variant="ghost"
                size="sm"
                icon={ChevronRight}
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Detail Slide-out Drawer */}
      <IncidentDetailDrawer
        incidentId={selectedIncidentId}
        isOpen={drawerOpen}
        onClose={handleCloseDetail}
        onIncidentUpdated={handleIncidentUpdated}
      />
    </div>
  );
}
