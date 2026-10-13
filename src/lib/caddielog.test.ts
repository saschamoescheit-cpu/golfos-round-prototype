import { beforeEach, describe, expect, it } from 'vitest';
import { loadCaddieLog, rateCaddie, recordCaddie, type CaddieLogEntry } from './caddielog';
import type { LngLat } from '../types';

const M = 1 / 111195;
const at = (n: number): LngLat => [9.69, 48.78 + n * M];
const entry = (n: number, club: string): CaddieLogEntry => ({ t: n, pos: at(n), toPin: 300 - n, club, playsLike: 300 - n, aim: null, plan: null, warning: null });

describe('caddie log', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;
  });
  it('one entry per spot: the newest advice at the same spot replaces the older one', () => {
    recordCaddie('r', 0, entry(0, 'Dr'));
    recordCaddie('r', 0, entry(5, '3W')); // 5 m on: same spot
    recordCaddie('r', 0, entry(200, 'SW')); // second shot
    const log = loadCaddieLog('r');
    expect(log[0].map((e) => e.club)).toEqual(['3W', 'SW']);
  });
  it('the player rates an advice; a newer advice at the same spot keeps the rating', () => {
    recordCaddie('r', 2, entry(0, 'Dr'));
    rateCaddie('r', 2, 0, 'other', 'Holz 3 wegen Wasser');
    recordCaddie('r', 2, entry(3, 'Dr'));
    expect(loadCaddieLog('r')[2][0]).toMatchObject({ verdict: 'other', note: 'Holz 3 wegen Wasser' });
  });
});

describe('putt reads in the caddie log', () => {
  it('a putt read next to the chip spot does not replace the chip advice', () => {
    const id = 'putt-test';
    const at = (m: number): [number, number] => [2.8, 39.47 + m / 111320];
    recordCaddie(id, 0, { t: 1, pos: at(0), toPin: 15, club: 'LW', playsLike: 15, aim: 'Chip', plan: null, warning: null });
    recordCaddie(id, 0, { t: 2, pos: at(10), toPin: 5, club: 'Putt', playsLike: 5, aim: 'Putt 5 m', plan: null, warning: null });
    expect(loadCaddieLog(id)[0].map((e) => e.club)).toEqual(['LW', 'Putt']);
  });
});
