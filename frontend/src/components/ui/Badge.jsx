import { Zap, AlertTriangle, AlertCircle, Info, Clock, CheckCircle2, UserCheck, Flame, XCircle } from 'lucide-react';

const PRIORITY_LABELS = {
  pending: 'Pending review',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const STATUS_LABELS = {
  reported: 'Reported',
  under_review: 'Under review',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
};

export default function Badge({
  children,
  variant = 'default',
  value,
  size = 'md',
  className = '',
  title,
  icon: CustomIcon,
}) {
  let badgeClass = `ui-badge ui-badge-${size}`;
  let text = children;
  let Icon = CustomIcon;

  if (variant === 'priority') {
    const p = (value || children || '').toLowerCase();
    badgeClass += ` ui-badge-prio-${p}`;
    text = PRIORITY_LABELS[p] || p;
    if (!Icon) {
      if (p === 'critical') Icon = Flame;
      else if (p === 'high') Icon = AlertCircle;
      else if (p === 'medium') Icon = AlertTriangle;
      else if (p === 'pending') Icon = Clock;
      else Icon = Info;
    }
  } else if (variant === 'status') {
    const s = (value || children || '').toLowerCase();
    badgeClass += ` ui-badge-status-${s}`;
    text = STATUS_LABELS[s] || s.replace('_', ' ');
    if (!Icon) {
      if (s === 'resolved') Icon = CheckCircle2;
      else if (s === 'in_progress' || s === 'under_review') Icon = Clock;
      else if (s === 'assigned') Icon = UserCheck;
      else if (s === 'cancelled') Icon = XCircle;
      else Icon = Info;
    }
  } else if (variant === 'auto-triage') {
    badgeClass += ' ui-badge-autotriage';
    text = text || 'Auto-triaged';
    if (!Icon) Icon = Zap;
  } else {
    badgeClass += ` ui-badge-${variant}`;
  }

  return (
    <span className={`${badgeClass} ${className}`} title={title}>
      {Icon && <Icon size={12} strokeWidth={2} className="ui-badge-icon" aria-hidden="true" />}
      <span>{text}</span>
    </span>
  );
}

export function AutoTriagedTag({ score, reason, size = 'sm' }) {
  return (
    <Badge
      variant="auto-triage"
      size={size}
      title={reason ? `Auto-triaged (score ${score ?? 'n/a'}/100): ${reason}` : `Auto-triaged (score ${score ?? 'n/a'}/100)`}
    >
      Auto-triaged{score != null ? ` (${score})` : ''}
    </Badge>
  );
}
