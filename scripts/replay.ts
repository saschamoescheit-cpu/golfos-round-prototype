// Replays an exported round (Schläge prüfen → Runde exportieren) through the shot detection and compares it with the
// shots the player corrected: per hole the distance of every detected shot to the player's own.
// Usage: npx tsx scripts/replay.ts <export.json> [--verbose]
import { readFileSync } from 'node:fs';
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { holeMapData, distanceM, type HoleMapData } from '../src/lib/geo';
import { holeForTee } from '../src/lib/teeline';
import { detectWithScore, splitRound, type TrackPoint } from '../src/lib/track';
import type { Round, LngLat } from '../src/types';

const file = process.argv[2];
const verbose = process.argv.includes('--verbose');
const data = JSON.parse(readFileSync(file, 'utf-8')) as { round: Round; track: TrackPoint[] };
const r = data.round;
const geo = SEED_GEOMETRY[r.courseId];
if (!geo) throw new Error('no seed geometry for ' + r.courseId);
// milliseconds (the QA browser hands out microseconds)
const track = data.track.map((x) => (x.t > 1e14 ? { ...x, t: x.t / 1000 } : x));
const maps: (HoleMapData | null)[] = r.holes.map((h) => holeForTee(holeMapData(geo, h.loop, h.number), r.courseId, h.label, r.tee, geo.tee));
const parts = splitRound(track, maps);
const me = r.players.find((p) => p.isMe)!.id;
let good = 0;
let sumErr = 0;
let n = 0;
const rows: string[] = [];
r.holes.forEach((h, i) => {
  const e = r.entries[me][i];
  const truth = (e.detail?.shots ?? []).map((s) => s.pos).filter((p): p is LngLat => p != null);
  const m = maps[i];
  const found = m && parts[i]?.length ? detectWithScore(parts[i], m, h.par, undefined, e) : null;
  const got = (found?.shots ?? []).map((s) => s.pos).filter((p): p is LngLat => p != null);
  // each true shot: the nearest detected one (by order first, then the nearest)
  const errs = truth.map((t, k) => {
    const same = got[k];
    const near = got.reduce((b, g) => Math.min(b, distanceM(g, t)), Infinity);
    return Math.round(Math.min(same ? distanceM(same, t) : Infinity, near + 15));
  });
  const max = errs.length ? Math.max(...errs) : 0;
  if (max <= 20 && got.length === truth.length) good++;
  for (const x of errs) if (isFinite(x)) {
    sumErr += x;
    n++;
  }
  rows.push(`${h.label.padEnd(4)} par ${h.par} score ${e.strokes ?? '–'} putts ${e.putts ?? '–'} pen ${e.penalties ?? 0} | own ${truth.length} found ${got.length} | errors ${errs.join(', ')} m | fixes ${parts[i]?.length ?? 0}`);
  if (verbose) for (const p of parts[i] ?? []) rows.push(`      ${new Date(p.t).toISOString().slice(11, 19)} ${p.p[0].toFixed(6)},${p.p[1].toFixed(6)} acc ${p.acc}${p.open ? ' OPEN' : ''}`);
});
console.log(rows.join('\n'));
console.log(`\nholes with every shot ≤ 20 m and the right count: ${good} of ${r.holes.length} · mean error ${n ? Math.round(sumErr / n) : '–'} m`);
