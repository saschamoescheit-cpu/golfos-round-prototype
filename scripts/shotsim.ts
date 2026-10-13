// Shot detection test bench (Sascha, 13.10.2026: "the shot detection must be better by Friday – 9 holes at Hetzenhof,
// on foot"). Simulates walking rounds on the Hetzenhof A loop with realistic phone GPS (a slowly wandering error of
// a few metres, white noise, now and then a wild fix), waiting on the tee, waiting for partners next to the line,
// a pre-shot routine at the ball and putting on the green. Two ways of using the phone:
//   open   – the app stays open the whole time (fixes every second)
//   locked – the phone is in the pocket between shots; it is taken out at the ball (and on the tee and green)
// Then runs the real detection (src/lib/track.ts) and counts found, missed and wrong shots.
// Run: npx vite-node scripts/shotsim.ts [rounds per mode]
import { writeFileSync } from 'node:fs';
import { SEED_COURSES } from '../src/data/seedCourses';
let exported = false;
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { TEES } from '../src/data/tees';
import { holesFromTags } from '../src/lib/courses';
import { distanceM, holeMapData, lineLength, pointAt, bearingDeg, type HoleMapData } from '../src/lib/geo';
import { holeForTee } from '../src/lib/teeline';
import { move } from '../src/lib/aimpoint';
import { detectHoleShots, findStops, splitRound, type TrackPoint } from '../src/lib/track';
import { onGreenAt } from '../src/lib/shots';
import type { LngLat } from '../src/types';

const COURSE = 'osm:relation/1326323';
const ROUNDS = Number(process.argv[2] ?? 6);

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const between = (a: number, b: number) => a + rnd() * (b - a);

// ---- the course ----
const geo = SEED_GEOMETRY[COURSE];
const seedC = SEED_COURSES[COURSE];
const tees = TEES[COURSE];
const holes = holesFromTags(seedC.holeTags)
  .filter((h) => h.par != null && h.loop === 'A')
  .map((h) => {
    let d = holeMapData(geo, h.loop, h.number)!;
    if (tees) d = holeForTee(d, COURSE, h.ref, tees.tees.includes('Yellow') ? 'Yellow' : tees.tees[0], geo.tee) ?? d;
    return { ref: h.ref, par: h.par!, d };
  })
  .filter((h) => h.d);

// ---- where the balls lie: a 12-handicapper ----
function balls(h: { par: number; d: HoleMapData }): { shots: LngLat[]; green: LngLat } {
  const L = lineLength(h.d.line);
  const shots: LngLat[] = [h.d.tee];
  let along = 0;
  const left = () => L - along;
  const lateral = (p: LngLat, sd: number) => move(p, bearingDeg(h.d.tee, h.d.greenCenter) + 90, gauss() * sd);
  let guard = 0;
  while (left() > 25 && guard++ < 6) {
    const isTee = shots.length === 1 && h.par >= 4;
    const len = isTee ? between(185, 225) : Math.min(left() - between(-5, 12), between(140, 175));
    along += len;
    if (left() <= 12) break; // on the green
    shots.push(lateral(pointAt(h.d.line, along), isTee ? 12 : 7));
  }
  // a chip now and then: the approach missed the green by 10–20 m
  if (rnd() < 0.35 && shots.length > 1) {
    // just off the green: outside its outline
    let c = lateral(pointAt(h.d.line, L - between(10, 20)), 5);
    for (let k = 0; k < 20 && onGreenAt(c, h.d); k++) c = move(c, bearingDeg(h.d.greenCenter, h.d.tee), 2);
    shots.push(c);
  }
  const green = move(h.d.greenCenter, between(0, 360), between(0, 7));
  return { shots, green };
}

// ---- phone GPS ----
class Phone {
  t = 0;
  bias: [number, number] = [0, 0];
  out: TrackPoint[] = [];
  last: TrackPoint | null = null;
  open = true;
  justOpened = false;
  openedAt = -1e9;
  constructor(public mode: 'open' | 'locked') {}
  fix(p: LngLat) {
    this.t += 1000;
    // slowly wandering error (multipath, satellites) + white noise + now and then a wild fix
    this.bias = [this.bias[0] * 0.97 + gauss() * 0.5, this.bias[1] * 0.97 + gauss() * 0.5];
    // right after unlocking the phone the first fixes are poor (the GPS chip warms up again)
    const warm = this.open && this.t - this.openedAt < 5000 ? 18 : 0;
    const wild = rnd() < 0.015 ? 25 : warm;
    const e = this.bias[0] + gauss() * 1.8 + (wild ? gauss() * wild : 0);
    const n = this.bias[1] + gauss() * 1.8 + (wild ? gauss() * wild : 0);
    const q: LngLat = [p[0] + e / (111320 * Math.cos((p[1] * Math.PI) / 180)), p[1] + n / 111320];
    if (!this.open) return;
    const acc = wild ? Math.round(between(8, 20)) : Math.round(between(4, 8));
    const pt: TrackPoint = { t: this.t, p: q, acc, ...(this.justOpened ? { open: true } : {}) };
    // the app's recording rule (recordFix): moved ≥ 3 m or 5 s passed, or the first fix after opening
    if (!this.justOpened && this.last && pt.t - this.last.t < 5000 && distanceM(this.last.p, pt.p) < 3) return;
    this.justOpened = false;
    this.out.push(pt);
    this.last = pt;
  }
  setOpen(o: boolean) {
    if (this.mode === 'open') return;
    if (o && !this.open) {
      this.justOpened = true;
      this.openedAt = this.t;
    }
    this.open = o;
  }
}

class Player {
  at: LngLat;
  constructor(public phone: Phone, start: LngLat) {
    this.at = start;
  }
  stand(s: number) {
    for (let k = 0; k < s; k++) this.phone.fix(this.at);
  }
  walk(to: LngLat, speed = between(1.1, 1.4)) {
    const d = distanceM(this.at, to);
    const steps = Math.max(1, Math.round(d / speed));
    const from = this.at;
    for (let k = 1; k <= steps; k++) this.phone.fix([from[0] + ((to[0] - from[0]) * k) / steps, from[1] + ((to[1] - from[1]) * k) / steps]);
    this.at = to;
  }
}

interface Score {
  truth: number;
  found: number;
  missed: number;
  wrong: number;
  green: number;
  greenFound: number;
  holes: number;
  exactHoles: number;
}

function playRound(mode: 'open' | 'locked'): Score {
  const phone = new Phone(mode);
  const pl = new Player(phone, holes[0].d.tee);
  const truths: { shots: LngLat[]; green: LngLat }[] = [];
  holes.forEach((h, n) => {
    const b = balls(h);
    truths.push(b);
    // on the tee: waiting for the group in front, the partners tee off first
    phone.setOpen(rnd() < 0.6);
    pl.stand(Math.round(between(40, 150)));
    pl.walk(h.d.tee);
    phone.setOpen(true);
    pl.stand(Math.round(between(15, 40)));
    for (let k = 1; k < b.shots.length; k++) {
      phone.setOpen(false);
      const target = b.shots[k];
      // a partner's ball on the way: wait next to it (10–30 m off the line) for a while
      if (rnd() < 0.5) {
        const mid = move(pl.at, bearingDeg(pl.at, target), distanceM(pl.at, target) * between(0.3, 0.8));
        const partner = move(mid, bearingDeg(pl.at, target) + (rnd() < 0.5 ? 90 : -90), between(10, 30));
        pl.walk(partner);
        pl.stand(Math.round(between(15, 40)));
      }
      // now and then a look at the distance on the way (not at a ball)
      if (rnd() < 0.3) {
        const mid = move(pl.at, bearingDeg(pl.at, target), distanceM(pl.at, target) * between(0.3, 0.7));
        pl.walk(mid);
        phone.setOpen(true);
        pl.stand(Math.round(between(3, 8)));
        phone.setOpen(false);
      }
      pl.walk(target);
      // at the ball: the phone comes out to read the distance, the routine, the shot
      phone.setOpen(true);
      pl.stand(Math.round(between(20, 45)));
    }
    phone.setOpen(false);
    pl.walk(b.green);
    phone.setOpen(true);
    pl.stand(Math.round(between(60, 150))); // putting, also the partners
    const next = holes[n + 1];
    phone.setOpen(rnd() < 0.5);
    if (next) pl.walk(move(next.d.tee, between(0, 360), between(5, 15)));
  });

  const track = phone.out;
  if (process.env.EXPORT && !exported) {
    exported = true;
    writeFileSync(process.env.EXPORT, JSON.stringify({ track: track.map((x) => (x.open ? [x.t, x.p[0], x.p[1], x.acc, 1] : [x.t, x.p[0], x.p[1], x.acc])), truth: truths }));
  }
  const parts = splitRound(track, holes.map((h) => h.d));
  const s: Score = { truth: 0, found: 0, missed: 0, wrong: 0, green: 0, greenFound: 0, holes: 0, exactHoles: 0 };
  holes.forEach((h, n) => {
    const part = parts[n];
    const det = detectHoleShots(part, h.d, h.par);
    const truth = truths[n].shots;
    const got = (det?.shots ?? []).map((x) => x.pos!).filter(Boolean);
    const used = new Set<number>();
    let found = 0;
    truth.forEach((t) => {
      const k = got.findIndex((g, i) => !used.has(i) && distanceM(g, t) <= 12);
      if (k >= 0) {
        used.add(k);
        found++;
      }
    });
    const exact = got.length === truth.length && truth.every((t) => got.some((g) => distanceM(g, t) <= 12));
    if (process.env.DEBUG && !exact) {
      const toG = (q: LngLat) => Math.round(distanceM(q, h.d.greenCenter));
      console.log(mode, h.ref, 'truth', truth.map(toG).join(','), '| got', got.map(toG).join(','), '| green', det?.onGreen ? toG(det.onGreen) : '-', '| part', part.length, 'opens', part.filter((x) => x.open).map((x) => toG(x.p)).join(','), 'stops', findStops(part).map((x) => toG(x.p) + '/' + Math.round((x.to - x.from) / 1000) + 's').join(' '));
    }
    s.truth += truth.length;
    s.found += found;
    s.missed += truth.length - found;
    s.wrong += got.length - used.size;
    s.green++;
    if (det?.onGreen && (onGreenAt(det.onGreen, h.d) || distanceM(det.onGreen, truths[n].green) <= 10)) s.greenFound++;
    s.holes++;
    if (found === truth.length && got.length === truth.length) s.exactHoles++;
  });
  return s;
}

for (const mode of ['open', 'locked'] as const) {
  const tot: Score = { truth: 0, found: 0, missed: 0, wrong: 0, green: 0, greenFound: 0, holes: 0, exactHoles: 0 };
  for (let r = 0; r < ROUNDS; r++) {
    const s = playRound(mode);
    (Object.keys(tot) as (keyof Score)[]).forEach((k) => (tot[k] += s[k]));
  }
  const pct = (a: number, b: number) => `${Math.round((100 * a) / Math.max(1, b))} %`;
  console.log(
    `${mode.padEnd(6)} · ${ROUNDS} rounds × ${holes.length} holes · shots found ${pct(tot.found, tot.truth)} (${tot.found}/${tot.truth}) · wrong extra ${tot.wrong} · ball on green ${pct(tot.greenFound, tot.green)} · holes exactly right ${pct(tot.exactHoles, tot.holes)}`,
  );
}
