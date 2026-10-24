import Spinner from './Spinner';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  type = 'button',
  className = '',
  ...props
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading}
      className={`ui-btn ui-btn-${variant} ui-btn-${size} ${className}`}
      {...props}
    >
      {loading ? (
        <Spinner size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} strokeWidth={1.8} aria-hidden="true" />
      ) : null}
      {children && <span>{children}</span>}
    </button>
  );
}
