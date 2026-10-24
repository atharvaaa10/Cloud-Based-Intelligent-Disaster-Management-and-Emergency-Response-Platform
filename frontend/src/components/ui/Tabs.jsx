export default function Tabs({ tabs, activeTab, onChange, className = '' }) {
  return (
    <div className={`ui-tabs ${className}`} role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`ui-tab ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {Icon && <Icon size={14} strokeWidth={1.8} className="ui-tab-icon" aria-hidden="true" />}
            <span>{tab.label}</span>
            {tab.count != null && <span className="ui-tab-count">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
