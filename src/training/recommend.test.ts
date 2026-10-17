import { beforeEach, describe, expect, it } from 'vitest';
import { adviceFromRounds } from './recommend';
import type { HoleEntry, Round } from '../types';
import { DRILLS } from './content';

// 9-hole players (Rounds, 16.10.2026): values per round are shown per 9 holes with the target halved – never doubled.
const round = (id: string, n: number, putts: number): Round =>
  ({
    id,
    createdAt: '2026-10-10T10:00:00Z',
    finishedAt: '2026-10-10T12:00:00Z',
    signedAt: '2026-10-10T12:05:00Z',
    courseId: 'c',
    courseName: 'QA',
    loopOrder: ['Main'],
    holes: Array.from({ length: n }, (_, k) => ({ index: k, label: String(k + 1), loop: 'Main', number: k + 1, par: 4, strokeIndex: k + 1 })),
    mode: 'quick',
    players: [{ id: 'me', name: 'S', playingHandicap: 16, isMe: true }],
    entries: { me: Array.from({ length: n }, () => ({ strokes: 6, putts, pickedUp: false, fairway: null, penalties: 0 })) },
    currentHole: n - 1,
  }) as unknown as Round;

describe('advice from 9-hole rounds', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;
  });

  it('putts per 9 holes, not doubled', () => {
    const advice = adviceFromRounds([round('a', 9, 2), round('b', 9, 2), round('c', 9, 2)]);
    const putting = advice.find((a) => a.cat === 'putting');
    expect(putting?.why).toMatch(/per 9 holes|je 9 Löcher/);
    expect(putting?.why).toMatch(/: 18 /); // 2 putts × 9 holes – the 9-hole value itself, not 36
  });

  it('no advice for 9-hole players counts per 18 holes (putts, strokes gained …)', () => {
    const advice = adviceFromRounds([round('a', 9, 3), round('b', 9, 3), round('c', 9, 2)]);
    expect(advice.length).toBeGreaterThan(0);
    for (const x of advice) expect(x.why, x.why).not.toMatch(/per round|pro Runde/);
  });

  it('18-hole rounds stay per round', () => {
    const advice = adviceFromRounds([round('a', 18, 2), round('b', 18, 2)]);
    const putting = advice.find((a) => a.cat === 'putting');
    expect(putting?.why).toMatch(/per round|pro Runde/);
  });
});

// The patterns behind the advice (night 17./18.10.2026): each pattern of the rounds points to its topic and drills.
type E = Partial<HoleEntry>;
const shaped = (id: string, entry: (k: number) => E): Round => {
  const r = round(id, 18, 2);
  r.entries.me = r.entries.me.map((e, k) => ({ ...e, greensideBunker: false, upAndDown: null, ...entry(k) }));
  return r;
};

describe('advice from patterns in the rounds', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;
  });

  it('fairways missed mostly right → slice drills', () => {
    const rs = ['a', 'b'].map((id) => shaped(id, (k) => ({ strokes: 5, fairway: k % 6 === 0 ? 'left' : k % 6 === 1 ? 'hit' : 'right' })));
    const flight = adviceFromRounds(rs).find((a) => a.cat === 'ballflight');
    expect(flight?.why).toMatch(/slice/i);
    expect(flight?.drills).toContain('slice-gate');
  });

  it('many three-putts → length drills, not short-putt drills', () => {
    const rs = ['a', 'b'].map((id) => shaped(id, (k) => ({ strokes: 6, putts: k % 3 === 0 ? 3 : 2 })));
    const putting = adviceFromRounds(rs).find((a) => a.cat === 'putting');
    expect(putting?.drills[0]).toBe('lag-circle');
  });

  it('no sand saves → bunker drills', () => {
    const rs = ['a', 'b'].map((id) => shaped(id, (k) => ({ strokes: k < 4 ? 6 : 5, greensideBunker: k < 4, sandShots: k < 4 ? 1 : 0, upAndDown: k < 4 ? false : null })));
    const all = adviceFromRounds(rs);
    const bunker = all.find((a) => a.cat === 'bunker');
    expect(bunker?.why).toMatch(/Sand/);
    expect(bunker?.drills).toContain('line-in-sand');
  });

  it('every suggested drill exists and the advice is short (at most four)', () => {
    const scenarios = [
      ['a', 'b'].map((id) => shaped(id, (k) => ({ strokes: 7, fairway: k % 2 ? 'right' : 'left', putts: 3, penalties: k % 4 === 0 ? 1 : 0 }))),
      ['a', 'b'].map((id) => shaped(id, (k) => ({ strokes: 5, fairway: k % 5 === 0 ? 'right' : 'left', putts: 1, greensideBunker: k < 3, sandShots: k < 3 ? 2 : 0 }))),
      [round('a', 9, 2), round('b', 18, 3)],
    ];
    for (const rs of scenarios) {
      const advice = adviceFromRounds(rs);
      expect(advice.length).toBeLessThanOrEqual(4);
      for (const x of advice) for (const d of x.drills) expect(DRILLS.some((y) => y.id === d), `${x.cat}: ${d}`).toBe(true);
    }
  });
});
