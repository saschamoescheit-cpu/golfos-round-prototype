import type { LngLat } from '../types';
import { pointInRing } from './geo';

// Heights from the best official terrain model where the course lies (Sascha 19.10.2026: "every course should have
// green slopes") – fetched by the phone for one green at a time, so no course has to be built by hand any more.
// Only services that answer the app directly (CORS) and give 1 m or finer: a green's breaks need that; the 30–90 m
// models available worldwide show nothing on a green.

export interface DemProvider {
  id: string;
  /** credit the licence asks for, shown in the map's ⓘ */
  credit: string;
  /** metres per cell the service is asked for */
  cell: number;
  /** the region it covers: [west, south, east, north] boxes, refined by an outline where a box is too coarse */
  boxes: [number, number, number, number][];
  outline?: LngLat[];
  /** UTM zone of the request (all providers here work in UTM, as the services' own grids) */
  zone: (p: LngLat) => number;
  /** URL of a square of heights, west/south/east/north in UTM metres */
  url: (w: number, s: number, e: number, n: number, cells: number) => string;
}

// North Rhine-Westphalia, a rough outline (the box around it takes in parts of Hesse and Lower Saxony)
const NRW: LngLat[] = [[5.87, 51.82], [6.4, 51.87], [6.83, 52.13], [7.06, 52.24], [7.3, 52.24], [7.57, 52.42], [8.0, 52.36], [8.3, 52.46], [8.5, 52.53], [8.7, 52.4], [9.0, 52.28], [9.45, 51.68], [9.16, 51.43], [8.95, 51.4], [8.5, 51.15], [8.3, 50.88], [8.1, 50.73], [7.85, 50.6], [7.2, 50.6], [6.9, 50.33], [6.4, 50.32], [6.03, 50.72], [5.97, 51.05], [6.2, 51.38], [5.87, 51.82]];
// Baden-Württemberg, a rough outline
const BW: LngLat[] = [[7.51, 47.54], [7.6, 48.1], [7.75, 48.5], [8.2, 48.98], [8.39, 49.25], [8.47, 49.6], [8.85, 49.66], [9.1, 49.6], [9.3, 49.7], [9.6, 49.78], [9.85, 49.55], [10.13, 49.3], [10.45, 48.95], [10.5, 48.55], [10.2, 48.35], [10.14, 47.75], [9.95, 47.53], [9.55, 47.53], [8.6, 47.6], [8.1, 47.56], [7.51, 47.54]];

export const DEM_PROVIDERS: DemProvider[] = [
  {
    id: 'nrw',
    credit: 'Grünhöhen: Geobasis NRW, DGM1 (dl-de/zero-2-0)',
    cell: 1,
    boxes: [[5.86, 50.32, 9.46, 52.54]],
    outline: NRW,
    zone: () => 32,
    url: (w, s, e, n) =>
      `https://www.wcs.nrw.de/geobasis/wcs_nw_dgm?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=nw_dgm&FORMAT=image/tiff&SUBSET=x(${w},${e})&SUBSET=y(${s},${n})`,
  },
  {
    id: 'bw',
    credit: 'Grünhöhen: © LGL, www.lgl-bw.de (dl-de/by-2-0)',
    cell: 1,
    boxes: [[7.5, 47.53, 10.5, 49.8]],
    outline: BW,
    zone: () => 32,
    // the LGL grid has its cell centres on whole metres: the square runs from half a metre
    url: (w, s, e, n) =>
      `https://owsproxy.lgl-bw.de/owsproxy/wcs/WCS_INSP_BW_Hoehe_Coverage_DGM1?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=EL.ElevationGridCoverage&FORMAT=image/tiff&SUBSET=E(${w - 0.5},${e - 0.5})&SUBSET=N(${s + 0.5},${n + 0.5})`,
  },
  {
    id: 'usgs',
    credit: 'Green heights: USGS 3D Elevation Program (3DEP)',
    cell: 1,
    // the lower 48 states, Hawaii (3DEP 1 m covers most of them; where it does not, the service returns coarser data)
    boxes: [[-125, 24.4, -66.9, 49.4], [-160.3, 18.9, -154.8, 22.3]],
    zone: (p) => Math.floor((p[0] + 180) / 6) + 1,
    url: (w, s, e, n, cells) => {
      // UTM north zone of the box's middle (EPSG 326xx); the zone is passed in through the box below
      return `https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox=${w},${s},${e},${n}&bboxSR={sr}&imageSR={sr}&size=${cells},${cells}&format=tiff&pixelType=F32&interpolation=RSP_BilinearInterpolation&f=image`;
    },
  },
];

/** The provider for a point, or null where no fine official model can be fetched. */
export function demProviderAt(p: LngLat): DemProvider | null {
  for (const d of DEM_PROVIDERS) {
    if (!d.boxes.some(([w, s, e, n]) => p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n)) continue;
    if (d.outline && !pointInRing(p, d.outline)) continue;
    return d;
  }
  return null;
}

// ---- UTM (WGS84 / ETRS89 – the same to a few centimetres) ----
const K0 = 0.9996;
const A = 6378137.0;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);

export function toUtm(p: LngLat, zone: number): [number, number] {
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const phi = (p[1] * Math.PI) / 180;
  const lam = (p[0] * Math.PI) / 180 - lon0;
  const n = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
  const t = Math.tan(phi) ** 2;
  const c = EP2 * Math.cos(phi) ** 2;
  const a = Math.cos(phi) * lam;
  const m =
    A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi));
  const e = 500000 + K0 * n * (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5) / 120);
  const nn = K0 * (m + n * Math.tan(phi) * ((a * a) / 2 + ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 + ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6) / 720));
  return [e, nn];
}

/** Inverse by Newton steps on toUtm (accurate to a centimetre here). */
export function fromUtm(e: number, n: number, zone: number): LngLat {
  let lon = (zone - 1) * 6 - 180 + 3 + (e - 500000) / 85000;
  let lat = n / 111200;
  for (let k = 0; k < 8; k++) {
    const [e0, n0] = toUtm([lon, lat], zone);
    lat += (n - n0) / 111200;
    lon += (e - e0) / (111320 * Math.cos((lat * Math.PI) / 180));
  }
  return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
}

export interface DemSquare {
  /** heights in metres, row 0 = north, `size` × `size`, NaN where the model has none */
  h: Float32Array;
  size: number;
  cell: number;
  /** UTM corner (west, south) and zone – the square's frame */
  w: number;
  s: number;
  zone: number;
}

/** The heights of a square around a point: `half` metres to each side, on the provider's cells. */
export async function fetchSquare(d: DemProvider, center: LngLat, half: number, signal?: AbortSignal): Promise<DemSquare | null> {
  const zone = d.zone(center);
  const [ce, cn] = toUtm(center, zone);
  const w = Math.round(ce) - half;
  const s = Math.round(cn) - half;
  const size = Math.round((2 * half) / d.cell);
  const url = d.url(w, s, w + 2 * half, s + 2 * half, size).replaceAll('{sr}', String(32600 + zone));
  const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(20000) });
  if (!res.ok || !/tiff/.test(res.headers.get('content-type') ?? '')) return null;
  const { fromArrayBuffer } = await import('geotiff');
  const tif = await fromArrayBuffer(await res.arrayBuffer());
  const img = await tif.getImage();
  const [raster] = (await img.readRasters({ width: size, height: size, resampleMethod: 'bilinear' })) as unknown as Float32Array[];
  const nodata = img.getGDALNoData();
  const h = new Float32Array(size * size);
  for (let k = 0; k < h.length; k++) {
    const v = raster[k];
    h[k] = v == null || v < -1000 || (nodata != null && v === nodata) ? NaN : v;
  }
  return { h, size, cell: d.cell, w, s, zone };
}
