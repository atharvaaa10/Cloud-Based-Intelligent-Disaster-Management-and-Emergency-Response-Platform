import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import MyRequests from './pages/MyRequests';
import ReportIncident from './pages/ReportIncident';
import AdminDashboard from './pages/AdminDashboard';
import IncidentDetail from './pages/IncidentDetail';
import TeamsPage from './pages/TeamsPage';
import ResourcesPage from './pages/ResourcesPage';
import AuditLog from './pages/AuditLog';
import './index.css';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-page"><span className="spinner" /> Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-page"><span className="spinner" /> Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'citizen') return <Navigate to="/citizen" replace />;
  return <Navigate to="/admin" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RootRedirect />} />

          {/* Citizen routes */}
          <Route element={<ProtectedRoute roles={['citizen']}><AppLayout /></ProtectedRoute>}>
            <Route path="/citizen" element={<MyRequests />} />
            <Route path="/citizen/report" element={<ReportIncident />} />
          </Route>

          {/* Admin / Responder routes */}
          <Route element={<ProtectedRoute roles={['admin', 'responder']}><AppLayout /></ProtectedRoute>}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/incidents/:id" element={<IncidentDetail />} />
            <Route path="/admin/teams" element={<ProtectedRoute roles={['admin']}><TeamsPage /></ProtectedRoute>} />
            <Route path="/admin/resources" element={<ProtectedRoute roles={['admin']}><ResourcesPage /></ProtectedRoute>} />
            <Route path="/admin/audit-log" element={<ProtectedRoute roles={['admin']}><AuditLog /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
