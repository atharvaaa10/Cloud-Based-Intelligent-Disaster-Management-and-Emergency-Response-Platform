import { Phone, ChevronRight } from 'lucide-react';

export default function SidebarImmediateHelp() {
  return (
    <section className="citizen-help-card" aria-label="Immediate Emergency Contact">
      <div className="citizen-section-header" style={{ marginBottom: 4 }}>
        <span className="citizen-section-title">
          <Phone size={15} strokeWidth={2.2} style={{ color: '#01AEFD' }} aria-hidden="true" />
          Need Immediate Help?
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: '#8997A5', margin: '0 0 10px 0', lineHeight: 1.4 }}>
        In a real emergency, please contact your local authorities:
      </p>

      <a
        href="tel:112"
        className="citizen-help-box"
        aria-label="Call 112 National Emergency Helpline India"
        title="Direct call to Emergency Services"
      >
        <div className="citizen-help-left">
          <div className="citizen-help-icon-wrap" aria-hidden="true">
            <Phone size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div className="citizen-help-number">112</div>
            <div className="citizen-help-sub">Emergency Services (India)</div>
          </div>
        </div>
        <ChevronRight size={18} strokeWidth={2.2} className="citizen-help-chevron" aria-hidden="true" />
      </a>

      <p className="citizen-help-disclaimer">
        Disclaimer: Submitting a request records it in the municipal coordination system. For life-threatening emergencies, dial 112 directly.
      </p>
    </section>
  );
}

