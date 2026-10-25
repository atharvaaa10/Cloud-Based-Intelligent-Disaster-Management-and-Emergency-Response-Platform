import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  MapPin,
  Clock,
  Plus,
  AlertTriangle,
  RotateCcw,
  X,
  Send,
  Ban,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Shield,
  LifeBuoy,
  HeartPulse,
  Utensils,
  Home,
  HelpCircle,
  Image as ImageIcon,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import {
  Table,
  Badge,
  Card,
  Button,
  Input,
  Select,
  Textarea,
  Modal,
  EmptyState,
  SkeletonTableRow,
  Timeline,
  formatRelativeTime,
  formatFullTime,
} from '../components/ui';

// ── Constants ──────────────────────────────────────────────────────────────────
export const POLL_INTERVAL_MS = 30000; // 30 seconds update polling interval

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'rescue', label: 'Rescue' },
  { value: 'medical', label: 'Medical' },
  { value: 'food_water', label: 'Food & Water' },
  { value: 'shelter', label: 'Shelter' },
  { value: 'other', label: 'Other' },
];

const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'reported', label: 'Reported' },
  { value: 'under_review', label: 'Under review' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'cancelled', label: 'Cancelled' },
];

const CATEGORY_ICONS = {
  rescue: LifeBuoy,
  medical: HeartPulse,
  food_water: Utensils,
  shelter: Home,
  other: HelpCircle,
};

export default function MyRequests() {
  const navigate = useNavigate();
  const toast = useToast();

  // ── Query & Filter State ─────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Data & Loading State ─────────────────────────────────────────────────────
  const [incidents, setIncidents] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Drawer & Detail State ────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Action State (Note & Cancel) ─────────────────────────────────────────────
  const [noteText, setNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // ── Search Debounce ──────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Fetch Incidents List ─────────────────────────────────────────────────────
  const fetchIncidents = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setIsRefreshing(true);
      setError('');

      try {
        const params = new URLSearchParams();
        params.set('page', page);
        params.set('limit', limit);
        if (statusFilter) params.set('status', statusFilter);
        if (categoryFilter) params.set('category', categoryFilter);
        if (searchQuery) params.set('search', searchQuery);

        const res = await api.get(`/incidents/mine?${params.toString()}`);

        if (Array.isArray(res)) {
          setIncidents(res);
          setTotalCount(res.length);
          setTotalPages(Math.ceil(res.length / limit) || 1);
        } else if (res && typeof res === 'object') {
          setIncidents(res.items || []);
          setTotalCount(res.total || 0);
          setTotalPages(res.pages || Math.ceil((res.total || 0) / limit) || 1);
        }
      } catch (err) {
        if (!silent) {
          setError(err.message || 'Unable to load your emergency requests.');
        }
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, limit, statusFilter, categoryFilter, searchQuery]
  );

  // ── Fetch Single Incident Detail ─────────────────────────────────────────────
  const fetchDetail = useCallback(
    async (id, silent = false) => {
      if (!id) return;
      if (!silent) setDetailLoading(true);

      try {
        const data = await api.get(`/incidents/${id}`);
        setDetail(data);
      } catch (err) {
        if (!silent) {
          toast.error(err.message || 'Failed to load incident detail.');
          setSelectedId(null);
        }
      } finally {
        if (!silent) setDetailLoading(false);
      }
    },
    [toast]
  );

  // Initial and reactive load
  useEffect(() => {
    fetchIncidents(false);
  }, [fetchIncidents]);

  // Load detail when selectedId changes
  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId, false);
    } else {
      setDetail(null);
      setNoteText('');
    }
  }, [selectedId, fetchDetail]);

  // ── 30-Second Polling Timer ──────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      fetchIncidents(true);
      if (selectedId) {
        fetchDetail(selectedId, true);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchIncidents, selectedId, fetchDetail]);

  // ── Handlers: Citizen Note ───────────────────────────────────────────────────
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim() || !selectedId) return;

    setNoteSubmitting(true);
    try {
      await api.post(`/incidents/${selectedId}/note`, { note: noteText.trim() });
      toast.success('Operational note added successfully');
      setNoteText('');
      await fetchDetail(selectedId, true);
      fetchIncidents(true);
    } catch (err) {
      toast.error(err.message || 'Failed to submit note.');
    } finally {
      setNoteSubmitting(false);
    }
  };

  // ── Handlers: Citizen Cancellation ───────────────────────────────────────────
  const handleCancelIncident = async () => {
    if (!selectedId) return;

    setCancelSubmitting(true);
    try {
      await api.post(`/incidents/${selectedId}/cancel`, {
        reason: cancelReason.trim() || undefined,
      });
      toast.success('Emergency request has been cancelled.');
      setCancelModalOpen(false);
      setCancelReason('');
      await fetchDetail(selectedId, true);
      fetchIncidents(true);
    } catch (err) {
      toast.error(err.message || 'Failed to cancel incident.');
    } finally {
      setCancelSubmitting(false);
    }
  };

  // Has active filters
  const hasActiveFilters = Boolean(statusFilter || categoryFilter || searchQuery);

  const resetFilters = () => {
    setStatusFilter('');
    setCategoryFilter('');
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      {/* ── Page Header ───────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1 className="ui-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            My emergency requests
            {isRefreshing && (
              <span
                className="ui-spinner"
                style={{ width: 14, height: 14, opacity: 0.7 }}
                title="Checking for updates..."
              />
            )}
          </h1>
          <p className="ui-page-desc">
            Monitor real-time response dispatch, status progression, and team assignments for your
            reported emergencies.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button
            variant="secondary"
            size="md"
            icon={RotateCcw}
            onClick={() => fetchIncidents(false)}
            title="Refresh requests"
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={() => navigate('/citizen/report')}
          >
            Report emergency
          </Button>
        </div>
      </div>

      {/* ── Filters & Search Bar ─────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            alignItems: 'center',
          }}
        >
          {/* Search by ID / Public Code */}
          <div style={{ position: 'relative' }}>
            <Input
              id="search-incident-id"
              placeholder="Search by ID (e.g. 42 or DR-1024)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ paddingLeft: 34 }}
            />
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)',
                pointerEvents: 'none',
              }}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  padding: 2,
                }}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <Select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            options={STATUSES}
          />

          {/* Category Filter */}
          <Select
            id="filter-category"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            options={CATEGORIES}
          />

          {/* Reset Filters Action */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={X}
              onClick={resetFilters}
              style={{ justifySelf: 'start', color: 'var(--text-secondary)' }}
            >
              Reset filters
            </Button>
          )}
        </div>
      </Card>

      {/* ── Error State ──────────────────────────────────────────────────────── */}
      {error && (
        <Card style={{ marginBottom: 20, borderColor: 'var(--danger-border)', background: 'var(--danger-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <AlertTriangle size={20} style={{ color: 'var(--danger-text)', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--danger-text)', fontSize: 14 }}>
                  Unable to fetch requests
                </div>
                <div style={{ fontSize: 13, color: 'var(--danger-text)', opacity: 0.9 }}>{error}</div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => fetchIncidents(false)}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* ── Table / Skeleton / Empty State ───────────────────────────────────── */}
      {loading ? (
        <Card padding="none">
          <Table>
            <thead>
              <tr>
                <th style={{ width: 110 }}>Incident ID</th>
                <th style={{ width: 130 }}>Category</th>
                <th>Location</th>
                <th style={{ width: 140 }}>Priority</th>
                <th style={{ width: 130 }}>Status</th>
                <th style={{ width: 130 }}>Reported</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTableRow columns={7} />
              <SkeletonTableRow columns={7} />
              <SkeletonTableRow columns={7} />
              <SkeletonTableRow columns={7} />
              <SkeletonTableRow columns={7} />
            </tbody>
          </Table>
        </Card>
      ) : incidents.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={Filter}
            title="No matching emergency requests"
            description="No requests match your selected status, category, or search filters. Try adjusting your search criteria."
            actionLabel="Clear all filters"
            onAction={resetFilters}
          />
        ) : (
          <EmptyState
            icon={LifeBuoy}
            title="You haven't reported anything yet"
            description="When you report an emergency, it will appear here so you can track response teams and status updates."
            actionLabel="Report emergency"
            onAction={() => navigate('/citizen/report')}
          />
        )
      ) : (
        <Card padding="none">
          <Table stickyHeader>
            <thead>
              <tr>
                <th style={{ width: 110 }}>Incident ID</th>
                <th style={{ width: 130 }}>Category</th>
                <th>Location</th>
                <th style={{ width: 150 }}>Priority</th>
                <th style={{ width: 140 }}>Status</th>
                <th style={{ width: 130 }}>Reported</th>
                <th style={{ width: 40 }} aria-label="Action"></th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => {
                const isSelected = selectedId === inc.id;
                const CatIcon = CATEGORY_ICONS[inc.category] || HelpCircle;
                const isPending = (inc.priority || '').toLowerCase() === 'pending';

                return (
                  <tr
                    key={inc.id}
                    className="clickable-row"
                    onClick={() => setSelectedId(isSelected ? null : inc.id)}
                    style={{
                      backgroundColor: isSelected ? 'var(--bg-surface-subdued)' : undefined,
                      cursor: 'pointer',
                    }}
                  >
                    {/* Column 1: Incident ID */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                          {inc.public_code || `#${inc.id}`}
                        </span>
                        {inc.public_code && (
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            ID #{inc.id}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Column 2: Category */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CatIcon size={14} style={{ color: 'var(--text-secondary)' }} />
                        <span style={{ textTransform: 'capitalize', fontSize: 13, fontWeight: 500 }}>
                          {(inc.category || '').replace('_', ' ')}
                        </span>
                      </div>
                    </td>

                    {/* Column 3: Location */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <MapPin size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                        <span
                          style={{
                            maxWidth: 260,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 13,
                          }}
                          title={inc.location_text || inc.address}
                        >
                          {inc.location_text || inc.address || 'Location provided'}
                        </span>
                      </div>
                    </td>

                    {/* Column 4: Priority (show "Pending review" when pending) */}
                    <td>
                      {isPending ? (
                        <Badge variant="priority" value="pending" size="sm">
                          Pending review
                        </Badge>
                      ) : (
                        <Badge variant="priority" value={inc.priority} size="sm" />
                      )}
                    </td>

                    {/* Column 5: Status Badge (text + color) */}
                    <td>
                      <Badge variant="status" value={inc.status} size="sm" />
                    </td>

                    {/* Column 6: Time Since Reported */}
                    <td>
                      <span
                        title={formatFullTime(inc.created_at)}
                        style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Clock size={12} style={{ color: 'var(--text-tertiary)' }} />
                        {formatRelativeTime(inc.created_at)}
                      </span>
                    </td>

                    {/* Column 7: Arrow indicator */}
                    <td style={{ textAlign: 'right' }}>
                      <ChevronRight
                        size={15}
                        style={{
                          transform: isSelected ? 'rotate(90deg)' : 'none',
                          transition: 'transform var(--transition-fast)',
                          color: 'var(--text-tertiary)',
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          {/* ── Pagination Footer ──────────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderTop: '1px solid var(--border-default)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              Showing {totalCount > 0 ? (page - 1) * limit + 1 : 0}–
              {Math.min(page * limit, totalCount)} of {totalCount} emergency requests
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button
                variant="secondary"
                size="sm"
                icon={ChevronLeft}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span style={{ fontWeight: 500, padding: '0 6px' }}>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={ChevronRight}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Slide-Over / Expand Detail Drawer ───────────────────────────────── */}
      {selectedId && (
        <div style={{ marginTop: 24 }}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>
                  Incident {detail?.public_code || `#${selectedId}`}
                </span>
                {detail && <Badge variant="status" value={detail.status} />}
                {detail && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Tracking: <code>{detail.tracking_code}</code>
                  </span>
                )}
              </div>
            }
            action={
              <Button variant="ghost" size="sm" icon={X} onClick={() => setSelectedId(null)}>
                Close
              </Button>
            }
          >
            {detailLoading || !detail ? (
              <div style={{ padding: '24px 0', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
                <span className="ui-spinner" style={{ width: 16, height: 16 }} />
                Loading incident operational details...
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
                {/* ── Section A: Key Operational Metrics ──────────────────────── */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 16,
                    padding: 16,
                    backgroundColor: 'var(--bg-surface-subdued)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  {/* Read-only priority view */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>
                      Triage Priority (Read-only)
                    </div>
                    {detail.priority === 'pending' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Badge variant="priority" value="pending" size="md">
                          Pending review
                        </Badge>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          Automated queue triage in progress
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Badge variant="priority" value={detail.priority} size="md" />
                        {detail.triage_score && (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            Score: {detail.triage_score}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Category & People affected */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>
                      Emergency Category
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                      {detail.category.replace('_', ' ')}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {detail.people_affected} person(s) affected
                    </span>
                  </div>

                  {/* Location & GPS */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>
                      Location & Coordinates
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {detail.location_text || detail.address}
                    </div>
                    {detail.latitude && detail.longitude && (
                      <a
                        href={`https://www.google.com/maps?q=${detail.latitude},${detail.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}
                      >
                        {detail.latitude.toFixed(4)}, {detail.longitude.toFixed(4)} <ExternalLink size={10} />
                      </a>
                    )}
                  </div>

                  {/* Report Timestamp */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>
                      Reported At
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                      {formatFullTime(detail.created_at)}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      ({formatRelativeTime(detail.created_at)})
                    </span>
                  </div>
                </div>

                {/* ── Section B: Full Description ─────────────────────────────── */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>
                    Full Situation Description
                  </div>
                  <div
                    style={{
                      padding: 14,
                      backgroundColor: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {detail.description}
                  </div>
                </div>

                {/* ── Section C: Attached Photo ───────────────────────────────── */}
                {detail.photo_url && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ImageIcon size={14} /> Attached Incident Scene Photo
                    </div>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <a href={detail.photo_url} target="_blank" rel="noopener noreferrer" title="Click to view full photo">
                        <img
                          src={detail.photo_url}
                          alt="Incident scene"
                          style={{
                            maxHeight: 220,
                            maxWidth: '100%',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-default)',
                            display: 'block',
                            objectFit: 'cover',
                          }}
                        />
                      </a>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, display: 'block' }}>
                        Secured storage key: <code>{detail.photo_key}</code> (viewable by owner & dispatch only)
                      </span>
                    </div>
                  </div>
                )}

                {/* ── Section D: Assigned Response Team ────────────────────────── */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={14} /> Dispatched Response Team
                  </div>
                  {detail.assignments && detail.assignments.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                      {detail.assignments.map((a) => (
                        <div
                          key={a.id}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: 'var(--bg-surface-subdued)',
                            border: '1px solid var(--border-default)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <Shield size={18} style={{ color: 'var(--accent)' }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {a.team_name || detail.assigned_team_name || `Team #${a.team_id}`}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              Dispatched {formatRelativeTime(a.assigned_at)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-surface-subdued)',
                        border: '1px dashed var(--border-default)',
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      No response team assigned yet. Incident is queued in the operational triage backlog.
                    </div>
                  )}
                </div>

                {/* ── Section E: Status History Timeline ──────────────────────── */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12 }}>
                    Status & Transition History
                  </div>
                  <Timeline items={detail.status_history || []} />
                </div>

                {/* ── Section F: Citizen Action Section (Cancel & Note) ────────── */}
                <div
                  style={{
                    padding: 18,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    backgroundColor: 'var(--bg-surface-subdued)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
                    Citizen Operational Actions
                  </div>

                  {detail.status === 'reported' ? (
                    <div>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                        Your report is currently in <strong>reported</strong> status. You can provide additional
                        on-scene updates or cancel this request if emergency assistance is no longer needed.
                      </p>

                      {/* Add note form */}
                      <form onSubmit={handleAddNote} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <Textarea
                            id="citizen-note-input"
                            placeholder="Add critical update (e.g. water level rising, family moved upstairs)..."
                            rows={2}
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            style={{ flex: 1 }}
                            disabled={noteSubmitting}
                          />
                          <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            icon={Send}
                            disabled={!noteText.trim() || noteSubmitting}
                          >
                            {noteSubmitting ? 'Posting…' : 'Add note'}
                          </Button>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, display: 'block' }}>
                          Notes appear immediately in the status timeline for dispatchers and response teams.
                        </span>
                      </form>

                      {/* Cancel request button */}
                      <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            Cancel emergency request
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            Withdraw this report if help is no longer required or reported by mistake.
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          icon={Ban}
                          onClick={() => setCancelModalOpen(true)}
                        >
                          Cancel request
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Shield size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span>
                        This incident has progressed to <strong>{detail.status.replace('_', ' ')}</strong>.
                        Cancellation and direct notes are locked once operations commence. For immediate emergency updates,
                        contact local emergency authorities directly.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Cancel Confirmation Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => {
          if (!cancelSubmitting) setCancelModalOpen(false);
        }}
        title="Cancel Emergency Request"
        description="Are you sure you want to cancel this emergency request? Response teams will be notified that assistance is no longer required."
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button
              variant="secondary"
              size="md"
              disabled={cancelSubmitting}
              onClick={() => setCancelModalOpen(false)}
            >
              Keep request active
            </Button>
            <Button
              variant="danger"
              size="md"
              disabled={cancelSubmitting}
              onClick={handleCancelIncident}
            >
              {cancelSubmitting ? 'Cancelling…' : 'Confirm cancellation'}
            </Button>
          </div>
        }
      >
        <div style={{ marginTop: 8 }}>
          <label htmlFor="cancel-reason" className="ui-label">
            Reason for cancellation <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span>
          </label>
          <Textarea
            id="cancel-reason"
            placeholder="e.g. Neighbors helped evacuate safely, water receded..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            disabled={cancelSubmitting}
          />
        </div>
      </Modal>
    </div>
  );
}
