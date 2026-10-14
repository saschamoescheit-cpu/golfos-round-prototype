import { describe, expect, it } from 'vitest';
import { formDef, received, transfers, type FormId, type Game } from './gameforms';

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
