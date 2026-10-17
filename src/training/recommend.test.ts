import { beforeEach, describe, expect, it } from 'vitest';
import { adviceFromRounds } from './recommend';
import type { Round } from '../types';

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
