// Caddie audit (feature 020): plays every hole of the bundled courses from several spots and in several winds,
// runs the real caddie logic (src/lib/caddieplan.ts) and flags advice that is wrong or contradicts itself.
// Run: npx vite-node scripts/audit.ts  → scripts/audit-out/audit.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { SEED_COURSES } from '../src/data/seedCourses';
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { TEES } from '../src/data/tees';
import { holesFromTags } from '../src/lib/courses';
import { bearingDeg, distanceM, distToLine, holeMapData, lineLength, pointInRing, shiftTee, teeDelta, type HoleMapData } from '../src/lib/geo';
import { move } from '../src/lib/aimpoint';
import { caddieAdvice, teeAimFor, type CaddieOutput } from '../src/lib/caddieplan';
import { DEFAULT_CARRY, playsLike, type Conditions } from '../src/lib/caddie';
import { loadHoleNotes } from '../src/lib/holenotes';
import type { LngLat, Ring } from '../src/types';

type Severity = 'error' | 'warn' | 'info';
interface Finding {
  severity: Severity;
  code: string;
  text: string;
}
interface Case {
  spot: string; // 'tee', '2nd centre', '2nd left' …
  wind: string; // 'calm', 'head', 'tail', 'from left', 'from right'
  from: LngLat;
  aim: LngLat;
  kind: string;
  club: string;
  distance: number;
  playsLike: number;
  lines: string[];
  findings: Finding[];
}
interface HoleReport {
  course: string;
  courseId: string;
  hole: string;
  par: number;
  lengthM: number;
  geometry: { line: LngLat[]; green: Ring | null; fairways: Ring[]; bunkers: Ring[]; water: Ring[]; trees: Ring[]; boundary: Ring[]; tees: Ring[] };
  cases: Case[];
}

const bag = DEFAULT_CARRY;
const longest = (teeShot: boolean) => Math.max(...bag.filter((b) => teeShot || b.club !== 'Dr').map((b) => b.carry));

function winds(holeBearing: number): { name: string; c: Conditions }[] {
  const w = (name: string, fromRel: number) => ({ name, c: { windKmh: 20, gustKmh: 30, windFromDeg: (holeBearing + fromRel + 360) % 360, tempC: 15 } });
  return [{ name: 'calm', c: { windKmh: 0, gustKmh: 0, windFromDeg: 0, tempC: 20 } }, w('head', 0), w('tail', 180), w('from left', 270), w('from right', 90)];
}

const inAny = (p: LngLat, rings: Ring[] | undefined) => (rings ?? []).some((r) => pointInRing(p, r));
const distToRings = (p: LngLat, rings: Ring[] | undefined) => Math.min(Infinity, ...(rings ?? []).map((r) => distToLine(p, r)));

function check(o: { r: CaddieOutput; d: HoleMapData; from: LngLat; teeShot: boolean; par: number; conditions: Conditions; boundary?: Ring[]; trees?: Ring[]; obNote: { obLeft?: boolean; obRight?: boolean } }): Finding[] {
  const { r, d } = o;
  const f: Finding[] = [];
  const add = (severity: Severity, code: string, text: string) => f.push({ severity, code, text });
  const ap = r.ap;
  const fromInside = !o.boundary?.length || inAny(o.from, o.boundary);
  if (o.boundary?.length && fromInside && !inAny(ap.pos, o.boundary)) add('error', 'aim-out', 'Aim point lies outside the course boundary (out of bounds)');
  if (inAny(ap.pos, d.water)) add('error', 'aim-water', 'Aim point lies in water');
  if (inAny(ap.pos, o.trees)) add('error', 'aim-trees', 'Aim point lies in trees');
  if (ap.kind !== 'approach' && inAny(ap.pos, d.bunkers)) add('warn', 'aim-bunker', 'Lay-up/drive aim point lies in a bunker');
  if (ap.kind !== 'approach') {
    const L = ap.landing;
    if (inAny(L, d.water)) add('error', 'land-water', 'Landing spot lies in water');
    if (inAny(L, d.bunkers)) add('warn', 'land-bunker', 'Landing spot lies in a bunker');
    const short = move(L, bearingDeg(o.from, L), -12);
    if (!inAny(L, d.water) && inAny(short, d.water)) add('info', 'water-short', 'Water within 12 m short of the landing spot – a slight mishit is wet');
    const long = move(L, bearingDeg(o.from, L), 15);
    if (inAny(long, d.water)) add('warn', 'water-long', 'Water within 15 m past the landing spot (roll-out)');
  }
  const obDist = distToRings(ap.pos, o.boundary);
  const pinGap = distToRings(d.greenCenter, o.boundary);
  if (fromInside && inAny(ap.pos, o.boundary) && obDist < Math.min(15, pinGap - 1)) add('error', 'aim-near-ob', `Aim point only ${Math.round(obDist)} m from the course boundary`);
  else if (fromInside && inAny(ap.pos, o.boundary) && obDist < Math.min(20, pinGap - 1)) add('warn', 'aim-near-ob', `Aim point only ${Math.round(obDist)} m from the course boundary`);
  // Club choice
  const a = r.advice;
  if (a.shorter && a.carry > r.pl.playsLike + 20 && r.lie === 'normal') add('warn', 'club-long', `${a.club} (carry ${a.carry}) for ${Math.round(r.pl.playsLike)} m plays-like – a shorter club fits`);
  if (a.longer && a.carry < r.pl.playsLike - 10) add('error', 'club-short', `${a.club} (carry ${a.carry}) is too short for ${Math.round(r.pl.playsLike)} m`);
  const ratio = r.pl.playsLike / Math.max(1, r.pl.distance);
  if (r.pl.distance > 40 && (ratio > 1.35 || ratio < 0.7)) add('warn', 'plays-like', `Plays-like ${Math.round(r.pl.playsLike)} m for ${Math.round(r.pl.distance)} m looks implausible`);
  // Strategy
  const toGreen = distanceM(ap.pos, d.greenCenter);
  if (ap.kind === 'drive' && toGreen < 45) add('warn', 'drive-too-close', `Drive aim only ${Math.round(toGreen)} m from the green – too close to approach well`);
  if (ap.kind === 'drive' && d.fairways.length && !inAny(ap.landing, d.fairways)) {
    const off = distToRings(ap.landing, d.fairways);
    if (off > 8) add(off > 15 ? 'warn' : 'info', 'drive-off-fairway', `Drive lands ${Math.round(off)} m off the mapped fairway`);
  }
  if (ap.kind === 'layup') {
    const pinPl = playsLike(distanceM(o.from, d.greenCenter), bearingDeg(o.from, d.greenCenter), o.conditions, null).playsLike;
    if (pinPl < longest(false) - 10) add('warn', 'layup-reachable', `Lay-up although the green (${Math.round(pinPl)} m) is in reach`);
    if (toGreen < 35) add('warn', 'layup-short', `Lay-up leaves only ${Math.round(toGreen)} m`);
  }
  if (ap.kind === 'recovery' && o.teeShot) add('info', 'tee-recovery', 'Trees block the tee shot line – recovery line suggested from the tee');
  // Words
  const text = r.lines.map((l) => l.text);
  const aimText = r.aim ?? '';
  // Hole notes know out of bounds without a distance: never aim towards that side (map boundary: see aim-near-ob).
  const obLeft = !!o.obNote.obLeft;
  const obRight = !!o.obNote.obRight;
  const movesLeft = /\b\d+ m left\b/.test(aimText) && !/centre/.test(aimText);
  const movesRight = /\b\d+ m right\b/.test(aimText) && !/centre/.test(aimText);
  if (movesLeft && obLeft && !movesRight) add('error', 'aim-towards-ob', `Aim moves left although out of bounds is left: "${aimText}"`);
  if (movesRight && obRight && !movesLeft) add('error', 'aim-towards-ob', `Aim moves right although out of bounds is right: "${aimText}"`);
  if (r.warning && text.some((t) => t.startsWith('Landing zone is open'))) add('error', 'open-vs-warning', 'Says "open on both sides" next to a warning');
  if (new Set(text).size !== text.length) add('warn', 'duplicate-line', 'The same sentence appears twice');
  if (/slope \d+ m left/.test(aimText) && /favour the left/.test(text.join(' ')) === false && /balls run left/.test(text.join(' '))) add('error', 'slope-contradiction', 'Slope makes balls run left but the aim also moves left');
  return f;
}

const out: HoleReport[] = [];
for (const [courseId, seed] of Object.entries(SEED_COURSES)) {
  const geo = SEED_GEOMETRY[courseId];
  if (!geo) continue;
  const holes = holesFromTags(seed.holeTags).filter((h) => h.par != null);
  const tees = TEES[courseId];
  const notes = loadHoleNotes(courseId);
  for (const h of holes) {
    let d = holeMapData(geo, h.loop, h.number);
    if (!d) continue;
    if (tees) d = shiftTee(d, teeDelta(tees.holes[h.ref], tees.tees.indexOf(tees.tees.includes('Yellow') ? 'Yellow' : tees.tees[0]), lineLength(d.line)));
    const par = h.par!;
    const terrain = { slopes: geo.fairwaySlopes?.[h.ref], boundary: geo.boundary, trees: geo.trees };
    const note = notes[h.ref] ?? {};
    const pin = d.greenCenter;
    const hb = bearingDeg(d.tee, d.greenCenter);
    const cases: Case[] = [];
    const run = (spot: string, from: LngLat, teeShot: boolean) => {
      for (const w of winds(bearingDeg(from, pin))) {
        const teeAim = teeAimFor({ data: d!, par, pin, bag, conditions: w.c, tendency: new Map(), ...terrain, note });
        const r = caddieAdvice({
          data: d!, par, holeIndex: 3, holeCount: 18, from, teeShot, pin,
          targets: teeAim && distanceM(teeAim.pos, d!.greenCenter) > 60 ? [teeAim.pos] : [],
          teeAim, ...terrain, bag, conditions: w.c, tendency: new Map(), note, lieChoice: null, unit: 'm',
        });
        cases.push({
          spot, wind: w.name, from, aim: r.ap.pos, kind: r.ap.kind, club: r.advice.club, distance: Math.round(r.pl.distance), playsLike: Math.round(r.pl.playsLike),
          lines: r.lines.map((l) => (l.tone ? `[${l.tone}] ` : '') + l.text),
          findings: check({ r, d: d!, from, teeShot, par, conditions: w.c, boundary: geo.boundary, trees: geo.trees, obNote: note }),
        });
        if (spot === 'tee' && w.name === 'calm') calmTee = r;
      }
    };
    let calmTee: CaddieOutput | null = null;
    run('tee', d.tee, true);
    const land = calmTee ? (calmTee as CaddieOutput).ap.pos : null;
    if (par >= 4 && land) {
      const b = bearingDeg(d.tee, land);
      run('2nd centre', land, false);
      run('2nd left', move(land, b - 90, 25), false);
      run('2nd right', move(land, b + 90, 25), false);
      if (par === 5) {
        const r2 = cases.find((c) => c.spot === '2nd centre' && c.wind === 'calm');
        if (r2 && r2.kind !== 'approach' && distanceM(r2.aim, pin) > 40) run('3rd', r2.aim, false);
      }
    } else if (par === 3) {
      run('missed short', move(d.greenCenter, hb, -30), false);
    }
    out.push({
      course: seed.name, courseId, hole: h.ref, par, lengthM: Math.round(lineLength(d.line)),
      geometry: { line: d.line, green: d.green, fairways: d.fairways, bunkers: d.bunkers, water: d.water, trees: (geo.trees ?? []).filter((r) => distToLine(r[0], d!.line) < 120), boundary: geo.boundary ?? [], tees: d.tees },
      cases,
    });
  }
}

mkdirSync('scripts/audit-out', { recursive: true });
writeFileSync('scripts/audit-out/audit.json', JSON.stringify(out));
// Summary in the terminal
const all = out.flatMap((h) => h.cases.flatMap((c) => c.findings.map((f) => ({ ...f, where: `${h.course} ${h.hole} · ${c.spot} · ${c.wind}` }))));
const byCode = new Map<string, number>();
for (const f of all) byCode.set(`${f.severity} ${f.code}`, (byCode.get(`${f.severity} ${f.code}`) ?? 0) + 1);
console.log(`holes ${out.length}, cases ${out.reduce((n, h) => n + h.cases.length, 0)}, findings ${all.length}`);
for (const [k, n] of [...byCode].sort()) console.log(`  ${k}: ${n}`);
const show = process.argv.includes('--list') ? all : all.filter((f) => f.severity === 'error').slice(0, 40);
for (const f of show) console.log(`${f.severity.toUpperCase()} ${f.where}: ${f.text}`);
