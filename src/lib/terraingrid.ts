import type { LngLat } from '../types';

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
