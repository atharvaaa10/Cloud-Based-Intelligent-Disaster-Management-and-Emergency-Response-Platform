export default function Table({
  children,
  className = '',
  compact = false,
  stickyHeader = true,
  ...props
}) {
  return (
    <div className="ui-table-container">
      <table
        className={`ui-table ${compact ? 'ui-table-compact' : ''} ${stickyHeader ? 'ui-table-sticky' : ''} ${className}`}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}
