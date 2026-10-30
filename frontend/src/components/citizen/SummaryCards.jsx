import { useNavigate } from 'react-router-dom';
import { FileText, Clock, ShieldCheck, Check, ChevronRight } from 'lucide-react';

export default function SummaryCards({ counts, loading }) {
  const navigate = useNavigate();

  const cards = [
    {
      id: 'total',
      label: 'Total Requests',
      sub: 'All time',
      value: counts?.total ?? 0,
      icon: FileText,
      tileClass: 'blue',
      route: '/citizen/requests',
      ariaLabel: `Total requests: ${counts?.total ?? 0}. Click to view all requests.`,
    },
    {
      id: 'under_review',
      label: 'Under Review',
      sub: 'Being evaluated',
      value: counts?.underReview ?? 0,
      icon: Clock,
      tileClass: 'amber',
      route: '/citizen/requests?status=under_review',
      ariaLabel: `Under review requests: ${counts?.underReview ?? 0}. Click to filter by under review.`,
    },
    {
      id: 'in_progress',
      label: 'Response in Progress',
      sub: 'Team assigned',
      value: counts?.inProgress ?? 0,
      icon: ShieldCheck,
      tileClass: 'green',
      route: '/citizen/requests?status=in_progress',
      ariaLabel: `Response in progress requests: ${counts?.inProgress ?? 0}. Click to filter by in progress.`,
    },
    {
      id: 'resolved',
      label: 'Resolved',
      sub: 'Successfully completed',
      value: counts?.resolved ?? 0,
      icon: Check,
      tileClass: 'purple',
      route: '/citizen/requests?status=resolved',
      ariaLabel: `Resolved requests: ${counts?.resolved ?? 0}. Click to filter by resolved.`,
    },
  ];

  return (
    <section className="citizen-summary-grid" aria-label="Request statistics summary">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.id}
            className="citizen-summary-card"
            role="button"
            tabIndex={0}
            onClick={() => navigate(c.route)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(c.route);
              }
            }}
            aria-label={c.ariaLabel}
          >
            <div className="citizen-summary-left">
              <div className={`citizen-summary-icon-tile ${c.tileClass}`} aria-hidden="true">
                <Icon size={18} strokeWidth={2.2} />
              </div>
              <div className="citizen-summary-details">
                <span className="citizen-summary-value">
                  {loading ? '—' : c.value}
                </span>
                <span className="citizen-summary-label">{c.label}</span>
                <span className="citizen-summary-sub">{c.sub}</span>
              </div>
            </div>
            <ChevronRight size={15} strokeWidth={2} className="citizen-summary-chevron" aria-hidden="true" />
          </div>
        );
      })}
    </section>
  );
}

