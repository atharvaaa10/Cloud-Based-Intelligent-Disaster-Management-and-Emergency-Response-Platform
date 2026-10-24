export default function StatCard({
  label,
  value,
  icon: Icon,
  variant = 'default',
  meta,
  className = '',
  onClick,
}) {
  const isClickable = !!onClick;
  return (
    <div
      className={`ui-stat-card ui-stat-${variant} ${isClickable ? 'is-clickable' : ''} ${className}`}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="ui-stat-header">
        <span className="ui-stat-label">{label}</span>
        {Icon && <Icon size={16} strokeWidth={1.8} className="ui-stat-icon" aria-hidden="true" />}
      </div>
      <div className="ui-stat-value">{value}</div>
      {meta && <div className="ui-stat-meta">{meta}</div>}
    </div>
  );
}
