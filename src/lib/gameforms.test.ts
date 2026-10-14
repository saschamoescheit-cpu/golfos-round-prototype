import { describe, expect, it } from 'vitest';
import { capLoss, formDef, received, stakeNow, standingOf, transfers, type FormId, type Game } from './gameforms';

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

describe('Chicago and Stableford', () => {
  it('Chicago counts gross points against the quota', () => {
    const st = formDef('chicago').standing(game('chicago', [Array(18).fill(4)], {}, [18]));
    expect(st.rows[0].points).toBe(36 - 21);
  });
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
    // Chicago without handicap: the quota is 39 for everyone
    expect(formDef('chicago').standing(game('chicago', [Array(18).fill(4)], { allowance: '0' }, [18])).rows[0].points).toBe(36 - 39);
  });
  it('a press doubles the stake up to the highest stake', () => {
    const g = game('chicago', [Array(18).fill(4), Array(18).fill(5)], { stake: 0.1, double: true, maxStake: '1.6' });
    g.presses = [1, 2, 3].map((hole) => ({ hole, by: 'p1' }));
    expect(stakeNow(g)).toBeCloseTo(0.8);
    g.presses.push({ hole: 4, by: 'p1' }, { hole: 5, by: 'p1' });
    expect(stakeNow(g)).toBeCloseTo(1.6); // 3.20 would be over the cap
    // 18 points apart × 1.60 €
    expect(standingOf(g).money!.p0).toBeCloseTo(28.8);
  });
  it('nobody loses more than the limit', () => {
    expect(capLoss({ a: 30, b: -20, c: -10 }, 10)).toEqual({ a: 20, b: -10, c: -10 });
    const g = game('skins', [[3, 3, 3], [4, 4, 4], [4, 4, 4]], { stake: 10, maxLoss: '20' });
    expect(standingOf(g).money).toEqual({ p0: 40, p1: -20, p2: -20 });
  });
});

describe('Chicago during the game', () => {
  it('counts the quota pro rata for the holes played', () => {
    // one hole played at par (2 points), playing handicap 18: quota 21 for 18 holes, 1.2 for one hole
    const scores = [[4, ...Array(17).fill(null)]];
    expect(formDef('chicago').standing(game('chicago', scores, {}, [18])).rows[0].points).toBeCloseTo(0.8);
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
