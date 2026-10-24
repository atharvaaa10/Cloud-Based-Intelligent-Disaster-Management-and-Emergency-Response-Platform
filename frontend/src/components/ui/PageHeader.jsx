export default function PageHeader({
  title,
  description,
  actions,
  badge,
  className = '',
}) {
  return (
    <div className={`ui-page-header ${className}`}>
      <div className="ui-page-header-main">
        <div className="ui-page-header-title-row">
          <h1 className="ui-page-title">{title}</h1>
          {badge && <div className="ui-page-header-badge">{badge}</div>}
        </div>
        {description && <p className="ui-page-desc">{description}</p>}
      </div>
      {actions && <div className="ui-page-header-actions">{actions}</div>}
    </div>
  );
}
