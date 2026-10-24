import { Inbox } from 'lucide-react';
import Button from './Button';

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'No items found',
  description = 'There are no records to display right now.',
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div className={`ui-empty-state ${className}`}>
      <div className="ui-empty-state-icon">
        <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h3 className="ui-empty-state-title">{title}</h3>
      <p className="ui-empty-state-desc">{description}</p>
      {actionLabel && onAction && (
        <div className="ui-empty-state-action">
          <Button variant="secondary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
