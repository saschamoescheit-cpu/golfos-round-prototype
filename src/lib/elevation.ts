import type { LngLat } from '../types';

// Heights for the slope of a hole ("plays 12 m shorter, downhill"): Open-Meteo elevation API
// (Copernicus DEM, 90 m grid – fine for tee/green height differences, not for green reading).
// Results are cached per point, so the course works offline once a hole was opened.

const KEY = 'golfos.elevation.v1';

function cache(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

const keyOf = (p: LngLat) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`; // ~10 m

/** Heights in metres for the points (null where unknown, e.g. offline and not cached). */
export async function heights(points: LngLat[]): Promise<(number | null)[]> {
  const c = cache();
  const missing = [...new Set(points.map(keyOf).filter((k) => c[k] == null))];
  if (missing.length) {
    try {
      const lat = missing.map((k) => k.split(',')[1]).join(',');
      const lon = missing.map((k) => k.split(',')[0]).join(',');
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const e: number[] = (await res.json()).elevation;
        missing.forEach((k, i) => (c[k] = e[i]));
        try {
          localStorage.setItem(KEY, JSON.stringify(c));
        } catch {
          // storage full – heights are only a convenience
        }
      }
    } catch {
      // offline – use what is cached
    }
  }
  return points.map((p) => c[keyOf(p)] ?? null);
}
