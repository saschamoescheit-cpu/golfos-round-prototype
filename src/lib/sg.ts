import type { DetailEntry, Lie, Round } from '../types';
import { distanceM } from './geo';
import { firstPuttM, shotsComplete } from './shots';
import { tr } from './i18n';
import { isTeamRound } from './games';
import { loadProfile } from './profile';

// Strokes gained (feature 007): every shot is measured against the average number of strokes a tour pro
// needs to hole out from the same distance and lie. Gaining 0.3 means the shot was 0.3 strokes better than
// a tour pro's average shot from there; a typical amateur loses strokes on most shots.
// Baseline: PGA Tour averages after Mark Broadie ("Every Shot Counts", 2014), rounded – to be confirmed.

type Table = [number, number][]; // [distance, expected strokes]
const YD = 1.09361; // yards per metre
const FT = 3.28084; // feet per metre

const TOUR: Record<Lie | 'green', { unit: number; t: Table }> = {
  tee: { unit: YD, t: [[100, 2.92], [120, 2.99], [140, 2.97], [160, 2.99], [180, 3.05], [200, 3.12], [220, 3.17], [240, 3.25], [260, 3.45], [280, 3.65], [300, 3.71], [320, 3.79], [340, 3.86], [360, 3.92], [380, 3.96], [400, 3.99], [420, 4.02], [440, 4.08], [460, 4.17], [480, 4.28], [500, 4.41], [520, 4.54], [540, 4.65], [560, 4.74], [580, 4.79], [600, 4.82]] },
  fairway: { unit: YD, t: [[0, 1.5], [10, 2.18], [20, 2.4], [40, 2.6], [60, 2.7], [80, 2.75], [100, 2.8], [120, 2.85], [140, 2.91], [160, 2.98], [180, 3.08], [200, 3.19], [220, 3.32], [240, 3.45], [260, 3.58], [280, 3.69], [300, 3.78], [350, 3.95], [400, 4.1], [500, 4.5], [600, 4.85]] },
  rough: { unit: YD, t: [[0, 1.6], [10, 2.34], [20, 2.59], [40, 2.78], [60, 2.91], [80, 2.96], [100, 3.02], [120, 3.08], [140, 3.15], [160, 3.23], [180, 3.31], [200, 3.42], [220, 3.53], [240, 3.64], [260, 3.74], [280, 3.83], [300, 3.9], [400, 4.2], [600, 4.95]] },
  bunker: { unit: YD, t: [[0, 2.0], [10, 2.43], [20, 2.53], [40, 2.82], [60, 3.15], [80, 3.24], [100, 3.23], [120, 3.21], [140, 3.22], [160, 3.28], [180, 3.4], [200, 3.55], [220, 3.7], [240, 3.84], [260, 3.93], [300, 4.04], [400, 4.3], [600, 5.0]] },
  recovery: { unit: YD, t: [[0, 3.0], [50, 3.5], [100, 3.8], [120, 3.78], [140, 3.8], [160, 3.81], [180, 3.82], [200, 3.87], [220, 3.92], [240, 3.97], [260, 4.03], [300, 4.2], [400, 4.5], [600, 5.1]] },
  green: { unit: FT, t: [[0, 1.0], [2, 1.01], [3, 1.04], [4, 1.13], [5, 1.23], [6, 1.34], [7, 1.42], [8, 1.5], [9, 1.56], [10, 1.61], [15, 1.78], [20, 1.87], [30, 1.98], [40, 2.06], [50, 2.14], [60, 2.21], [90, 2.4], [120, 2.6]] },
};

/** Expected strokes of a tour pro to hole out from `m` metres in this lie. */
export function expectedStrokes(m: number, lie: Lie | 'green'): number {
  // A tee shot shorter than 100 yd (short par 3) plays like the fairway.
  const b = lie === 'tee' && m * YD < 100 ? TOUR.fairway : TOUR[lie];
  const x = m * b.unit;
  const t = b.t;
  if (x <= t[0][0]) return t[0][1];
  for (let k = 1; k < t.length; k++) {
    if (x <= t[k][0]) {
      const [x0, y0] = t[k - 1];
      const [x1, y1] = t[k];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return t[t.length - 1][1];
}

export type SgCategory = 'tee' | 'long' | 'approach' | 'around' | 'putting';
export const SG_CATEGORIES: SgCategory[] = ['tee', 'long', 'approach', 'around', 'putting'];
export const SG_LABELS: Record<SgCategory, string> = {
  tee: tr('Off the tee', 'Abschlag'),
  long: tr('Long game', 'Langes Spiel'),
  approach: tr('Approach', 'Annäherung'),
  around: tr('Around the green', 'Rund ums Grün'),
  putting: 'Putting',
};
const AROUND_M = 30 / YD; // within 30 yards of the hole (and not on the green)
const LONG_M = 180; // shots (not off the tee) from further out are "long game": second shots on par 5s, layups

export interface ShotSg {
  category: SgCategory;
  sg: number;
}

/** Strokes gained of every shot and the putting of one hole; null when positions are missing or the hole is not finished. */
export function holeSg(d: DetailEntry, putts: number | null, par: number): ShotSg[] | null {
  const pin = d.pin; // set when the ball is marked on the green (flag or green centre)
  if (!pin || d.shots.length === 0 || d.shots.some((s) => !s.pos)) return null;
  if (!d.holedOut && (d.onGreen == null || putts == null)) return null;
  const firstPutt = firstPuttM({ ...d, pin }) ?? 0;
  const out: ShotSg[] = [];
  d.shots.forEach((s, k) => {
    const from = distanceM(s.pos!, pin);
    const start = expectedStrokes(from, s.lie);
    let end: number;
    if (k + 1 < d.shots.length) end = expectedStrokes(distanceM(d.shots[k + 1].pos!, pin), d.shots[k + 1].lie);
    else if (d.holedOut) end = 0;
    else end = expectedStrokes(firstPutt, 'green');
    const category: SgCategory = k === 0 && par >= 4 ? 'tee' : from <= AROUND_M ? 'around' : from > LONG_M ? 'long' : 'approach';
    out.push({ category, sg: start - end - 1 - (s.penalty ? 1 : 0) });
  });
  if (!d.holedOut && putts != null) out.push({ category: 'putting', sg: expectedStrokes(firstPutt, 'green') - putts });
  return out;
}

export type SgValues = Record<SgCategory | 'total', number>;

export interface SgSummary {
  holes: number; // holes with complete shot data
  per18: SgValues;
  /** Strokes played in each category per 18 holes (putting = putts). */
  shotsPer18: Record<SgCategory, number>;
}

/** Strokes gained against the tour, per 18 holes, over the player's detailed holes. */
export function roundsSg(rounds: Round[]): SgSummary | null {
  rounds = rounds.filter((r) => !isTeamRound(r)); // team scores (scramble, foursomes) are not the player's own
  const sum: Record<SgCategory, number> = { tee: 0, long: 0, approach: 0, around: 0, putting: 0 };
  const shots: Record<SgCategory, number> = { tee: 0, long: 0, approach: 0, around: 0, putting: 0 };
  let holes = 0;
  for (const r of rounds) {
    const me = r.players.find((p) => p.isMe);
    if (!me) continue;
    r.holes.forEach((h, i) => {
      const e = r.entries[me.id][i];
      if (!e.detail || e.pickedUp) return;
      // Holes whose shots do not add up to the score are left out until the player corrected them.
      const d = e.detail;
      // Only holes the player checked: shots from GPS detection that are not confirmed yet, or a shot list that
      // does not start at the tee, would count wrong positions (Sascha, 13.10.2026: "−20 against Hcp 10").
      if (!shotsComplete(d) || d.shots.some((x) => x.review)) return;
      const count = d.shots.length + d.shots.filter((x) => x.penalty).length + (d.holedOut ? 0 : (e.putts ?? 0));
      if (e.strokes != null && count !== e.strokes) return;
      const s = holeSg(d, e.putts, h.par);
      if (!s) return;
      holes++;
      s.forEach((x) => {
        sum[x.category] += x.sg;
        shots[x.category] += x.category === 'putting' ? (e.putts ?? 0) : 1;
      });
    });
  }
  if (!holes) return null;
  const f = 18 / holes;
  const r1 = (v: number) => Math.round(v * f * 10) / 10;
  const per18 = { ...(Object.fromEntries(SG_CATEGORIES.map((c) => [c, r1(sum[c])])) as Record<SgCategory, number>), total: 0 };
  per18.total = Math.round(SG_CATEGORIES.reduce((t, c) => t + per18[c], 0) * 10) / 10;
  const shotsPer18 = Object.fromEntries(SG_CATEGORIES.map((c) => [c, Math.round(shots[c] * f)])) as Record<SgCategory, number>;
  return { holes, per18, shotsPer18 };
}

/**
 * Comparison groups: typical strokes gained against the tour per round. The total grows with the handicap;
 * it is split like Broadie's finding that the long game (tee + approach) makes about two thirds of the gap.
 * Approximate values – to be confirmed by Chris.
 */
// Long game and approach share Broadie's approach part (0.40): about a quarter of it from 180 m and further.
const SHARE: Record<SgCategory, number> = { tee: 0.27, long: 0.1, approach: 0.3, around: 0.17, putting: 0.16 };
export const GROUPS: { id: string; label: string; total: number }[] = [
  { id: 'tour', label: tr('Tour pro', 'Tour-Profi'), total: 0 },
  { id: 'scratch', label: 'Scratch', total: -4 },
  { id: 'h5', label: 'Hcp 5', total: -8 },
  { id: 'h10', label: 'Hcp 10', total: -13 },
  { id: 'h15', label: 'Hcp 15', total: -18 },
  { id: 'h20', label: 'Hcp 20', total: -23 },
  { id: 'h25', label: 'Hcp 25', total: -28 },
];

export function groupSg(id: string): SgValues {
  const g = GROUPS.find((x) => x.id === id) ?? GROUPS[0];
  const v = (c: SgCategory) => Math.round(g.total * SHARE[c] * 10) / 10;
  return { ...(Object.fromEntries(SG_CATEGORIES.map((c) => [c, v(c)])) as Record<SgCategory, number>), total: g.total };
}

/** The comparison group closest to a playing handicap. */
/** The group the player compares himself with: the one chosen in the profile (Golf → Strokes-gained comparison),
 *  else the next better group to the handicap (Sascha 17.10.2026). */
export function comparisonGroup(hcp: number | null): string {
  const chosen = loadProfile().sgGroup;
  return chosen && GROUPS.some((g) => g.id === chosen) ? chosen : groupForHandicap(hcp);
}

export function groupForHandicap(hcp: number | null): string {
  if (hcp == null) return 'h20';
  if (hcp <= 2) return 'scratch';
  // the next better group, not the nearest (Sascha 16.10.2026: "with Hcp 7 the standard should not be Hcp 10"):
  // the player measures himself against where he wants to go
  const better = GROUPS.filter((g) => g.id.startsWith('h') && Number(g.id.slice(1)) <= hcp).sort((a, b) => Number(b.id.slice(1)) - Number(a.id.slice(1)));
  return better[0]?.id ?? 'scratch';
}
