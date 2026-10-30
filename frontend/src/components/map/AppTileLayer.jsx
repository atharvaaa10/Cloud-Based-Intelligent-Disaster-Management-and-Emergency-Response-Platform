import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MAP_TILES } from '../../config/mapTiles';

/**
 * AppTileLayer — Shared Leaflet TileLayer Component
 *
 * Attaches a Leaflet TileLayer using the shared MAP_TILES configuration.
 * Applies the enterprise dark look by targeting ONLY the map tile pane
 * (`filter: invert(1) hue-rotate(200deg) brightness(0.75) contrast(0.9) saturate(0.5)`),
 * never markers, icons, or popups.
 *
 * @param {object} props
 * @param {L.Map} props.map - The Leaflet map instance
 * @param {'map' | 'satellite'} [props.tileType='map'] - 'map' (darkened street) or 'satellite' (true color)
 * @param {number} [props.maxZoom=19] - Maximum zoom level
 * @param {object} [props.options={}] - Additional Leaflet tileLayer options
 */
export default function AppTileLayer({ map, tileType = 'map', maxZoom = 19, options = {} }) {
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map) return;

    // Remove previous layer if re-rendering or updating tileType
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    const config = tileType === 'satellite' ? MAP_TILES.SATELLITE : MAP_TILES.STREET;
    const tileOptions = {
      maxZoom,
      attribution: config.attribution,
      ...options,
    };

    const tileLayer = L.tileLayer(config.url, tileOptions).addTo(map);
    layerRef.current = tileLayer;

    // Apply dark filter class only to the tile pane, never markers or popups
    const tilePane = map.getPane('tilePane');
    if (tilePane) {
      if (tileType === 'satellite') {
        tilePane.classList.add('leaflet-tile-pane-satellite');
      } else {
        tilePane.classList.remove('leaflet-tile-pane-satellite');
      }
    }

    return () => {
      if (layerRef.current && map) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, tileType, maxZoom, options]);

  return null;
}

