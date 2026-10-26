import { describe, expect, it } from 'vitest';
import { setLang } from './i18n';
import { FORMS, chicagoHole, fitsPlayers, formDef, stakeAt, pairShare, standingOf, transfers, type FormId, type Game, type HoleExtra } from './gameforms';

// Games before the next test round (Sascha 25.10.2026: "alle Spiele simulieren und testen"): Chicago and the presses
// recomputed independently from the written rules, and every form with every player number, 9 and 18 holes and random
// settings played many times over – the money always adds up to zero, the payments settle it to the cent, nothing NaN.

setLang('de');
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const PARS = [4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4, 4];

function score(par: number, pickups: boolean): number | null {
  const x = rnd();
  if (pickups && x < 0.03) return null;
  if (x < 0.02) return par - 2;
  if (x < 0.12) return par - 1;
  if (x < 0.42) return par;
  if (x < 0.74) return par + 1;
  if (x < 0.9) return par + 2;
  if (x < 0.97) return par + 3;
  return par + 6; // a 10 now and then (Chicago "höchstens 9")
}

/** A random game of a form: players, holes, settings from the form's own choices, scores and the form's own input. */
function randomGame(form: FormId, n: number, holesN: number, pickups = true): Game {
  const def = formDef(form);
  const holes = Array.from({ length: holesN }, (_, i) => ({ label: String(i + 1), par: PARS[i], si: ((i * 7) % holesN) + 1 }));
  const players = Array.from({ length: n }, (_, k) => ({ id: `p${k}`, name: `P${k}`, hcp: rnd() < 0.1 ? null : Math.floor(rnd() * 37) - 2 }));
  const settings: Record<string, number | boolean | string> = {};
  for (const s of def.settings) {
    if (s.type === 'bool') settings[s.key] = rnd() < 0.5;
    else if (s.type === 'choice') settings[s.key] = pick(s.options!).value;
    else if (s.type === 'stake') settings[s.key] = pick([0, 0.1, 0.25, 0.5, 1, 2]);
    else settings[s.key] = s.default;
  }
  if (n === 4) settings.partner = pick([1, 2, 3]);
  const ids = players.map((p) => p.id);
  const extra: HoleExtra[] = holes.map((_, i) => {
    const x: HoleExtra = {};
    if (form === 'wolf') {
      const wolf = ids[i % n];
      x.wolfPartner = rnd() < 0.25 ? null : pick(ids.filter((id) => id !== wolf));
      if (x.wolfPartner === null && rnd() < 0.3) x.wolfBlind = true;
    }
    if (form === 'bbb') for (const k of ['bingo', 'bango', 'bongo'] as const) x[k] = rnd() < 0.1 ? null : pick(ids);
    if (form === 'snake' && rnd() < 0.25) x.threePutt = [pick(ids)];
    if (form === 'dots') x.dots = Object.fromEntries(ids.filter(() => rnd() < 0.3).map((id) => [id, ['sandy']]));
    if (form === 'hammer' && rnd() < 0.3) {
      x.hammer = pick([1, 2]);
      if (rnd() < 0.2) x.conceded = pick(['A', 'B'] as const);
    }
    if (form === 'chicago' && rnd() < 0.2) x.pairing = pick([1, 2, 3]);
    return x;
  });
  return {
    id: 'g', createdAt: '2026-10-25T10:00:00Z', finishedAt: '2026-10-25T14:00:00Z', courseName: 'Test', holes, players, form, settings,
    scores: Object.fromEntries(players.map((p) => [p.id, holes.map((h) => score(h.par, pickups))])), extra, current: holesN - 1,
  };
}

// ---------- Chicago, from the written rules ----------

/** WHS strokes by stroke index (hardest first), 9 holes half the handicap; plus handicaps give strokes back. */
function refStrokes(g: Game, hcp0: number | null): number[] {
  // the form's share of the playing handicap ("Vorgabe (WHS)"), 100 % without the setting
  const hcp = hcp0 == null ? 0 : Math.round((hcp0 * Number(g.settings.allowance ?? 100)) / 100);
  if (!hcp) return g.holes.map(() => 0);
  const n = g.holes.length;
  const full = n === 9 ? Math.round(hcp / 2) : hcp;
  const order = g.holes.map((h, i) => ({ i, si: h.si })).sort((a, b) => a.si - b.si);
  const out = g.holes.map(() => 0);
  for (let k = 0; k < Math.abs(full); k++) out[order[k % n].i] += Math.sign(full);
  return out;
}
function refChicago(g: Game) {
  const max9 = g.settings.max9 === true;
  const birdie5 = g.settings.birdie5 === true;
  const eagle10 = g.settings.eagle10 === true;
  const nets = Object.fromEntries(g.players.map((p) => {
    const st = refStrokes(g, p.hcp);
    return [p.id, g.scores[p.id].map((s, i) => (s == null ? null : s - st[i]))];
  }));
  const pts: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
  const perHole: number[] = [];
  g.holes.forEach((h, i) => {
    if (g.players.some((p) => nets[p.id][i] == null)) return perHole.push(0);
    // the rotation: player 1 with player 2, 3, 4 in turn – or the pairing set on the hole
    const k = g.extra[i]?.pairing ?? (i % 3) + 1;
    const ids = g.players.map((p) => p.id);
    const A = [ids[0], ids[k]];
    const B = ids.filter((id) => !A.includes(id));
    const hasPar = (team: string[]) => team.some((id) => nets[id][i]! <= h.par);
    const number = (team: string[], other: string[]) => {
      const v = team.map((id) => nets[id][i]!).map((x) => (max9 ? Math.min(9, x) : x));
      const lo = Math.min(...v);
      const hi = Math.max(...v);
      // the lower first; with "höchstens 9" a team without a par puts the higher first; a 10 or more goes first
      const num = (max9 && !hasPar(team)) || hi >= 10 ? Number(`${hi}${lo}`) : Number(`${lo}${hi}`);
      if (hasPar(other) || (!birdie5 && !eagle10)) return num;
      let off = 0;
      for (const id of team) {
        const d = nets[id][i]! - h.par;
        if (d <= -2) off += eagle10 ? 10 : birdie5 ? 5 : 0;
        else if (d === -1) off += birdie5 ? 5 : 0;
      }
      return num - off;
    };
    const diff = number(B, A) - number(A, B); // + for team A
    for (const id of A) pts[id] += diff;
    for (const id of B) pts[id] -= diff;
    perHole.push(diff);
  });
  return { pts, perHole };
}

describe('Chicago recomputed from the written rules', () => {
  it('pairings, team numbers, house rules, net – points and money over many random games', () => {
    for (let r = 0; r < 400; r++) {
      const g = randomGame('chicago', 4, rnd() < 0.3 ? 9 : 18);
      const ref = refChicago(g);
      const st = standingOf(g);
      for (const p of g.players) {
        expect(st.rows.find((x) => x.id === p.id)!.points).toBe(ref.pts[p.id]);
        expect(st.money![p.id]).toBeCloseTo(ref.pts[p.id] * Number(g.settings.stake), 9);
      }
      // the hole as the app shows it: the difference for team A
      g.holes.forEach((_, i) => {
        const h = chicagoHole(g, i);
        if (h) expect(h.diff).toBe(ref.perHole[i]);
      });
    }
  });
  it('the examples of the rules: 56 against 33, par and birdie 29, bogey and 10 = 95', () => {
    const base = randomGame('chicago', 4, 18, false);
    const g: Game = { ...base, players: base.players.map((p) => ({ ...p, hcp: 0 })), settings: { max9: false, birdie5: false, eagle10: false, stake: 0.1 }, extra: base.extra.map(() => ({})) };
    const set = (i: number, s: number[]) => g.players.forEach((p, k) => (g.scores[p.id][i] = s[k]));
    // hole 1 (par 4): player 1 with player 2 – 6 and 5 = 56 against 3 and 3 = 33
    set(0, [6, 5, 3, 3]);
    expect(chicagoHole(g, 0)!.a.num).toBe(56);
    expect(chicagoHole(g, 0)!.b.num).toBe(33);
    expect(chicagoHole(g, 0)!.diff).toBe(-23);
    // house rules on: par and birdie = 34 − 5 = 29 against two bogeys 55
    const h: Game = { ...g, settings: { ...g.settings, max9: true, birdie5: true, eagle10: true } };
    set(0, [4, 3, 5, 5]);
    expect(chicagoHole(h, 0)!.a.num).toBe(29);
    // a team without a par: bogey and 10 → 9 = 95
    set(0, [3, 4, 5, 10]);
    expect(chicagoHole(h, 0)!.b.num).toBe(95);
  });
});

// ---------- presses ----------

describe('presses: every hole at the stake in force on it', () => {
  it('Chicago and Stableford with random presses – the money hole by hole, points halved with every press (Chicago)', () => {
    for (let r = 0; r < 200; r++) {
      const form = pick(['chicago', 'stableford'] as FormId[]);
      const g = randomGame(form, form === 'chicago' ? 4 : pick([2, 3, 4]), 18, false);
      if (!('double' in g.settings) && form !== 'chicago') continue;
      g.settings.double = true;
      g.settings.stake = 0.1;
      const holes = [...new Set(Array.from({ length: Math.floor(rnd() * 4) }, () => 1 + Math.floor(rnd() * 16)))].sort((a, b) => a - b);
      g.presses = holes.map((hole) => ({ hole, by: 'p0' }));
      const plain = formDef(form);
      const total: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      let prev: Record<string, number> = { ...total };
      g.holes.forEach((_, k) => {
        const upto: Game = { ...g, settings: { ...g.settings, double: false, stake: 1 }, presses: [], scores: Object.fromEntries(Object.entries(g.scores).map(([id, s]) => [id, s.map((v, j) => (j <= k ? v : null))])) };
        const m = plain.standing(upto).money!;
        const at = 0.1 * 2 ** holes.filter((h) => h <= k).length;
        expect(stakeAt(g, k)).toBeCloseTo(at, 9);
        for (const p of g.players) total[p.id] += (m[p.id] - prev[p.id]) * at;
        prev = m;
      });
      const st = standingOf(g);
      for (const p of g.players) expect(st.money![p.id]).toBeCloseTo(total[p.id], 6);
    }
  });
});

// ---------- every form ----------

describe('every form, every player number, 9 and 18 holes, random settings', () => {
  it('the money adds up to zero, the payments settle it to the cent, every player ranked, nothing NaN', () => {
    let games = 0;
    for (const f of FORMS) {
      for (let n = 2; n <= 4; n++) {
        if (!fitsPlayers(f, n)) continue;
        for (const holesN of [9, 18]) {
          for (let r = 0; r < 60; r++) {
            const g = randomGame(f.id, n, holesN);
            const st = standingOf(g);
            games++;
            // every player in the money; the standing ranks the players or – in the team forms – the two sides
            expect(st.rows.length).toBeGreaterThanOrEqual(2);
            if (st.money) expect(Object.keys(st.money).sort()).toEqual(g.players.map((p) => p.id).sort());
            for (const row of st.rows) {
              expect(Number.isFinite(row.points)).toBe(true);
              expect(row.value).not.toMatch(/NaN|undefined|Infinity/);
            }
            const money = st.money ?? {};
            const sum = Object.values(money).reduce((a, v) => a + v, 0);
            expect(Math.abs(sum)).toBeLessThan(0.005 * n);
            for (const v of Object.values(money)) expect(Number.isFinite(v)).toBe(true);
            // the payments: after them everyone stands at zero (to the cent)
            const left: Record<string, number> = Object.fromEntries(Object.entries(money).map(([id, v]) => [id, Math.round(v * 100)]));
            for (const t of transfers(money)) {
              left[t.from] += Math.round(t.amount * 100);
              left[t.to] -= Math.round(t.amount * 100);
              expect(t.amount).toBeGreaterThan(0);
            }
            const rest = Object.values(left).filter((v) => v !== 0);
            expect(rest.length <= 1 && Math.abs(rest[0] ?? 0) <= n).toBe(true); // a cent of rounding at most
            expect(transfers(money).length).toBeLessThanOrEqual(Math.max(0, n - 1));
          }
        }
      }
    }
    expect(games).toBeGreaterThan(2000);
  });
});

describe('the balance per friend (pairShare)', () => {
  it('the Wolf game of the help video: 1× ahead of each opponent is 1 € each, the partner 0 €', () => {
    const m = { alex: 2, ben: 2, chris: -2, thomas: -2 };
    expect(pairShare(m, 'alex', 'chris')).toBe(1);
    expect(pairShare(m, 'alex', 'thomas')).toBe(1);
    expect(pairShare(m, 'alex', 'ben')).toBe(0);
    expect(pairShare(m, 'thomas', 'alex')).toBe(-1);
    expect(pairShare({ a: 3, b: -3 }, 'a', 'b')).toBe(3);
  });
  it('over every form: symmetric to the cent, adds up to the player’s money', () => {
    for (const f of FORMS) {
      for (let n = 2; n <= 4; n++) {
        if (!fitsPlayers(f, n)) continue;
        for (let r = 0; r < 30; r++) {
          const g = randomGame(f.id, n, 18);
          const st = standingOf(g);
          if (!st.money) continue;
          for (const a of g.players) {
            let sum = 0;
            for (const b of g.players) {
              if (b.id === a.id) continue;
              const s = pairShare(st.money, a.id, b.id);
              expect(Number.isFinite(s)).toBe(true);
              expect(s).toBeCloseTo(-pairShare(st.money, b.id, a.id), 9);
              sum += s;
            }
            expect(Math.abs(sum - st.money[a.id])).toBeLessThanOrEqual(0.005 * n + 1e-9);
          }
        }
      }
    }
  });
});
