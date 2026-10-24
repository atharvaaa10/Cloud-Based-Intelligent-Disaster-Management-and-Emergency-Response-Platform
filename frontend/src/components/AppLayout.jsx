import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ShieldAlert,
  LayoutDashboard,
  Users,
  Package,
  FileText,
  AlertTriangle,
  ClipboardList,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const isAdmin = user?.role === 'admin';
  const isResponder = user?.role === 'responder';
  const isCitizen = user?.role === 'citizen';

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const getPageTitle = () => {
    const p = location.pathname;
    if (p.startsWith('/admin/incidents/')) return 'Incident details';
    if (p === '/admin') return 'Operational dashboard';
    if (p === '/admin/teams') return 'Team dispatch & fleet';
    if (p === '/admin/resources') return 'Emergency resources';
    if (p === '/admin/audit-log') return 'Security audit trail';
    if (p === '/citizen/report') return 'Report emergency';
    if (p === '/citizen') return 'My emergency requests';
    return 'Disaster management';
  };

  // Close mobile sidebar on link navigation
  const closeMobile = () => setMobileOpen(false);

  // ── Citizen Layout (Streamlined Top Navigation) ────────────────
  if (isCitizen) {
    return (
      <div className="citizen-app-shell">
        <header className="citizen-header">
          <div className="citizen-header-inner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="sidebar-brand">
                <div className="brand-icon">
                  <ShieldAlert size={16} strokeWidth={2} />
                </div>
                <div className="brand-meta">
                  <span>DisasterResponse</span>
                  <small>Civilian emergency portal</small>
                </div>
              </div>

              <nav className="citizen-nav" aria-label="Main navigation">
                <NavLink
                  to="/citizen"
                  end
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <ClipboardList size={15} strokeWidth={1.8} className="nav-link-icon" />
                  <span>My requests</span>
                </NavLink>
                <NavLink
                  to="/citizen/report"
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <AlertTriangle size={15} strokeWidth={1.8} className="nav-link-icon" />
                  <span>Report emergency</span>
                </NavLink>
              </nav>
            </div>

            <div className="topbar-right">
              <button
                type="button"
                className="theme-toggle-btn"
                onClick={toggleTheme}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
              </button>

              <div className="sidebar-user-row" style={{ marginLeft: 8 }}>
                <div className="user-avatar">{initials}</div>
                <div className="user-details">
                  <span className="user-name">{user?.name}</span>
                  <span className="user-role-badge">Citizen</span>
                </div>
              </div>

              <button
                type="button"
                className="ui-btn ui-btn-outline ui-btn-sm"
                onClick={logout}
                title="Sign out"
                style={{ marginLeft: 6 }}
              >
                <LogOut size={13} strokeWidth={1.8} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    );
  }

  // ── Admin / Responder Layout (Sidebar + Top Bar) ───────────────
  return (
    <div className="app-shell">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="ui-modal-backdrop"
          style={{ zIndex: 35 }}
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="brand-icon">
              <ShieldAlert size={16} strokeWidth={2} />
            </div>
            <div className="brand-meta">
              <span>DisasterResponse</span>
              <small>Operations control</small>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Operations navigation">
          {(isAdmin || isResponder) && (
            <>
              <div className="nav-section-label">Operations</div>
              <NavLink
                to="/admin"
                end
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={closeMobile}
              >
                <LayoutDashboard size={15} strokeWidth={1.8} className="nav-link-icon" />
                <span>Incidents</span>
              </NavLink>
            </>
          )}

          {isAdmin && (
            <>
              <div className="nav-section-label">Fleet & Resources</div>
              <NavLink
                to="/admin/teams"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={closeMobile}
              >
                <Users size={15} strokeWidth={1.8} className="nav-link-icon" />
                <span>Rescue teams</span>
              </NavLink>
              <NavLink
                to="/admin/resources"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={closeMobile}
              >
                <Package size={15} strokeWidth={1.8} className="nav-link-icon" />
                <span>Supplies & vehicles</span>
              </NavLink>

              <div className="nav-section-label">Governance</div>
              <NavLink
                to="/admin/audit-log"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={closeMobile}
              >
                <FileText size={15} strokeWidth={1.8} className="nav-link-icon" />
                <span>Audit trail</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-row">
            <div className="user-avatar">{initials}</div>
            <div className="user-details">
              <span className="user-name">{user?.name}</span>
              <span className="user-role-badge">{user?.role}</span>
            </div>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-outline ui-btn-sm"
            onClick={logout}
            style={{ width: '100%' }}
          >
            <LogOut size={13} strokeWidth={1.8} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={2} />}
            </button>
            <span className="topbar-title">{getPageTitle()}</span>
          </div>

          <div className="topbar-right">
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
            </button>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
