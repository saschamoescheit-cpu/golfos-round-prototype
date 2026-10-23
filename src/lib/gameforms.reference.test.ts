import { describe, expect, it } from 'vitest';
import { formDef, standingOf, type FormId, type Game } from './gameforms';

// Night run 22./23.10.2026 (Games 1): the forms recomputed independently – own handicap strokes after the WHS (by the
// holes' stroke index, half the handicap on 9 holes, the form's allowance), own rules of Skins (with and without
// carry-over) and the Stableford duel, own settling – and compared with the app over hundreds of random games.

let seed = 3;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const PARS = [4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4, 4];

function score(par: number): number | null {
  const x = rnd();
  if (x < 0.04) return null; // picked up
  if (x < 0.1) return par - 1;
  if (x < 0.42) return par;
  if (x < 0.76) return par + 1;
  if (x < 0.93) return par + 2;
  return par + 3;
}

function game(form: FormId, n: number, holesN: number, settings: Record<string, number | boolean | string>): Game {
  const def = formDef(form);
  const holes = Array.from({ length: holesN }, (_, i) => ({ label: String(i + 1), par: PARS[i], si: ((i * 7) % holesN) + 1 }));
  const players = Array.from({ length: n }, (_, k) => ({ id: `p${k}`, name: `P${k}`, hcp: Math.floor(rnd() * 37) }));
  return {
    id: 'g', createdAt: '2026-10-23T02:00:00Z', finishedAt: '2026-10-23T06:00:00Z', courseName: 'Test', holes, players, form,
    settings: { ...Object.fromEntries(def.settings.map((s) => [s.key, s.default])), ...settings },
    scores: Object.fromEntries(players.map((p) => [p.id, holes.map((h) => score(h.par))])),
    extra: holes.map(() => ({})), current: holesN - 1,
  };
}

/** WHS: the playing handicap (× allowance) spread by stroke index; 9 holes get half of it. */
function refStrokes(g: Game, hcp: number): number[] {
  const allowance = g.settings.allowance != null ? Number(g.settings.allowance) : 100;
  let h = Math.round((hcp * allowance) / 100);
  const n = g.holes.length;
  if (n === 9) h = Math.round(h / 2);
  const rankOf = g.holes.map((x) => g.holes.filter((y) => y.si < x.si).length); // 0 = hardest
  return g.holes.map((_, i) => Math.floor(h / n) + (rankOf[i] < h % n ? 1 : 0));
}

function refSkins(g: Game) {
  const strokes = Object.fromEntries(g.players.map((p) => [p.id, refStrokes(g, p.hcp ?? 0)]));
  const skins: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
  let pot = 0;
  g.holes.forEach((_, i) => {
    if (g.players.some((p) => g.scores[p.id][i] == null)) return; // a hole counts once everyone has a score
    pot++;
    const nets = g.players.map((p) => ({ id: p.id, v: g.scores[p.id][i]! - strokes[p.id][i] }));
    const low = Math.min(...nets.map((x) => x.v));
    const best = nets.filter((x) => x.v === low);
    if (best.length === 1) {
      skins[best[0].id] += pot;
      pot = 0;
    } else if (!g.settings.carry) pot = 0;
  });
  const stake = Number(g.settings.stake);
  const money = Object.fromEntries(g.players.map((p) => [p.id, skins[p.id] * stake * (g.players.length - 1) - g.players.filter((q) => q.id !== p.id).reduce((a, q) => a + skins[q.id] * stake, 0)]));
  return { skins, money };
}

function refStableford(g: Game) {
  const pts = Object.fromEntries(
    g.players.map((p) => {
      const st = refStrokes(g, p.hcp ?? 0);
      return [p.id, g.holes.reduce((a, h, i) => (g.scores[p.id][i] == null ? a : a + Math.max(0, 2 + h.par + st[i] - g.scores[p.id][i]!)), 0)];
    }),
  );
  const stake = Number(g.settings.stake);
  const money = Object.fromEntries(g.players.map((p) => [p.id, g.players.reduce((a, q) => a + (pts[p.id] - pts[q.id]) * stake, 0)]));
  return { pts, money };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('game forms recomputed independently', () => {
  for (const carry of [true, false])
    it(`Skins (carry-over ${carry ? 'on' : 'off'}): skins and money as the rules say, 2–4 players, 9 and 18 holes`, () => {
      let games = 0;
      for (let k = 0; k < 300; k++) {
        seed = 11 + k * 97;
        const g = game('skins', 2 + (k % 3), k % 2 ? 9 : 18, { carry, stake: 0.5 });
        const app = standingOf(g);
        const ref = refSkins(g);
        for (const r of app.rows) expect(r.points, `game ${k}: skins of ${r.name}`).toBe(ref.skins[r.id]);
        for (const p of g.players) expect(near(app.money![p.id], ref.money[p.id]), `game ${k}: money of ${p.name}`).toBe(true);
        games++;
      }
      expect(games).toBe(300);
    });
  it('Stableford duel: points and settling, with the WHS allowance of the form', () => {
    for (let k = 0; k < 300; k++) {
      seed = 5 + k * 131;
      const g = game('stableford', 2 + (k % 3), k % 2 ? 9 : 18, { stake: 0.2 });
      const app = standingOf(g);
      const ref = refStableford(g);
      for (const r of app.rows) expect(r.points, `game ${k}: points of ${r.name}`).toBe(ref.pts[r.id]);
      for (const p of g.players) expect(near(app.money![p.id], ref.money[p.id]), `game ${k}: money of ${p.name}`).toBe(true);
    }
  });
});
