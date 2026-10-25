import { describe, expect, it } from 'vitest';
import { FORMS, formDef, standingOf, transfers, type FormId, type Game } from './gameforms';

// Every game form played over real rounds (night 18./19.10.2026, Sascha: "play all game forms through"): 9 and 18 holes
// of par 3, 4 and 5, scores from birdie to triple bogey and the odd picked-up hole, handicaps 0–36, every allowed
// number of players. Whatever happens: the standing is a number for everyone, the money adds up to nothing and the
// payments settle it.

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const PARS = [4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4, 4];

/** a real hole: mostly par or bogey, sometimes a birdie or a double, now and then a triple or a picked-up ball */
function score(par: number): number | null {
  const x = rnd();
  if (x < 0.03) return null;
  if (x < 0.08) return par - 1;
  if (x < 0.4) return par;
  if (x < 0.75) return par + 1;
  if (x < 0.92) return par + 2;
  return par + 3;
}

function game(form: FormId, n: number, holesN: number, settings: Record<string, number | boolean | string> = {}): Game {
  const def = formDef(form);
  const holes = Array.from({ length: holesN }, (_, i) => ({ label: String(i + 1), par: PARS[i], si: ((i * 7) % holesN) + 1 }));
  const players = Array.from({ length: n }, (_, k) => ({ id: `p${k}`, name: `P${k}`, hcp: Math.floor(rnd() * 37) }));
  return {
    id: 'g',
    createdAt: '2026-10-18T10:00:00Z',
    finishedAt: '2026-10-18T14:00:00Z',
    courseName: 'Hetzenhof',
    holes,
    players,
    form,
    settings: { ...Object.fromEntries(def.settings.map((s) => [s.key, s.default])), ...settings },
    scores: Object.fromEntries(players.map((p) => [p.id, holes.map((h) => score(h.par))])),
    extra: holes.map(() => ({})),
    current: holesN - 1,
  };
}

describe('every game form over real rounds', () => {
  for (const f of FORMS) {
    const counts = (f.counts ?? Array.from({ length: f.players[1] - f.players[0] + 1 }, (_, k) => f.players[0] + k)).filter((c) => c >= f.players[0] && c <= f.players[1]);
    for (const n of counts)
      for (const holesN of [9, 18])
        it(`${f.id} · ${n} players · ${holesN} holes`, () => {
          for (let round = 0; round < 25; round++) {
            seed = 7 + round * 101 + n * 13 + holesN;
            const g = game(f.id, n, holesN, f.settings.some((s) => s.key === 'stake') ? { stake: 0.5 } : {});
            const st = standingOf(g);
            expect(st.rows.length).toBeGreaterThan(0);
            for (const r of st.rows) expect(Number.isFinite(r.points), `${f.id}: points of ${r.name}`).toBe(true);
            if (st.money) {
              const vals = Object.values(st.money);
              for (const v of vals) expect(Number.isFinite(v), `${f.id}: money`).toBe(true);
              expect(Math.abs(vals.reduce((a, v) => a + v, 0)), `${f.id}: the money adds up to nothing`).toBeLessThan(0.011);
              const paid = transfers(st.money).reduce((a, t) => a + t.amount, 0);
              const won = vals.reduce((a, v) => a + (v > 0 ? v : 0), 0);
              expect(Math.abs(paid - won), `${f.id}: the payments settle the winnings`).toBeLessThan(0.011);
            }
          }
        });
  }
});

/** what the players tap in during the round: wolf partners, bingo/bango/bongo, three-putts, dots, hammers, pairings */
function extras(g: Game): Game {
  const ids = g.players.map((p) => p.id);
  const any = () => ids[Math.floor(rnd() * ids.length)];
  return {
    ...g,
    extra: g.holes.map(() => ({
      wolfPartner: rnd() < 0.2 ? null : any(),
      wolfBlind: rnd() < 0.05,
      bingo: any(),
      bango: rnd() < 0.9 ? any() : null,
      bongo: any(),
      threePutt: rnd() < 0.3 ? [any()] : [],
      dots: Object.fromEntries(ids.map((id) => [id, rnd() < 0.3 ? ['sandy'] : []])),
      hammer: Math.floor(rnd() * 3),
      pairing: 1 + Math.floor(rnd() * 3),
      conceded: rnd() < 0.05 ? (rnd() < 0.5 ? 'A' : 'B') : undefined,
    })),
  };
}

describe('every game form with the taps of a real round and presses', () => {
  for (const f of FORMS) {
    const n = f.counts?.[f.counts.length - 1] ?? f.players[1];
    it(`${f.id} · ${n} players · 18 holes with inputs${f.settings.some((s) => s.key === 'double') ? ' and presses' : ''}`, () => {
      for (let round = 0; round < 25; round++) {
        seed = 991 + round * 37;
        const press = f.settings.some((s) => s.key === 'double');
        let g = extras(game(f.id, n, 18, { ...(f.settings.some((s) => s.key === 'stake') ? { stake: 0.5 } : {}), ...(press ? { double: true, maxStake: '0' } : {}) }));
        if (press) g = { ...g, presses: [{ hole: 3 + Math.floor(rnd() * 5), by: g.players[0].id }, { hole: 11 + Math.floor(rnd() * 5), by: g.players[n - 1].id }] };
        const st = standingOf(g);
        for (const r of st.rows) expect(Number.isFinite(r.points), `${f.id}: points of ${r.name}`).toBe(true);
        if (st.money) {
          const vals = Object.values(st.money);
          for (const v of vals) expect(Number.isFinite(v), `${f.id}: money`).toBe(true);
          expect(Math.abs(vals.reduce((a, v) => a + v, 0)), `${f.id}: the money adds up to nothing`).toBeLessThan(0.011);
        }
      }
    });
  }
});
