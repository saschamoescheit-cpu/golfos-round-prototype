import { afterAll, describe, expect, it } from 'vitest';
import { clubCode, tr, useLangForTests } from './i18n';
import { scoreStrategy, clubName, readGreen } from './caddie';
import { slopeAdvice } from './terrain';
import { aimPoint } from './aimpoint';
import { DEFAULT_CARRY } from './caddie';
import type { HoleMapData } from './geo';
import type { LngLat } from '../types';

describe('German texts (021)', () => {
  useLangForTests('de');
  afterAll(() => useLangForTests('en'));
  it('club names and codes', () => {
    expect(clubCode('7i')).toBe('7i');
    expect(clubCode('Dr')).toBe('D');
    expect(clubCode('Hy')).toBe('4H');
    expect(clubName('3W')).toBe('Holz 3');
    expect(tr('New round', 'Neue Runde')).toBe('Neue Runde');
  });
  it('caddie sentences', () => {
    expect(scoreStrategy({ par: 4, received: 1, shotsSoFar: 0 })).toBe('Du bekommst hier 1 Schlag – eine 5 bringt noch 2 Punkte, kein Risiko nötig');
    expect(slopeAdvice(4)!.text).toBe('Fairway hängt von rechts nach links (4 %) – der Ball rollt nach links');
    expect(readGreen({ pct: 2.5, downDeg: 90 }, 0).text).toBe('bricht nach rechts');
  });
  it('out of bounds from the hole notes', () => {
    const M = 1 / 111320;
    const at = (e: number, n: number): LngLat => [9.69 + (e * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + n * M];
    const hole: HoleMapData = { line: [at(0, 0), at(0, 380)], tee: at(0, 0), green: null, greenCenter: at(0, 380), bunkers: [], water: [], fairways: [], tees: [] };
    const a = aimPoint({ data: hole, from: at(0, 0), pin: at(0, 380), par: 4, teeShot: true, bag: DEFAULT_CARRY, conditions: null, tendency: new Map(), note: { obRight: true } });
    expect(a.note).toBe('Aus rechts');
  });
});
