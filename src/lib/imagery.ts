import type { LngLat } from '../types';

// Satellite imagery sources. Esri works worldwide but is only free for prototypes.
// PNOA (Spanish national orthophoto, 25 cm) is sharper and free incl. commercial use (CC BY 4.0, credit IGN).

export type ImageryId = 'esri' | 'pnoa';

export interface ImagerySource {
  id: ImageryId;
  label: string; // short button text
  tiles: string;
  scheme: 'xyz' | 'tms';
  maxzoom: number;
  attribution: string;
  /** Raster paint tweaks so the imagery looks vivid under the course overlays. */
  paint: { 'raster-saturation': number; 'raster-contrast': number; 'raster-brightness-min'?: number };
  /** Bounding boxes [west, south, east, north] where the source has imagery. */
  coverage: [number, number, number, number][] | 'world';
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
  return source.coverage.some(([w, s, e, n]) => p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n);
}

/** Sources with imagery at this place, best first (national orthophoto before the worldwide fallback). */
export function imageryOptions(p: LngLat): ImagerySource[] {
  return [IMAGERY.pnoa, IMAGERY.esri].filter((s) => covers(s, p));
}

/** The player's choice if it covers this place, else the best source there. */
export function pickImagery(p: LngLat, preferred: ImageryId | null): ImagerySource {
  const options = imageryOptions(p);
  return options.find((s) => s.id === preferred) ?? options[0];
}
