export default function Spinner({ size = 16, className = '' }) {
  return (
    <span
      className={`ui-spinner ${className}`}
      style={{
        width: size,
        height: size,
        borderWidth: Math.max(2, Math.round(size / 8)),
      }}
      role="status"
      aria-label="Loading"
    />
  );
}
