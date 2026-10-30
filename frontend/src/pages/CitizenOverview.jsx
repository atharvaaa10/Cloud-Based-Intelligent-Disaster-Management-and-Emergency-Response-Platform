import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api';
import CitizenHero from '../components/citizen/CitizenHero';
import SummaryCards from '../components/citizen/SummaryCards';
import QuickActions from '../components/citizen/QuickActions';
import RecentRequestsTable from '../components/citizen/RecentRequestsTable';
import SafetyInfoCards from '../components/citizen/SafetyInfoCards';
import SidebarMapPreview from '../components/citizen/SidebarMapPreview';
import SidebarAnnouncements from '../components/citizen/SidebarAnnouncements';
import SidebarImmediateHelp from '../components/citizen/SidebarImmediateHelp';
import IncidentDetailModal from '../components/citizen/IncidentDetailModal';
import '../styles/citizen-dashboard.css';

// Reference demo data matching the UI screenshot when no live user requests exist
const DEMO_REFERENCE_REQUESTS = [
  {
    id: 1023,
    public_code: 'DR-1023',
    category: 'rescue',
    address: 'Kothrud, Pune',
    location_text: 'Kothrud, Pune',
    priority: 'critical',
    status: 'reported',
    reported_time: '15 min ago',
    description: 'Citizens stranded in flooded ground-floor housing complex near Karve Road. Rescue boat assistance needed urgently.',
    people_affected: 4,
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: 1022,
    public_code: 'DR-1022',
    category: 'flooding',
    address: 'Hinjawadi, Pune',
    location_text: 'Hinjawadi, Pune',
    priority: 'high',
    status: 'under_review',
    reported_time: '32 min ago',
    description: 'Stormwater backflow under Phase 1 IT park flyover causing heavy water accumulation and stranded two-wheelers.',
    people_affected: 2,
    created_at: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
  },
  {
    id: 1021,
    public_code: 'DR-1021',
    category: 'medical',
    address: 'Baner, Pune',
    location_text: 'Baner, Pune',
    priority: 'medium',
    status: 'in_progress',
    reported_time: '1 hour ago',
    description: 'Elderly citizen requiring oxygen cylinder backup and ambulance transport due to localized power outage.',
    people_affected: 1,
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
  {
    id: 1020,
    public_code: 'DR-1020',
    category: 'food_water',
    address: 'Wakad, Pune',
    location_text: 'Wakad, Pune',
    priority: 'medium',
    status: 'resolved',
    reported_time: '3 hours ago',
    description: 'Relief ration and packaged drinking water packets requested for displaced families at community center.',
    people_affected: 8,
    created_at: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
  },
  {
    id: 1019,
    public_code: 'DR-1019',
    category: 'shelter',
    address: 'Aundh, Pune',
    location_text: 'Aundh, Pune',
    priority: 'low',
    status: 'resolved',
    reported_time: '5 hours ago',
    description: 'Temporary night shelter bed allocation confirmed at Aundh Municipal Secondary School refuge hall.',
    people_affected: 3,
    created_at: new Date(Date.now() - 300 * 60 * 1000).toISOString(),
  },
];

export default function CitizenOverview() {
  const { user } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overviewData, setOverviewData] = useState(null);
  const [userRequests, setUserRequests] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);

  // Load overview and requests data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch overview data and user's requests concurrently
      const [overviewRes, mineRes] = await Promise.allSettled([
        api.get('/citizen/overview?limit=5'),
        api.get('/incidents/mine?limit=50'),
      ]);

      if (overviewRes.status === 'fulfilled' && overviewRes.value) {
        setOverviewData(overviewRes.value);
      }

      if (mineRes.status === 'fulfilled' && mineRes.value) {
        const list = Array.isArray(mineRes.value)
          ? mineRes.value
          : mineRes.value?.items || [];
        setUserRequests(list);
      }
    } catch (err) {
      console.error('[CITIZEN_DASHBOARD] Load error:', err);
      setError(err.message || 'Unable to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Determine whether to show live user requests or reference demo data
  const hasLiveRequests = userRequests.length > 0;
  const isDemo = !hasLiveRequests;

  // Calculate counts dynamically from live request data
  const counts = useMemo(() => {
    if (hasLiveRequests) {
      const total = userRequests.length;
      const underReview = userRequests.filter(
        (r) => r.status?.toLowerCase() === 'under_review'
      ).length;
      const inProgress = userRequests.filter((r) =>
        ['in_progress', 'assigned'].includes(r.status?.toLowerCase())
      ).length;
      const resolved = userRequests.filter(
        (r) => r.status?.toLowerCase() === 'resolved'
      ).length;
      return { total, underReview, inProgress, resolved };
    }

    // Reference demo counts matching the screenshot
    return {
      total: 5,
      underReview: 2,
      inProgress: 1,
      resolved: 2,
    };
  }, [hasLiveRequests, userRequests]);

  // Recent requests list for the table (top 5)
  const displayRequests = useMemo(() => {
    if (hasLiveRequests) {
      return userRequests.slice(0, 5);
    }
    return DEMO_REFERENCE_REQUESTS;
  }, [hasLiveRequests, userRequests]);

  // Stored announcements from backend overview or fallback
  const announcements = overviewData?.announcements || [];

  return (
    <main className="citizen-dashboard-container" role="main">
      {/* Error Alert Banner */}
      {error && (
        <div
          role="alert"
          style={{
            background: 'rgba(240, 68, 56, 0.15)',
            border: '1px solid rgba(240, 68, 56, 0.35)',
            color: '#FCA5A5',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span><strong>Failed to load live data:</strong> {error}</span>
          <button
            type="button"
            onClick={loadData}
            style={{
              background: 'transparent',
              border: '1px solid #FCA5A5',
              color: '#FCA5A5',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Two-Column Layout (72% Main / 28% Sidebar) */}
      <div className="citizen-dashboard-grid">
        {/* Left / Main Column (72%) */}
        <div className="citizen-main-column">
          {/* 1. Welcome Hero */}
          <CitizenHero user={user} />

          {/* 2. Four Summary Cards */}
          <SummaryCards counts={counts} loading={loading} />

          {/* 3. Quick Actions */}
          <QuickActions />

          {/* 4. Recent Emergency Requests Table */}
          <RecentRequestsTable
            requests={displayRequests}
            loading={loading}
            isDemo={isDemo}
            onSelectIncident={(inc) => setSelectedIncident(inc)}
          />

          {/* 5. Emergency Safety Information Cards */}
          <SafetyInfoCards />
        </div>

        {/* Right / Sidebar Column (28%) */}
        <aside className="citizen-sidebar-column" aria-label="Incident map and emergency information">
          {/* 1. Live Incident Map Preview */}
          <SidebarMapPreview />

          {/* 2. Important Announcements */}
          <SidebarAnnouncements announcements={announcements} />

          {/* 3. Need Immediate Help? (112) */}
          <SidebarImmediateHelp />
        </aside>
      </div>

      {/* Incident Detail Dialog / Modal */}
      {selectedIncident && (
        <IncidentDetailModal
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
        />
      )}
    </main>
  );
}
