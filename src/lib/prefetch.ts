import type { LngLat } from '../types';
import type { HoleMapData } from './geo';
import type { ImagerySource } from './imagery';

// Offline map for the course: when a round starts, the satellite tiles of every hole are fetched once.
// The service worker keeps them (runtime cache "imagery"), so the map works on the course without reception.

type BBox = [number, number, number, number]; // west, south, east, north

const M_PER_DEG = 111320;

function pad([w, s, e, n]: BBox, m: number): BBox {
  const dLat = m / M_PER_DEG;
  const dLon = m / (M_PER_DEG * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return [w - dLon, s - dLat, e + dLon, n + dLat];
}

function bboxOf(points: LngLat[]): BBox {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function tileXY(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [x, y];
}

/** One tile's URL: {z}/{x}/{y}, or the tile's box in web mercator for a WMS – exactly as MapLibre writes it. */
export function tileUrl(template: string, z: number, x: number, y: number): string {
  if (template.includes('{bbox-epsg-3857}')) {
    // same arithmetic as MapLibre (@mapbox/whoots-js getTileBBox), so the cached tile is found again
    const merc = (px: number, py: number) => {
      const res = (2 * Math.PI * 6378137) / 256 / Math.pow(2, z);
      return [px * res - (2 * Math.PI * 6378137) / 2.0, py * res - (2 * Math.PI * 6378137) / 2.0];
    };
    const yy = Math.pow(2, z) - y - 1;
    const min = merc(x * 256, yy * 256);
    const max = merc((x + 1) * 256, (yy + 1) * 256);
    return template.replace('{bbox-epsg-3857}', min[0] + ',' + min[1] + ',' + max[0] + ',' + max[1]);
  }
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

/** Tile URLs covering each hole: the whole hole at zoom 15–18, tee and green close up at zoom 19. */
export function holeTileUrls(source: ImagerySource, holes: HoleMapData[]): string[] {
  const areas: { box: BBox; zooms: number[] }[] = [];
  for (const h of holes) {
    areas.push({ box: pad(bboxOf([...h.line, ...(h.green ?? [])]), 60), zooms: [15, 16, 17, 18] });
    areas.push({ box: pad(bboxOf([h.greenCenter]), 60), zooms: [19] });
    areas.push({ box: pad(bboxOf([h.tee]), 40), zooms: [19] });
  }
  const urls = new Set<string>();
  for (const { box, zooms } of areas) {
    for (const z of zooms) {
      if (z > source.maxzoom) continue;
      const [x0, y0] = tileXY(box[0], box[3], z);
      const [x1, y1] = tileXY(box[2], box[1], z);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const yy = source.scheme === 'tms' ? 2 ** z - 1 - y : y;
          urls.add(tileUrl(source.tiles, z, x, yy));
        }
      }
    }
  }
  return [...urls];
}

/** Fetches the tiles a few at a time; the service worker stores them. Failed tiles are skipped. */
export async function prefetchTiles(urls: string[], onProgress: (done: number, total: number) => void, signal: AbortSignal): Promise<number> {
  let next = 0;
  let done = 0;
  let failed = 0;
  const worker = async () => {
    while (next < urls.length && !signal.aborted) {
      const url = urls[next++];
      try {
        const res = await fetch(url, { mode: 'cors', signal });
        if (!res.ok) failed++;
        else await res.arrayBuffer();
      } catch {
        failed++;
      }
      onProgress(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return failed;
}
