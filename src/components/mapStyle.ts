import type maplibregl from 'maplibre-gl';
import type { ImagerySource } from '../lib/imagery';

// Shared map look for the hole map and the hole set-up: satellite imagery with the course drawn on top
// in soft course colours (fairway, tee, green, bunker, water), like the hole maps of GPS golf apps.

/** Credit for the course shapes (OpenStreetMap, ODbL). */
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export function imageryStyle(source: ImagerySource): maplibregl.StyleSpecification {
  return { version: 8, sources: { sat: rasterSource(source) }, layers: [imageryLayer(source)] };
}

/**
 * Sharp on phone screens (Sascha 14.10.2026: "the maps are not really good"): tiles at twice the density – the WMS
 * (LGL) sends 512 px images for each 256 px tile, the tile services are asked one zoom level finer (128 px tiles).
 */
function rasterSource(source: ImagerySource): maplibregl.RasterSourceSpecification {
  const wms = source.tiles.includes('{bbox-epsg-3857}');
  return { type: 'raster', tiles: [source.tiles], scheme: source.scheme, tileSize: wms ? 256 : 128, maxzoom: source.maxzoom, attribution: source.attribution };
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
  const layers = m.getStyle().layers;
  const below = layers[layers.findIndex((l) => l.id === 'sat') + 1]?.id; // course layers stay on top
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

/**
 * The drawn hole as in BeBrassie (Sascha 14.10.2026; 16.10.2026: "this quality is the least I want"): no aerial
 * image – the hole's own dark rough as one smooth shape on a light ground, a bright fairway, a light green with its
 * fringe, cream bunkers and blue water with an edge, soft outlines everywhere, trees as drawn crowns.
 */
export const PLAN_COLOURS = {
  ground: '#e3eed6',
  rough: '#23803d',
  fairway: '#3fb54d',
  fairwayEdge: '#5fcb69',
  tee: '#3fb54d',
  teeEdge: '#a8e39a',
  green: '#8fd65c',
  fringe: '#b9e98f',
  bunker: '#f2e3b8',
  bunkerEdge: '#d6bf83',
  water: '#4a8ee8',
  waterEdge: '#2a68c4',
  path: '#d8d0bb',
} as const;
/** Layers of the drawn hole that only show in 2D. */
export const PLAN_LAYERS = [
  'plan-rough', 'plan-corridor', 'plan-fairway', 'plan-fairway-edge', 'plan-tee', 'plan-tee-edge', 'plan-water', 'plan-water-edge',
  'plan-bunker', 'plan-bunker-edge', 'plan-fringe', 'plan-green', 'plan-paths', 'plan-ob-casing', 'plan-ob', 'plan-ob-stakes', 'plan-tree-icons',
];

/** Course layers for the view: hidden (aerial only), soft overlay on the aerial image, or the drawn hole. */
export function setCourseLook(m: maplibregl.Map, look: 'hidden' | 'overlay' | 'plan'): void {
  const plan = look === 'plan';
  for (const kind of ORDER) {
    const f = FILL[kind];
    for (const part of ['fill', 'edge'] as const) {
      const id = `${kind}-${part}`;
      if (!m.getLayer(id)) continue;
      // the drawn hole has its own smoothed shapes (plan-…): the overlay shapes are hidden there
      m.setLayoutProperty(id, 'visibility', look === 'overlay' ? 'visible' : 'none');
      if (part === 'fill') m.setPaintProperty(id, 'fill-opacity', f.opacity);
      else m.setPaintProperty(id, 'line-opacity', f.edgeOpacity);
    }
  }
  for (const id of PLAN_LAYERS) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', plan ? 'visible' : 'none');
  if (m.getLayer('sat')) m.setLayoutProperty('sat', 'visibility', plan ? 'none' : 'visible');
}

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
