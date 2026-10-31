import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { renderToString } from 'react-dom/server';
import { useNavigate, useLocation } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import {
  MapPin,
  Search,
  Filter,
  Compass,
  AlertTriangle,
  LifeBuoy,
  HeartPulse,
  Home,
  HelpCircle,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
  Package,
  Truck,
  Layers,
  Waves,
  Flame,
  Shield,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  EmptyState,
  SkeletonStatCard,
  GlobalStatRow,
  ErrorBoundary,
  formatRelativeTime,
} from '../components/ui';

import MapLegend from '../components/map/MapLegend';
import IncidentCard from '../components/map/IncidentCard';
import DetailPanel from '../components/map/DetailPanel';
import NearbyResources from '../components/map/NearbyResources';
import AppTileLayer from '../components/map/AppTileLayer';
import AssignTeamModal from '../components/admin/AssignTeamModal';

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

// ── Fallback Pune Demo Data (Used ONLY if citizen API returns empty) ────
const DEMO_PUNE_TEAMS = [
  { id: 901, name: 'Rescue Team Alpha', approx_latitude: 18.5284, approx_longitude: 73.8465, status: 'busy', isDemo: true },
  { id: 902, name: 'Medical Response Bravo', approx_latitude: 18.5520, approx_longitude: 73.8010, status: 'busy', isDemo: true },
  { id: 903, name: 'Disaster Relief Charlie', approx_latitude: 18.5080, approx_longitude: 73.8290, status: 'available', isDemo: true },
];

const DEMO_PUNE_DEPOTS = [
  { id: 801, type: 'relief_supply', name: 'Kothrud Relief Depot', latitude: 18.5020, longitude: 73.8150, capacity: 500, available: true, isDemo: true },
  { id: 802, type: 'relief_supply', name: 'Baner Emergency Stockpile', latitude: 18.5590, longitude: 73.7860, capacity: 250, available: true, isDemo: true },
];

// ── Category Icon & Color Mappings ─────────────────────────────
const CATEGORY_ICONS = {
  rescue: AlertTriangle,
  waterlogging: Waves,
  flood: Waves,
  medical: HeartPulse,
  food_water: Users,
  shelter: Home,
  other: AlertTriangle,
};

const CATEGORY_COLORS = {
  rescue: '#F04438',
  waterlogging: '#F59E0B',
  flood: '#F59E0B',
  medical: '#00BFFF',
  food_water: '#F59E0B',
  shelter: '#22C55E',
  other: '#01AEFD',
};

// ── Priority Colors for Admin Map ──────────────────────────────
const PRIORITY_COLORS = {
  critical: '#F04438',
  high: '#F59E0B',
  medium: '#FACC15',
  low: '#01AEFD',
};

const ITEMS_PER_PAGE = 6;

export default function LiveMap({ adminMode: propAdminMode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const isAdminMode = propAdminMode !== undefined
    ? propAdminMode
    : (location.pathname.startsWith('/admin') || (user?.role === 'admin' && location.pathname.includes('/admin')));

  // ── Data State ────────────────────────────────────────────────
  const [publicData, setPublicData] = useState({
    incidents: [],
    places: [],
    affected_zones: [],
    teams: [],
  });
  const [myIncidents, setMyIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // ── Filter State ──────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [page, setPage] = useState(1);

  // ── Map Display & Layer State ─────────────────────────────────
  const [tileType, setTileType] = useState('map'); // 'map' | 'satellite'

  const [layers, setLayers] = useState({
    incidents: true,
    shelters: true,
    hospitals: true,
    teams: true,
    supplies: true,
    zones: true,
  });
  const [showLegend, setShowLegend] = useState(true);
  const [showLayersDropdown, setShowLayersDropdown] = useState(false);

  // ── Selection & GPS State ─────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState(null); // incident, place, team, or zone
  const [selectedType, setSelectedType] = useState(null); // 'own' | 'public' | 'place' | 'zone' | 'team'
  const [userLocation, setUserLocation] = useState(null); // { lat, lon }
  const [locating, setLocating] = useState(false);

  // ── Assign Team Modal State (Admin) ───────────────────────────
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignIncidentId, setAssignIncidentId] = useState(null);
  const [assignIncidentCode, setAssignIncidentCode] = useState(null);

  // Responsive Drawer & Mobile View State
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState('map'); // 'map' | 'list'

  // Leaflet references
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const clusterGroupRef = useRef(null);
  const zonesGroupRef = useRef(null);
  const markersByItemKeyRef = useRef(new Map());

  // ── Track Whether Demo Data is Actively Shown (Citizen only) ──
  const isUsingDemoTeams = useMemo(() => {
    return (!isAdminMode && (!publicData.teams || publicData.teams.length === 0));
  }, [publicData.teams, isAdminMode]);

  const activeTeams = useMemo(() => {
    if (publicData.teams && publicData.teams.length > 0) return publicData.teams;
    return isAdminMode ? [] : DEMO_PUNE_TEAMS;
  }, [publicData.teams, isAdminMode]);

  const activePlaces = useMemo(() => {
    const list = [...(publicData.places || [])];
    if (!isAdminMode) {
      const hasSupply = list.some((p) => p.type === 'relief_supply');
      if (!hasSupply) {
        list.push(...DEMO_PUNE_DEPOTS);
      }
    }
    return list;
  }, [publicData.places, isAdminMode]);

  // ── Fetch Map & Incident Data ─────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isAdminMode) {
        // Admin-only endpoint with exact coordinates and full details
        const params = new URLSearchParams();
        if (selectedCategory) params.set('category', selectedCategory);
        if (selectedPriority) params.set('priority', selectedPriority);
        if (selectedStatus) params.set('status', selectedStatus);

        const qs = params.toString();
        const res = await api.get(`/admin/map${qs ? '?' + qs : ''}`);

        setPublicData({
          incidents: Array.isArray(res?.incidents) ? res.incidents : [],
          places: Array.isArray(res?.places) ? res.places : [],
          affected_zones: Array.isArray(res?.affected_zones) ? res.affected_zones : [],
          teams: Array.isArray(res?.response_teams) ? res.response_teams : [],
        });
        setMyIncidents([]);
      } else {
        // Public citizen endpoint
        const pubRes = await api.get('/map/public');
        setPublicData({
          incidents: Array.isArray(pubRes?.incidents) ? pubRes.incidents : [],
          places: Array.isArray(pubRes?.places) ? pubRes.places : [],
          affected_zones: Array.isArray(pubRes?.affected_zones) ? pubRes.affected_zones : [],
          teams: Array.isArray(pubRes?.teams) ? pubRes.teams : [],
        });

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
      }

      const now = new Date();
      setLastUpdated(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    } catch (err) {
      console.error('[MAP] Error loading map data:', err);
      setError(err.message || 'Failed to load live map data.');
      toast.error(err.message || 'Failed to load live map data.');
    } finally {
      setLoading(false);
    }
  }, [isAdminMode, selectedCategory, selectedPriority, selectedStatus, user, toast]);

  useEffect(() => {
    fetchData();
    // Poll every 30 seconds for real-time updates
    const pollInterval = setInterval(fetchData, 30000);
    return () => clearInterval(pollInterval);
  }, [fetchData]);

  // ── Unified Incidents ─────────────────────────────────────────
  const myIncidentIds = useMemo(() => new Set((myIncidents || []).map((i) => i.id)), [myIncidents]);

  const allIncidents = useMemo(() => {
    if (isAdminMode) {
      // Admin sees exact coordinates and complete info
      return (publicData?.incidents || []).map((inc) => {
        const lat = typeof inc.latitude === 'number' ? inc.latitude : parseFloat(inc.latitude);
        const lon = typeof inc.longitude === 'number' ? inc.longitude : parseFloat(inc.longitude);
        return {
          ...inc,
          isOwn: false,
          displayLat: !isNaN(lat) ? lat : null,
          displayLon: !isNaN(lon) ? lon : null,
          displayArea: inc.address || inc.location_text || 'Exact Pune Coordinates',
          headline: inc.description || `${(inc.category || 'Incident').replace(/_/g, ' ')} emergency`,
        };
      });
    }

    const list = [];
    (myIncidents || []).forEach((inc) => {
      const lat = typeof inc.latitude === 'number' ? inc.latitude : parseFloat(inc.latitude);
      const lon = typeof inc.longitude === 'number' ? inc.longitude : parseFloat(inc.longitude);
      list.push({
        ...inc,
        isOwn: true,
        displayLat: !isNaN(lat) ? lat : null,
        displayLon: !isNaN(lon) ? lon : null,
        displayArea: inc.location_text || inc.address || 'Reported Location',
        headline: inc.title || inc.description || 'Emergency incident',
      });
    });

    (publicData?.incidents || []).forEach((inc) => {
      if (!myIncidentIds.has(inc.id)) {
        const lat = typeof inc.approx_latitude === 'number' ? inc.approx_latitude : parseFloat(inc.approx_latitude);
        const lon = typeof inc.approx_longitude === 'number' ? inc.approx_longitude : parseFloat(inc.approx_longitude);
        list.push({
          ...inc,
          isOwn: false,
          displayLat: !isNaN(lat) ? lat : null,
          displayLon: !isNaN(lon) ? lon : null,
          displayArea: inc.general_area || 'Pune Metro Area',
          headline: `${(inc.category || 'Incident').replace('_', ' ')} emergency`,
        });
      }
    });

    return list;
  }, [isAdminMode, publicData?.incidents, myIncidents, myIncidentIds]);

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
        const title = (item.headline || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        if (!code.includes(q) && !area.includes(q) && !cat.includes(q) && !title.includes(q) && !desc.includes(q)) {
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

  // Set default selected incident on load if none selected
  useEffect(() => {
    if (!selectedItem && filteredIncidents.length > 0) {
      setSelectedItem(filteredIncidents[0]);
      setSelectedType(filteredIncidents[0].isOwn ? 'own' : 'public');
    }
  }, [filteredIncidents, selectedItem]);

  // ── Nearby Resources within 5 km ──────────────────────────────
  const referenceCoords = useMemo(() => {
    if (selectedItem?.displayLat != null && selectedItem?.displayLon != null) {
      return { lat: selectedItem.displayLat, lon: selectedItem.displayLon };
    }
    if (selectedItem?.latitude != null && selectedItem?.longitude != null) {
      return { lat: selectedItem.latitude, lon: selectedItem.longitude };
    }
    if (userLocation) return userLocation;
    return { lat: 18.5204, lon: 73.8567 }; // Central Pune fallback
  }, [selectedItem, userLocation]);

  const nearbyResources5km = useMemo(() => {
    if (!referenceCoords) return [];
    const pool = [
      ...activePlaces.map((p) => ({ ...p, kind: 'place' })),
      ...activeTeams.map((t) => ({
        ...t,
        type: 'team',
        latitude: t.latitude != null ? t.latitude : t.approx_latitude,
        longitude: t.longitude != null ? t.longitude : t.approx_longitude,
        kind: 'team',
      })),
    ];

    const withDist = pool
      .map((item) => {
        const dist = haversineKm(
          referenceCoords.lat,
          referenceCoords.lon,
          item.latitude,
          item.longitude
        );
        return { ...item, distance_km: dist };
      })
      .filter((item) => item.distance_km != null);

    withDist.sort((a, b) => a.distance_km - b.distance_km);

    const within5 = withDist.filter((p) => p.distance_km <= 5.0);
    if (within5.length > 0) return within5.slice(0, 5);
    return withDist.slice(0, 3);
  }, [referenceCoords, activePlaces, activeTeams]);

  // Distance from user to selected incident
  const incidentDistanceKm = useMemo(() => {
    if (!userLocation || !selectedItem) return null;
    const targetLat = selectedItem.displayLat ?? selectedItem.latitude;
    const targetLon = selectedItem.displayLon ?? selectedItem.longitude;
    if (targetLat == null || targetLon == null) return null;
    return haversineKm(userLocation.lat, userLocation.lon, targetLat, targetLon);
  }, [userLocation, selectedItem]);

  // ── Initialize Leaflet Map ────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    if (mapContainerRef.current._leaflet_id) {
      delete mapContainerRef.current._leaflet_id;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        center: [18.5204, 73.8567],
        zoom: 12,
        minZoom: 10,
        maxZoom: 18,
        zoomControl: false,
        attributionControl: true,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

      // Group for hazard zones
      zonesGroupRef.current = L.layerGroup().addTo(map);

      // Marker Cluster Group with custom dark cluster badge
      const clusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 38,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 16,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          return L.divIcon({
            html: `<div class="custom-cluster-badge"><span>${count}</span></div>`,
            className: 'custom-cluster-icon',
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });
        },
      });
      map.addLayer(clusterGroup);
      clusterGroupRef.current = clusterGroup;

      mapInstanceRef.current = map;
      setMapInstance(map);

      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 100);
    } catch (err) {
      console.error('[LEAFLET_INIT_ERROR]', err);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setMapInstance(null);
      }
    };
  }, []);

  // ── Render Affected Zones (Hazard Circles) ────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !zonesGroupRef.current) return;
    zonesGroupRef.current.clearLayers();

    if (!layers.zones) return;

    (publicData?.affected_zones || []).forEach((zone) => {
      const zLat = typeof zone.center_latitude === 'number' ? zone.center_latitude : parseFloat(zone.center_latitude);
      const zLon = typeof zone.center_longitude === 'number' ? zone.center_longitude : parseFloat(zone.center_longitude);
      if (isNaN(zLat) || isNaN(zLon) || zLat == null || zLon == null) return;

      const circle = L.circle([zLat, zLon], {
        radius: zone.radius_meters || 1600,
        color: '#F04438',
        fillColor: '#F04438',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6, 6',
      });

      circle.bindPopup(`
        <div class="zone-popup-card">
          <span class="zone-popup-title">${zone.name}</span>
          <span class="zone-popup-desc">${zone.description || ''}</span>
          <span class="zone-popup-radius">Radius: ${((zone.radius_meters || 1600) / 1000).toFixed(1)} km</span>
        </div>
      `, {
        className: 'custom-dark-popup',
      });

      circle.on('click', () => {
        setSelectedItem({
          ...zone,
          displayLat: zLat,
          displayLon: zLon,
          displayArea: 'Pune Affected Basin',
          headline: zone.name,
          priority: zone.severity || 'high',
        });
        setSelectedType('zone');
      });

      zonesGroupRef.current.addLayer(circle);
    });
  }, [publicData?.affected_zones, layers.zones]);

  // ── Render Markers with Clustering ────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !clusterGroupRef.current) return;
    clusterGroupRef.current.clearLayers();
    markersByItemKeyRef.current.clear();

    const boundsPoints = [];

    // 1. Incidents (Colored by PRIORITY for Admin, or CATEGORY for Citizen)
    if (layers.incidents) {
      filteredIncidents.forEach((inc) => {
        const isOwn = inc.isOwn;
        const lat = inc.displayLat;
        const lon = inc.displayLon;
        if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return;
        boundsPoints.push([lat, lon]);

        const isSelected = selectedItem?.id === inc.id;
        const isCritical = inc.priority === 'critical';

        // Admin: colored by priority; Citizen: colored by category
        const prioColor = PRIORITY_COLORS[inc.priority?.toLowerCase()] || '#01AEFD';
        const catColor = CATEGORY_COLORS[inc.category] || '#01AEFD';
        const markerColor = isAdminMode ? prioColor : catColor;

        const CatIcon = CATEGORY_ICONS[inc.category] || AlertTriangle;

        const svgIconStr = renderToString(
          <CatIcon size={18} strokeWidth={2.2} color={markerColor} />
        );

        const htmlContent = `
          <div class="custom-navy-marker ${isCritical ? 'is-critical-glow' : ''} ${isSelected ? 'is-marker-selected' : ''}" style="--marker-border-color: ${markerColor};">
            ${isOwn ? '<span class="marker-own-star">★</span>' : ''}
            ${svgIconStr}
          </div>
        `;

        const icon = L.divIcon({
          className: 'custom-navy-marker-wrap',
          html: htmlContent,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker([lat, lon], { icon });

        const displayTitle = inc.headline || `${(inc.category || 'Incident').replace('_', ' ').toUpperCase()} &bull; ${inc.displayArea}`;
        const displayId = inc.public_code || `#DR-${inc.id}`;
        const prioTag = isAdminMode && inc.priority
          ? `<span style="color: ${prioColor}; font-weight: 700; font-size: 10px; margin-left: 6px; text-transform: uppercase;">[${inc.priority}]</span>`
          : '';

        const popupHtml = `
          <div class="incident-popup-card">
            <div class="incident-popup-content">
              <span class="incident-popup-id">${displayId}${prioTag}</span>
              <span class="incident-popup-title" title="${displayTitle}">${displayTitle}</span>
            </div>
            <div class="incident-popup-chevron">&rsaquo;</div>
          </div>
        `;
        marker.bindPopup(popupHtml, {
          offset: [0, -22],
          closeButton: false,
          className: 'custom-dark-popup',
        });

        marker.on('click', () => {
          setSelectedItem(inc);
          setSelectedType(isOwn ? 'own' : 'public');
        });

        const itemKey = `${isOwn ? 'own' : 'pub'}-${inc.id}`;
        markersByItemKeyRef.current.set(itemKey, marker);
        clusterGroupRef.current.addLayer(marker);

        if (isSelected) {
          setTimeout(() => {
            if (marker && mapInstanceRef.current) {
              marker.openPopup();
            }
          }, 150);
        }
      });
    }

    // 2. Places (Shelters, Hospitals, Relief Supplies)
    activePlaces.forEach((place) => {
      const isShelter = place.type === 'shelter';
      const isHospital = place.type === 'hospital';
      const isRelief = place.type === 'relief_supply';

      if (isShelter && !layers.shelters) return;
      if (isHospital && !layers.hospitals) return;
      if (isRelief && !layers.supplies) return;

      const pLat = typeof place.latitude === 'number' ? place.latitude : parseFloat(place.latitude);
      const pLon = typeof place.longitude === 'number' ? place.longitude : parseFloat(place.longitude);
      if (isNaN(pLat) || isNaN(pLon) || pLat == null || pLon == null) return;

      boundsPoints.push([pLat, pLon]);

      const isSelected = selectedItem?.id === place.id;
      const borderColor = isHospital ? '#00BFFF' : isShelter ? '#22C55E' : '#A855F7';
      const PlaceIcon = isHospital ? HeartPulse : isShelter ? Home : Package;

      const svgIconStr = renderToString(
        <PlaceIcon size={18} strokeWidth={2.2} color={borderColor} />
      );

      const htmlContent = `
        <div class="custom-navy-marker ${isSelected ? 'is-marker-selected' : ''}" style="--marker-border-color: ${borderColor};">
          ${svgIconStr}
        </div>
      `;

      const icon = L.divIcon({
        className: 'custom-navy-marker-wrap',
        html: htmlContent,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([pLat, pLon], { icon });

      marker.bindPopup(`
        <div class="incident-popup-card">
          <div class="incident-popup-content">
            <span class="incident-popup-id">${place.type.replace('_', ' ').toUpperCase()}</span>
            <span class="incident-popup-title">${place.name}</span>
          </div>
          <div class="incident-popup-chevron">&rsaquo;</div>
        </div>
      `, {
        offset: [0, -22],
        closeButton: false,
        className: 'custom-dark-popup',
      });

      marker.on('click', () => {
        setSelectedItem(place);
        setSelectedType('place');
      });

      markersByItemKeyRef.current.set(`place-${place.id}`, marker);
      clusterGroupRef.current.addLayer(marker);
    });

    // 3. Response Teams (Truck Icon in Blue #0EA5FF)
    if (layers.teams) {
      activeTeams.forEach((team) => {
        const rawLat = team.latitude != null ? team.latitude : team.approx_latitude;
        const rawLon = team.longitude != null ? team.longitude : team.approx_longitude;
        const tLat = typeof rawLat === 'number' ? rawLat : parseFloat(rawLat);
        const tLon = typeof rawLon === 'number' ? rawLon : parseFloat(rawLon);
        if (isNaN(tLat) || isNaN(tLon) || tLat == null || tLon == null) return;

        boundsPoints.push([tLat, tLon]);

        const isSelected = selectedItem?.id === team.id;
        const borderColor = '#0EA5FF';

        const svgIconStr = renderToString(
          <Truck size={18} strokeWidth={2.2} color={borderColor} />
        );

        const htmlContent = `
          <div class="custom-navy-marker ${isSelected ? 'is-marker-selected' : ''}" style="--marker-border-color: ${borderColor};">
            ${svgIconStr}
          </div>
        `;

        const icon = L.divIcon({
          className: 'custom-navy-marker-wrap',
          html: htmlContent,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker([tLat, tLon], { icon });

        marker.bindPopup(`
          <div class="incident-popup-card">
            <div class="incident-popup-content">
              <span class="incident-popup-id">RESPONSE TEAM (${team.status || 'ACTIVE'})</span>
              <span class="incident-popup-title">${team.name}</span>
            </div>
            <div class="incident-popup-chevron">&rsaquo;</div>
          </div>
        `, {
          offset: [0, -22],
          closeButton: false,
          className: 'custom-dark-popup',
        });

        marker.on('click', () => {
          setSelectedItem(team);
          setSelectedType('team');
        });

        markersByItemKeyRef.current.set(`team-${team.id}`, marker);
        clusterGroupRef.current.addLayer(marker);
      });
    }
  }, [filteredIncidents, activePlaces, activeTeams, layers, selectedItem?.id, isAdminMode]);

  // ── Focus Map on Incident Click from List ──────────────────────
  const handleSelectIncident = (item) => {
    setSelectedItem(item);
    setSelectedType(item.isOwn ? 'own' : 'public');
    setLeftDrawerOpen(false);

    if (window.innerWidth <= 600) {
      setMobileTab('map');
    }

    if (mapInstanceRef.current && item.displayLat != null && item.displayLon != null) {
      mapInstanceRef.current.flyTo([item.displayLat, item.displayLon], 15, {
        duration: 1.0,
      });

      const itemKey = `${item.isOwn ? 'own' : 'pub'}-${item.id}`;
      const marker = markersByItemKeyRef.current.get(itemKey);
      if (marker && clusterGroupRef.current) {
        clusterGroupRef.current.zoomToShowLayer(marker, () => {
          marker.openPopup();
        });
        setTimeout(() => {
          marker.openPopup();
        }, 300);
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
        }
        toast.success('Centered on your GPS location.');
      },
      (err) => {
        setLocating(false);
        console.warn('Geolocation error:', err);
        toast.error('Could not acquire your current location.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const toggleLayer = (layerKey) => {
    setLayers((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  // ── Admin Action Handlers ─────────────────────────────────────
  const handleMarkResponding = async (incidentId) => {
    setActionLoading(true);
    try {
      await api.post(`/incidents/${incidentId}/respond`);
      toast.success('Incident marked as responding.');
      fetchData();
    } catch (err) {
      console.error('Mark responding error:', err);
      toast.error(err.message || 'Failed to mark incident as responding.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignTeam = (incidentId) => {
    const inc = allIncidents.find((i) => i.id === incidentId);
    setAssignIncidentId(incidentId);
    setAssignIncidentCode(inc?.public_code || `INC-${incidentId}`);
    setAssignModalOpen(true);
  };

  const handleTeamAssigned = () => {
    fetchData();
    toast.success('Response team successfully deployed and assigned.');
  };

  const resetFilters = () => {
    setSelectedCategory('');
    setSelectedPriority('');
    setSelectedStatus('');
    setSearchQuery('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    selectedCategory || selectedPriority || selectedStatus || searchQuery.trim()
  );

  return (
    <div className="live-map-wrapper">
      {/* ── 1. Top Stat Cards Row ── */}
      <ErrorBoundary title="Failed to load telemetry stats" compact>
        <GlobalStatRow
          userCoords={
            userLocation?.lat != null && userLocation?.lon != null
              ? { latitude: userLocation.lat, longitude: userLocation.lon }
              : null
          }
        />
      </ErrorBoundary>

      {/* Sync Error Banner if any */}
      {error && (
        <Card style={{ marginBottom: 12, padding: '10px 16px', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#EF4444', fontSize: 13 }}>
            <AlertTriangle size={16} />
            <span>Telemetry error: {error}</span>
          </div>
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={fetchData}>
            Retry
          </Button>
        </Card>
      )}

      {/* Mobile/Tablet Switcher */}
      <div className="map-view-switcher" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`ui-btn ui-btn-sm ${mobileTab === 'map' ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
            onClick={() => setMobileTab('map')}
            style={{ height: 32, fontSize: 'var(--text-xs)', padding: '0 12px' }}
            aria-label="Show map view"
          >
            <MapIcon size={13} />
            <span>Map</span>
          </button>
          <button
            type="button"
            className={`ui-btn ui-btn-sm ${mobileTab === 'list' ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
            onClick={() => setMobileTab('list')}
            style={{ height: 32, fontSize: 'var(--text-xs)', padding: '0 12px' }}
            aria-label="Show incidents list"
          >
            <List size={13} />
            <span>List ({filteredIncidents.length})</span>
          </button>
        </div>

        <button
          type="button"
          className="tablet-drawer-toggle-btn"
          onClick={() => setLeftDrawerOpen((prev) => !prev)}
          aria-label="Toggle Incidents List Drawer"
        >
          <List size={14} />
          <span>Directory ({filteredIncidents.length})</span>
        </button>
      </div>

      {/* ── 2. Main View: 3-Column Layout ── */}
      <div className="live-map-main-area">
        {/* Left Panel: Incidents Directory */}
        <aside
          className={`map-left-list-panel ${leftDrawerOpen ? 'drawer-open' : ''} ${mobileTab === 'list' ? 'mobile-visible' : ''}`}
          aria-label="Incidents Directory"
        >
          {/* Header Top */}
          <div className="map-left-header-top">
            <div className="map-left-title-row">
              <h2 className="map-left-title">{isAdminMode ? 'Operational Directory' : 'Incidents'}</h2>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                {isUsingDemoTeams && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#F59E0B',
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      padding: '1px 6px',
                      borderRadius: '9999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                    title="Showing demo response teams while offline"
                  >
                    <Info size={10} />
                    Demo data
                  </span>
                )}

                {lastUpdated && (
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} />
                    {lastUpdated}
                  </span>
                )}

                {leftDrawerOpen && (
                  <button
                    type="button"
                    onClick={() => setLeftDrawerOpen(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', marginLeft: 4 }}
                    aria-label="Close drawer"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="map-category-chips-scroll" role="tablist" aria-label="Category filter">
              {[
                { id: '', label: 'All' },
                { id: 'rescue', label: 'Rescue' },
                { id: 'medical', label: 'Medical' },
                { id: 'food_water', label: 'Food & Water' },
                { id: 'shelter', label: 'Shelter' },
                { id: 'other', label: 'More' },
              ].map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id || 'all'}
                    type="button"
                    className={`category-chip-pill ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setPage(1);
                    }}
                    role="tab"
                    aria-selected={isActive}
                  >
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="map-search-wrap">
              <input
                type="text"
                placeholder={isAdminMode ? 'Search ID, description, or exact address...' : 'Search incidents by location or ID...'}
                className="map-search-input"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                id="incidents-search-input"
                aria-label="Search incidents"
              />
              <Search size={16} className="map-search-icon" aria-hidden="true" />
            </div>

            {/* Priority & Status Select Dropdowns */}
            <div className="map-dropdowns-row">
              <div className="map-select-field-group">
                <label htmlFor="incidents-filter-priority" className="map-select-field-label">
                  Priority
                </label>
                <div className="map-custom-select-wrapper">
                  <select
                    className="map-select-filter"
                    value={selectedPriority}
                    onChange={(e) => {
                      setSelectedPriority(e.target.value);
                      setPage(1);
                    }}
                    id="incidents-filter-priority"
                    aria-label="Filter by priority"
                  >
                    <option value="">All priorities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <ChevronDown size={14} className="map-select-chevron" aria-hidden="true" />
                </div>
              </div>

              <div className="map-select-field-group">
                <label htmlFor="incidents-filter-status" className="map-select-field-label">
                  Status
                </label>
                <div className="map-custom-select-wrapper">
                  <select
                    className="map-select-filter"
                    value={selectedStatus}
                    onChange={(e) => {
                      setSelectedStatus(e.target.value);
                      setPage(1);
                    }}
                    id="incidents-filter-status"
                    aria-label="Filter by status"
                  >
                    <option value="">All statuses</option>
                    <option value="reported">Reported</option>
                    <option value="under_review">Under Review</option>
                    <option value="assigned">Assigned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    {isAdminMode && <option value="cancelled">Cancelled</option>}
                  </select>
                  <ChevronDown size={14} className="map-select-chevron" aria-hidden="true" />
                </div>
              </div>
            </div>

            {hasActiveFilters && (
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={resetFilters}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-primary)',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <RotateCcw size={12} /> Reset filters
                </button>
              </div>
            )}
          </div>

          {/* Click-to-Center Incidents Directory Scrollable List */}
          <div className="map-incident-scroll" role="list" aria-label="Incident cards">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 8 }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} style={{ padding: 12, borderRadius: 10, background: 'var(--bg-canvas)', border: '1px solid var(--border-default)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ width: 80, height: 14, background: 'var(--border-default)', borderRadius: 4 }} />
                      <div style={{ width: 50, height: 14, background: 'var(--border-default)', borderRadius: 4 }} />
                    </div>
                    <div style={{ width: '70%', height: 16, background: 'var(--border-default)', borderRadius: 4, marginBottom: 6 }} />
                    <div style={{ width: '50%', height: 12, background: 'var(--border-default)', borderRadius: 4 }} />
                  </div>
                ))}
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <p style={{ fontSize: 13, fontWeight: 500 }}>No incidents found.</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {hasActiveFilters ? 'Try adjusting your search criteria or resetting filters.' : 'Active reports will appear here in real-time.'}
                </p>
                {hasActiveFilters && (
                  <Button variant="secondary" size="sm" onClick={resetFilters} style={{ marginTop: 12 }}>
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              paginatedIncidents.map((item) => (
                <IncidentCard
                  key={`${item.isOwn ? 'own' : 'pub'}-${item.id}`}
                  incident={item}
                  isSelected={selectedItem?.id === item.id}
                  onClick={handleSelectIncident}
                />
              ))
            )}
          </div>

          {/* Numbered Square Pagination at Bottom */}
          {totalPages > 1 && (
            <div className="map-pagination-bar" role="navigation" aria-label="Incident pagination">
              <button
                type="button"
                className="map-page-num-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={13} />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                if (
                  pageNum === 1 ||
                  pageNum === totalPages ||
                  (pageNum >= page - 1 && pageNum <= page + 1)
                ) {
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      className={`map-page-num-btn ${page === pageNum ? 'active' : ''}`}
                      onClick={() => setPage(pageNum)}
                      aria-current={page === pageNum ? 'page' : undefined}
                    >
                      {pageNum}
                    </button>
                  );
                } else if (pageNum === page - 2 || pageNum === page + 2) {
                  return (
                    <span key={pageNum} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 2px' }}>
                      &hellip;
                    </span>
                  );
                }
                return null;
              })}

              <button
                type="button"
                className="map-page-num-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </aside>

        {/* Center Map Viewport */}
        <main className="map-viewport-container" aria-label="Interactive map representation">
          <ErrorBoundary
            title="Map view encountered an issue"
            description="The interactive map component could not render properly. You can reload or view the incidents in list format."
            compact
          >
            <div ref={mapContainerRef} className="leaflet-map-root">
              {mapInstance && <AppTileLayer map={mapInstance} tileType={tileType} />}
            </div>
          </ErrorBoundary>

          {/* Top-Left Segmented Control (Map vs Satellite) */}
          <div className="map-tile-segmented-control" role="group" aria-label="Map tile selection">
            <button
              type="button"
              className={`map-tile-segmented-btn ${tileType === 'map' ? 'active' : ''}`}
              onClick={() => setTileType('map')}
              aria-pressed={tileType === 'map'}
            >
              Map
            </button>
            <button
              type="button"
              className={`map-tile-segmented-btn ${tileType === 'satellite' ? 'active' : ''}`}
              onClick={() => setTileType('satellite')}
              aria-pressed={tileType === 'satellite'}
            >
              Satellite
            </button>
          </div>

          {/* Top-Right Compact Layers Dropdown */}
          <div className="map-layers-dropdown-wrap">
            <button
              type="button"
              className={`map-layers-trigger-btn ${showLayersDropdown ? 'active' : ''}`}
              onClick={() => setShowLayersDropdown((prev) => !prev)}
              aria-expanded={showLayersDropdown}
              aria-haspopup="true"
              id="btn-map-layers-menu"
              title="Toggle map layers"
            >
              <Layers size={14} />
              <span>Layers</span>
              <ChevronDown size={13} className={showLayersDropdown ? 'rotate-180' : ''} />
            </button>

            {showLayersDropdown && (
              <div
                className="map-layers-dropdown-menu"
                role="menu"
                aria-label="Layer toggles"
              >
                <div className="map-layers-menu-header">Map Layers</div>
                
                <label className="map-layer-menu-item">
                  <input
                    type="checkbox"
                    checked={layers.incidents}
                    onChange={() => toggleLayer('incidents')}
                  />
                  <span className="layer-item-icon">🚨</span>
                  <span className="layer-item-label">Incidents ({filteredIncidents.length})</span>
                </label>

                <label className="map-layer-menu-item">
                  <input
                    type="checkbox"
                    checked={layers.shelters}
                    onChange={() => toggleLayer('shelters')}
                  />
                  <span className="layer-item-icon">🏠</span>
                  <span className="layer-item-label">Shelters</span>
                </label>

                <label className="map-layer-menu-item">
                  <input
                    type="checkbox"
                    checked={layers.hospitals}
                    onChange={() => toggleLayer('hospitals')}
                  />
                  <span className="layer-item-icon">🏥</span>
                  <span className="layer-item-label">Hospitals</span>
                </label>

                <label className="map-layer-menu-item">
                  <input
                    type="checkbox"
                    checked={layers.teams}
                    onChange={() => toggleLayer('teams')}
                  />
                  <span className="layer-item-icon">🚚</span>
                  <span className="layer-item-label">Teams ({activeTeams.length})</span>
                </label>

                <label className="map-layer-menu-item">
                  <input
                    type="checkbox"
                    checked={layers.supplies}
                    onChange={() => toggleLayer('supplies')}
                  />
                  <span className="layer-item-icon">📦</span>
                  <span className="layer-item-label">Supplies</span>
                </label>

                <label className="map-layer-menu-item">
                  <input
                    type="checkbox"
                    checked={layers.zones}
                    onChange={() => toggleLayer('zones')}
                  />
                  <span className="layer-item-icon">⚠️</span>
                  <span className="layer-item-label">Affected Regions</span>
                </label>
              </div>
            )}
          </div>

          {/* Bottom-Right Circular "Locate Me" Button */}
          <button
            type="button"
            className="map-locate-control-btn"
            onClick={handleLocateMe}
            disabled={locating}
            id="btn-locate-me"
            title="Locate me"
            aria-label="Focus map to current location"
          >
            <Compass size={17} className={locating ? 'animate-spin' : ''} />
          </button>

          {/* Floating Collapsible Legend (Bottom-Left) */}
          <MapLegend isOpen={showLegend} onToggle={setShowLegend} adminMode={isAdminMode} />
        </main>

        {/* Right Detail & Nearby Resources Panel */}
        <DetailPanel
          selectedItem={selectedItem}
          selectedType={selectedType}
          onClose={() => setSelectedItem(null)}
          incidentDistanceKm={incidentDistanceKm}
          nearbyResources={nearbyResources5km}
          user={user}
          onMarkResponding={handleMarkResponding}
          onAssignTeam={handleAssignTeam}
          actionLoading={actionLoading}
          adminMode={isAdminMode}
        />
      </div>

      {/* Admin Assign Team Modal */}
      <AssignTeamModal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        incidentId={assignIncidentId}
        incidentCode={assignIncidentCode}
        onAssigned={handleTeamAssigned}
      />
    </div>
  );
}
