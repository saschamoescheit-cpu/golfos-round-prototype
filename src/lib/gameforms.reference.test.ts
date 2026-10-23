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

/** Match play the rules' way: hole by hole, over the moment a side leads by more than the holes left. */
function refMatch(g: Game): { diff: number; left: number; decided: boolean } {
  const strokes = Object.fromEntries(g.players.map((p) => [p.id, refStrokes(g, p.hcp ?? 0)]));
  const [a, b] = [g.players[0].id, g.players[1].id];
  let d = 0;
  for (let i = 0; i < g.holes.length; i++) {
    const sa = g.scores[a][i];
    const sb = g.scores[b][i];
    if (sa == null || sb == null) return { diff: d, left: g.holes.length - i, decided: false };
    const na = sa - strokes[a][i];
    const nb = sb - strokes[b][i];
    d += na < nb ? 1 : na > nb ? -1 : 0;
    const left = g.holes.length - 1 - i;
    if (Math.abs(d) > left) return { diff: d, left, decided: true };
  }
  return { diff: d, left: 0, decided: d !== 0 };
}

describe('match play recomputed independently', () => {
  it('one against one: the winner, "3&2" at the moment it is decided, the stake', () => {
    let decidedEarly = 0;
    for (let k = 0; k < 400; k++) {
      seed = 17 + k * 211;
      // whole rounds (no picked-up hole), so the match runs to its decision
      const g = game('match', 2, k % 2 ? 9 : 18, { stake: 5 });
      for (const p of g.players) g.scores[p.id] = g.scores[p.id].map((v, i) => v ?? g.holes[i].par + 2);
      const app = standingOf(g);
      const ref = refMatch(g);
      const a = app.rows.find((r) => r.id === 'A')!;
      expect(a.points, `game ${k}: holes up`).toBe(ref.diff);
      if (ref.decided && ref.left > 0) {
        decidedEarly++;
        expect(app.status, `game ${k}`).toMatch(new RegExp(`gewinnt ${Math.abs(ref.diff)}&${ref.left}|wins ${Math.abs(ref.diff)}&${ref.left}`));
      }
      expect(app.money![g.players[0].id]).toBe(ref.decided ? Math.sign(ref.diff) * 5 : 0);
    }
    expect(decidedEarly).toBeGreaterThan(50);
  });
});

describe('Nassau recomputed independently (no press)', () => {
  it('front, back and total: three bets, each counted once its holes are all played', () => {
    for (let k = 0; k < 300; k++) {
      seed = 23 + k * 173;
      const g = game('nassau', 2, 18, { stake: 2, press: false });
      const strokes = Object.fromEntries(g.players.map((p) => [p.id, refStrokes(g, p.hcp ?? 0)]));
      const [a, b] = [g.players[0].id, g.players[1].id];
      const res = g.holes.map((_, i) => {
        const sa = g.scores[a][i];
        const sb = g.scores[b][i];
        if (sa == null || sb == null) return null;
        const na = sa - strokes[a][i];
        const nb = sb - strokes[b][i];
        return na < nb ? 1 : na > nb ? -1 : 0;
      });
      let bets = 0;
      for (const [from, to] of [[0, 9], [9, 18], [0, 18]]) {
        const part = res.slice(from, to);
        const d = part.reduce<number>((t, r) => t + (r ?? 0), 0);
        if (part.every((r) => r != null) && d) bets += Math.sign(d);
      }
      const app = standingOf(g);
      expect(app.rows.find((r) => r.id === 'A')!.points, `game ${k}: bets`).toBe(bets);
      expect(app.money![a], `game ${k}: money`).toBe(bets * 2);
    }
  });
});

// Night run 23.10.2026 (Games 1, second part): the remaining forms after the rule table of spec 021, recomputed
// the same independent way – net scores from the WHS strokes above, money "difference × stake, everyone with everyone".
const pairwise = (g: Game, pts: Record<string, number>, stake: number) =>
  Object.fromEntries(g.players.map((p) => [p.id, g.players.reduce((a, q) => a + (pts[p.id] - pts[q.id]) * stake, 0)]));
const netOf = (g: Game) => {
  const st = Object.fromEntries(g.players.map((p) => [p.id, refStrokes(g, p.hcp ?? 0)]));
  return (id: string, i: number) => (g.scores[id][i] == null ? null : g.scores[id][i]! - st[id][i]);
};
const allIn = (g: Game, i: number) => g.players.every((p) => g.scores[p.id][i] != null);

describe('Wolf, Las Vegas, Sixes recomputed independently', () => {
  it('Wolf: the wolf rotates, partner or lone wolf, blind doubles – points and money as the rules say', () => {
    let lone = 0;
    for (let k = 0; k < 300; k++) {
      seed = 29 + k * 151;
      const g = game('wolf', 4, k % 2 ? 9 : 18, { stake: 1 });
      const ids = g.players.map((p) => p.id);
      g.extra = g.holes.map((_, i) => {
        const x = rnd();
        if (x < 0.1) return {}; // the wolf did not choose: the hole does not count
        const others = ids.filter((id) => id !== ids[i % 4]);
        return x < 0.35 ? { wolfPartner: null, wolfBlind: x < 0.2 } : { wolfPartner: others[Math.floor(rnd() * 3)] };
      });
      const net = netOf(g);
      const pts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      g.holes.forEach((_, i) => {
        const x = g.extra[i];
        if (!allIn(g, i) || x.wolfPartner === undefined) return;
        const wolf = ids[i % 4];
        const team = x.wolfPartner ? [wolf, x.wolfPartner] : [wolf];
        const rest = ids.filter((id) => !team.includes(id));
        const a = Math.min(...team.map((id) => net(id, i)!));
        const b = Math.min(...rest.map((id) => net(id, i)!));
        if (a === b) return;
        const k2 = x.wolfBlind ? 2 : 1;
        if (team.length === 2) for (const id of a < b ? team : rest) pts[id] += k2;
        else if (a < b) {
          pts[wolf] += 2 * 3 * k2; // 2 points per opponent
          lone++;
        } else for (const id of rest) pts[id] += k2;
      });
      const app = standingOf(g);
      for (const r of app.rows) expect(r.points, `game ${k}: points of ${r.name}`).toBe(pts[r.id]);
      const money = pairwise(g, pts, 1);
      for (const id of ids) expect(near(app.money![id], money[id]), `game ${k}: money`).toBe(true);
    }
    expect(lone).toBeGreaterThan(20);
  });

  for (const flip of [true, false])
    it(`Las Vegas (birdie flip ${flip ? 'on' : 'off'}): team numbers, 10 goes first, the difference in points`, () => {
      for (let k = 0; k < 300; k++) {
        seed = 31 + k * 157;
        const g = game('vegas', 4, k % 2 ? 9 : 18, { stake: 0.1, flip });
        const net = netOf(g);
        const [A, B] = [['p0', 'p1'], ['p2', 'p3']];
        let diff = 0;
        g.holes.forEach((h, i) => {
          if (!allIn(g, i)) return;
          const lowFirst = (t: string[]) => {
            const [lo, hi] = t.map((id) => net(id, i)!).sort((x, y) => x - y);
            return hi >= 10 ? Number(`${hi}${lo}`) : Number(`${lo}${hi}`);
          };
          const highFirst = (t: string[]) => {
            const [lo, hi] = t.map((id) => net(id, i)!).sort((x, y) => x - y);
            return Number(`${hi}${lo}`);
          };
          const birdie = (t: string[]) => t.some((id) => net(id, i)! < h.par);
          let a = lowFirst(A);
          let b = lowFirst(B);
          if (flip && birdie(A) && !birdie(B)) b = highFirst(B);
          if (flip && birdie(B) && !birdie(A)) a = highFirst(A);
          diff += b - a;
        });
        const app = standingOf(g);
        expect(app.rows.find((r) => r.id === 'A')!.points, `game ${k}`).toBe(diff);
        expect(near(app.money!.p0, diff * 0.1) && near(app.money!.p3, -diff * 0.1), `game ${k}: money`).toBe(true);
      }
    });

  it('Sixes: new pairs every six holes (three on 9), better ball, a point for each winner', () => {
    for (let k = 0; k < 300; k++) {
      seed = 37 + k * 163;
      const n = k % 2 ? 9 : 18;
      const g = game('sixes', 4, n, { stake: 2 });
      const net = netOf(g);
      const pts: Record<string, number> = { p0: 0, p1: 0, p2: 0, p3: 0 };
      const seg = n / 3;
      const pairs = [[['p0', 'p1'], ['p2', 'p3']], [['p0', 'p2'], ['p1', 'p3']], [['p0', 'p3'], ['p1', 'p2']]];
      pairs.forEach(([A, B], s) => {
        let d = 0;
        let all = true;
        for (let i = s * seg; i < (s + 1) * seg; i++) {
          if (!allIn(g, i)) {
            all = false;
            continue;
          }
          const a = Math.min(...A.map((id) => net(id, i)!));
          const b = Math.min(...B.map((id) => net(id, i)!));
          d += a < b ? 1 : a > b ? -1 : 0;
        }
        if (all && d) for (const id of d > 0 ? A : B) pts[id]++;
      });
      const app = standingOf(g);
      for (const r of app.rows) expect(r.points, `game ${k}: points of ${r.name}`).toBe(pts[r.id]);
      const money = pairwise(g, pts, 2);
      for (const id of Object.keys(pts)) expect(near(app.money![id], money[id]), `game ${k}: money`).toBe(true);
    }
  });
});

describe('Snake, Dots, Bingo Bango Bongo recomputed independently', () => {
  it('Snake: the last three-putter holds it and pays its length to each of the others', () => {
    for (let k = 0; k < 300; k++) {
      seed = 41 + k * 167;
      const g = game('snake', 2 + (k % 3), 18, { stake: 1 });
      const ids = g.players.map((p) => p.id);
      g.extra = g.holes.map(() => (rnd() < 0.3 ? { threePutt: ids.filter(() => rnd() < 0.4) } : {}));
      const order = g.extra.flatMap((x) => x.threePutt ?? []);
      const holder = order.length ? order[order.length - 1] : null;
      const app = standingOf(g);
      for (const id of ids) {
        const want = !holder ? 0 : id === holder ? -order.length * (ids.length - 1) : order.length;
        expect(near(app.money![id], want), `game ${k}: money of ${id}`).toBe(true);
      }
      if (holder) expect(app.rows[app.rows.length - 1].id, `game ${k}: the holder last`).toBe(holder);
    }
  });

  it('Dots: birdie 1, eagle 2 by itself (gross), plus the chosen dots', () => {
    for (let k = 0; k < 300; k++) {
      seed = 43 + k * 173;
      const g = game('dots', 2 + (k % 3), 18, { stake: 0.5 });
      const ids = g.players.map((p) => p.id);
      const kinds = ['sandy', 'greenie', 'chipin', 'longputt'];
      g.extra = g.holes.map(() => ({ dots: Object.fromEntries(ids.map((id) => [id, kinds.filter(() => rnd() < 0.08)])) }));
      const pts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      g.holes.forEach((h, i) => {
        for (const id of ids) {
          const v = g.scores[id][i];
          if (v != null) pts[id] += v === h.par - 1 ? 1 : v <= h.par - 2 ? 2 : 0;
          pts[id] += g.extra[i].dots![id].length;
        }
      });
      const app = standingOf(g);
      for (const r of app.rows) expect(r.points, `game ${k}: dots of ${r.name}`).toBe(pts[r.id]);
      const money = pairwise(g, pts, 0.5);
      for (const id of ids) expect(near(app.money![id], money[id]), `game ${k}: money`).toBe(true);
    }
  });

  it('Bingo Bango Bongo: one point for each of the three, the difference times the stake', () => {
    for (let k = 0; k < 300; k++) {
      seed = 47 + k * 179;
      const g = game('bbb', 2 + (k % 3), 18, { stake: 0.5 });
      const ids = g.players.map((p) => p.id);
      const pick = () => (rnd() < 0.1 ? null : ids[Math.floor(rnd() * ids.length)]);
      g.extra = g.holes.map(() => ({ bingo: pick(), bango: pick(), bongo: pick() }));
      const pts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      for (const x of g.extra) for (const id of [x.bingo, x.bango, x.bongo]) if (id) pts[id]++;
      const app = standingOf(g);
      for (const r of app.rows) expect(r.points, `game ${k}: points of ${r.name}`).toBe(pts[r.id]);
      const money = pairwise(g, pts, 0.5);
      for (const id of ids) expect(near(app.money![id], money[id]), `game ${k}: money`).toBe(true);
    }
  });
});
