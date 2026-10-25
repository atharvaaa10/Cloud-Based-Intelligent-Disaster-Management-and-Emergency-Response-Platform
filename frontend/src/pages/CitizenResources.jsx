import { useState, useEffect, useCallback, useRef } from "react";
import {
  Building2, Heart, Package, Phone, MapPin, Navigation2, Search,
  LocateFixed, AlertCircle, RefreshCw, ChevronRight, Wifi, WifiOff,
  Users, PhoneCall, Shield, Flame, Ambulance, HeartPulse, Siren, Info,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const TABS = [
  { key: "all",           label: "All resources",  icon: Shield },
  { key: "shelter",       label: "Shelters",        icon: Building2 },
  { key: "hospital",      label: "Hospitals",       icon: Heart },
  { key: "relief_supply", label: "Relief supply",   icon: Package },
];

const INDIA_HELPLINES = [
  { name: "National Emergency",         number: "112",   icon: Siren,      color: "#ef4444", desc: "Police / Fire / Ambulance – unified" },
  { name: "Ambulance",                  number: "108",   icon: Ambulance,  color: "#f97316", desc: "Free emergency ambulance service" },
  { name: "Police",                     number: "100",   icon: Shield,     color: "#3b82f6", desc: "Law enforcement emergency" },
  { name: "Fire Brigade",               number: "101",   icon: Flame,      color: "#ef4444", desc: "Fire rescue & hazmat" },
  { name: "Disaster Management (NDRF)", number: "1078",  icon: HeartPulse, color: "#8b5cf6", desc: "National Disaster Response Force" },
  { name: "Women Helpline",             number: "1091",  icon: PhoneCall,  color: "#ec4899", desc: "Emergency for women in distress" },
  { name: "Child Helpline",             number: "1098",  icon: PhoneCall,  color: "#14b8a6", desc: "Childline India Foundation" },
  { name: "Senior Citizen Helpline",    number: "14567", icon: Phone,      color: "#a3a3a3", desc: "Elder care & emergency support" },
];

const TYPE_META = {
  shelter:       { label: "Shelter",       icon: Building2, color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  hospital:      { label: "Hospital",      icon: Heart,     color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  relief_supply: { label: "Relief Supply", icon: Package,   color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(km) {
  if (km == null) return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function SkeletonCard() {
  return (
    <div className="resource-card resource-skeleton" aria-hidden="true">
      <div className="sk-row"><div className="sk-circle" /><div className="sk-lines"><div className="sk-line sk-w60" /><div className="sk-line sk-w40" /></div></div>
      <div className="sk-line sk-w80" style={{marginTop:10}} />
      <div className="sk-row" style={{marginTop:12,gap:8}}><div className="sk-btn" /><div className="sk-btn" /><div className="sk-btn" /></div>
    </div>
  );
}

function ResourceCard({ place, userLocation }) {
  const meta = TYPE_META[place.type] || TYPE_META.shelter;
  const Icon = meta.icon;
  const dist = userLocation && place.latitude && place.longitude
    ? haversine(userLocation.lat, userLocation.lon, place.latitude, place.longitude) : null;
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}&zoom=16`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`;
  return (
    <div className={`resource-card ${place.available ? "available" : "unavailable"}`}>
      <div className="rc-header">
        <div className="rc-icon-wrap" style={{background: meta.bg}}>
          <Icon size={18} color={meta.color} strokeWidth={1.8} />
        </div>
        <div className="rc-title-block">
          <h3 className="rc-name">{place.name}</h3>
          <span className="rc-type-badge" style={{color: meta.color, background: meta.bg}}>{meta.label}</span>
        </div>
        <div className={`avail-badge ${place.available ? "avail-open" : "avail-closed"}`}>
          {place.available ? <><Wifi size={10} strokeWidth={2} /> Available</> : <><WifiOff size={10} strokeWidth={2} /> Unavailable</>}
        </div>
      </div>
      <p className="rc-address"><MapPin size={12} strokeWidth={2} style={{flexShrink:0}} /><span>{place.address}</span></p>
      {place.type === "shelter" && place.capacity > 0 && (
        <div className="rc-capacity"><Users size={12} strokeWidth={2} /><span>Capacity: <strong>{place.capacity.toLocaleString()}</strong> people</span></div>
      )}
      {dist != null && (
        <div className="rc-distance"><Navigation2 size={11} strokeWidth={2} /><span>{formatDist(dist)} away</span></div>
      )}
      <div className="rc-actions">
        {place.contact && (
          <a href={`tel:${place.contact.replace(/\s+/g,"")}`} className="rc-btn rc-btn-call" title={`Call ${place.name}`}>
            <Phone size={12} strokeWidth={2} /><span>{place.contact}</span>
          </a>
        )}
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="rc-btn rc-btn-map">
          <MapPin size={12} strokeWidth={2} /><span>Show on map</span>
        </a>
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="rc-btn rc-btn-dir">
          <Navigation2 size={12} strokeWidth={2} /><span>Directions</span>
        </a>
      </div>
    </div>
  );
}

function HelplineCard({ line }) {
  const Icon = line.icon;
  return (
    <a href={`tel:${line.number}`} className="helpline-card" title={`Call ${line.name}: ${line.number}`}>
      <div className="helpline-icon" style={{background:`${line.color}1a`, color: line.color}}>
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <div className="helpline-info">
        <span className="helpline-name">{line.name}</span>
        <span className="helpline-desc">{line.desc}</span>
      </div>
      <div className="helpline-number" style={{color: line.color}}>
        {line.number}<ChevronRight size={14} style={{opacity:0.6}} />
      </div>
    </a>
  );
}

export default function CitizenResources() {
  const { token } = useAuth();
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [nearestFirst, setNearestFirst] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(null);
  const searchRef = useRef(null);

  const fetchPlaces = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (activeTab !== "all") params.set("type", activeTab);
      if (availableOnly) params.set("available_only", "true");
      const res = await fetch(`/places?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      setPlaces(await res.json());
    } catch (e) { setError(e.message || "Could not load resources."); }
    finally { setLoading(false); }
  }, [activeTab, availableOnly, token]);

  useEffect(() => { fetchPlaces(); }, [fetchPlaces]);

  const locateMe = () => {
    if (!navigator.geolocation) { setLocError("Geolocation not supported by your browser."); return; }
    setLocating(true); setLocError(null);
    navigator.geolocation.getCurrentPosition(
      pos => { setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setNearestFirst(true); setLocating(false); },
      err => { const msgs={1:"Location access denied.",2:"Location unavailable.",3:"Request timed out."}; setLocError(msgs[err.code]||"Could not determine location."); setLocating(false); },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const filtered = places
    .filter(p => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q) || (p.contact&&p.contact.toLowerCase().includes(q));
    })
    .map(p => ({ ...p, _dist: userLocation && p.latitude && p.longitude ? haversine(userLocation.lat, userLocation.lon, p.latitude, p.longitude) : null }))
    .sort((a,b) => nearestFirst && a._dist!=null && b._dist!=null ? a._dist-b._dist : a.name.localeCompare(b.name));

  const counts = { all: places.length, shelter: places.filter(p=>p.type==="shelter").length, hospital: places.filter(p=>p.type==="hospital").length, relief_supply: places.filter(p=>p.type==="relief_supply").length };

  return (
    <div className="citizen-resources-page">
      <div className="resources-page-header">
        <div>
          <h1 className="page-heading">Emergency Resources</h1>
          <p className="page-subheading">Shelters, hospitals and relief supply centres near you</p>
        </div>
        <button id="resources-locate-btn" className={`ui-btn ui-btn-outline ui-btn-sm locate-btn ${locating?"loading":""}`} onClick={locateMe} disabled={locating}>
          {locating ? <span className="ui-spinner" style={{width:13,height:13}} /> : <LocateFixed size={13} strokeWidth={2} />}
          <span>{userLocation ? "Location set" : "Use my location"}</span>
        </button>
      </div>

      {locError && (
        <div className="loc-error-banner">
          <AlertCircle size={14} strokeWidth={2} />
          <span>{locError}</span>
          <button onClick={()=>setLocError(null)} className="loc-error-close">✕</button>
        </div>
      )}

      {userLocation && (
        <div className="loc-status-banner">
          <Navigation2 size={13} strokeWidth={2} />
          <span>Sorting by distance from your location</span>
          <button className="loc-clear-btn" onClick={()=>{setUserLocation(null);setNearestFirst(false);}}>Clear</button>
        </div>
      )}

      <div className="resources-tabs" role="tablist">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} id={`resources-tab-${tab.key}`} role="tab" aria-selected={activeTab===tab.key} className={`resources-tab ${activeTab===tab.key?"active":""}`} onClick={()=>setActiveTab(tab.key)}>
              <Icon size={14} strokeWidth={1.8} />
              <span>{tab.label}</span>
              {counts[tab.key]>0 && <span className="tab-count">{counts[tab.key]}</span>}
            </button>
          );
        })}
      </div>

      <div className="resources-toolbar">
        <div className="resources-search-wrap">
          <Search size={14} strokeWidth={2} className="search-icon" />
          <input ref={searchRef} id="resources-search" type="search" placeholder="Search by name, address or phone…" value={search} onChange={e=>setSearch(e.target.value)} className="resources-search" aria-label="Search resources" />
          {search && <button className="search-clear" onClick={()=>setSearch("")} aria-label="Clear search">✕</button>}
        </div>
        <div className="resources-filters">
          <label className="filter-toggle" htmlFor="filter-available">
            <input id="filter-available" type="checkbox" checked={availableOnly} onChange={e=>setAvailableOnly(e.target.checked)} />
            <span>Available only</span>
          </label>
          <label className="filter-toggle" htmlFor="filter-nearest">
            <input id="filter-nearest" type="checkbox" checked={nearestFirst} onChange={e=>{ if(e.target.checked&&!userLocation) locateMe(); else setNearestFirst(e.target.checked); }} />
            <span>Nearest first</span>
          </label>
          <button id="resources-refresh-btn" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={fetchPlaces} title="Refresh" disabled={loading}>
            <RefreshCw size={13} strokeWidth={2} className={loading?"spin":""} />
          </button>
        </div>
      </div>

      <div className="resources-grid" role="tabpanel">
        {loading ? Array.from({length:6}).map((_,i)=><SkeletonCard key={i} />) :
         error ? (
          <div className="resources-error-state">
            <AlertCircle size={40} strokeWidth={1.4} color="var(--status-critical)" />
            <h3>Could not load resources</h3>
            <p>{error}</p>
            <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={fetchPlaces}><RefreshCw size={13} strokeWidth={2} /> Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="resources-empty-state">
            <div className="empty-icon">
              {activeTab==="shelter" ? <Building2 size={40} strokeWidth={1.2} /> : activeTab==="hospital" ? <Heart size={40} strokeWidth={1.2} /> : activeTab==="relief_supply" ? <Package size={40} strokeWidth={1.2} /> : <Shield size={40} strokeWidth={1.2} />}
            </div>
            <h3>No resources found</h3>
            <p>{search ? `No results for "${search}".` : availableOnly ? 'No available resources right now.' : 'No resources in this category.'}</p>
            {(search||availableOnly) && <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={()=>{setSearch("");setAvailableOnly(false);}}>Clear filters</button>}
          </div>
        ) : filtered.map(place => <ResourceCard key={place.id} place={place} userLocation={userLocation} />)}
      </div>

      {!loading && !error && filtered.length > 0 && (
        <p className="results-count">Showing <strong>{filtered.length}</strong> {filtered.length===1?"resource":"resources"}{search&&` matching "${search}"`}</p>
      )}

      <section className="helplines-section" aria-labelledby="helplines-heading">
        <div className="helplines-header">
          <div>
            <h2 id="helplines-heading" className="helplines-title">
              <PhoneCall size={18} strokeWidth={1.8} style={{color:"var(--accent-primary)"}} />
              Emergency Helplines — India
            </h2>
            <p className="helplines-subtitle">Tap any card to call immediately. Official government helplines, available 24/7.</p>
          </div>
          <div className="helplines-note"><Info size={13} strokeWidth={2} /><span>Free calls from any network</span></div>
        </div>
        <div className="helplines-grid">
          {INDIA_HELPLINES.map(line => <HelplineCard key={line.number} line={line} />)}
        </div>
      </section>
    </div>
  );
}
