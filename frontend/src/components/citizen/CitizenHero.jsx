import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import heroRescueImg from '../../assets/hero_rescue.png';

export default function CitizenHero({ user }) {
  const navigate = useNavigate();
  const firstName = user?.name ? user.name.split(' ')[0] : 'Bhavik';

  return (
    <section className="citizen-hero-card" aria-label="Welcome and emergency action">
      <div className="citizen-hero-left">
        <h1 className="citizen-hero-title">
          Welcome back, <span className="citizen-hero-name">{firstName}!</span>
        </h1>
        <p className="citizen-hero-desc">
          Stay informed, report emergencies, and track the status of your requests. Together we can build a safer community.
        </p>
        <button
          type="button"
          className="citizen-hero-btn"
          onClick={() => navigate('/citizen/report')}
          aria-label="Report a new emergency"
          id="btn-report-emergency-hero"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>Report Emergency</span>
        </button>
      </div>

      <div className="citizen-hero-right" aria-hidden="true">
        <img
          src={heroRescueImg}
          alt="Together for a Safer Tomorrow - Emergency Response"
          className="citizen-hero-image"
          onError={(e) => {
            // Elegant fallback if image asset is unavailable
            e.currentTarget.style.display = 'none';
          }}
        />
      </div>
    </section>
  );
}
