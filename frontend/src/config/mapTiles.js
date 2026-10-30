/**
 * Shared Map Tile Configuration & URLs
 *
 * Reads URLs & attributions from VITE_* environment variables with clean,
 * keyless OpenStreetMap and Esri World Imagery defaults.
 */

export const MAP_TILES = {
  STREET: {
    url: import.meta.env.VITE_TILE_STREET_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      import.meta.env.VITE_TILE_STREET_ATTRIBUTION ||
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  SATELLITE: {
    url:
      import.meta.env.VITE_TILE_SATELLITE_URL ||
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      import.meta.env.VITE_TILE_SATELLITE_ATTRIBUTION ||
      'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a>',
    maxZoom: 19,
  },
};

export default MAP_TILES;

