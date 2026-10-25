import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, BellOff, CheckCheck, AlertTriangle, Shield, Info,
  Megaphone, ClipboardList, RefreshCw, ChevronRight, Filter,
  AlertCircle, Users, CheckCircle2, XCircle, Clock, Activity,
  Siren,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

// ─── Poll interval ────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 30_000;

// ─── Type metadata ────────────────────────────────────────────────────────────
const TYPE_META = {
  report_received:  { icon: Bell,           color: "#8b5cf6", label: "Report received" },
  status_update:    { icon: Activity,       color: "#3b82f6", label: "Status update" },
  team_assigned:    { icon: Users,          color: "#f59e0b", label: "Team assigned" },
  resolved:         { icon: CheckCircle2,   color: "#22c55e", label: "Resolved" },
  cancelled:        { icon: XCircle,        color: "#6b7280", label: "Cancelled" },
  announcement:     { icon: Megaphone,      color: "#ef4444", label: "Announcement" },
};

function getTypeMeta(type) {
  return TYPE_META[type] || { icon: Bell, color: "var(--accent-primary)", label: "Notification" };
}

// ─── Announcement severity metadata ──────────────────────────────────────────
const SEVERITY_META = {
  critical: { icon: Siren,          color: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)" },
  warning:  { icon: AlertTriangle,  color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)" },
  info:     { icon: Info,           color: "#3b82f6", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)" },
};

function getSeverityMeta(severity) {
  return SEVERITY_META[severity] || SEVERITY_META.info;
}

// ─── Relative time ────────────────────────────────────────────────────────────
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return "just now";
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ─── Notification card ────────────────────────────────────────────────────────
function NotificationCard({ notif, onMarkRead }) {
  const navigate = useNavigate();
  const meta = getTypeMeta(notif.type);
  const Icon = meta.icon;

  const handleClick = async () => {
    if (!notif.is_read) await onMarkRead(notif.id);
    if (notif.incident_id) navigate(`/citizen/requests?highlight=${notif.incident_id}`);
  };

  return (
    <div
      className={`notif-card ${!notif.is_read ? "notif-unread" : ""}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && handleClick()}
      aria-label={`${notif.title}${notif.incident_id ? ", click to view incident" : ""}`}
    >
      <div className="notif-icon-wrap" style={{ background: `${meta.color}1a`, color: meta.color }}>
        <Icon size={16} strokeWidth={1.8} />
      </div>
      <div className="notif-body">
        <div className="notif-header-row">
          <span className="notif-title">{notif.title}</span>
          <span className="notif-time"><Clock size={10} strokeWidth={2} /> {timeAgo(notif.created_at)}</span>
        </div>
        <p className="notif-message">{notif.message}</p>
        <div className="notif-footer-row">
          <span className="notif-type-chip" style={{ color: meta.color, background: `${meta.color}1a` }}>
            {meta.label}
          </span>
          {notif.incident_id && (
            <span className="notif-link-hint">
              View incident <ChevronRight size={11} strokeWidth={2} />
            </span>
          )}
        </div>
      </div>
      {!notif.is_read && <div className="notif-unread-dot" aria-hidden="true" />}
    </div>
  );
}

// ─── Announcement card ────────────────────────────────────────────────────────
function AnnouncementCard({ ann }) {
  const meta = getSeverityMeta(ann.severity);
  const Icon = meta.icon;
  return (
    <div className="ann-card" style={{ borderColor: meta.border, background: meta.bg }}>
      <div className="ann-icon" style={{ color: meta.color }}>
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <div className="ann-body">
        <div className="ann-header-row">
          <span className="ann-title">{ann.title}</span>
          <span className="ann-severity-badge" style={{ color: meta.color, background: `${meta.color}20` }}>
            {ann.severity.toUpperCase()}
          </span>
        </div>
        <p className="ann-message">{ann.message}</p>
        <div className="ann-footer-row">
          <span className="ann-source">{ann.source}</span>
          <span className="ann-time"><Clock size={10} strokeWidth={2} />{timeAgo(ann.issued_at)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function NotifSkeleton() {
  return (
    <div className="notif-card notif-skeleton" aria-hidden="true">
      <div className="sk-circle" style={{ width: 36, height: 36, borderRadius: 10 }} />
      <div className="sk-lines" style={{ flex: 1 }}>
        <div className="sk-line sk-w60" />
        <div className="sk-line sk-w80" style={{ marginTop: 6 }} />
        <div className="sk-line sk-w40" style={{ marginTop: 6 }} />
      </div>
    </div>
  );
}

// ─── Filters ──────────────────────────────────────────────────────────────────
const FILTERS = [
  { key: "all",          label: "All",                icon: Bell },
  { key: "incident",     label: "Incident updates",   icon: Activity },
  { key: "announcement", label: "Announcements",      icon: Megaphone },
  { key: "unread",       label: "Unread",             icon: BellOff },
];

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function CitizenUpdates() {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("all");
  const [markingAll, setMarkingAll] = useState(false);
  const pollerRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────
  const fetchAll = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [nRes, aRes] = await Promise.all([
        fetch("/notifications?limit=100", { headers }),
        fetch("/notifications/announcements"),
      ]);
      if (!nRes.ok) throw new Error(`Notifications: ${nRes.status}`);
      const [nData, aData] = await Promise.all([nRes.json(), aRes.json()]);
      setNotifications(nData);
      setAnnouncements(aData);
    } catch (e) {
      setError(e.message || "Could not load updates.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAll();
    pollerRef.current = setInterval(() => fetchAll(true), POLL_INTERVAL_MS);
    return () => clearInterval(pollerRef.current);
  }, [fetchAll]);

  // ── Mark one read ──────────────────────────────────────────────
  const markRead = useCallback(async (id) => {
    try {
      await fetch(`/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch { /* silent */ }
  }, [token]);

  // ── Mark all read ──────────────────────────────────────────────
  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await fetch("/notifications/read-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { /* silent */ }
    finally { setMarkingAll(false); }
  };

  // ── Derived lists ──────────────────────────────────────────────
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const INCIDENT_TYPES = new Set(["report_received","status_update","team_assigned","resolved","cancelled"]);

  const visibleNotifications = notifications.filter(n => {
    if (filter === "unread")       return !n.is_read;
    if (filter === "incident")     return INCIDENT_TYPES.has(n.type);
    if (filter === "announcement") return !INCIDENT_TYPES.has(n.type);
    return true;
  });

  const showAnnouncements = filter === "all" || filter === "announcement";

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="citizen-updates-page">
      {/* Page header */}
      <div className="updates-page-header">
        <div>
          <h1 className="page-heading">
            <Bell size={22} strokeWidth={1.8} style={{ color: "var(--accent-primary)" }} />
            Updates & Notifications
          </h1>
          <p className="page-subheading">
            Real-time alerts for your incidents and emergency announcements
          </p>
        </div>
        <div className="updates-header-actions">
          {unreadCount > 0 && (
            <button
              id="mark-all-read-btn"
              className="ui-btn ui-btn-outline ui-btn-sm"
              onClick={markAllRead}
              disabled={markingAll}
              title="Mark all as read"
            >
              {markingAll ? <span className="ui-spinner" style={{width:13,height:13}} /> : <CheckCheck size={13} strokeWidth={2} />}
              <span>Mark all read</span>
            </button>
          )}
          <button
            id="updates-refresh-btn"
            className="ui-btn ui-btn-ghost ui-btn-sm"
            onClick={() => fetchAll()}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={13} strokeWidth={2} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="updates-error-banner">
          <AlertCircle size={14} strokeWidth={2} />
          <span>{error}</span>
          <button onClick={() => fetchAll()} className="loc-error-close">Retry</button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="updates-filters" role="tablist">
        {FILTERS.map(f => {
          const Icon = f.icon;
          const cnt = f.key === "unread" ? unreadCount
                    : f.key === "incident" ? notifications.filter(n => INCIDENT_TYPES.has(n.type)).length
                    : f.key === "announcement" ? announcements.length
                    : notifications.length;
          return (
            <button
              key={f.key}
              id={`updates-filter-${f.key}`}
              role="tab"
              aria-selected={filter === f.key}
              className={`updates-filter-tab ${filter === f.key ? "active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              <Icon size={13} strokeWidth={1.8} />
              <span>{f.label}</span>
              {cnt > 0 && (
                <span className={`filter-badge ${f.key === "unread" && cnt > 0 ? "badge-alert" : ""}`}>{cnt}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Announcements section */}
      {showAnnouncements && announcements.length > 0 && (
        <section className="announcements-section" aria-labelledby="ann-heading">
          <h2 id="ann-heading" className="section-heading">
            <Megaphone size={15} strokeWidth={1.8} style={{ color: "#ef4444" }} />
            Emergency Announcements
          </h2>
          <div className="announcements-list">
            {announcements.map(a => <AnnouncementCard key={a.id} ann={a} />)}
          </div>
        </section>
      )}

      {/* Notifications section */}
      <section aria-labelledby="notifs-heading">
        {(filter !== "announcement") && (
          <h2 id="notifs-heading" className="section-heading" style={{ marginBottom: 12 }}>
            <Bell size={15} strokeWidth={1.8} style={{ color: "var(--accent-primary)" }} />
            {filter === "unread" ? `Unread (${unreadCount})` : "Your Notifications"}
          </h2>
        )}
        <div className="notifications-list">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <NotifSkeleton key={i} />)
          ) : visibleNotifications.length === 0 ? (
            filter !== "announcement" && (
              <div className="updates-empty-state">
                <div className="empty-icon" style={{ opacity: 0.35 }}>
                  <BellOff size={44} strokeWidth={1.2} />
                </div>
                <h3>
                  {filter === "unread" ? "All caught up!" : "No notifications yet"}
                </h3>
                <p>
                  {filter === "unread"
                    ? "You have no unread notifications."
                    : filter === "incident"
                    ? "Incident status updates will appear here."
                    : "When you report an emergency, updates will show here."}
                </p>
                {filter !== "all" && (
                  <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setFilter("all")}>
                    View all
                  </button>
                )}
              </div>
            )
          ) : (
            visibleNotifications.map(n => (
              <NotificationCard key={n.id} notif={n} onMarkRead={markRead} />
            ))
          )}
        </div>
      </section>

      {/* Poll notice */}
      <p className="poll-notice">
        <Activity size={10} strokeWidth={2} />
        Auto-refreshes every 30 seconds
      </p>
    </div>
  );
}
