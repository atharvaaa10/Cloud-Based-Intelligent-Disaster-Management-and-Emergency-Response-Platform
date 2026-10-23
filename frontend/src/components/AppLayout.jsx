import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isResponder = user?.role === 'responder';
  const isCitizen = user?.role === 'citizen';
  const initials = user?.name?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>🛡️ DisasterResponse</h1>
          <small>Emergency Management Platform</small>
        </div>

        <nav className="sidebar-nav">
          {isCitizen && (
            <>
              <div className="nav-section-label">Citizen</div>
              <NavLink to="/citizen" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="icon">📋</span> My Requests
              </NavLink>
              <NavLink to="/citizen/report" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="icon">🚨</span> Report Emergency
              </NavLink>
            </>
          )}

          {(isAdmin || isResponder) && (
            <>
              <div className="nav-section-label">Operations</div>
              <NavLink to="/admin" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="icon">📊</span> Dashboard
              </NavLink>
            </>
          )}

          {isAdmin && (
            <>
              <div className="nav-section-label">Management</div>
              <NavLink to="/admin/teams" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="icon">👥</span> Teams
              </NavLink>
              <NavLink to="/admin/resources" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="icon">📦</span> Resources
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="name">{user?.name}</div>
              <div className="role">{user?.role}</div>
            </div>
          </div>
          <button className="btn-logout" onClick={logout}>Sign Out</button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
