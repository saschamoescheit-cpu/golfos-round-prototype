import { approachFrom, bearingDeg, centroid, formatDistance, hazardToCarry, isAhead, lineLength, pointAt, type HoleMapData, type Unit } from './geo';
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
  rise: string | null; // "green 6 m higher"
  hazards: string[]; // "Water left: 180 / 205"
  green: string[];
  record: string[];
}

export function holeBook(p: {
  data: HoleMapData;
  slopes?: [number, number, number?][];
  greenSlope?: { pct: number; downDeg: number };
  grid: GreenGrid | null;
  unit: Unit;
  record?: CourseHoleStat;
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
        tr(
          `Ø ${dec(rec.avg.toFixed(1))} (${rec.toPar > 0 ? '+' : ''}${dec(rec.toPar.toFixed(1))}) in ${rec.played} ${rec.played === 1 ? 'round' : 'rounds'} · best ${rec.best}`,
          `Ø ${dec(rec.avg.toFixed(1))} (${rec.toPar > 0 ? '+' : ''}${dec(rec.toPar.toFixed(1))}) aus ${rec.played} ${rec.played === 1 ? 'Runde' : 'Runden'} · beste ${rec.best}`,
        ),
        ...(rec.notes.length ? [rec.notes.join(' · ')] : []),
      ]
    : [];
  return { rise, hazards, green, record };
}
