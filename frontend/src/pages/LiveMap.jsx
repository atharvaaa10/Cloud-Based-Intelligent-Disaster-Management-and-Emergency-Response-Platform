import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import {
  MapPin,
  Search,
  Filter,
  Layers,
  Compass,
  AlertTriangle,
  LifeBuoy,
  HeartPulse,
  Utensils,
  Home,
  HelpCircle,
  Users,
  Phone,
  ExternalLink,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  X,
  List,
  Map as MapIcon,
  RotateCcw,
  CheckCircle2,
  Clock,
  Eye,
  Info,
  Building,
  Activity,
  Layers2,
  HelpCircle as LegendIcon,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  EmptyState,
  SkeletonStatCard,
  formatRelativeTime,
} from '../components/ui';

// ── Haversine Distance Formula (km) ────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// ── Constants & Category Config ────────────────────────────────
const CATEGORIES = [
  { id: '', label: 'All Categories', icon: Filter },
  { id: 'rescue', label: 'Rescue', icon: LifeBuoy, color: '#3b82f6' },
  { id: 'medical', label: 'Medical', icon: HeartPulse, color: '#ef4444' },
  { id: 'food_water', label: 'Food & Water', icon: Utensils, color: '#f59e0b' },
  { id: 'shelter', label: 'Shelter', icon: Home, color: '#8b5cf6' },
  { id: 'other', label: 'Other', icon: HelpCircle, color: '#64748b' },
];

const CATEGORY_COLORS = {
  rescue: '#3b82f6',
  medical: '#ef4444',
  food_water: '#f59e0b',
  shelter: '#8b5cf6',
  other: '#64748b',
};

const CATEGORY_ICONS = {
  rescue: LifeBuoy,
  medical: HeartPulse,
  food_water: Utensils,
  shelter: Home,
  other: HelpCircle,
};

const PRIORITY_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#10b981',
  pending: '#64748b',
};

// ── Dynamic Tile Servers (OpenStreetMap for Street & Dark with CSS filter; Esri for Satellite) ──
const TILE_SERVERS = {
  street: {
    name: 'Street',
    url: import.meta.env.VITE_TILE_STREET_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      attribution: import.meta.env.VITE_TILE_STREET_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  dark: {
    name: 'Dark',
    url: import.meta.env.VITE_TILE_DARK_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      attribution: import.meta.env.VITE_TILE_DARK_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  satellite: {
    name: 'Satellite',
    url: import.meta.env.VITE_TILE_SATELLITE_URL || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: {
      maxZoom: 19,
      attribution: import.meta.env.VITE_TILE_SATELLITE_ATTRIBUTION || 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    },
  },
};


const ITEMS_PER_PAGE = 6;

export default function LiveMap() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const toast = useToast();

  const isCitizen = user?.role === 'citizen';

  // ── Data State ────────────────────────────────────────────────
  const [publicData, setPublicData] = useState({
    incidents: [],
    places: [],
    affected_zones: [],
  });
  const [myIncidents, setMyIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState(false);
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'

  // ── Filter State ──────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [page, setPage] = useState(1);

  // ── Map Display & Layer State ─────────────────────────────────
  // Automatically follow theme toggle: dark in dark theme, street in light theme
  const [tileType, setTileType] = useState(() => (theme === 'dark' ? 'dark' : 'street'));
  const [userOverrodeTile, setUserOverrodeTile] = useState(false);

  useEffect(() => {
    if (!userOverrodeTile) {
      setTileType(theme === 'dark' ? 'dark' : 'street');
    }
  }, [theme, userOverrodeTile]);

  const [layers, setLayers] = useState({
    myIncidents: true,
    publicIncidents: true,
    shelters: true,
    hospitals: true,
    relief: true,
    zones: true,
  });
  const [showLegend, setShowLegend] = useState(true);

  // ── Selection & GPS State ─────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState(null); // incident, place, or zone
  const [selectedType, setSelectedType] = useState(null); // 'own' | 'public' | 'place' | 'zone'
  const [userLocation, setUserLocation] = useState(null); // { lat, lon }
  const [locating, setLocating] = useState(false);

  // Leaflet references
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const clusterGroupRef = useRef(null);
  const zonesGroupRef = useRef(null);
  const userMarkerRef = useRef(null);
  const markersByItemKeyRef = useRef(new Map());
  const initialFitDoneRef = useRef(false);

  // ── Fetch Map & Incident Data ─────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const pubRes = await api.get('/map/public');
      setPublicData(pubRes || { incidents: [], places: [], affected_zones: [] });

      if (user) {
        try {
          const mineRes = await api.get('/incidents/mine');
          const list = Array.isArray(mineRes) ? mineRes : mineRes?.items || [];
          setMyIncidents(list);
        } catch (e) {
          console.warn('[MAP] Could not fetch user own incidents:', e);
          setMyIncidents([]);
        }
      }
    } catch (err) {
      console.error('[MAP] Error loading map data:', err);
      toast.error('Failed to load map data. Showing fallback list.');
      setMapError(true);
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Unified Filtered Incidents ────────────────────────────────
  const myIncidentIds = useMemo(() => new Set(myIncidents.map((i) => i.id)), [myIncidents]);

  const allIncidents = useMemo(() => {
    const list = [];
    myIncidents.forEach((inc) => {
      list.push({
        ...inc,
        isOwn: true,
        displayLat: inc.latitude,
        displayLon: inc.longitude,
        displayArea: inc.location_text || inc.address || 'Reported Location',
      });
    });

    publicData.incidents.forEach((inc) => {
      if (!myIncidentIds.has(inc.id)) {
        list.push({
          ...inc,
          isOwn: false,
          displayLat: inc.approx_latitude,
          displayLon: inc.approx_longitude,
          displayArea: inc.general_area || 'Pune Metro Area',
        });
      }
    });

    return list;
  }, [myIncidents, publicData.incidents, myIncidentIds]);

  const filteredIncidents = useMemo(() => {
    return allIncidents.filter((item) => {
      if (selectedCategory && item.category !== selectedCategory) return false;
      if (selectedPriority && item.priority !== selectedPriority) return false;
      if (selectedStatus && item.status !== selectedStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const code = (item.public_code || '').toLowerCase();
        const area = (item.displayArea || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        if (!code.includes(q) && !area.includes(q) && !cat.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [allIncidents, selectedCategory, selectedPriority, selectedStatus, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredIncidents.length / ITEMS_PER_PAGE));
  const paginatedIncidents = useMemo(() => {
    const offset = (page - 1) * ITEMS_PER_PAGE;
    return filteredIncidents.slice(offset, offset + ITEMS_PER_PAGE);
  }, [filteredIncidents, page]);

  // Separate Counts
  const publicIncidentCount = useMemo(() => {
    return filteredIncidents.filter((i) => !i.isOwn).length;
  }, [filteredIncidents]);

  const myReportCount = useMemo(() => {
    return filteredIncidents.filter((i) => i.isOwn).length;
  }, [filteredIncidents]);

  // ── Stat Card Calculations ────────────────────────────────────
  const stats = useMemo(() => {
    const totalVisible = filteredIncidents.length;
    const activeEmergencies = filteredIncidents.filter((i) =>
      ['reported', 'under_review', 'assigned', 'in_progress'].includes(i.status)
    ).length;

    const totalPeopleAffected = filteredIncidents.reduce((sum, item) => {
      const p = item.people_affected || item.people_affected_approx || 0;
      return sum + p;
    }, 0);

    const openShelters = (publicData.places || []).filter(
      (p) => p.type === 'shelter' && p.available
    ).length;

    return {
      total: totalVisible,
      active: activeEmergencies,
      peopleAffected: totalPeopleAffected,
      openShelters,
    };
  }, [filteredIncidents, publicData.places]);

  // ── Nearby Resources within 5 km ──────────────────────────────
  const referenceCoords = useMemo(() => {
    if (selectedItem) {
      if (selectedItem.displayLat != null && selectedItem.displayLon != null) {
        return { lat: selectedItem.displayLat, lon: selectedItem.displayLon };
      }
      if (selectedItem.latitude != null && selectedItem.longitude != null) {
        return { lat: selectedItem.latitude, lon: selectedItem.longitude };
      }
    }
    if (userLocation) return userLocation;
    return { lat: 18.5204, lon: 73.8567 }; // Central Pune fallback
  }, [selectedItem, userLocation]);

  const nearbyResources5km = useMemo(() => {
    if (!referenceCoords || !publicData.places) return [];
    const withDist = publicData.places.map((place) => {
      const dist = haversineKm(
        referenceCoords.lat,
        referenceCoords.lon,
        place.latitude,
        place.longitude
      );
      return { ...place, distance_km: dist };
    });

    const within5 = withDist.filter((p) => p.distance_km != null && p.distance_km <= 5.0);
    within5.sort((a, b) => a.distance_km - b.distance_km);
    if (within5.length > 0) return within5.slice(0, 6);

    withDist.sort((a, b) => a.distance_km - b.distance_km);
    return withDist.slice(0, 3);
  }, [referenceCoords, publicData.places]);

  // ── Initialize Leaflet Map ────────────────────────────────────
  useEffect(() => {
    if (viewMode !== 'map') return;
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    try {
      const map = L.map(mapContainerRef.current, {
        center: [18.5304, 73.8367],
        zoom: 12,
        zoomControl: false, // Moved to bottom-right below
      });

      // Bottom-right zoom control
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Base tile layer
      const serverConfig = TILE_SERVERS[tileType] || TILE_SERVERS.street;
      const tileLayer = L.tileLayer(serverConfig.url, serverConfig.options).addTo(map);
      tileLayerRef.current = tileLayer;

      // Apply initial filter class if starting in dark mode
      if (tileType === 'dark' && mapContainerRef.current) {
        mapContainerRef.current.classList.add('leaflet-tile-dark-mode');
      }


      // Group for hazard zones
      zonesGroupRef.current = L.layerGroup().addTo(map);

      // Marker Cluster Group
      const clusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 40,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 16,
      });
      map.addLayer(clusterGroup);
      clusterGroupRef.current = clusterGroup;

      mapInstanceRef.current = map;
    } catch (err) {
      console.error('[LEAFLET_INIT_ERROR]', err);
      setMapError(true);
      setViewMode('list');
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [viewMode]);

  // ── Update Tile Layer on Toggle & Apply CSS Filter ─────────────
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }
    const serverConfig = TILE_SERVERS[tileType] || TILE_SERVERS.street;
    tileLayerRef.current = L.tileLayer(serverConfig.url, serverConfig.options).addTo(
      mapInstanceRef.current
    );

    // Apply dark filter class to map container ONLY when Dark tile is active
    if (mapContainerRef.current) {
      if (tileType === 'dark') {
        mapContainerRef.current.classList.add('leaflet-tile-dark-mode');
      } else {
        mapContainerRef.current.classList.remove('leaflet-tile-dark-mode');
      }
    }
  }, [tileType]);


  // ── Render Affected Zones ─────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !zonesGroupRef.current) return;
    zonesGroupRef.current.clearLayers();

    if (!layers.zones) return;

    (publicData.affected_zones || []).forEach((zone) => {
      const color =
        zone.severity === 'critical'
          ? '#ef4444'
          : zone.severity === 'high'
          ? '#f97316'
          : '#3b82f6';

      const circle = L.circle([zone.center_latitude, zone.center_longitude], {
        radius: zone.radius_meters || 1500,
        color,
        fillColor: color,
        fillOpacity: 0.18,
        weight: 2,
        dashArray: '6, 6',
      });

      circle.bindTooltip(
        `<div style="font-weight:700; font-size:12px;">⚠️ ${zone.name}</div>
         <div style="font-size:11px; color:#cbd5e1;">Severity: ${zone.severity.toUpperCase()}</div>`,
        { sticky: true }
      );

      circle.on('click', () => {
        setSelectedItem(zone);
        setSelectedType('zone');
      });

      zonesGroupRef.current.addLayer(circle);
    });
  }, [publicData.affected_zones, layers.zones]);

  // ── Render Markers with Clustering ────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !clusterGroupRef.current) return;
    clusterGroupRef.current.clearLayers();
    markersByItemKeyRef.current.clear();

    const boundsPoints = [];

    // 1. Incidents (Own & Public)
    filteredIncidents.forEach((inc) => {
      const isOwn = inc.isOwn;
      if (isOwn && !layers.myIncidents) return;
      if (!isOwn && !layers.publicIncidents) return;

      const lat = inc.displayLat;
      const lon = inc.displayLon;
      if (lat == null || lon == null) return;
      boundsPoints.push([lat, lon]);

      const isSelected = selectedItem?.id === inc.id;
      const catColor = CATEGORY_COLORS[inc.category] || '#64748b';
      const prioColor = PRIORITY_COLORS[inc.priority] || '#64748b';

      const size = isOwn ? 34 : 28;
      const htmlContent = `
        <div class="custom-leaflet-marker ${isSelected ? 'is-marker-selected' : ''}" style="
          width: ${size}px;
          height: ${size}px;
          background: ${catColor};
          border: 3px solid ${prioColor};
          position: relative;
        ">
          ${isOwn ? '<span class="marker-own-star">★</span>' : ''}
          <div style="width: 8px; height: 8px; background: #ffffff; border-radius: 50%;"></div>
        </div>
      `;

      const icon = L.divIcon({
        className: 'incident-div-icon',
        html: htmlContent,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([lat, lon], { icon });

      const popupHtml = `
        <div style="font-family: inherit; font-size: 12px; color: #0f172a; min-width: 180px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
            <strong style="color: ${catColor};">${inc.public_code}</strong>
            <span style="font-size: 10px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${inc.status}</span>
          </div>
          <div><strong>Area:</strong> ${inc.displayArea}</div>
          <div><strong>Category:</strong> ${inc.category}</div>
          ${isOwn ? '<div style="color: #d97706; font-weight: 700; margin-top: 4px;">★ Your Emergency Report</div>' : '<div style="color: #64748b; font-size: 11px;">Approximate ~500m public location</div>'}
        </div>
      `;
      marker.bindPopup(popupHtml);

      marker.on('click', () => {
        setSelectedItem(inc);
        setSelectedType(isOwn ? 'own' : 'public');
      });

      const itemKey = `${isOwn ? 'own' : 'pub'}-${inc.id}`;
      markersByItemKeyRef.current.set(itemKey, marker);
      clusterGroupRef.current.addLayer(marker);
    });

    // 2. Places (Shelters, Hospitals, Relief Supplies)
    (publicData.places || []).forEach((place) => {
      const isShelter = place.type === 'shelter';
      const isHospital = place.type === 'hospital';
      const isRelief = place.type === 'relief_supply';

      if (isShelter && !layers.shelters) return;
      if (isHospital && !layers.hospitals) return;
      if (isRelief && !layers.relief) return;

      boundsPoints.push([place.latitude, place.longitude]);

      const isSelected = selectedItem?.id === place.id;
      const bg = isShelter ? '#8b5cf6' : isHospital ? '#ef4444' : '#10b981';
      const iconChar = isShelter ? '🏠' : isHospital ? '🏥' : '📦';
      const size = 30;

      const htmlContent = `
        <div class="custom-leaflet-marker ${isSelected ? 'is-marker-selected' : ''}" style="
          width: ${size}px;
          height: ${size}px;
          background: ${bg};
          border: 2px solid #ffffff;
          font-size: 14px;
          color: #ffffff;
        ">
          ${iconChar}
        </div>
      `;

      const icon = L.divIcon({
        className: 'place-div-icon',
        html: htmlContent,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([place.latitude, place.longitude], { icon });

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; color: #0f172a; min-width: 190px;">
          <div style="font-weight: 700; margin-bottom: 4px;">${place.name}</div>
          <div style="color: #64748b; font-size: 11px;">${place.address}</div>
          <div style="margin-top: 4px;"><strong>Capacity:</strong> ${place.capacity}</div>
          ${place.contact ? `<div style="margin-top: 4px;"><a href="tel:${place.contact}" style="color: #2563eb; font-weight: 600;">Call: ${place.contact}</a></div>` : ''}
        </div>
      `);

      marker.on('click', () => {
        setSelectedItem(place);
        setSelectedType('place');
      });

      markersByItemKeyRef.current.set(`place-${place.id}`, marker);
      clusterGroupRef.current.addLayer(marker);
    });

    // fitBounds on initial load with visible points
    if (!initialFitDoneRef.current && boundsPoints.length > 0 && mapInstanceRef.current) {
      initialFitDoneRef.current = true;
      try {
        const bounds = L.latLngBounds(boundsPoints);
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      } catch (err) {
        console.warn('[FIT_BOUNDS_ERROR]', err);
      }
    }
  }, [filteredIncidents, publicData.places, layers, selectedItem?.id]);

  // ── Focus Map on Incident Click from List ──────────────────────
  const handleSelectIncident = (item) => {
    setSelectedItem(item);
    setSelectedType(item.isOwn ? 'own' : 'public');

    if (mapInstanceRef.current && item.displayLat != null && item.displayLon != null) {
      mapInstanceRef.current.flyTo([item.displayLat, item.displayLon], 15, {
        duration: 1.0,
      });

      const itemKey = `${item.isOwn ? 'own' : 'pub'}-${item.id}`;
      const marker = markersByItemKeyRef.current.get(itemKey);
      if (marker && clusterGroupRef.current) {
        // Zoom into cluster if parent is clustered
        clusterGroupRef.current.zoomToShowLayer(marker, () => {
          marker.openPopup();
        });
      }
    }
  };

  // ── "Locate Me" Browser Geolocation ───────────────────────────
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setUserLocation({ lat, lon });

        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([lat, lon], 14, { duration: 1.2 });

          if (userMarkerRef.current) {
            mapInstanceRef.current.removeLayer(userMarkerRef.current);
          }

          const pulseIcon = L.divIcon({
            className: 'user-gps-icon',
            html: '<div class="gps-pulse-marker" title="Your live location"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });

          userMarkerRef.current = L.marker([lat, lon], { icon: pulseIcon })
            .addTo(mapInstanceRef.current)
            .bindPopup('<strong>📍 You are here</strong>')
            .openPopup();
        }

        toast.success('Centered map on your current location.');
      },
      (err) => {
        setLocating(false);
        console.warn('[GEO_ERR]', err);
        toast.error('Location permission was denied. Defaulting to Pune city center.');
      },
      { timeout: 8000 }
    );
  };

  const toggleLayer = (layerKey) => {
    setLayers((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  return (
    <div className="live-map-wrapper">
      {/* ── 1. Top Stat Cards ── */}
      <section className="live-map-stats-grid" aria-label="Live map incident statistics">
        {loading ? (
          <>
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </>
        ) : (
          <>
            <div className="ui-stat-card ui-stat-default" id="stat-visible-incidents">
              <div className="ui-stat-header">
                <span className="ui-stat-label">Total Incidents</span>
                <MapPin size={16} strokeWidth={1.8} className="ui-stat-icon" />
              </div>
              <div className="ui-stat-value">{stats.total}</div>
              <div className="ui-stat-meta">In selected area &bull; Active filters</div>
            </div>

            <div className="ui-stat-card ui-stat-critical" id="stat-active-emergencies">
              <div className="ui-stat-header">
                <span className="ui-stat-label">Active Emergencies</span>
                <AlertTriangle size={16} strokeWidth={1.8} className="ui-stat-icon" style={{ color: 'var(--critical-default)' }} />
              </div>
              <div className="ui-stat-value">{stats.active}</div>
              <div className="ui-stat-meta">In response &bull; Evacuations active</div>
            </div>

            <div className="ui-stat-card ui-stat-warning" id="stat-people-affected">
              <div className="ui-stat-header">
                <span className="ui-stat-label">People in Need</span>
                <Users size={16} strokeWidth={1.8} className="ui-stat-icon" style={{ color: 'var(--warning-default)' }} />
              </div>
              <div className="ui-stat-value">{stats.peopleAffected}</div>
              <div className="ui-stat-meta">Estimated, from public reports</div>
            </div>

            <div className="ui-stat-card ui-stat-success" id="stat-open-shelters">
              <div className="ui-stat-header">
                <span className="ui-stat-label">Open Shelters</span>
                <Home size={16} strokeWidth={1.8} className="ui-stat-icon" style={{ color: 'var(--success-default)' }} />
              </div>
              <div className="ui-stat-value">{stats.openShelters}</div>
              <div className="ui-stat-meta">Refuge centers with available beds</div>
            </div>
          </>
        )}
      </section>

      {/* ── 2. Filters & Actions Toolbar ── */}
      <div className="live-map-toolbar">
        {/* Left Filter Controls */}
        <div className="map-filter-group">
          {/* Search Input */}
          <div style={{ position: 'relative', width: 220 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search code, area..."
              className="ui-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              style={{ paddingLeft: 30, height: 32, fontSize: 'var(--text-xs)' }}
              id="map-search-input"
            />
          </div>

          {/* Priority Dropdown */}
          <select
            className="ui-select"
            value={selectedPriority}
            onChange={(e) => {
              setSelectedPriority(e.target.value);
              setPage(1);
            }}
            style={{ width: 130, height: 32, fontSize: 'var(--text-xs)' }}
            id="map-priority-filter"
          >
            <option value="">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Status Dropdown */}
          <select
            className="ui-select"
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            style={{ width: 140, height: 32, fontSize: 'var(--text-xs)' }}
            id="map-status-filter"
          >
            <option value="">All Statuses</option>
            <option value="reported">Reported</option>
            <option value="under_review">Under Review</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        {/* Right Toolbar: Locate Me, Tile Toggle, Map/List View Mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLocateMe}
            disabled={locating}
            id="btn-locate-me"
            title="Focus map to my current location"
            style={{ height: 32, fontSize: 'var(--text-xs)' }}
          >
            <Compass size={13} className={locating ? 'animate-spin' : ''} />
            <span>{locating ? 'Locating...' : 'Locate Me'}</span>
          </Button>

          {/* Tile Toggle (Dark, Satellite, Street) */}
          {viewMode === 'map' && (
            <div className="ui-btn-group" style={{ display: 'inline-flex' }}>
              <button
                type="button"
                className={`ui-btn ui-btn-sm ${tileType === 'street' ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
                style={{ height: 32, fontSize: 'var(--text-xs)', padding: '0 8px' }}
                onClick={() => {
                  setTileType('street');
                  setUserOverrodeTile(true);
                }}
                title="OpenStreetMap Standard"
              >
                Street
              </button>
              <button
                type="button"
                className={`ui-btn ui-btn-sm ${tileType === 'dark' ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
                style={{ height: 32, fontSize: 'var(--text-xs)', padding: '0 8px' }}
                onClick={() => {
                  setTileType('dark');
                  setUserOverrodeTile(true);
                }}
                title="Dark Map (OpenStreetMap with Dark Filter)"
              >
                Dark
              </button>

              <button
                type="button"
                className={`ui-btn ui-btn-sm ${tileType === 'satellite' ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
                style={{ height: 32, fontSize: 'var(--text-xs)', padding: '0 8px' }}
                onClick={() => {
                  setTileType('satellite');
                  setUserOverrodeTile(true);
                }}
                title="Esri World Imagery"
              >
                Satellite
              </button>
            </div>
          )}

          {/* Map View vs List View Mode Toggle */}
          <div className="ui-btn-group" style={{ display: 'inline-flex' }}>
            <button
              type="button"
              className={`ui-btn ui-btn-sm ${viewMode === 'map' ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
              style={{ height: 32, fontSize: 'var(--text-xs)', padding: '0 8px' }}
              onClick={() => {
                setMapError(false);
                setViewMode('map');
              }}
              title="Live Map view"
              id="btn-view-map"
            >
              <MapIcon size={13} />
              <span>Map</span>
            </button>
            <button
              type="button"
              className={`ui-btn ui-btn-sm ${viewMode === 'list' ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
              style={{ height: 32, fontSize: 'var(--text-xs)', padding: '0 8px' }}
              onClick={() => setViewMode('list')}
              title="Fallback / Tabular List view"
              id="btn-view-list"
            >
              <List size={13} />
              <span>List</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 3. Category Filter Chips Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id || 'all'}
              type="button"
              className={`category-chip-btn ${isActive ? 'active' : ''}`}
              onClick={() => {
                setSelectedCategory(cat.id);
                setPage(1);
              }}
              id={`cat-chip-${cat.id || 'all'}`}
            >
              <Icon size={13} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── 4. Main View: Map Mode OR Fallback List Mode ── */}
      {viewMode === 'map' && !mapError ? (
        <div className="live-map-main-area">
          {/* Left Panel: Filtered Incidents List with Pagination */}
          <aside className="map-left-list-panel" aria-label="Incident directory">
            <div className="map-left-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                  Public incidents ({publicIncidentCount})
                </span>
                {myReportCount > 0 && (
                  <span
                    className="ui-badge"
                    style={{ background: '#f59e0b', color: '#000', fontSize: 10, padding: '1px 6px', fontWeight: 700 }}
                  >
                    My Reports ({myReportCount})
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Page {page} of {totalPages}
              </span>
            </div>

            <div className="map-incident-scroll">
              {filteredIncidents.length === 0 ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: 'var(--text-xs)' }}>No incidents match active filters.</p>
                </div>
              ) : (
                paginatedIncidents.map((item) => {
                  const CatIcon = CATEGORY_ICONS[item.category] || HelpCircle;
                  const isSelected = selectedItem?.id === item.id;
                  const dist = userLocation
                    ? haversineKm(userLocation.lat, userLocation.lon, item.displayLat, item.displayLon)
                    : null;

                  return (
                    <div
                      key={`${item.isOwn ? 'own' : 'pub'}-${item.id}`}
                      className={`map-incident-card ${isSelected ? 'is-selected' : ''} ${item.isOwn ? 'is-own' : ''}`}
                      onClick={() => handleSelectIncident(item)}
                      role="button"
                      tabIndex={0}
                      id={`list-card-${item.public_code}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                            {item.public_code}
                          </span>
                          {item.isOwn && (
                            <span
                              className="ui-badge"
                              style={{ background: '#f59e0b', color: '#000', fontSize: 9, padding: '1px 5px', fontWeight: 800 }}
                            >
                              MY REPORT
                            </span>
                          )}
                        </div>

                        <span
                          className={`ui-badge ui-badge-prio-${item.priority || 'pending'}`}
                          style={{ fontSize: 10, padding: '1px 6px' }}
                        >
                          {item.priority || 'pending'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        <CatIcon size={12} style={{ color: CATEGORY_COLORS[item.category] }} />
                        <span style={{ textTransform: 'capitalize' }}>{item.category?.replace('_', ' ')}</span>
                        <span>&bull;</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>
                          {item.displayArea}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', paddingTop: 2 }}>
                        <span>{formatRelativeTime(item.created_at)}</span>
                        {userLocation ? (
                          dist != null ? <span>~{dist} km away</span> : null
                        ) : (
                          <span style={{ fontSize: 10, fontStyle: 'italic', color: 'var(--text-tertiary)' }}>
                            Enable location to see distance
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="map-pagination-footer">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                >
                  <ChevronLeft size={13} /> Prev
                </Button>
                <span>
                  {page} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                >
                  Next <ChevronRight size={13} />
                </Button>
              </div>
            )}
          </aside>

          {/* Center Map Viewport */}
          <main className="map-viewport-container" aria-label="Interactive map representation">
            <div ref={mapContainerRef} className="leaflet-map-root" />

            {/* Floating Layer Toggles Pill Menu */}
            <div className="map-floating-layers">
              <span
                className={`map-layer-pill ${layers.myIncidents ? 'active' : ''}`}
                onClick={() => toggleLayer('myIncidents')}
                role="button"
                tabIndex={0}
                title="Toggle your reported incidents"
              >
                ★ My Incident ({myIncidents.length})
              </span>
              <span
                className={`map-layer-pill ${layers.publicIncidents ? 'active' : ''}`}
                onClick={() => toggleLayer('publicIncidents')}
                role="button"
                tabIndex={0}
                title="Toggle approximate public markers"
              >
                Public Incident ({publicData.incidents.length})
              </span>
              <span
                className={`map-layer-pill ${layers.shelters ? 'active' : ''}`}
                onClick={() => toggleLayer('shelters')}
                role="button"
                tabIndex={0}
                title="Toggle emergency relief shelters"
              >
                🏠 Shelter
              </span>
              <span
                className={`map-layer-pill ${layers.hospitals ? 'active' : ''}`}
                onClick={() => toggleLayer('hospitals')}
                role="button"
                tabIndex={0}
                title="Toggle trauma hospitals"
              >
                🏥 Hospital
              </span>
              <span
                className={`map-layer-pill ${layers.relief ? 'active' : ''}`}
                onClick={() => toggleLayer('relief')}
                role="button"
                tabIndex={0}
                title="Toggle relief supply depots"
              >
                📦 Relief Depot
              </span>
              <span
                className={`map-layer-pill ${layers.zones ? 'active' : ''}`}
                onClick={() => toggleLayer('zones')}
                role="button"
                tabIndex={0}
                title="Toggle hazard & flood zones"
              >
                ⚠️ Flood Zone
              </span>
            </div>

            {/* Floating Collapsible Legend (Bottom-Left) */}
            {showLegend ? (
              <div className="map-floating-legend" role="region" aria-label="Map legend">
                <div className="legend-header">
                  <span className="legend-title">Map Legend</span>
                  <button
                    type="button"
                    onClick={() => setShowLegend(false)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                    title="Collapse legend"
                    aria-label="Collapse map legend"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="legend-item-row">
                  <div className="legend-dot" style={{ background: '#f59e0b', border: '2px solid #ffffff' }}>
                    ★
                  </div>
                  <span>My Incident (Full detail)</span>
                </div>
                <div className="legend-item-row">
                  <div className="legend-dot" style={{ background: '#3b82f6', border: '2px solid #ef4444' }} />
                  <span>Public Incident (~500m area)</span>
                </div>
                <div className="legend-item-row">
                  <div className="legend-dot" style={{ background: '#8b5cf6', color: '#fff' }}>
                    🏠
                  </div>
                  <span>Shelter</span>
                </div>
                <div className="legend-item-row">
                  <div className="legend-dot" style={{ background: '#ef4444', color: '#fff' }}>
                    🏥
                  </div>
                  <span>Hospital</span>
                </div>
                <div className="legend-item-row">
                  <div className="legend-dot" style={{ background: '#10b981', color: '#fff' }}>
                    📦
                  </div>
                  <span>Relief Depot</span>
                </div>
                <div className="legend-item-row">
                  <div className="legend-dot" style={{ background: 'rgba(239, 68, 68, 0.4)', border: '1px dashed #ef4444' }}>
                    ⚠️
                  </div>
                  <span>Flood Zone</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="map-floating-legend-toggle"
                onClick={() => setShowLegend(true)}
                title="Show Map Legend"
                aria-label="Open map legend"
              >
                <LegendIcon size={14} />
                <span>Legend</span>
              </button>
            )}
          </main>

          {/* Right Panel: Selected Item Detail & Nearby Resources */}
          {selectedItem && (
            <aside className="map-right-panel" aria-label="Selected item details">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                    {selectedType === 'place'
                      ? selectedItem.name
                      : selectedType === 'zone'
                      ? `⚠️ ${selectedItem.name}`
                      : `${selectedItem.public_code}`}
                  </span>
                  {selectedType === 'own' && (
                    <span className="ui-badge" style={{ background: '#f59e0b', color: '#000', fontSize: 9, fontWeight: 800 }}>
                      YOUR REPORT
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className="map-panel-close-btn"
                  onClick={() => setSelectedItem(null)}
                  title="Close panel"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Citizen Rule: OWN Incident gets FULL Details & Photo */}
              {selectedType === 'own' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {selectedItem.photo_key && (
                    <div style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-default)', maxHeight: 180 }}>
                      <img
                        src={`/uploads/${selectedItem.photo_key}`}
                        alt="Incident photographic attachment"
                        style={{ width: '100%', height: 180, objectFit: 'cover' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Description</span>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', marginTop: 2, lineHeight: 1.5 }}>
                      {selectedItem.description}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 'var(--text-xs)' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Category</span>
                      <div style={{ fontWeight: 600 }}>{selectedItem.category}</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Priority</span>
                      <div>
                        <span className={`ui-badge ui-badge-prio-${selectedItem.priority}`}>
                          {selectedItem.priority}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Status</span>
                      <div>
                        <span className={`ui-badge ui-badge-status-${selectedItem.status}`}>
                          {selectedItem.status}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>People Affected</span>
                      <div style={{ fontWeight: 600 }}>{selectedItem.people_affected || 'N/A'}</div>
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Exact Location</span>
                    <div style={{ fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 2 }}>
                      <MapPin size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>{selectedItem.address || selectedItem.location_text}</span>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate(`/citizen/requests?search=${selectedItem.public_code}`)}
                    id="btn-view-own-incident-full"
                    style={{ marginTop: 4 }}
                  >
                    <Eye size={13} />
                    <span>View full details & status history</span>
                  </Button>
                </div>
              )}

              {/* Citizen Rule: Other Incidents appear ONLY as Approximate Public Markers */}
              {selectedType === 'public' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div className="ui-alert ui-alert-info" style={{ fontSize: 11, padding: '8px 12px' }}>
                    <Info size={14} style={{ flexShrink: 0 }} />
                    <span>
                      Civic Privacy Protected: Coordinates are rounded to ~500m. Description and civilian reporter identity are restricted.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 'var(--text-xs)' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Category</span>
                      <div style={{ fontWeight: 600 }}>{selectedItem.category}</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Priority</span>
                      <div>
                        <span className={`ui-badge ui-badge-prio-${selectedItem.priority}`}>
                          {selectedItem.priority}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Status</span>
                      <div>
                        <span className={`ui-badge ui-badge-status-${selectedItem.status}`}>
                          {selectedItem.status}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Reported</span>
                      <div style={{ fontWeight: 600 }}>{formatRelativeTime(selectedItem.created_at)}</div>
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>General Area</span>
                    <div style={{ fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <MapPin size={13} />
                      <span>{selectedItem.displayArea}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Place Detail */}
              {selectedType === 'place' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Facility Address</span>
                    <p style={{ marginTop: 2 }}>{selectedItem.address}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Capacity</span>
                    <p style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: '#10b981' }}>
                      {selectedItem.capacity} individuals / beds
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {selectedItem.contact && (
                      <a
                        href={`tel:${selectedItem.contact}`}
                        className="ui-btn ui-btn-primary ui-btn-sm"
                        style={{ flex: 1, textDecoration: 'none', justifyContent: 'center' }}
                      >
                        <Phone size={12} /> Call Facility
                      </a>
                    )}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selectedItem.latitude},${selectedItem.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ui-btn ui-btn-secondary ui-btn-sm"
                      style={{ flex: 1, textDecoration: 'none', justifyContent: 'center' }}
                    >
                      <ExternalLink size={12} /> Google Maps
                    </a>
                  </div>
                </div>
              )}

              {/* Affected Zone Detail */}
              {selectedType === 'zone' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                  <p style={{ lineHeight: 1.5 }}>{selectedItem.description}</p>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Evacuation Radius</span>
                    <div style={{ fontWeight: 600 }}>{selectedItem.radius_meters} meters from epicenter</div>
                  </div>
                </div>
              )}

              {/* ── Nearby Resources within 5 km ── */}
              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 'var(--space-3)' }}>
                <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 var(--space-2)' }}>
                  <Building size={14} className="text-accent" />
                  <span>Nearby Resources (within 5 km)</span>
                </h4>

                {nearbyResources5km.length === 0 ? (
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>No resources found in 5 km perimeter.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {nearbyResources5km.map((res) => (
                      <div
                        key={res.id}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-subdued)',
                          background: 'var(--bg-surface-subdued)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 11,
                        }}
                      >
                        <div style={{ overflow: 'hidden', paddingRight: 6 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {res.name}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                            {res.type.replace('_', ' ')} &bull; Cap: {res.capacity}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <span className="ui-badge" style={{ fontSize: 10, padding: '1px 5px' }}>
                            {res.distance_km} km
                          </span>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${res.latitude},${res.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--text-secondary)' }}
                            title="Directions"
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      ) : (
        /* ── Fallback List View ── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', background: 'var(--bg-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 700 }}>
                Incident Directory (Fallback View)
              </h3>
              <small style={{ color: 'var(--text-muted)' }}>
                Showing {filteredIncidents.length} incidents across Pune disaster response grid
              </small>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMapError(false);
                setViewMode('map');
              }}
            >
              <MapIcon size={14} /> Back to Live Map
            </Button>
          </div>

          <div className="ui-table-container">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Public Code</th>
                  <th>Category</th>
                  <th>General Area</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>People Affected</th>
                  <th>Reported Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.map((item) => (
                  <tr key={`${item.isOwn ? 'own' : 'pub'}-${item.id}`}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {item.public_code}
                      {item.isOwn && (
                        <span className="ui-badge" style={{ background: '#f59e0b', color: '#000', fontSize: 9, marginLeft: 6, fontWeight: 800 }}>
                          MY REPORT
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="ui-badge" style={{ textTransform: 'capitalize' }}>
                        {item.category?.replace('_', ' ')}
                      </span>
                    </td>
                    <td>{item.displayArea}</td>
                    <td>
                      <span className={`ui-badge ui-badge-prio-${item.priority}`}>
                        {item.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`ui-badge ui-badge-status-${item.status}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>{item.people_affected || 'N/A'}</td>
                    <td>{formatRelativeTime(item.created_at)}</td>
                    <td>
                      {item.isOwn ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/citizen/requests?search=${item.public_code}`)}
                        >
                          <Eye size={13} /> View Detail
                        </Button>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Public Marker</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
