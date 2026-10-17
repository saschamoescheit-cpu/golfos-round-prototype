import { describe, expect, it } from 'vitest';
import { canPress, capChain, onChain, snapCap, chicagoHole, chicagoTeams, formDef, received, stakeCap, stakeNow, standingOf, transfers, type FormId, type Game } from './gameforms';

const holes = (n: number) => Array.from({ length: n }, (_, i) => ({ label: String(i + 1), par: 4, si: i + 1 }));

function game(form: FormId, scores: (number | null)[][], settings: Record<string, number | boolean | string> = {}, hcp: (number | null)[] = []): Game {
  const n = scores[0].length;
  const players = scores.map((_, k) => ({ id: `p${k}`, name: `P${k}`, hcp: hcp[k] ?? 0 }));
  const def = formDef(form);
  return {
    id: 'g',
    createdAt: '2026-10-15T10:00:00Z',
    finishedAt: null,
    courseName: 'Test',
    holes: holes(n),
    players,
    form,
    settings: { ...Object.fromEntries(def.settings.map((s) => [s.key, s.default])), ...settings },
    scores: Object.fromEntries(players.map((p, k) => [p.id, scores[k]])),
    extra: Array.from({ length: n }, () => ({})),
    current: 0,
  };
}

describe('received strokes', () => {
  it('gives the strokes on the hardest holes first', () => {
    expect(received(holes(18), 3).slice(0, 4)).toEqual([1, 1, 1, 0]);
    expect(received(holes(18), 20)[0]).toBe(2);
    expect(received(holes(18), 20)[2]).toBe(1);
  });
  it('halves the handicap on 9 holes', () => {
    expect(received(holes(9), 10).reduce((a, b) => a + b, 0)).toBe(5);
  });
});

describe('skins', () => {
  it('carries a tied skin to the next hole', () => {
    const g = game('skins', [
      [4, 4, 3],
      [4, 5, 4],
      [4, 5, 5],
    ], { stake: 1 });
    const st = formDef('skins').standing(g);
    expect(st.rows[0]).toMatchObject({ id: 'p0', points: 3 }); // hole 1 tied, hole 2 alone (2 skins), hole 3 alone
    expect(st.money).toEqual({ p0: 6, p1: -3, p2: -3 });
  });
  it('without carry-over a tie is lost', () => {
    const g = game('skins', [
      [4, 4],
      [4, 5],
    ], { carry: false });
    expect(formDef('skins').standing(g).rows[0].points).toBe(1);
  });
});

describe('Nassau', () => {
  it('settles front, back and total', () => {
    const a = Array(18).fill(4);
    const b = [...Array(9).fill(5), ...Array(9).fill(4)];
    b[17] = 3; // B wins the last hole: back to B 1 up, total A 8 up
    const st = formDef('nassau').standing(game('nassau', [a, b], { stake: 5 }));
    expect(st.money).toEqual({ p0: 5, p1: -5 }); // front A, back B, total A
  });
});

describe('wolf', () => {
  it('lone wolf wins 2 points from each other player', () => {
    const g = game('wolf', [[3], [4], [4], [4]]);
    g.extra[0] = { wolfPartner: null };
    const st = formDef('wolf').standing(g);
    expect(st.rows[0]).toMatchObject({ id: 'p0', points: 6 });
  });
  it('a partner pair splits the hole', () => {
    const g = game('wolf', [[4], [3], [5], [5]]);
    g.extra[0] = { wolfPartner: 'p1' };
    const pts = Object.fromEntries(formDef('wolf').standing(g).rows.map((r) => [r.id, r.points]));
    expect(pts).toEqual({ p0: 1, p1: 1, p2: 0, p3: 0 });
  });
});

describe('Las Vegas', () => {
  it('builds the team numbers and flips on a birdie', () => {
    // team A 4 & 5 = 45, team B 3 & 6 = 36 with a birdie: A flipped to 54 → B wins by 18
    const st = formDef('vegas').standing(game('vegas', [[4], [5], [3], [6]]));
    expect(st.rows[0]).toMatchObject({ id: 'B', points: 18 });
  });
  it('a score of ten goes first', () => {
    const st = formDef('vegas').standing(game('vegas', [[4], [10], [4], [5]], { flip: false }));
    expect(st.rows[0]).toMatchObject({ id: 'B', points: 104 - 45 });
  });
});

describe('Stableford', () => {
  it('Stableford gives the handicap strokes', () => {
    const st = formDef('stableford').standing(game('stableford', [Array(18).fill(5), Array(18).fill(4)], {}, [18, 0]));
    expect(st.rows.map((r) => r.points)).toEqual([36, 36]);
  });
});

describe('match play', () => {
  it('ends early when the lead is bigger than the holes left', () => {
    const a = [...Array(10).fill(3), ...Array(8).fill(null)];
    const b = [...Array(10).fill(4), ...Array(8).fill(null)];
    expect(formDef('match').standing(game('match', [a, b])).status).toMatch(/10&8/);
  });
});

describe('snake and transfers', () => {
  it('the last three-putt holds the snake and pays everyone the length', () => {
    const g = game('snake', [[4, 4], [4, 4], [4, 4]]);
    g.extra = [{ threePutt: ['p0'] }, { threePutt: ['p1'] }];
    expect(formDef('snake').standing(g).money).toEqual({ p0: 2, p1: -4, p2: 2 });
  });
  it('settles with the fewest payments', () => {
    expect(transfers({ a: 6, b: -3, c: -3 })).toEqual([
      { from: 'b', to: 'a', amount: 3 },
      { from: 'c', to: 'a', amount: 3 },
    ]);
  });
});

describe('handicap share, press and limits (Sascha 15.10.2026)', () => {
  it('plays gross without handicap and with a share of it', () => {
    const scores = [Array(18).fill(5), Array(18).fill(4)];
    expect(formDef('stableford').standing(game('stableford', scores, { allowance: '0' }, [18, 0])).rows.map((r) => r.points)).toEqual([36, 18]);
    expect(formDef('stableford').standing(game('stableford', scores, { allowance: '50' }, [18, 0])).rows.map((r) => r.points)).toEqual([36, 27]);
  });
  it('a press doubles only the coming holes – the money so far stays', () => {
    // skins: P0 wins hole 1 at 1 €, presses are made on hole 2, P0 wins hole 2 at 2 €
    const g = game('skins', [[3, 3], [4, 4]], { stake: 1, double: true, maxStake: '0' });
    g.presses = [{ hole: 1, by: 'p1' }];
    expect(standingOf(g).money).toEqual({ p0: 3, p1: -3 });
  });
});

describe("Chicago as Sascha's group plays it", () => {
  // the house rules (Sascha 17.10.2026), par 4: Max & Sascha against Sam & Cedric = p0, p1 against p2, p3
  const house = (scores: number[]) => {
    const g = game('chicago', scores.map((x) => [x]), { stake: 0.1, max9: true, birdie5: true });
    g.holes = g.holes.map((h) => ({ ...h, par: 4 }));
    return chicagoHole(g, 0)!;
  };
  it('house rules: par par 44 against bogey double 65', () => {
    expect([house([4, 4, 5, 6]).a.num, house([4, 4, 5, 6]).b.num]).toEqual([44, 65]);
  });
  it('house rules: the highest score is 9, turned round – bogey and a 10 = 95', () => {
    expect(house([4, 4, 5, 10]).b.num).toBe(95);
  });
  it('house rules: par and birdie 29 against bogey and double 65', () => {
    expect([house([4, 3, 5, 6]).a.num, house([4, 3, 5, 6]).b.num]).toEqual([29, 65]);
  });
  it('house rules: two birdies 23 against 65', () => {
    expect([house([3, 3, 5, 6]).a.num, house([3, 3, 5, 6]).b.num]).toEqual([23, 65]);
  });
  it('house rules: par and birdie = 34 − 5 = 29 when the other team has no par', () => {
    expect(house([4, 3, 5, 6]).a.num).toBe(29);
  });
  it('house rules: no −5 when somebody in the other team makes par', () => {
    expect(house([3, 4, 4, 6]).a.num).toBe(34);
    expect(house([4, 4, 4, 6]).b.num).toBe(46);
  });
  it('house rules: no par on either side – both teams put the higher score first', () => {
    const h = house([5, 6, 7, 5]);
    expect([h.a.num, h.b.num]).toEqual([65, 75]);
  });
  it('house rules: two birdies = 33 − 10 = 23', () => {
    expect(house([3, 3, 5, 6]).a.num).toBe(23);
  });
  it('a score of 10 or more goes first: 10 and 4 = 104 (to be checked again)', () => {
    // A 10, B 4 = 104 against C 5, D 5 = 55 → 49 for C and D
    const st = standingOf(game('chicago', [[10], [4], [5], [5]], { stake: 0.1, allowance: '0', max9: false, birdie5: false }));
    expect(st.rows.find((r) => r.id === 'p2')!.points).toBe(49);
    expect(st.rows.find((r) => r.id === 'p0')!.points).toBe(-49);
  });
  // players A, B, C, D = p0 … p3
  it('makes a two-digit number of each team and gives the difference to every player', () => {
    // hole 1: A+B against C+D; Sascha 6 and Cedric 5 = 56, Jonas 3 and Maggi 3 = 33 → 23
    const st = standingOf(game('chicago', [[6], [5], [3], [3]], { stake: 0.1, max9: false, birdie5: false }));
    expect(Object.fromEntries(st.rows.map((r) => [r.id, r.points]))).toEqual({ p0: -23, p1: -23, p2: 23, p3: 23 });
    expect(st.money!.p2).toBeCloseTo(2.3);
    expect(Object.values(st.money!).reduce((a, b) => a + b, 0)).toBeCloseTo(0);
  });
  it('rotates the three pairings, and a hole can have its own', () => {
    const g = game('chicago', [[4, 4, 4], [4, 4, 4], [4, 4, 4], [4, 4, 4]]);
    expect(chicagoTeams(g, 0)).toEqual([['p0', 'p1'], ['p2', 'p3']]);
    expect(chicagoTeams(g, 1)).toEqual([['p0', 'p2'], ['p1', 'p3']]);
    expect(chicagoTeams(g, 2)).toEqual([['p0', 'p3'], ['p1', 'p2']]);
    g.extra[2] = { pairing: 1 };
    expect(chicagoTeams(g, 2)).toEqual([['p0', 'p1'], ['p2', 'p3']]);
  });
  it('a press doubles the stake and halves all points – the money so far stays', () => {
    // hole 1: A+B 56 against C+D 33 (A −23); A presses on hole 2; hole 2: A+C 44 against B+D 55 (A +11 at double stake)
    const g = game('chicago', [[6, 4], [5, 5], [3, 4], [3, 5]], { stake: 0.1, max9: false, birdie5: false });
    g.presses = [{ hole: 1, by: 'p0' }];
    const st = standingOf(g);
    expect(stakeNow(g)).toBeCloseTo(0.2);
    expect(st.money!.p0).toBeCloseTo(-0.1); // −23 × 0,10 + 11 × 0,20
    expect(st.rows.find((r) => r.id === 'p0')!.points).toBeCloseTo(-0.5); // −23 halved + 11
  });
  it('the highest stake snaps to the doubling chain, or counts presses', () => {
    expect(stakeCap({ settings: { stake: 0.15, double: true, maxStake: '3.6' } })).toBeCloseTo(2.4);
    expect(stakeCap({ settings: { stake: 0.1, double: true, maxStake: '3.6' } })).toBeCloseTo(3.2);
    expect(stakeCap({ settings: { stake: 0.1, double: true, maxStake: '0', maxPresses: '2' } })).toBeCloseTo(0.4);
    const g = game('chicago', [[4], [4], [4], [4]], { stake: 0.15, maxStake: '3.6' });
    g.presses = [0, 0, 0, 0].map((hole) => ({ hole, by: 'p0' })); // 0,15 → 2,40
    expect(canPress(g)).toBe(false);
  });
  it('the cap is a step of the doubling chain – chips to 6,40 €, typed ones checked', () => {
    expect(capChain(0.1)).toEqual([0.2, 0.4, 0.8, 1.6, 3.2, 6.4]);
    expect(capChain(0.15)).toEqual([0.3, 0.6, 1.2, 2.4, 4.8]);
    expect(onChain(0.1, 12.8)).toBe(true);
    expect(onChain(0.1, 25.6)).toBe(true);
    expect(onChain(0.1, 10)).toBe(false);
    expect(onChain(0.1, 12.2)).toBe(false);
    expect(onChain(0.1, 0.1)).toBe(false);
    expect(snapCap(0.15, 1.6)).toBeCloseTo(1.2);
    expect(snapCap(2, 1.6)).toBeCloseTo(4);
  });
  it('net without stroke index spreads the strokes over the round', () => {
    const noSi = Array.from({ length: 18 }, (_, i) => ({ label: String(i + 1), par: 4, si: 0 }));
    const got = received(noSi, 6).map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    expect(got).toHaveLength(6);
    expect(Math.max(...got) - Math.min(...got)).toBeGreaterThan(10); // not just the first six holes
  });
});

describe('hammer, rabbit, acey deucey and free teams (night run 15./16.10.2026)', () => {
  it('a hammered hole is worth double, a declined hammer gives the hole up', () => {
    const g = game('hammer', [[4, 5, 4], [5, 4, 4]], { stake: 1 });
    g.extra = [{ hammer: 1 }, {}, { hammer: 2, conceded: 'B' }];
    // hole 1: A wins ×2 = +2, hole 2: B wins ×1 = −1, hole 3: B gave up at ×4 = +4
    expect(formDef('hammer').standing(g).money).toEqual({ p0: 5, p1: -5 });
  });
  it('the rabbit is caught by an outright win, set free by another, and paid after the nine', () => {
    const scores = [
      [3, 4, 4, 4, 4, 4, 4, 4, 4],
      [4, 3, 4, 4, 4, 4, 4, 4, 4],
      [4, 4, 4, 4, 4, 4, 4, 4, 3],
    ];
    // hole 1: P0 catches it, hole 2: P1 sets it free, hole 9: P2 catches it and holds it at the end of the nine
    const st = formDef('rabbit').standing(game('rabbit', scores, { stake: 2 }));
    expect(st.rows[0]).toMatchObject({ id: 'p2', points: 1 });
    expect(st.money).toEqual({ p0: -2, p1: -2, p2: 4 });
  });
  it('acey deucey: the best collects from each, the worst pays each', () => {
    const st = formDef('acey').standing(game('acey', [[3], [4], [4], [6]], { stake: 1 }));
    // ace P0 +3, the others −1; deuce P3 −3, the others +1
    expect(st.money).toEqual({ p0: 4, p1: 0, p2: 0, p3: -4 });
  });
  it('teams are free to choose: player 1 with the partner set', () => {
    const g = game('vegas', [[4], [5], [3], [6]], { partner: 2, flip: false });
    // teams P0 & P2 (34) against P1 & P3 (56): +22 for P0's team
    const st = formDef('vegas').standing(g);
    expect(st.rows[0]).toMatchObject({ id: 'A', points: 22 });
    expect(st.money!.p2).toBeGreaterThan(0);
  });
});
