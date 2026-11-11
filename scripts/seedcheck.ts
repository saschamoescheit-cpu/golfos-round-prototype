// A bundled course checked hole by hole (Sascha 12.11.2026, USA: "Falcon's Fire and Southern Dunes we still play – check
// that everything fits"): par and stroke index against the tees' lengths, each hole line against its longest and
// shortest tee, the green at the line's end, a tee at its start, the stroke indexes 1–18 once each, the walk from a
// green to the next tee. Usage: npx tsx scripts/seedcheck.ts <course id>
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { SEED_COURSES } from '../src/data/seedCourses';
import { TEES } from '../src/data/tees';
import { RATINGS } from '../src/data/ratings';

const id = process.argv[2];
const g = SEED_GEOMETRY[id];
const c = SEED_COURSES[id];
const t = TEES[id];
if (!g || !c) throw new Error(`no bundled course ${id}`);
const m = (a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);
const centre = (ring: number[][]) => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
const near = (p: number[], rings: number[][][]) => Math.min(Infinity, ...rings.map((r) => m(p, centre(r))));
console.log(`${c.name} (${id}): ${g.holes.length} holes, ${g.green.length} greens, ${g.tee.length} tees, ${g.bunker.length} bunkers; tees ${t?.tees.join('/') ?? '–'}; ratings ${RATINGS[id] ? Object.keys(RATINGS[id]).join('/') : '–'}`);
const tags = c.holeTags ?? [];
const sis = new Set<string>();
let bad = 0;
const flag = (s: string) => {
  bad++;
  return `  <- ${s}`;
};
let prevGreen: number[] | null = null;
for (const h of [...g.holes].sort((a, b) => Number(a.ref) - Number(b.ref))) {
  const tag = tags.find((x) => x.ref === h.ref);
  const par = Number(tag?.par ?? h.par);
  const si = tag?.handicap ?? h.handicap;
  sis.add(String(si));
  const len = h.line.slice(1).reduce((s, p, i) => s + m(h.line[i], p), 0);
  const row = (t?.holes[h.ref] ?? []).filter((x): x is number => x != null);
  const lo = row.length ? Math.min(...row) : NaN;
  const hi = row.length ? Math.max(...row) : NaN;
  const notes: string[] = [];
  if (row.length && (len < lo * 0.85 - 25 || len > hi * 1.1 + 25)) notes.push(flag(`length ${Math.round(len)} vs tees ${lo}–${hi}`));
  if (row.length && ((par === 3 && hi > 260) || (par === 4 && (hi < 220 || hi > 470)) || (par === 5 && hi < 400))) notes.push(flag(`par ${par} with ${hi} m`));
  const gEnd = near(h.line[h.line.length - 1], g.green);
  if (gEnd > 25) notes.push(flag(`no green at the end (${Math.round(gEnd)} m)`));
  const tStart = g.tee.length ? near(h.line[0], g.tee) : NaN;
  const walk = prevGreen ? m(prevGreen, h.line[0]) : 0;
  if (walk > 450) notes.push(flag(`${Math.round(walk)} m from the last green`));
  console.log(`${h.ref.padStart(2)} par ${par} si ${String(si).padStart(2)}  line ${String(Math.round(len)).padStart(3)} m  tees ${row.join('/')}  green ${Math.round(gEnd)} m  tee ${Number.isFinite(tStart) ? Math.round(tStart) + ' m' : '–'}  walk ${Math.round(walk)} m${notes.join('')}`);
  prevGreen = h.line[h.line.length - 1];
}
if (sis.size !== 18 || [...Array(18)].some((_, i) => !sis.has(String(i + 1)))) {
  bad++;
  console.log(`stroke index not 1–18 once each: ${[...sis].sort((a, b) => Number(a) - Number(b)).join(',')}`);
}
console.log(bad ? `${bad} to look at` : 'all fits');
