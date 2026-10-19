import type { LngLat, Ring } from '../types';
import type { GreenChart } from '../data/greenCharts';
import type { GreenGrid } from './greenread';
import { demProvidersAt, fetchSquare, fromUtm, toUtm, type DemProvider } from './dem';

// Green charts made on the phone (Sascha 19.10.2026: "every course should have green slopes"): for a course without
// built-in charts, the heights of each green come from the official terrain model of the region (dem.ts) and are
// drawn as on the built-in courses (lidar/greenoverlay.py): slope colours, fall-line arrows every 4 m, 10 cm contours,
// plus the height grid for the putt read and the green's main slope for the caddie. Kept on the phone (IndexedDB) –
// made once per course, then offline.

export interface MadeCharts {
  version: number;
  provider: string;
  credit: string;
  charts: Record<string, { png: Blob; corners: GreenChart['corners'] }>;
  heights: Record<string, GreenGrid>;
  slopes: Record<string, { pct: number; downDeg: number }>;
}

const VERSION = 1;
const S = 20; // px per metre (5 cm per pixel), as the built-in charts
// slope classes (%) and colours, as greenoverlay.py: light blue < 1, blue < 2, green < 3, dark green < 4, red < 5, purple
const CLASSES: [number, [number, number, number]][] = [
  [1, [90, 190, 235]],
  [2, [40, 120, 230]],
  [3, [70, 200, 70]],
  [4, [30, 140, 30]],
  [5, [235, 70, 40]],
  [99, [230, 60, 170]],
];

// ---- the store on the phone ----
const DB = 'golfos-greens';
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('courses');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function loadMade(courseId: string): Promise<MadeCharts | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const q = db.transaction('courses').objectStore('courses').get(courseId);
      q.onsuccess = () => {
        const r = q.result;
        if (r?.version !== VERSION) return resolve(null);
        // the images are kept as bytes (WebKit keeps no Blob in IndexedDB)
        const charts = Object.fromEntries(Object.entries(r.charts as Record<string, { png: ArrayBuffer; corners: GreenChart['corners'] }>).map(([k, c]) => [k, { png: new Blob([c.png], { type: 'image/png' }), corners: c.corners }]));
        resolve({ ...r, charts } as MadeCharts);
      };
      q.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function saveMade(courseId: string, m: MadeCharts): Promise<void> {
  try {
    const charts = Object.fromEntries(await Promise.all(Object.entries(m.charts).map(async ([k, c]) => [k, { png: await c.png.arrayBuffer(), corners: c.corners }] as const)));
    const db = await idb();
    await new Promise<void>((resolve) => {
      const t = db.transaction('courses', 'readwrite');
      t.objectStore('courses').put({ ...m, charts }, courseId);
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
    });
  } catch {
    // private mode or storage full: the charts are made again next time
  }
}

// ---- the grid maths ----
function blur(h: Float32Array, n: number, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const pass = (src: Float32Array, dx: number, dy: number) => {
    const out = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let a = 0;
        let w = 0;
        for (let i = -r; i <= r; i++) {
          // the edge repeats its last cell (as OpenCV's default reflects – the edge is outside the green anyway)
          const xx = Math.min(n - 1, Math.max(0, x + i * dx));
          const yy = Math.min(n - 1, Math.max(0, y + i * dy));
          a += src[yy * n + xx] * k[i + r];
          w += k[i + r];
        }
        out[y * n + x] = a / w;
      }
    return out;
  };
  return pass(pass(h, 1, 0), 0, 1);
}

/** east and north slope (m per m) at a cell, central differences (row 0 = north) */
function grad(h: Float32Array, n: number, x: number, y: number): [number, number] {
  const at = (xx: number, yy: number) => h[Math.min(n - 1, Math.max(0, yy)) * n + Math.min(n - 1, Math.max(0, xx))];
  const gx = (at(x + 1, y) - at(x - 1, y)) / (x > 0 && x < n - 1 ? 2 : 1);
  const gy = (at(x, y - 1) - at(x, y + 1)) / (y > 0 && y < n - 1 ? 2 : 1); // north = up the rows
  return [gx, gy];
}

function inside(x: number, y: number, ring: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
}

/** One green: its chart image, corners, height grid and main slope – null without heights. */
export async function makeGreen(d: DemProvider, ring: Ring, signal?: AbortSignal): Promise<{ png: Blob; corners: GreenChart['corners']; grid: GreenGrid; slope: { pct: number; downDeg: number } } | null> {
  const center: LngLat = [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
  const zone = d.zone(center);
  const ru = ring.map((p) => toUtm(p, zone));
  const [ce, cn] = toUtm(center, zone);
  const half = Math.ceil(Math.max(...ru.map(([e, n]) => Math.max(Math.abs(e - ce), Math.abs(n - cn))))) + 6;
  const sq = await fetchSquare(d, center, half, signal);
  if (!sq) return null;
  const n = sq.size;
  if (sq.h.some((v) => Number.isNaN(v))) return null;
  const hs = blur(sq.h, n, 1.0 / sq.cell);
  // the green in grid metres: x east from the west edge, y south from the north edge
  const north = sq.s + n * sq.cell;
  const poly: [number, number][] = ru.map(([e, nn]) => [e - sq.w, north - nn]);
  const inG = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) inG[y * n + x] = inside((x + 0.5) * sq.cell, (y + 0.5) * sq.cell, poly) ? 1 : 0;
  // the main slope: a plane z = a·x + b·y + c through the green's heights (least squares, x east, y north)
  const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!inG[y * n + x]) continue;
      const v = [(x + 0.5) * sq.cell, -(y + 0.5) * sq.cell, 1];
      const z = hs[y * n + x];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) M[i][j] += v[i] * v[j];
        M[i][3] += v[i] * z;
      }
    }
  if (M[2][2] < 10) return null; // fewer than 10 cells: no green to speak of
  for (let i = 0; i < 3; i++) {
    // Gauss–Jordan with the largest pivot
    let piv = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    [M[i], M[piv]] = [M[piv], M[i]];
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
    }
  }
  const a = M[0][3] / M[0][0];
  const b = M[1][3] / M[1][1];
  const slope = { pct: Math.round(Math.hypot(a, b) * 1000) / 10, downDeg: Math.round(((Math.atan2(-a, -b) * 180) / Math.PI + 360) % 360) };

  // ---- the image ----
  const PX = Math.round(n * sq.cell * S);
  const cv = document.createElement('canvas');
  cv.width = PX;
  cv.height = PX;
  const ctx = cv.getContext('2d')!;
  const gxs = new Float32Array(n * n);
  const gys = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const [gx, gy] = grad(hs, n, x, y);
      gxs[y * n + x] = gx / sq.cell;
      gys[y * n + x] = gy / sq.cell;
    }
  const bil = (f: Float32Array, fx: number, fy: number) => {
    const x0 = Math.min(n - 2, Math.max(0, Math.floor(fx)));
    const y0 = Math.min(n - 2, Math.max(0, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - x0));
    const ty = Math.min(1, Math.max(0, fy - y0));
    return f[y0 * n + x0] * (1 - tx) * (1 - ty) + f[y0 * n + x0 + 1] * tx * (1 - ty) + f[(y0 + 1) * n + x0] * (1 - tx) * ty + f[(y0 + 1) * n + x0 + 1] * tx * ty;
  };
  const img = ctx.createImageData(PX, PX);
  const per = S * sq.cell; // px per cell
  for (let py = 0; py < PX; py++)
    for (let px = 0; px < PX; px++) {
      const fx = (px + 0.5) / per - 0.5;
      const fy = (py + 0.5) / per - 0.5;
      const pct = Math.hypot(bil(gxs, fx, fy), bil(gys, fx, fy)) * 100;
      const c = CLASSES.find(([lim]) => pct < lim)?.[1] ?? CLASSES[CLASSES.length - 1][1];
      const o = (py * PX + px) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 107; // 42 %: lighter colours on the phone (Sascha 15.10.2026)
    }
  ctx.putImageData(img, 0, 0);
  // only the green: everything outside its outline goes (anti-aliased edge)
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  poly.forEach(([x, y], k) => (k ? ctx.lineTo(x * S, y * S) : ctx.moveTo(x * S, y * S)));
  ctx.closePath();
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  // 10 cm contours around and on the green (marching squares on the cells, within 3 m of the green)
  const zone3 = new Uint8Array(n * n);
  const r3 = Math.ceil(3 / sq.cell);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (inG[y * n + x])
        for (let dy = -r3; dy <= r3; dy++) for (let dx = -r3; dx <= r3; dx++) if (x + dx >= 0 && x + dx < n && y + dy >= 0 && y + dy < n) zone3[(y + dy) * n + x + dx] = 1;
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < n * n; k++) if (zone3[k]) { lo = Math.min(lo, hs[k]); hi = Math.max(hi, hs[k]); }
  ctx.strokeStyle = 'rgba(245,245,245,0.31)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let lv = Math.floor(lo * 20) / 20; lv < hi; lv += 0.1) {
    for (let y = 0; y < n - 1; y++)
      for (let x = 0; x < n - 1; x++) {
        if (!zone3[y * n + x]) continue;
        const v = [hs[y * n + x], hs[y * n + x + 1], hs[(y + 1) * n + x + 1], hs[(y + 1) * n + x]];
        const corner: [number, number][] = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
        const pts: [number, number][] = [];
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          if (v[i] >= lv !== v[j] >= lv) {
            const t = (lv - v[i]) / (v[j] - v[i]);
            pts.push([corner[i][0] + t * (corner[j][0] - corner[i][0]), corner[i][1] + t * (corner[j][1] - corner[i][1])]);
          }
        }
        for (let i = 0; i + 1 < pts.length; i += 2) {
          ctx.moveTo((pts[i][0] + 0.5) * per, (pts[i][1] + 0.5) * per);
          ctx.lineTo((pts[i + 1][0] + 0.5) * per, (pts[i + 1][1] + 0.5) * per);
        }
      }
  }
  ctx.stroke();
  // fall-line arrows every 4 m, fine white with a light shadow
  const arrow = (colour: string, off: number) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let ym = 2; ym < n * sq.cell; ym += 4)
      for (let xm = 2; xm < n * sq.cell; xm += 4) {
        const cx = Math.floor(xm / sq.cell);
        const cy = Math.floor(ym / sq.cell);
        if (!inside(xm, ym, poly)) continue;
        const gx = gxs[cy * n + cx];
        const gy = gys[cy * n + cx];
        const L = Math.hypot(gx, gy);
        if (L < 1e-6) continue;
        const ux = -gx / L; // downhill, image x = east
        const uy = gy / L; // image y = south: downhill north (gy < 0) is up
        const ln = S * 0.7;
        const p0 = [xm * S - ux * ln * 0.55 + off, ym * S - uy * ln * 0.55 + off];
        const p1 = [xm * S + ux * ln * 0.55 + off, ym * S + uy * ln * 0.55 + off];
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        for (const ang of [2.6, -2.6]) {
          const hx = ux * Math.cos(ang) - uy * Math.sin(ang);
          const hy = ux * Math.sin(ang) + uy * Math.cos(ang);
          ctx.moveTo(p1[0], p1[1]);
          ctx.lineTo(p1[0] + hx * ln * 0.28, p1[1] + hy * ln * 0.28);
        }
      }
    ctx.stroke();
  };
  arrow('rgba(20,20,20,0.2)', 1);
  arrow('rgba(255,255,255,0.78)', 0);
  const png = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'));
  if (!png) return null;
  const corners: GreenChart['corners'] = [fromUtm(sq.w, north, sq.zone), fromUtm(sq.w + n * sq.cell, north, sq.zone), fromUtm(sq.w + n * sq.cell, sq.s, sq.zone), fromUtm(sq.w, sq.s, sq.zone)];
  let base = Infinity;
  for (const v of hs) base = Math.min(base, v);
  base = Math.floor(base * 100) / 100;
  const grid: GreenGrid = { corners, size: n, ...(sq.cell !== 1 ? { cell: sq.cell } : {}), base, cm: Array.from(hs, (v) => Math.round((v - base) * 100)) };
  return { png, corners, grid, slope };
}

/** The charts of a course without built-in ones: from the phone's store, or made now from the region's terrain
 *  model (null where there is none). `onProgress` counts the greens. */
export async function madeChartsFor(
  courseId: string,
  greens: { ref: string; ring: Ring }[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<MadeCharts | null> {
  const kept = await loadMade(courseId);
  if (kept) return kept;
  if (!greens.length) return null;
  // the service of the region: the first one that has heights for the first green
  let d: DemProvider | null = null;
  for (const cand of demProvidersAt(greens[0].ring[0])) {
    if (signal?.aborted) return null;
    if (await makeGreen(cand, greens[0].ring, signal).catch(() => null)) {
      d = cand;
      break;
    }
  }
  if (!d) return null;
  const m: MadeCharts = { version: VERSION, provider: d.id, credit: d.credit, charts: {}, heights: {}, slopes: {} };
  let done = 0;
  onProgress?.(0, greens.length);
  // three greens at a time: quick, and kind to the services
  const queue = [...greens];
  const work = async () => {
    for (let g = queue.shift(); g; g = queue.shift()) {
      if (signal?.aborted) return;
      try {
        const r = await makeGreen(d, g.ring, signal);
        if (r) {
          m.charts[g.ref] = { png: r.png, corners: r.corners };
          m.heights[g.ref] = r.grid;
          m.slopes[g.ref] = r.slope;
        }
      } catch {
        // one green without heights (service hiccup): the others still come
      }
      onProgress?.(++done, greens.length);
    }
  };
  await Promise.all([work(), work(), work()]);
  if (signal?.aborted || !Object.keys(m.charts).length) return null;
  // kept only when every green came – a hiccup makes them again next time
  if (Object.keys(m.charts).length === greens.length) await saveMade(courseId, m);
  return m;
}
