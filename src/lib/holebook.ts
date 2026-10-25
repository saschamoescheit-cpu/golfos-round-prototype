import { approachFrom, bearingDeg, centroid, distanceM, formatDistance, hazardToCarry, isAhead, lineLength, pointAt, type HoleMapData, type Unit } from './geo';
import type { LngLat } from '../types';
import { sideOf } from './dispersion';
import { heightAt } from './terrain';
import { bestLeave, type GreenGrid } from './greenread';
import { levelName, readGreen } from './caddie';
import { dec, hazardWord, sideWord, tr } from './i18n';
import type { CourseHoleStat } from './history';

// What the course book knows about a hole (feature 027) – also in the caddie on the hole (Sascha 15.10.2026: "the
// course book has important information that belongs in the caddie"): height tee → green, the hazards from the tee
// (to reach / to carry), the green's slope and where to leave the approach, the player's record on the hole.

export interface HoleBook {
  tip?: string; // what a good local player knows (hole notes)
  rise: string | null; // "green 6 m higher"
  hazards: string[]; // "Water left: 180 / 205"
  green: string[];
  record: string[];
  /** the first line of record is the average (own rounds) – else only notes from the history */
  hasRecord: boolean;
}

export function holeBook(p: {
  data: HoleMapData;
  slopes?: [number, number, number?][];
  greenSlope?: { pct: number; downDeg: number };
  grid: GreenGrid | null;
  unit: Unit;
  record?: CourseHoleStat;
  tip?: string;
  /** the player's own strategy here: the tee club that served best, what the caddie's advice was worth (22.10.2026) */
  history?: string[];
}): HoleBook {
  const { data } = p;
  const fmt = (m: number) => formatDistance(m, p.unit);
  const L = lineLength(data.line);
  // hazards from the tee (bunkers and water ahead, nearest first)
  const hazards = [...data.bunkers.map((r) => ({ r, kind: 'bunker' })), ...data.water.map((r) => ({ r, kind: 'water' }))]
    .map((x) => ({ ...x, c: centroid(x.r), ...hazardToCarry(data.tee, x.r) }))
    .filter((x) => isAhead(data.tee, data.greenCenter, x.c) && x.to >= 60 && x.to <= Math.min(320, L - 30))
    .sort((a, b) => a.to - b.to)
    .slice(0, 4)
    .map((x) => {
      const s = sideOf(data.tee, data.greenCenter, x.c);
      const where = Math.abs(s) < 8 ? tr('in the middle', 'mittig') : sideWord(s > 0 ? 'right' : 'left');
      return `${hazardWord(x.kind)} ${where}: ${fmt(x.to)} / ${fmt(x.carry)}`;
    });
  // height tee → green (terrain model along the hole)
  const h0 = heightAt(p.slopes, 0);
  const h1 = heightAt(p.slopes, L - 20);
  const r = h0 != null && h1 != null ? h1 - h0 : null;
  const rise = r != null && Math.abs(r) >= 2 ? tr(`green ${Math.abs(Math.round(r))} m ${r > 0 ? 'higher' : 'lower'}`, `Grün ${Math.abs(Math.round(r))} m ${r > 0 ? 'höher' : 'tiefer'}`) : null;
  // green: main slope and where to leave the approach (from 120 m in front, middle pin)
  const g = p.greenSlope ? readGreen(p.greenSlope, bearingDeg(approachFrom(data), data.greenCenter)) : null;
  const leave = p.grid ? bestLeave(p.grid, data.greenCenter, pointAt(data.line, Math.max(0, L - 120)), data.green) : null;
  const green = [
    ...(g ? [g.level === 'flat' ? tr('almost flat', 'fast flach') : tr(`${g.level} slope, ${g.text}`, `${levelName(g.level)} Neigung, ${g.text}`)] : []),
    ...(leave ? [leave.text] : []),
  ];
  const rec = p.record;
  const record = rec
    ? [
        // three lines in a green tile (Sascha 25.10.2026): the average, then where it comes from – no best score
        `Ø ${dec(rec.avg.toFixed(1))} (${rec.toPar > 0 ? '+' : ''}${dec(rec.toPar.toFixed(1))})`,
        tr(`in ${rec.played} ${rec.played === 1 ? 'round' : 'rounds'}`, `aus ${rec.played} ${rec.played === 1 ? 'Runde' : 'Runden'}`),
        ...(rec.notes.length ? [rec.notes.join(' · ')] : []),
      ]
    : [];
  return { ...(p.tip ? { tip: p.tip } : {}), rise, hazards, green, record: [...record, ...(p.history ?? [])], hasRecord: record.length > 0 };
}

export interface HazardAhead {
  kind: 'bunker' | 'water';
  side: 'left' | 'right' | 'middle';
  to: number; // metres to reach it
  carry: number; // metres to carry it
}

/** The bunkers and water ahead of the player, nearest first – from where the ball lies, up to the green (Sascha
 *  18.10.2026: "from the tee into the coming hazards" in the caddie). */
export function hazardsAhead(data: HoleMapData, from: LngLat, max = 3): HazardAhead[] {
  const toGreen = distanceM(from, data.greenCenter);
  return [...data.bunkers.map((r) => ({ r, kind: 'bunker' as const })), ...data.water.map((r) => ({ r, kind: 'water' as const }))]
    .map((x) => ({ ...x, c: centroid(x.r), ...hazardToCarry(from, x.r) }))
    .filter((x) => isAhead(from, data.greenCenter, x.c) && x.to >= 15 && x.to <= Math.min(320, toGreen + 15))
    .sort((a, b) => a.to - b.to)
    .slice(0, max)
    .map((x) => {
      const s = sideOf(from, data.greenCenter, x.c);
      return { kind: x.kind, side: Math.abs(s) < 8 ? 'middle' : s > 0 ? 'right' : 'left', to: x.to, carry: x.carry };
    });
}
