export default function Card({
  children,
  title,
  subtitle,
  action,
  className = '',
  padding = 'md',
  ...props
}) {
  return (
    <div className={`ui-card ui-card-pad-${padding} ${className}`} {...props}>
      {(title || subtitle || action) && (
        <div className="ui-card-header">
          <div className="ui-card-header-text">
            {title && <h3 className="ui-card-title">{title}</h3>}
            {subtitle && <p className="ui-card-subtitle">{subtitle}</p>}
          </div>
          {action && <div className="ui-card-action">{action}</div>}
        </div>
      )}
      <div className="ui-card-body">{children}</div>
    </div>
  );
}
