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
import IncidentDetail from './pages/IncidentDetail';
import TeamsPage from './pages/TeamsPage';
import ResourcesPage from './pages/ResourcesPage';
import AuditLog from './pages/AuditLog';
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
            <Route element={<ProtectedRoute roles={['citizen', 'admin', 'responder']}><AppLayout /></ProtectedRoute>}>
              <Route path="/citizen" element={<ErrorBoundary title="Failed to load Citizen Overview"><CitizenOverview /></ErrorBoundary>} />
              <Route path="/citizen/map" element={<ErrorBoundary title="Failed to load Live Map"><LiveMap /></ErrorBoundary>} />
              <Route path="/map" element={<Navigate to="/citizen/map" replace />} />
              <Route path="/citizen/requests" element={<ErrorBoundary title="Failed to load My Requests"><MyRequests /></ErrorBoundary>} />
              <Route path="/citizen/my-requests" element={<Navigate to="/citizen/requests" replace />} />
              <Route path="/citizen/report" element={<ErrorBoundary title="Failed to load Report Emergency"><ReportIncident /></ErrorBoundary>} />
              <Route path="/citizen/resources" element={<ErrorBoundary title="Failed to load Resources"><CitizenResources /></ErrorBoundary>} />
              <Route path="/citizen/updates" element={<ErrorBoundary title="Failed to load Updates"><CitizenUpdates /></ErrorBoundary>} />
            </Route>

            {/* Admin / Responder routes */}
            <Route element={<ProtectedRoute roles={['admin', 'responder']}><AppLayout /></ProtectedRoute>}>
              <Route path="/admin" element={<ErrorBoundary title="Failed to load Admin Dashboard"><AdminDashboard /></ErrorBoundary>} />
              <Route path="/admin/incidents/:id" element={<ErrorBoundary title="Failed to load Incident Details"><IncidentDetail /></ErrorBoundary>} />
              <Route path="/admin/teams" element={<ProtectedRoute roles={['admin']}><ErrorBoundary title="Failed to load Teams"><TeamsPage /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/admin/resources" element={<ProtectedRoute roles={['admin']}><ErrorBoundary title="Failed to load Resources"><ResourcesPage /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/admin/audit-log" element={<ProtectedRoute roles={['admin']}><ErrorBoundary title="Failed to load Audit Log"><AuditLog /></ErrorBoundary></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
