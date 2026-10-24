export default function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
  count = 1,
}) {
  const items = Array.from({ length: count });

  return (
    <>
      {items.map((_, i) => (
        <span
          key={i}
          className={`ui-skeleton ui-skeleton-${variant} ${className}`}
          style={{
            width: width || (variant === 'text' ? '100%' : undefined),
            height: height || (variant === 'text' ? '14px' : undefined),
          }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

export function SkeletonTableRow({ columns = 5 }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i}>
          <Skeleton width={i === 0 ? '40px' : i === 1 ? '120px' : '80px'} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="ui-stat-card ui-skeleton-card">
      <Skeleton width="60px" height="12px" />
      <Skeleton width="48px" height="28px" style={{ margin: '8px 0 4px' }} />
    </div>
  );
}
