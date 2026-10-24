import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  MapPin,
  Users,
  AlertTriangle,
  Clock,
  Plus,
} from 'lucide-react';
import { api } from '../api';
import {
  Table,
  Badge,
  Card,
  Button,
  EmptyState,
  SkeletonTableRow,
  Timeline,
  formatRelativeTime,
  formatFullTime,
} from '../components/ui';

export default function MyRequests() {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [details, setDetails] = useState({});

  useEffect(() => {
    api
      .get('/incidents/mine')
      .then(setIncidents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleDetail = async (id) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    if (!details[id]) {
      try {
        const data = await api.get(`/incidents/${id}`);
        let photo_url = null;
        if (data.photo_key) {
          try {
            const photoRes = await api.get(`/incidents/${id}/photo-url`);
            photo_url = photoRes.photo_url;
          } catch {
            // ignore mock
          }
        }
        setDetails((prev) => ({ ...prev, [id]: { ...data, photo_url } }));
      } catch {
        /* ignore */
      }
    }
    setExpanded(id);
  };

  return (
    <div>
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
          <h1 className="ui-page-title">My emergency requests</h1>
          <p className="ui-page-desc">
            Track operational response status and deployment history for your submitted reports.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          icon={Plus}
          onClick={() => navigate('/citizen/report')}
        >
          Report emergency
        </Button>
      </div>

      {loading ? (
        <Card padding="none">
          <Table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Category</th>
                <th>Location</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Reported</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTableRow columns={7} />
              <SkeletonTableRow columns={7} />
              <SkeletonTableRow columns={7} />
            </tbody>
          </Table>
        </Card>
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No emergency requests found"
          description="You have not submitted any emergency reports yet. If you are experiencing or witnessing an emergency, submit a report."
          actionLabel="Report emergency"
          onAction={() => navigate('/citizen/report')}
        />
      ) : (
        <Card padding="none">
          <Table stickyHeader>
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Category</th>
                <th>Location</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Reported</th>
                <th style={{ width: 40 }} aria-label="Expand"></th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => {
                const isExpanded = expanded === inc.id;
                const incDetail = details[inc.id];

                return (
                  <tr
                    key={inc.id}
                    className="clickable-row"
                    onClick={() => toggleDetail(inc.id)}
                    style={{
                      backgroundColor: isExpanded ? 'var(--bg-surface-subdued)' : undefined,
                    }}
                  >
                    <td style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                      #{inc.id}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>
                      {inc.category.replace('_', ' ')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={13} style={{ color: 'var(--text-tertiary)' }} />
                        <span>{inc.location_text}</span>
                      </div>
                    </td>
                    <td>
                      <Badge variant="priority" value={inc.priority} />
                    </td>
                    <td>
                      <Badge variant="status" value={inc.status} />
                    </td>
                    <td>
                      <span
                        title={formatFullTime(inc.created_at)}
                        style={{ color: 'var(--text-secondary)', fontSize: '12px' }}
                      >
                        {formatRelativeTime(inc.created_at)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <ChevronRight
                        size={15}
                        style={{
                          transform: isExpanded ? 'rotate(90deg)' : 'none',
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
        </Card>
      )}

      {/* Expanded Details Drawer / Sub-Card below */}
      {expanded && details[expanded] && (
        <div style={{ marginTop: 16 }}>
          <Card
            title={`Incident #${details[expanded].id} details & timeline`}
            action={
              <Button variant="ghost" size="sm" onClick={() => setExpanded(null)}>
                Close
              </Button>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Description
                </div>
                <p style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                  {details[expanded].description}
                </p>
              </div>

              {details[expanded].photo_url && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>
                    Attached scene photo
                  </div>
                  <a
                    href={details[expanded].photo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      src={details[expanded].photo_url}
                      alt="Incident scene"
                      style={{
                        maxHeight: 180,
                        maxWidth: '100%',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-default)',
                        display: 'block',
                      }}
                    />
                  </a>
                </div>
              )}

              {details[expanded].assignments?.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>
                    Dispatched response teams
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {details[expanded].assignments.map((a) => (
                      <div
                        key={a.id}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: 'var(--bg-surface-subdued)',
                          border: '1px solid var(--border-default)',
                          fontSize: '12px',
                        }}
                      >
                        Team #{a.team_id} (Assigned {formatRelativeTime(a.assigned_at)})
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Status transition history
                </div>
                <Timeline items={details[expanded].status_history || []} />
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
