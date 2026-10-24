import Badge from './Badge';

export function formatRelativeTime(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function formatFullTime(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

export default function Timeline({ items = [], className = '' }) {
  if (!items || items.length === 0) {
    return (
      <p className="ui-timeline-empty">No status updates recorded yet.</p>
    );
  }

  return (
    <div className={`ui-timeline ${className}`}>
      {items.map((item, index) => {
        const fullTime = formatFullTime(item.changed_at);
        const relTime = formatRelativeTime(item.changed_at);

        return (
          <div key={item.id || index} className="ui-timeline-item">
            <div className="ui-timeline-marker" aria-hidden="true" />
            <div className="ui-timeline-content">
              <div className="ui-timeline-header">
                <div className="ui-timeline-badges">
                  {item.old_status && (
                    <>
                      <Badge variant="status" value={item.old_status} size="sm" />
                      <span className="ui-timeline-arrow" aria-hidden="true">→</span>
                    </>
                  )}
                  <Badge variant="status" value={item.new_status} size="sm" />
                </div>
                <time
                  dateTime={item.changed_at}
                  title={fullTime}
                  className="ui-timeline-time"
                >
                  {relTime}
                </time>
              </div>
              {item.note && (
                <div className="ui-timeline-note">{item.note}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
