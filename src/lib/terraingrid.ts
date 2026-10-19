import type { LngLat } from '../types';
import { demProvidersAt, fetchBox, loadStaticCourse, toUtm, unpackCm } from './dem';

// Heights of a whole course on a 10 m grid (from the 1 m terrain model, lidar/terrain_grid.py): "plays like" from
// anywhere – the neighbouring fairway, deep in the rough – not only within 40 m of the hole line. Where there is no
// grid, the app falls back to the coarse 90 m elevation service.

export interface TerrainGrid {
  west: number;
  north: number;
  dLon: number;
  dLat: number;
  cols: number;
  rows: number;
  base: number; // metres above sea level of value 0
  cm: number[]; // row 0 = north; −1 = no height
}

/** Courses with a grid (file under public/). */
export const TERRAIN_GRIDS: Record<string, string> = {
  'osm:relation/1326323': 'greens/hetzenhof/terrain.json', // Hetzenhof, DGM1 Baden-Württemberg
  'osm:way/119442124': 'greens/frielinghausen/terrain.json', // Gut Frielinghausen, DGM1 Nordrhein-Westfalen
};

const cache = new Map<string, Promise<TerrainGrid | null>>();
export function loadTerrainGrid(courseId: string): Promise<TerrainGrid | null> {
  const file = TERRAIN_GRIDS[courseId];
  if (!file) return Promise.resolve(null);
  if (!cache.has(courseId))
    cache.set(
      courseId,
      fetch(file)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  return cache.get(courseId)!;
}

/** Height in metres at a point (bilinear between the four grid points around it), null outside the grid. */
export function gridHeight(g: TerrainGrid, p: LngLat): number | null {
  const e = 1e-6; // rounding at the edge
  const x = (p[0] - g.west) / g.dLon;
  const y = (g.north - p[1]) / g.dLat;
  if (x < -e || y < -e || x > g.cols - 1 + e || y > g.rows - 1 + e) return null;
  const c = Math.max(0, Math.min(g.cols - 2, Math.floor(x)));
  const r = Math.max(0, Math.min(g.rows - 2, Math.floor(y)));
  const fx = Math.max(0, Math.min(1, x - c));
  const fy = Math.max(0, Math.min(1, y - r));
  const at = (rr: number, cc: number) => g.cm[rr * g.cols + cc];
  const v = [at(r, c), at(r, c + 1), at(r + 1, c), at(r + 1, c + 1)];
  if (v.some((q) => q < 0)) return null;
  const top = v[0] + (v[1] - v[0]) * fx;
  const bottom = v[2] + (v[3] - v[2]) * fx;
  return g.base + (top + (bottom - top) * fy) / 100;
}

// ---- made on the phone (19.10.2026): every course in a region with an official terrain model gets its 10 m grid ----
const DB = 'golfos-terrain';
async function store(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('grids');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function kept(courseId: string): Promise<TerrainGrid | null> {
  try {
    const db = await store();
    return await new Promise((resolve) => {
      const q = db.transaction('grids').objectStore('grids').get(courseId);
      q.onsuccess = () => resolve((q.result as TerrainGrid) ?? null);
      q.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function keep(courseId: string, g: TerrainGrid): Promise<void> {
  try {
    const db = await store();
    db.transaction('grids', 'readwrite').objectStore('grids').put(g, courseId);
  } catch {
    // made again next time
  }
}

/** The course's 10 m grid from the region's terrain model (one request for the whole course), kept on the phone –
 *  null where there is no such model. `points`: everything mapped on the course (tees, lines, greens). */
export async function makeTerrainGrid(courseId: string, points: LngLat[], signal?: AbortSignal): Promise<TerrainGrid | null> {
  const k = await kept(courseId);
  if (k) return k;
  if (!points.length) return null;
  // shipped with the app (Bavaria and the states without a service for the phone): the grid comes ready
  const shipped = async () => {
    const c = await loadStaticCourse(courseId);
    if (!c?.terrain) return null;
    const g: TerrainGrid = { ...c.terrain, cm: Array.from(await unpackCm(c.terrain.cm)) };
    await keep(courseId, g);
    return g;
  };
  const providers = demProvidersAt(points[0]);
  if (!providers.length) return shipped();
  const CELL = 10;
  const MARGIN = 80; // a ball in the trees, the path beside the hole
  const lat0 = points.reduce((a, p) => a + p[1], 0) / points.length;
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const west = Math.min(...points.map((p) => p[0])) - MARGIN / mLon;
  const east = Math.max(...points.map((p) => p[0])) + MARGIN / mLon;
  const south = Math.min(...points.map((p) => p[1])) - MARGIN / 111320;
  const north = Math.max(...points.map((p) => p[1])) + MARGIN / 111320;
  if ((east - west) * mLon > 6000 || (north - south) * 111320 > 6000) return null; // not one course
  for (const d of providers) {
    const zone = d.zone([(west + east) / 2, (south + north) / 2]);
    const corners = [toUtm([west, south], zone), toUtm([east, south], zone), toUtm([west, north], zone), toUtm([east, north], zone)];
    const w = Math.floor(Math.min(...corners.map((c) => c[0])) / CELL) * CELL;
    const s = Math.floor(Math.min(...corners.map((c) => c[1])) / CELL) * CELL;
    const e = Math.ceil(Math.max(...corners.map((c) => c[0])) / CELL) * CELL;
    const n = Math.ceil(Math.max(...corners.map((c) => c[1])) / CELL) * CELL;
    const side = Math.max(e - w, n - s);
    const box = await fetchBox(d, zone, w, s, w + side, s + side, CELL, signal).catch(() => null);
    if (!box) continue;
    // onto the app's grid (north up in degrees): each point read bilinearly from the UTM grid
    const dLat = CELL / 111320;
    const dLon = CELL / mLon;
    const cols = Math.ceil((east - west) / dLon) + 1;
    const rows = Math.ceil((north - south) / dLat) + 1;
    const top = box.s + box.size * box.cell;
    const at = (x: number, y: number) => box.h[Math.min(box.size - 1, Math.max(0, y)) * box.size + Math.min(box.size - 1, Math.max(0, x))];
    const H: number[] = [];
    let missing = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const [ue, un] = toUtm([west + c * dLon, north - r * dLat], zone);
        const fx = (ue - box.w) / box.cell - 0.5;
        const fy = (top - un) / box.cell - 0.5;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const v = at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
        if (Number.isNaN(v)) missing++;
        H.push(v);
      }
    if (missing > H.length * 0.1) continue; // mostly outside this service's state: the next one
    const valid = H.filter((v) => !Number.isNaN(v));
    const base = Math.floor(Math.min(...valid) * 100) / 100;
    const g: TerrainGrid = { west, north, dLon, dLat, cols, rows, base, cm: H.map((v) => (Number.isNaN(v) ? -1 : Math.round((v - base) * 100))) };
    await keep(courseId, g);
    return g;
  }
  return shipped(); // by a state border: the neighbour's service had no heights here
}
