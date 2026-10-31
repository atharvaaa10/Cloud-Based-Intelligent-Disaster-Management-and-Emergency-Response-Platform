import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import CitizenOverview from './pages/CitizenOverview';
import LiveMap from './pages/LiveMap';
import MyRequests from './pages/MyRequests';
import ReportIncident from './pages/ReportIncident';
import AdminDashboard from './pages/AdminDashboard';
import AdminIncidents from './pages/AdminIncidents';
import IncidentDetail from './pages/IncidentDetail';
import AdminResources from './pages/AdminResources';
import AdminActivity from './pages/AdminActivity';
import CitizenResources from './pages/CitizenResources';
import CitizenUpdates from './pages/CitizenUpdates';
import ErrorBoundary from './components/ui/ErrorBoundary';
import './index.css';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 8, color: 'var(--text-secondary)' }}><span className="ui-spinner" style={{ width: 20, height: 20 }} /> Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 8, color: 'var(--text-secondary)' }}><span className="ui-spinner" style={{ width: 20, height: 20 }} /> Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'citizen') return <Navigate to="/citizen" replace />;
  return <Navigate to="/admin" replace />;
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RootRedirect />} />

            {/* Citizen routes */}
            <Route element={<ProtectedRoute roles={['citizen', 'admin']}><AppLayout /></ProtectedRoute>}>
              <Route path="/citizen" element={<ErrorBoundary title="Failed to load Citizen Overview"><CitizenOverview /></ErrorBoundary>} />
              <Route path="/citizen/map" element={<ErrorBoundary title="Failed to load Live Map"><LiveMap /></ErrorBoundary>} />
              <Route path="/map" element={<Navigate to="/citizen/map" replace />} />
              <Route path="/citizen/requests" element={<ErrorBoundary title="Failed to load My Requests"><MyRequests /></ErrorBoundary>} />
              <Route path="/citizen/my-requests" element={<Navigate to="/citizen/requests" replace />} />
              <Route path="/citizen/report" element={<ErrorBoundary title="Failed to load Report Emergency"><ReportIncident /></ErrorBoundary>} />
              <Route path="/citizen/resources" element={<ErrorBoundary title="Failed to load Resources"><CitizenResources /></ErrorBoundary>} />
              <Route path="/citizen/updates" element={<ErrorBoundary title="Failed to load Updates"><CitizenUpdates /></ErrorBoundary>} />
            </Route>

            {/* Admin routes */}
            <Route element={<ProtectedRoute roles={['admin']}><AppLayout /></ProtectedRoute>}>
              {/* 1. Dashboard */}
              <Route path="/admin" element={<ErrorBoundary title="Failed to load Dashboard"><AdminDashboard /></ErrorBoundary>} />

              {/* 2. Incident Management */}
              <Route path="/admin/incidents" element={<ErrorBoundary title="Failed to load Incident Management"><AdminIncidents /></ErrorBoundary>} />
              <Route path="/admin/incidents/:id" element={<ErrorBoundary title="Failed to load Incident Details"><IncidentDetail /></ErrorBoundary>} />

              {/* 3. Live Map */}
              <Route path="/admin/map" element={<ErrorBoundary title="Failed to load Live Map"><LiveMap /></ErrorBoundary>} />

              {/* 4. Rescue Teams & Resources */}
              <Route path="/admin/resources" element={<ErrorBoundary title="Failed to load Rescue Teams & Resources"><AdminResources /></ErrorBoundary>} />
              <Route path="/admin/teams" element={<Navigate to="/admin/resources" replace />} />

              {/* 5. Notifications & Audit Trail */}
              <Route path="/admin/activity" element={<ErrorBoundary title="Failed to load Notifications & Audit Trail"><AdminActivity /></ErrorBoundary>} />
              <Route path="/admin/audit-log" element={<Navigate to="/admin/activity" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
