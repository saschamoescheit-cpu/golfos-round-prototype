import type { LngLat } from '../types';

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
  /** the region it covers: [west, south, east, north] boxes (a state's box takes in its neighbours' edges) */
  boxes: [number, number, number, number][];
  /** UTM zone of the request (all providers here work in UTM, as the services' own grids) */
  zone: (p: LngLat) => number;
  /** URL of a square of heights, west/south/east/north in UTM metres */
  url: (w: number, s: number, e: number, n: number, cells: number) => string;
  /** heights cut on the PC and shipped with the app (states the phone cannot ask itself): no request */
  local?: (w: number, s: number, e: number, n: number) => DemSquare | null;
}

export const DEM_PROVIDERS: DemProvider[] = [
  {
    id: 'nrw',
    credit: 'Grünhöhen: Geobasis NRW, DGM1 (dl-de/zero-2-0)',
    cell: 1,
    boxes: [[5.86, 50.32, 9.46, 52.54]],
    zone: () => 32,
    url: (w, s, e, n) =>
      `https://www.wcs.nrw.de/geobasis/wcs_nw_dgm?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=nw_dgm&FORMAT=image/tiff&SUBSET=x(${w},${e})&SUBSET=y(${s},${n})`,
  },
  {
    id: 'bw',
    credit: 'Grünhöhen: © LGL, www.lgl-bw.de (dl-de/by-2-0)',
    cell: 1,
    boxes: [[7.5, 47.53, 10.5, 49.8]],
    zone: () => 32,
    // the LGL grid has its cell centres on whole metres: the square runs from half a metre
    url: (w, s, e, n) =>
      `https://owsproxy.lgl-bw.de/owsproxy/wcs/WCS_INSP_BW_Hoehe_Coverage_DGM1?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=EL.ElevationGridCoverage&FORMAT=image/tiff&SUBSET=E(${w - 0.5},${e - 0.5})&SUBSET=N(${s + 0.5},${n + 0.5})`,
  },
  {
    id: 'ni',
    credit: 'Grünhöhen: © LGLN, DGM1',
    cell: 1,
    boxes: [[6.6, 51.29, 11.6, 53.9]],
    zone: () => 32,
    url: (w, s, e, n) =>
      `https://opendata.geoservices.lgln.niedersachsen.de/dgm_wcs?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=ni_dgm1&FORMAT=image/tiff&SUBSET=x(${w},${e})&SUBSET=y(${s},${n})`,
  },
  {
    id: 'he',
    credit: 'Grünhöhen: © HVBG Hessen, DGM1',
    cell: 1,
    boxes: [[7.77, 49.39, 10.24, 51.66]],
    zone: () => 32,
    url: (w, s, e, n) =>
      `https://inspire-hessen.de/raster/dgm1/ows?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=he_dgm1&FORMAT=image/tiff&SUBSET=E(${w},${e})&SUBSET=N(${s},${n})`,
  },
  {
    id: 'bb',
    credit: 'Grünhöhen: © GeoBasis-DE/LGB, DGM1 (dl-de/by-2-0)',
    cell: 1,
    boxes: [[11.26, 51.36, 14.77, 53.56]],
    zone: () => 33,
    url: (w, s, e, n) =>
      `https://isk.geobasis-bb.de/ows/dgm_wcs?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=bb_dgm&FORMAT=image/tiff&SUBSET=x(${w},${e})&SUBSET=y(${s},${n})`,
  },
  {
    id: 'mv',
    credit: 'Grünhöhen: © GeoBasis-DE/M-V, DGM1',
    cell: 1,
    boxes: [[10.59, 53.11, 14.42, 54.69]],
    zone: () => 33,
    url: (w, s, e, n) =>
      `https://www.geodaten-mv.de/dienste/dgm_wcs?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=mv_dgm&FORMAT=image/tiff&SUBSET=x(${w},${e})&SUBSET=y(${s},${n})`,
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

/** The services whose region may hold a point, the likeliest first – near a state border more than one: the one
 *  without heights there gives nothing and the next is asked (fetchSquare). Empty where no fine official model can
 *  be fetched. */
export function demProvidersAt(p: LngLat): DemProvider[] {
  return DEM_PROVIDERS.filter((d) => d.boxes.some(([w, s, e, n]) => p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n));
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

/** The URL of a box at a coarser cell than the service's own: the WCS services thin it out themselves (SCALEFACTOR),
 *  the ArcGIS one is asked for fewer pixels. */
function boxUrl(d: DemProvider, w: number, s: number, e: number, n: number, cell: number): string {
  const cells = Math.round((e - w) / cell);
  const url = d.url(w, s, e, n, cells);
  if (cell <= d.cell || /ImageServer/.test(url)) return url;
  return `${url}&SCALEFACTOR=${(d.cell / cell).toFixed(4)}`;
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
  return fetchBox(d, zone, w, s, w + 2 * half, s + 2 * half, d.cell, signal);
}

/** The heights of a UTM box at a given cell size (metres), row 0 = north; null when the service has none there. */
export async function fetchBox(d: DemProvider, zone: number, w: number, s: number, e: number, n: number, cell: number, signal?: AbortSignal): Promise<DemSquare | null> {
  if (d.local) return d.local(w, s, e, n);
  const size = Math.round((e - w) / cell);
  const url = boxUrl(d, w, s, e, n, cell).replaceAll('{sr}', String(32600 + zone));
  const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(30000) });
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
  return { h, size, cell, w, s, zone };
}

// ---- heights shipped with the app (19.10.2026): Bavaria and the other states without a service the phone may ask –
// cut by lidar/de_static.py: per course the squares around its greens (1 m) and a 10 m grid over the course ----
export interface StaticCourse {
  course: string;
  credit: string;
  zone: number;
  squares: { w: number; s: number; size: number; base: number; cm: string }[];
  terrain: { west: number; north: number; dLon: number; dLat: number; cols: number; rows: number; base: number; cm: string } | null;
}

/** cm values packed by de_static.py: base64 → zlib → int16 differences cell to cell → values */
export async function unpackCm(b64: string): Promise<Int32Array> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  const d = new Int16Array(await new Response(stream).arrayBuffer());
  const out = new Int32Array(d.length);
  let acc = 0;
  for (let k = 0; k < d.length; k++) out[k] = acc += d[k];
  return out;
}

let staticIndex: Promise<Record<string, string>> | null = null;
const staticCourses = new Map<string, Promise<StaticCourse | null>>();
/** The shipped heights of a course, or null (most courses: none) – loaded once per session. */
export function loadStaticCourse(courseId: string): Promise<StaticCourse | null> {
  if (!staticCourses.has(courseId)) staticCourses.set(courseId, fetchStaticCourse(courseId).then((c) => (c ? c : (staticCourses.delete(courseId), null))));
  return staticCourses.get(courseId)!;
}
async function fetchStaticCourse(courseId: string): Promise<StaticCourse | null> {
  staticIndex ??= fetch(`${import.meta.env.BASE_URL}dem/index.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => {
      staticIndex = null; // offline: next time
      return {};
    });
  const file = (await staticIndex)[courseId];
  if (!file) return null;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}${file}`);
    return r.ok ? ((await r.json()) as StaticCourse) : null;
  } catch {
    return null;
  }
}

/** A provider that answers from a course's shipped squares (any box inside one of them). */
export async function staticProvider(c: StaticCourse): Promise<DemProvider> {
  const squares = await Promise.all(
    c.squares.map(async (q) => {
      const cm = await unpackCm(q.cm);
      return { ...q, h: Float32Array.from(cm, (v) => q.base + v / 100) };
    }),
  );
  return {
    id: 'static',
    credit: c.credit,
    cell: 1,
    boxes: [],
    zone: () => c.zone,
    url: () => '',
    local: (w, s, e, n) => {
      const q = squares.find((x) => x.w <= w && x.s <= s && w + (e - w) <= x.w + x.size && n <= x.s + x.size);
      if (!q) return null;
      const size = Math.round(e - w);
      const h = new Float32Array(size * size);
      const top = q.s + q.size - n; // stored rows above the box (row 0 = north)
      for (let r = 0; r < size; r++) for (let x = 0; x < size; x++) h[r * size + x] = q.h[(top + r) * q.size + (w - q.w) + x];
      return { h, size, cell: 1, w, s, zone: c.zone };
    },
  };
}
