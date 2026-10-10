import type maplibregl from 'maplibre-gl';
import type { ImagerySource } from '../lib/imagery';

// Shared map look for the hole map and the hole set-up: satellite imagery with the course drawn on top
// in soft course colours (fairway, tee, green, bunker, water), like the hole maps of GPS golf apps.

/** Credit for the course shapes (OpenStreetMap, ODbL). */
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export function imageryStyle(source: ImagerySource): maplibregl.StyleSpecification {
  return { version: 8, sources: { sat: rasterSource(source) }, layers: [imageryLayer(source)] };
}

function rasterSource(source: ImagerySource): maplibregl.RasterSourceSpecification {
  return { type: 'raster', tiles: [source.tiles], scheme: source.scheme, tileSize: 256, maxzoom: source.maxzoom, attribution: source.attribution };
}

export function imageryLayer(source: ImagerySource): maplibregl.RasterLayerSpecification {
  return { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 150, ...source.paint } };
}

/** Shows the credit as the (i) button (tap to read) instead of a wide banner over the hole. */
export function collapseAttribution(m: maplibregl.Map): void {
  const el = m.getContainer().querySelector('.maplibregl-ctrl-attrib.maplibregl-compact');
  el?.classList.remove('maplibregl-compact-show');
  el?.removeAttribute('open');
}

/** Swaps the imagery under the existing course layers. */
export function setImagery(m: maplibregl.Map, source: ImagerySource): void {
  const below = m.getStyle().layers[1]?.id; // course layers stay on top
  m.removeLayer('sat');
  m.removeSource('sat');
  m.addSource('sat', rasterSource(source));
  m.addLayer(imageryLayer(source), below);
}

const FILL: Record<string, { color: string; opacity: number; edge: string; edgeOpacity: number; width: number }> = {
  fairway: { color: '#5FC94A', opacity: 0.32, edge: '#C8F5A8', edgeOpacity: 0.55, width: 1.2 },
  tee: { color: '#5FC94A', opacity: 0.45, edge: '#E2FFD0', edgeOpacity: 0.8, width: 1.2 },
  water: { color: '#2E8BE0', opacity: 0.55, edge: '#9AD3FF', edgeOpacity: 0.8, width: 1.4 },
  bunker: { color: '#F6E7BE', opacity: 0.8, edge: '#FFF8E3', edgeOpacity: 0.9, width: 1.2 },
  green: { color: '#7EE04A', opacity: 0.6, edge: '#EFFFC2', edgeOpacity: 1, width: 2 },
};
const ORDER = ['fairway', 'tee', 'water', 'bunker', 'green'];

/** Fill + soft edge per surface; `source` holds polygons with a `kind` property. */
export function courseLayers(source: string): maplibregl.LayerSpecification[] {
  return ORDER.flatMap((kind): maplibregl.LayerSpecification[] => {
    const f = FILL[kind];
    return [
      { id: `${kind}-fill`, type: 'fill', source, filter: ['==', ['get', 'kind'], kind], paint: { 'fill-color': f.color, 'fill-opacity': f.opacity } },
      {
        id: `${kind}-edge`,
        type: 'line',
        source,
        filter: ['==', ['get', 'kind'], kind],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': f.edge, 'line-opacity': f.edgeOpacity, 'line-width': f.width, 'line-blur': 0.6 },
      },
    ];
  });
}
