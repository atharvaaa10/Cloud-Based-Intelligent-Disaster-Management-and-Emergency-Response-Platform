import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ShieldAlert,
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Home,
  Map as MapIcon,
  AlertTriangle,
  ClipboardList,
  LogOut,
  Menu,
  X,
  LifeBuoy,
  Bell,
  Activity,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBellCount } from '../hooks/useBellCount';
import ErrorBoundary from './ui/ErrorBoundary';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { count: bellCount } = useBellCount();

  const isAdmin = user?.role === 'admin';
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
    if (p.startsWith('/admin/incidents/')) return 'Incident Details';
    if (p === '/admin/incidents') return 'Incident Management';
    if (p === '/admin/map') return 'Live Map';
    if (p === '/admin/resources' || p === '/admin/teams') return 'Rescue Teams & Resources';
    if (p === '/admin/activity' || p === '/admin/audit-log') return 'Notifications & Audit Trail';
    if (p === '/admin') return 'Dashboard';
    if (p === '/citizen/report') return 'Report Emergency';
    if (p === '/citizen/map' || p === '/map') return 'Live Disaster Map';
    if (p === '/citizen/requests' || p === '/citizen/my-requests') return 'My Emergency Requests';
    if (p === '/citizen/resources') return 'Emergency Resources';
    if (p === '/citizen/updates') return 'Updates';
    if (p === '/citizen') return 'Citizen Overview';
    return 'Disaster Management';
  };

  // Close mobile sidebar on link navigation
  const closeMobile = () => setMobileOpen(false);

  // ── Citizen Layout (Streamlined Top Navigation + Hamburger < 1100px) ────
  if (isCitizen) {
    return (
      <div className="citizen-app-shell">
        <header className="citizen-header" role="banner">
          <div className="citizen-header-inner">
            {/* Left: Shield Logo Tile + Bold Title + Subtitle */}
            <div className="citizen-header-left">
              <button
                type="button"
                className="citizen-hamburger-btn"
                onClick={() => setMobileOpen((prev) => !prev)}
                aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileOpen}
                title="Toggle navigation"
              >
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="citizen-brand-logo" aria-hidden="true">
                  <ShieldAlert size={18} strokeWidth={2.2} />
                </div>
                <div className="citizen-brand-meta">
                  <span className="citizen-brand-title">DisasterResponse</span>
                  <span className="citizen-brand-sub">Civilian emergency portal</span>
                </div>
              </div>
            </div>

            {/* Center: Filled Pill Navigation (Desktop > 1100px) */}
            <nav className="citizen-nav citizen-nav-desktop" aria-label="Civilian Portal Navigation">
              <NavLink
                to="/citizen"
                end
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <Home size={15} strokeWidth={1.9} className="nav-link-icon" />
                <span>Home</span>
              </NavLink>
              <NavLink
                to="/citizen/requests"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <ClipboardList size={15} strokeWidth={1.9} className="nav-link-icon" />
                <span>My requests</span>
              </NavLink>
              <NavLink
                to="/citizen/report"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <AlertTriangle size={15} strokeWidth={1.9} className="nav-link-icon" />
                <span>Report emergency</span>
              </NavLink>
              <NavLink
                to="/citizen/map"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <MapIcon size={15} strokeWidth={1.9} className="nav-link-icon" />
                <span>Live map</span>
              </NavLink>
              <NavLink
                to="/citizen/updates"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                style={{ position: 'relative' }}
              >
                <Bell size={15} strokeWidth={1.9} className="nav-link-icon" />
                <span>Updates</span>
                {bellCount > 0 && (
                  <span className="bell-badge" aria-label={`${bellCount} unread notifications`}>
                    {bellCount > 9 ? '9+' : bellCount}
                  </span>
                )}
              </NavLink>
            </nav>

            {/* Right: User Avatar Circle + Name/Role, Outlined Sign Out */}
            <div className="citizen-header-right">
              <div className="citizen-user-profile">
                <div className="citizen-avatar-circle" aria-hidden="true">
                  {initials}
                </div>
                <div className="citizen-user-text">
                  <span className="citizen-user-name">{user?.name || 'Citizen'}</span>
                  <span className="citizen-user-role">Citizen</span>
                </div>
              </div>

              <button
                type="button"
                className="citizen-signout-btn"
                onClick={logout}
                title="Sign out of civilian portal"
              >
                <LogOut size={13} strokeWidth={1.9} />
                <span>Sign out</span>
              </button>
            </div>
          </div>

          {/* Mobile / Tablet Drawer below 1100px */}
          {mobileOpen && (
            <div className="citizen-mobile-drawer" role="dialog" aria-label="Mobile navigation">
              <nav className="citizen-mobile-nav">
                <NavLink
                  to="/citizen"
                  end
                  className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <Home size={16} strokeWidth={1.9} />
                  <span>Home</span>
                </NavLink>
                <NavLink
                  to="/citizen/requests"
                  className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <ClipboardList size={16} strokeWidth={1.9} />
                  <span>My requests</span>
                </NavLink>
                <NavLink
                  to="/citizen/report"
                  className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <AlertTriangle size={16} strokeWidth={1.9} />
                  <span>Report emergency</span>
                </NavLink>
                <NavLink
                  to="/citizen/map"
                  className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <MapIcon size={16} strokeWidth={1.9} />
                  <span>Live map</span>
                </NavLink>
                <NavLink
                  to="/citizen/resources"
                  className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <LifeBuoy size={16} strokeWidth={1.9} />
                  <span>Resources</span>
                </NavLink>
                <NavLink
                  to="/citizen/updates"
                  className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Bell size={16} strokeWidth={1.9} />
                    <span>Updates</span>
                  </div>
                  {bellCount > 0 && (
                    <span className="bell-badge bell-badge-inline">
                      {bellCount > 9 ? '9+' : bellCount}
                    </span>
                  )}
                </NavLink>
              </nav>
            </div>
          )}
        </header>

        {mobileOpen && (
          <div
            className="citizen-drawer-backdrop"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}


        <main className="main-content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    );
  }

  // ── Admin Layout (Sidebar + Top Bar) ───────────────
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
          {isAdmin && (
            <>
              <NavLink
                to="/admin"
                end
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={closeMobile}
              >
                <LayoutDashboard size={16} strokeWidth={1.8} className="nav-link-icon" />
                <span>Dashboard</span>
              </NavLink>
              <NavLink
                to="/admin/incidents"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={closeMobile}
              >
                <AlertTriangle size={16} strokeWidth={1.8} className="nav-link-icon" />
                <span>Incident Management</span>
              </NavLink>
              <NavLink
                to="/admin/map"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={closeMobile}
              >
                <MapIcon size={16} strokeWidth={1.8} className="nav-link-icon" />
                <span>Live Map</span>
              </NavLink>
              <NavLink
                to="/admin/resources"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={closeMobile}
              >
                <Users size={16} strokeWidth={1.8} className="nav-link-icon" />
                <span>Rescue Teams & Resources</span>
              </NavLink>
              <NavLink
                to="/admin/activity"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={closeMobile}
              >
                <Activity size={16} strokeWidth={1.8} className="nav-link-icon" />
                <span>Notifications & Audit Trail</span>
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
          </div>
        </header>

        <main className="main-content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
