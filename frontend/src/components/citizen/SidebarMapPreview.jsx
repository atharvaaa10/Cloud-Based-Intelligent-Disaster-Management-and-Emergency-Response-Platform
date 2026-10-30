import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Map as MapIcon, ArrowRight } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import AppTileLayer from '../map/AppTileLayer';

// Key Pune incident locations with dark rounded badge markers matching LiveMap
const PREVIEW_LOCATIONS = [
  { id: 'aundh-alert', name: 'Aundh', lat: 18.558, lon: 73.807, type: 'rescue', color: '#F04438' },
  { id: 'aundh-shelter', name: 'Aundh', lat: 18.562, lon: 73.815, type: 'shelter', color: '#34D399' },
  { id: 'viman-shelter', name: 'Viman Nagar', lat: 18.567, lon: 73.914, type: 'shelter', color: '#34D399' },
  { id: 'viman-supplies', name: 'Viman Nagar', lat: 18.562, lon: 73.922, type: 'supplies', color: '#A855F7' },
  { id: 'hinj-flooding', name: 'Hinjawadi', lat: 18.591, lon: 73.738, type: 'flooding', color: '#F59E0B' },
  { id: 'kothrud-med', name: 'Kothrud', lat: 18.507, lon: 73.807, type: 'medical', color: '#01AEFD' },
  { id: 'katraj-alert', name: 'Katraj', lat: 18.448, lon: 73.858, type: 'rescue', color: '#F04438' },
];

export default function SidebarMapPreview() {
  const navigate = useNavigate();
  const mapContainerRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstance) return;

    try {
      const map = L.map(mapContainerRef.current, {
        center: [18.5204, 73.8567], // Pune City Center
        zoom: 11,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
      });

      // Markers use dark rounded badges matching LiveMap design system
      PREVIEW_LOCATIONS.forEach((loc) => {
        let symbolHtml = '';
        if (loc.type === 'rescue') {
          symbolHtml = `<span style="color:#F04438;font-size:12px;font-weight:700;">!</span>`;
        } else if (loc.type === 'flooding') {
          symbolHtml = `<span style="color:#F59E0B;font-size:12px;font-weight:700;">~</span>`;
        } else if (loc.type === 'medical') {
          symbolHtml = `<span style="color:#01AEFD;font-size:13px;font-weight:700;">+</span>`;
        } else if (loc.type === 'shelter') {
          symbolHtml = `<span style="color:#34D399;font-size:12px;">&#8962;</span>`;
        } else if (loc.type === 'supplies') {
          symbolHtml = `<span style="color:#A855F7;font-size:11px;">&#9633;</span>`;
        }

        const customIcon = L.divIcon({
          html: `<div style="width:24px;height:24px;background:#0B1016;border:2px solid ${loc.color};border-radius:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.6);">${symbolHtml}</div>`,
          className: 'citizen-preview-custom-icon',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        L.marker([loc.lat, loc.lon], { icon: customIcon }).addTo(map);
      });

      // City Center label
      const puneLabelIcon = L.divIcon({
        html: `<div style="color:#FFFFFF;font-weight:700;font-size:14px;letter-spacing:-0.01em;text-shadow:0 2px 4px #000;pointer-events:none;">Pune</div>`,
        className: 'citizen-preview-center-label',
        iconSize: [50, 20],
        iconAnchor: [25, 10],
      });
      L.marker([18.5204, 73.8567], { icon: puneLabelIcon }).addTo(map);

      setMapInstance(map);
    } catch (e) {
      console.warn('[MAP_PREVIEW] Leaflet init fallback:', e);
    }

    return () => {
      if (mapInstance) {
        mapInstance.remove();
        setMapInstance(null);
      }
    };
  }, []);

  return (
    <section className="citizen-sidebar-card" aria-label="Live Incident Map preview">
      <div className="citizen-sidebar-map-header">
        <span className="citizen-section-title" style={{ whiteSpace: 'nowrap' }}>
          <MapIcon size={15} strokeWidth={2.2} style={{ color: '#01AEFD' }} aria-hidden="true" />
          Live Incident Map
        </span>

        <Link to="/citizen/map" className="citizen-section-link" style={{ whiteSpace: 'nowrap' }}>
          <span>View full map</span>
          <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      <div
        className="citizen-map-preview-wrap"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/citizen/map')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate('/citizen/map');
          }
        }}
        aria-label="Interactive map preview. Click to open full live map."
      >
        <div ref={mapContainerRef} className="citizen-map-leaflet-container">
          {mapInstance && <AppTileLayer map={mapInstance} tileType="map" />}
        </div>

        {/* Fallback overlay labels for high-contrast visibility */}
        <div className="citizen-map-label" style={{ top: '34%', left: '16%' }}>Hinjwadi</div>
        <div className="citizen-map-label" style={{ top: '24%', left: '46%' }}>Aundh</div>
        <div className="citizen-map-label" style={{ top: '15%', left: '74%' }}>Viman Nagar</div>
        <div className="citizen-map-label" style={{ top: '56%', left: '38%' }}>Kothrud</div>
        <div className="citizen-map-label" style={{ top: '68%', left: '62%' }}>Katraj</div>
      </div>
    </section>
  );
}
