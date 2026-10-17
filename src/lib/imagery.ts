import type { LngLat } from '../types';
import { pointInRing } from './geo';

// Satellite imagery sources. Esri works worldwide but is only free for prototypes.
// PNOA (Spanish national orthophoto, 25 cm) is sharper and free incl. commercial use (CC BY 4.0, credit IGN).
// LGL DOP20 (Baden-Württemberg, 20 cm, flown every 3 years) – Open Data (dl-de/by-2-0, credit LGL-BW): Hetzenhof.
// Checked 13.10.2026: the OSM green outlines at Hetzenhof sit within 1–2 m of the DOP20 image.

export type ImageryId = string; // 'esri' | 'pnoa' | 'lgl' | a US source id from public/imagery/us.json

export interface ImagerySource {
  id: ImageryId;
  label: string; // short button text
  tiles: string; // {z}/{x}/{y} – or {bbox-epsg-3857} for a WMS
  scheme: 'xyz' | 'tms';
  maxzoom: number;
  attribution: string;
  /** Raster paint tweaks so the imagery looks vivid under the course overlays. */
  paint: { 'raster-saturation': number; 'raster-contrast': number; 'raster-brightness-min'?: number };
  /** Bounding boxes [west, south, east, north] where the source has imagery – or outlines (US counties, states). */
  coverage: [number, number, number, number][] | 'world' | { rings: LngLat[][] };
}

export const IMAGERY: Record<ImageryId, ImagerySource> = {
  esri: {
    id: 'esri',
    label: 'Esri',
    tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    scheme: 'xyz',
    maxzoom: 19,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    paint: { 'raster-saturation': 0, 'raster-contrast': 0 },
    coverage: 'world',
  },
  lgl: {
    id: 'lgl',
    label: 'LGL',
    tiles:
      'https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=IMAGES_DOP_20_RGB&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg',
    scheme: 'xyz',
    maxzoom: 20,
    attribution: 'Luftbild: LGL-BW (2026) dl-de/by-2-0, www.lgl-bw.de',
    paint: { 'raster-saturation': 0.15, 'raster-contrast': 0.08 },
    // Baden-Württemberg (a box; outside the state the service returns white)
    coverage: [[7.5, 47.53, 10.5, 49.8]],
  },
  pnoa: {
    id: 'pnoa',
    label: 'IGN',
    tiles: 'https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{y}.jpeg',
    scheme: 'tms',
    maxzoom: 19, // z20 returns 404
    attribution: 'PNOA © IGN España (CC BY 4.0)',
    // PNOA is accurate but pale; lift colour and contrast a little.
    paint: { 'raster-saturation': 0.35, 'raster-contrast': 0.12 },
    // Spain without Portugal: mainland (two boxes around the Portuguese border), Balearics, Canaries.
    coverage: [
      [-7.0, 35.9, 3.4, 43.9],
      [-9.4, 41.9, -7.0, 43.9],
      [-7.6, 36.9, -7.0, 38.3],
      [1.1, 38.6, 4.4, 40.15],
      [-18.2, 27.6, -13.3, 29.5],
    ],
  },
};

export function covers(source: ImagerySource, p: LngLat): boolean {
  if (source.coverage === 'world') return true;
  if ('rings' in source.coverage) return source.coverage.rings.some((r) => pointInRing(p, r));
  return source.coverage.some(([w, s, e, n]) => p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n);
}

// ---- the USA: state and county orthoimagery, checked by scripts/us-imagery.py (USA trip, 17.10.2026) ----
interface UsSource { id: string; name: string; tiles: string; scheme: 'xyz' | 'tms'; maxzoom: number; year: number; best: boolean; attribution: string; coverage: LngLat[][] }
let regional: ImagerySource[] = [];
let regionalLoad: Promise<void> | null = null;
const IN_USA = (p: LngLat) => (p[0] >= -125 && p[0] <= -66 && p[1] >= 24 && p[1] <= 50) || (p[0] >= -180 && p[0] <= -129 && p[1] >= 51 && p[1] <= 72) || (p[0] >= -161 && p[0] <= -154 && p[1] >= 18 && p[1] <= 23) || (p[0] >= -68 && p[0] <= -64 && p[1] >= 17 && p[1] <= 19);

/** Loads the US sources once for a course in the USA; true when one covers it (the map then picks it). */
export async function loadRegionalImagery(p: LngLat): Promise<boolean> {
  if (!IN_USA(p)) return false;
  regionalLoad ??= fetch(`${import.meta.env.BASE_URL}imagery/us.json`)
    .then((r) => (r.ok ? r.json() : { sources: [] }))
    .then((d: { sources: UsSource[] }) => {
      // marked best by the index first, then the newest, then the finest
      regional = [...d.sources]
        .sort((a, b) => Number(b.best) - Number(a.best) || b.year - a.year || b.maxzoom - a.maxzoom)
        .map((s) => ({ id: s.id, label: s.name, tiles: s.tiles, scheme: s.scheme, maxzoom: s.maxzoom, attribution: s.attribution, paint: { 'raster-saturation': 0.1, 'raster-contrast': 0.05 }, coverage: { rings: s.coverage } }));
    })
    .catch(() => {
      regionalLoad = null; // offline: next time
    });
  await regionalLoad;
  return regional.some((s) => covers(s, p));
}

/** Sources with imagery at this place, best first (national or county orthophoto before the worldwide fallback). */
export function imageryOptions(p: LngLat): ImagerySource[] {
  return [...regional, IMAGERY.pnoa, IMAGERY.lgl, IMAGERY.esri].filter((s) => covers(s, p));
}

/** The player's choice if it covers this place, else the best source there. */
export function pickImagery(p: LngLat, preferred: ImageryId | null): ImagerySource {
  const options = imageryOptions(p);
  return options.find((s) => s.id === preferred) ?? options[0];
}
