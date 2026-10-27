// Every US aerial source of the app (public/imagery/us.json) checked live (night run 27./28.10.2026 – Polk County had
// quietly gone away): one tile inside its coverage at z17 – it answers, allows the app's origin (CORS), is a picture and
// not an empty one. Prints a line per source and writes the result as JSON.
// Usage: node scripts/us-imagery-check.mjs [out.json]
// Only reads: removing a source stays a decision by hand (a service down for a night is no reason).
import { readFileSync, writeFileSync } from 'node:fs';

const ORIGIN = 'https://saschamoescheit-cpu.github.io';
const d = JSON.parse(readFileSync(new URL('../public/imagery/us.json', import.meta.url), 'utf-8'));
const out = process.argv[2];

const inRing = ([x, y], ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
// points inside the coverage: the centre of the largest ring (else between centre and a corner), then towards four
// corners – a single point can fall on water or a gap of the service
function points(coverage) {
  const ring = coverage.slice().sort((a, b) => b.length - a.length)[0];
  const c = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  const out = [inside(coverage)];
  for (let k = 0; k < 4; k++) {
    const v = ring[Math.floor((k * ring.length) / 4)];
    const p = [c[0] + (v[0] - c[0]) * 0.6, c[1] + (v[1] - c[1]) * 0.6];
    if (inRing(p, ring)) out.push(p);
  }
  return out;
}
function inside(coverage) {
  const ring = coverage.slice().sort((a, b) => b.length - a.length)[0];
  const c = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  if (inRing(c, ring)) return c;
  for (const v of ring)
    for (const t of [0.5, 0.75, 0.9, 0.97]) {
      const p = [c[0] + (v[0] - c[0]) * t, c[1] + (v[1] - c[1]) * t];
      if (inRing(p, ring)) return p;
    }
  return ring[0];
}
const tileOf = ([lon, lat], z) => {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x, y, z };
};
const bboxOf = ({ x, y, z }) => {
  const size = (2 * Math.PI * 6378137) / 2 ** z;
  const o = Math.PI * 6378137;
  return [x * size - o, o - (y + 1) * size, (x + 1) * size - o, o - y * size].join(',');
};
function urlOf(s, t) {
  const y = s.scheme === 'tms' ? 2 ** t.z - 1 - t.y : t.y;
  return s.tiles.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', y).replace('{bbox-epsg-3857}', bboxOf(t));
}

async function check(s) {
  let r;
  for (const p of points(s.coverage)) {
    r = await checkAt(s, p);
    if (r.ok || /^HTTP 403|ENOTFOUND/.test(r.why)) return r;
  }
  return r;
}
async function checkAt(s, p) {
  const z = Math.min(17, s.maxzoom ?? 17);
  const url = urlOf(s, tileOf(p, z));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { Origin: ORIGIN, Referer: ORIGIN + '/' }, signal: ctl.signal, redirect: 'manual' });
    const type = r.headers.get('content-type') ?? '';
    const cors = r.headers.get('access-control-allow-origin');
    const body = Buffer.from(await r.arrayBuffer());
    const magic = body.length > 3 && ((body[0] === 0xff && body[1] === 0xd8) || (body[0] === 0x89 && body[1] === 0x50) || (body[0] === 0x52 && body[1] === 0x49 && body[8] === 0x57));
    const pic = type.startsWith('image/') || (/octet-stream/.test(type) && magic);
    const ok = r.status === 200 && pic && (cors === '*' || cors === ORIGIN) && body.length > 1500;
    const why = r.status !== 200 ? `HTTP ${r.status}${r.headers.get('location') ? ' → ' + r.headers.get('location') : ''}` : !pic ? `no picture (${type || 'no type'})` : !cors ? 'no CORS' : body.length <= 1500 ? `empty tile (${body.length} B)` : '';
    return { id: s.id, ok, why, type, magic, bytes: body.length, url };
  } catch (e) {
    return { id: s.id, ok: false, why: e.name === 'AbortError' ? 'no answer in 20 s' : String(e.cause?.code ?? e.message), url };
  } finally {
    clearTimeout(timer);
  }
}

const res = [];
const queue = d.sources.slice();
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const s = queue.shift();
      const r = await check(s);
      res.push(r);
      console.log(`${r.ok ? '✓' : '✗'} ${s.id}${r.ok ? '' : ' – ' + r.why}`);
    }
  }),
);
const bad = res.filter((r) => !r.ok);
console.log(`== ${res.length - bad.length} of ${res.length} fine${bad.length ? ' · not fine: ' + bad.map((r) => r.id).join(', ') : ''}`);
if (out) writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), results: res }, null, 1));
