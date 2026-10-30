import { Link } from 'react-router-dom';
import { Shield, Umbrella, Car, Cross, Home, ArrowRight } from 'lucide-react';

export default function SafetyInfoCards() {
  const cards = [
    {
      id: 'rain',
      title: 'During Heavy Rain',
      desc: 'Avoid low-lying areas and stay indoors.',
      icon: Umbrella,
      tileClass: 'cyan',
    },
    {
      id: 'travel',
      title: 'While Travelling',
      desc: 'Avoid flooded roads and follow official updates.',
      icon: Car,
      tileClass: 'blue',
    },
    {
      id: 'medical',
      title: 'Medical Emergency',
      desc: 'Provide accurate location and number of people affected.',
      icon: Cross,
      tileClass: 'teal',
    },
    {
      id: 'shelter',
      title: 'Need Shelter?',
      desc: 'Check nearby shelter locations on the live map.',
      icon: Home,
      tileClass: 'green',
    },
  ];

  return (
    <section className="citizen-safety-card" aria-label="Emergency Safety Information">
      <div className="citizen-section-header">
        <div className="citizen-section-title-wrap">
          <span className="citizen-section-title">
            <Shield size={15} strokeWidth={2.2} style={{ color: '#01AEFD' }} aria-hidden="true" />
            Emergency Safety Information
          </span>
          <span className="citizen-section-sub">Stay safe and follow these guidelines</span>
        </div>

        <Link to="/citizen/resources" className="citizen-section-link">
          <span>View all tips</span>
          <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      <div className="citizen-safety-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.id} className="citizen-safety-item">
              <div className={`citizen-safety-icon-tile ${card.tileClass}`} aria-hidden="true">
                <Icon size={16} strokeWidth={2.2} />
              </div>
              <div className="citizen-safety-content">
                <span className="citizen-safety-title">{card.title}</span>
                <span className="citizen-safety-desc">{card.desc}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

