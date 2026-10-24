import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Inbox,
  UserCheck,
  Clock,
  CheckCircle2,
  Search,
  Filter,
  Users,
} from 'lucide-react';
import { api } from '../api';
import {
  Table,
  Badge,
  AutoTriagedTag,
  StatCard,
  Card,
  Input,
  Select,
  EmptyState,
  SkeletonTableRow,
  SkeletonStatCard,
  formatRelativeTime,
  formatFullTime,
} from '../components/ui';

const PRIORITY_WEIGHTS = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    category: '',
  });

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.category) params.set('category', filters.category);
      const qs = params.toString();
      const data = await api.get(`/incidents${qs ? '?' + qs : ''}`);
      setIncidents(data);
    } catch {
      /* ignore */
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchIncidents();
  }, [filters]);

  const setFilter = (k) => (e) =>
    setFilters({ ...filters, [k]: e.target.value });

  // Counts by status (from unfiltered or filtered list)
  const counts = useMemo(() => {
    return {
      reported: incidents.filter((i) => i.status === 'reported').length,
      assigned: incidents.filter((i) => i.status === 'assigned').length,
      in_progress: incidents.filter((i) => i.status === 'in_progress').length,
      resolved: incidents.filter((i) => i.status === 'resolved').length,
    };
  }, [incidents]);

  // Filter by search query and sort by priority (critical -> low) then recency
  const sortedFilteredIncidents = useMemo(() => {
    let list = [...incidents];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.location_text?.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q) ||
          String(i.id).includes(q)
      );
    }

    // Default sort: priority weight descending, then created_at descending
    list.sort((a, b) => {
      const weightA = PRIORITY_WEIGHTS[a.priority?.toLowerCase()] || 0;
      const weightB = PRIORITY_WEIGHTS[b.priority?.toLowerCase()] || 0;
      if (weightB !== weightA) {
        return weightB - weightA;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return list;
  }, [incidents, searchQuery]);

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="ui-page-title">Operations dashboard</h1>
        <p className="ui-page-desc">
          Live overview of emergency incidents, triage severity, and active dispatch status.
        </p>
      </div>

      {/* Top row of 4 StatCards */}
      <div className="ui-stat-grid">
        {loading ? (
          <>
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </>
        ) : (
          <>
            <StatCard
              label="Reported"
              value={counts.reported}
              icon={Inbox}
              variant="default"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  status: prev.status === 'reported' ? '' : 'reported',
                }))
              }
              className={filters.status === 'reported' ? 'is-selected' : ''}
            />
            <StatCard
              label="Assigned"
              value={counts.assigned}
              icon={UserCheck}
              variant="default"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  status: prev.status === 'assigned' ? '' : 'assigned',
                }))
              }
              className={filters.status === 'assigned' ? 'is-selected' : ''}
            />
            <StatCard
              label="In progress"
              value={counts.in_progress}
              icon={Clock}
              variant="default"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  status: prev.status === 'in_progress' ? '' : 'in_progress',
                }))
              }
              className={filters.status === 'in_progress' ? 'is-selected' : ''}
            />
            <StatCard
              label="Resolved"
              value={counts.resolved}
              icon={CheckCircle2}
              variant="default"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  status: prev.status === 'resolved' ? '' : 'resolved',
                }))
              }
              className={filters.status === 'resolved' ? 'is-selected' : ''}
            />
          </>
        )}
      </div>

      {/* Filter bar */}
      <div className="filters-bar">
        <div className="search-input-group">
          <Input
            id="search"
            placeholder="Search by ID, location, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={Search}
          />
        </div>

        <Select
          id="status-filter"
          value={filters.status}
          onChange={setFilter('status')}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'reported', label: 'Reported' },
            { value: 'assigned', label: 'Assigned' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'resolved', label: 'Resolved' },
          ]}
        />

        <Select
          id="priority-filter"
          value={filters.priority}
          onChange={setFilter('priority')}
          options={[
            { value: '', label: 'All priorities' },
            { value: 'critical', label: 'Critical' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ]}
        />

        <Select
          id="category-filter"
          value={filters.category}
          onChange={setFilter('category')}
          options={[
            { value: '', label: 'All categories' },
            { value: 'rescue', label: 'Rescue' },
            { value: 'medical', label: 'Medical' },
            { value: 'food_water', label: 'Food & water' },
            { value: 'shelter', label: 'Shelter' },
            { value: 'other', label: 'Other' },
          ]}
        />
      </div>

      {/* Incidents Table */}
      {loading ? (
        <Card padding="none">
          <Table compact>
            <thead>
              <tr>
                <th style={{ width: 70 }}>ID</th>
                <th>Category</th>
                <th>Location</th>
                <th>Affected</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Triage</th>
                <th>Reported</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTableRow columns={8} />
              <SkeletonTableRow columns={8} />
              <SkeletonTableRow columns={8} />
              <SkeletonTableRow columns={8} />
            </tbody>
          </Table>
        </Card>
      ) : sortedFilteredIncidents.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No incidents match criteria"
          description="Try adjusting your status, priority, or search term to see emergency incident records."
          actionLabel={
            filters.status || filters.priority || filters.category || searchQuery
              ? 'Reset all filters'
              : undefined
          }
          onAction={() => {
            setFilters({ status: '', priority: '', category: '' });
            setSearchQuery('');
          }}
        />
      ) : (
        <Card padding="none">
          <Table compact stickyHeader>
            <thead>
              <tr>
                <th style={{ width: 70 }}>ID</th>
                <th>Category</th>
                <th>Location</th>
                <th>Affected</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Triage</th>
                <th>Reported</th>
              </tr>
            </thead>
            <tbody>
              {sortedFilteredIncidents.map((inc) => (
                <tr
                  key={inc.id}
                  className="clickable-row"
                  onClick={() => navigate(`/admin/incidents/${inc.id}`)}
                >
                  <td style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                    #{inc.id}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>
                    {inc.category.replace('_', ' ')}
                  </td>
                  <td style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {inc.location_text}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Users size={12} style={{ color: 'var(--text-tertiary)' }} />
                      <span>{inc.people_affected}</span>
                    </div>
                  </td>
                  <td>
                    <Badge variant="priority" value={inc.priority} size="sm" />
                  </td>
                  <td>
                    <Badge variant="status" value={inc.status} size="sm" />
                  </td>
                  <td>
                    {inc.auto_triaged_at ? (
                      <AutoTriagedTag score={inc.triage_score} reason={inc.triage_reason} />
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>Manual</span>
                    )}
                  </td>
                  <td>
                    <span
                      title={formatFullTime(inc.created_at)}
                      style={{ color: 'var(--text-secondary)', fontSize: '11px' }}
                    >
                      {formatRelativeTime(inc.created_at)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
