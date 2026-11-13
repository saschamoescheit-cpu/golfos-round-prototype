import { afterEach, describe, expect, it } from 'vitest';
import type { LngLat, Round } from '../types';
import { learnedClub, learnedKind, learnedShots, useLearned, type LearnedShot } from './shotlearn';
import { suggestKind } from './shots';
import { cartSpot, rodeCart, type TrackPoint } from './track';
import { distanceM, distToLine } from './geo';

// Sascha 13.11.2026: "Bei der Schlagnachbereitung werden oft falsche Positionen und Schläger vorgeschlagen … ebenso
// schlägt er aus Pitch-Distanzen oft volle Schwünge vor"; "Wenn Texas Wedge gewählt wird, muss der Schlag immer Chip
// sein"; "Bei Schlägen ums Grün … sollte der Chip als Vorauswahl sein".
const pitches = (from: number, to: number, club: 'GW' | 'SW' = 'GW'): LearnedShot[] =>
  Array.from({ length: 6 }, (_, k) => ({ toPin: from + ((to - from) * k) / 5, lie: 'fairway' as const, kind: 'pitch' as const, club }));

afterEach(() => useLearned([]));

describe('the shot type and club from the player\'s own checked shots', () => {
  it('he pitches the gap wedge from 85–105 m: "Pitch" there, not "Voll"', () => {
    const list = pitches(85, 105);
    expect(learnedKind(list, 'fairway', 95)).toBe('pitch');
    expect(learnedClub(list, 'pitch', 95)).toBe('GW');
    useLearned(list);
    expect(suggestKind('fairway', 95)).toBe('pitch');
  });
  it('too few shots of his there: the fixed bounds as before', () => {
    const list = pitches(85, 105).slice(0, 2);
    expect(learnedKind(list, 'fairway', 95)).toBeNull();
    useLearned(list);
    expect(suggestKind('fairway', 95)).toBe('full');
  });
  it('a bunker lie learns from bunker shots only', () => {
    useLearned(pitches(85, 105));
    expect(learnedKind(pitches(85, 105), 'bunker', 95)).toBeNull();
  });
  it('only what he checked teaches: a suggestion still marked for checking is left out', () => {
    const at = (m: number): LngLat => [9.69 + m / 73000, 48.78];
    const pin = at(0);
    const shot = (m: number, review: boolean) => ({ pos: at(m), lie: 'fairway' as const, club: 'GW' as const, penalty: false, kind: 'pitch' as const, review });
    const round = {
      id: 'r', finishedAt: '2026-11-12T20:00:00Z', players: [{ id: 'me', name: 'Sascha', isMe: true, playingHandicap: 9 }],
      entries: { me: [{ strokes: 4, putts: 2, detail: { shots: [{ pos: at(300), lie: 'tee', club: 'Dr', penalty: false, kind: 'full' }, shot(95, false), shot(90, true)], onGreen: null, pin, holedOut: false } }] },
    } as unknown as Round;
    const got = learnedShots([round]);
    expect(got.length).toBe(1);
    expect(Math.round(got[0].toPin)).toBe(95);
  });
});

describe("Sascha's checked round at StoneGate Oaks (12.11.2026, his export)", () => {
  // his pitches – 9i from 120–124 m, PW 103–107, GW 110–111, SW 68 – his chips under 25 m, full swings from 150 m on
  const oaks: LearnedShot[] = [
    ...[[124, '9i'], [123, '9i'], [120, '9i'], [103, 'PW'], [107, 'PW'], [111, 'GW'], [110, 'GW'], [68, 'SW']].map(([m, c]) => ({ toPin: m as number, lie: 'fairway' as const, kind: 'pitch' as const, club: c as 'GW' })),
    ...[[19, 'SW'], [21, 'SW'], [12, 'LW'], [24, 'GW'], [6, 'Pt'], [15, 'SW'], [10, 'LW']].map(([m, c]) => ({ toPin: m as number, lie: 'fringe' as const, kind: 'chip' as const, club: c as 'SW' })),
    ...[[150, '5i'], [169, '6i'], [166, '4i'], [180, '3W']].map(([m, c]) => ({ toPin: m as number, lie: 'fairway' as const, kind: 'full' as const, club: c as '5i' })),
  ];
  it('from 115 m his own round says "Pitch" – the fixed bound said "Voll"', () => {
    useLearned(oaks);
    expect(suggestKind('fairway', 115)).toBe('pitch');
    useLearned([]);
    expect(suggestKind('fairway', 115)).toBe('full');
  });
  it('the pitch from 121 m: the 9-iron, from 108 m: a wedge', () => {
    expect(learnedClub(oaks, 'pitch', 121)).toBe('9i');
    expect(['PW', 'GW']).toContain(learnedClub(oaks, 'pitch', 108));
  });
  it('from 165 m: a full swing', () => {
    expect(learnedKind(oaks, 'fairway', 165)).toBe('full');
  });
});

describe('a chip where it is one', () => {
  it('the putter off the green (Texas wedge): always a chip', () => {
    expect(suggestKind('fairway', 25, 'Pt')).toBe('chip');
    expect(suggestKind('rough', 60, 'Pt')).toBe('chip');
  });
  it('around the green – the fringe, or up to 10 m off its edge: a chip, even 35 m from a flag at the back', () => {
    expect(suggestKind('fringe', 35)).toBe('chip');
    expect(suggestKind('rough', 35, null, 6)).toBe('chip');
    expect(suggestKind('rough', 35, null, 25)).toBe('pitch');
  });
  it('a greenside bunker stays a bunker shot', () => {
    expect(suggestKind('bunker', 20, null, 3)).toBe('bunker');
  });
});

describe('riding a cart: the phone stands where the cart parks', () => {
  const t0 = Date.UTC(2026, 10, 12, 15);
  const along = (n: number, metresPerFix: number, secs: number): TrackPoint[] =>
    Array.from({ length: n }, (_, k) => ({ t: t0 + k * secs * 1000, p: [-81.5 + (k * metresPerFix) / 98000, 28.3] as LngLat, acc: 5 }));
  it('walking (1.2 m/s) is no cart, riding (6 m/s) twice is', () => {
    expect(rodeCart(along(30, 6, 5))).toBe(false);
    // one ride is no cart yet (a jog to the next tee), two are
    const ride = along(30, 30, 5);
    expect(rodeCart(ride)).toBe(false);
    const stop = Array.from({ length: 10 }, (_, k) => ({ ...ride[29], t: ride[29].t + (k + 1) * 5000 }));
    const again = ride.map((_, k) => ({ t: stop[9].t + (k + 1) * 5000, p: [ride[29].p[0] + (k * 30) / 98000, 28.3] as LngLat, acc: 5 }));
    expect(rodeCart([...ride, ...stop, ...again])).toBe(true);
  });
  it('a stop 30 m off the hole line is pulled halfway to it (15 m); one 6 m off stays', () => {
    const line: LngLat[] = [[-81.5, 28.3], [-81.5, 28.304]];
    const off = (m: number): LngLat => [-81.5 + m / 98000, 28.302];
    const pulled = cartSpot(off(30), line);
    expect(Math.round(distToLine(pulled, line))).toBe(15);
    expect(distanceM(cartSpot(off(6), line), off(6))).toBeLessThan(0.01);
    // far off (60 m): at most 20 m
    expect(Math.round(distanceM(cartSpot(off(60), line), off(60)))).toBe(20);
  });
});
