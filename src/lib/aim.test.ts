import { describe, expect, it } from 'vitest';
import { aimChoices, aimFor, assumedAim, besideLine, laidUp, offAim, offAimText } from './aim';
import { clubReports, clubShots } from './clubstats';
import { clubDispersion } from './dispersion';
import { distanceM } from './geo';
import { emptyEntry } from './scoring';
import type { LngLat, Round, Shot } from '../types';

// Sascha 16.11.2026: "Ich ziele ja nicht immer Mitte Bahn. Daher habe ich Streuungen in den Schlägern, die nicht der
// Realität entsprechen" – the aim set per shot in the round check is what the spread is measured against.

const M = 1 / 111195;
const at = (east: number, north: number): LngLat => [9.69 + (east * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + north * M];
const round = (shots: (left: number, k: number) => Shot[], ends: number[], par = 4): Round => {
  const holes = ends.map((_, k) => ({ index: k, label: String(k + 1), loop: 'Main', number: k + 1, par, strokeIndex: k + 1 }));
  const entries = ends.map((x, k) => ({ ...emptyEntry(), strokes: 4, putts: 2, detail: { shots: shots(x, k), onGreen: at(0, 395), pin: at(0, 400), holedOut: false } }));
  return { id: 'r', createdAt: '', finishedAt: 'x', courseId: 'c', courseName: 'C', loopOrder: ['Main'], holes, mode: 'detail', players: [{ id: 'me', name: 'Me', playingHandicap: 10, isMe: true }], entries: { me: entries }, currentHole: 0 } as unknown as Round;
};
const line = [at(0, 0), at(0, 400)];
const rnd = (x: number) => Math.round(x) || 0; // no -0

describe('the aim of a shot', () => {
  it('Bahn links / Mitte / rechts: on the hole at the ball\'s distance, 10 m to the side', () => {
    const o = { from: at(0, 0), end: at(-12, 230), line, pin: at(0, 400), greenCenter: at(3, 398) };
    const mid = aimFor('middle', o)!;
    expect(rnd(distanceM(mid, at(0, 230)))).toBe(0);
    expect(rnd(offAim(o.from, aimFor('left', o)!, at(-10, 230)).side)).toBe(0);
    expect(rnd(offAim(o.from, aimFor('right', o)!, at(10, 230)).side)).toBe(0);
    expect(rnd(distanceM(besideLine(at(0, 0), at(0, 100), -10), at(-10, 100)))).toBe(0);
    expect(aimFor('flag', o)).toEqual(o.pin);
    expect(aimFor('green', o)).toEqual(o.greenCenter);
    // the lay-up on the way to the flag at the ball's distance
    const lay = aimFor('layup', o)!;
    expect(rnd(distanceM(o.from, lay))).toBe(rnd(distanceM(o.from, o.end!)));
    expect(assumedAim({ fairway: false, from: o.from, end: o.end, line, pin: o.pin })).toEqual(o.pin);
  });
  it('off the aim in metres and words', () => {
    const o = offAim(at(0, 0), at(0, 200), at(7, 196));
    expect(rnd(o.side)).toBe(7);
    expect(rnd(o.long)).toBe(-4);
    expect(offAimText(o, 'aim')).toMatch(/7 m (right of the target|rechts vom Ziel) · 4 m (short|zu kurz)/);
  });
  it('the chips: the fairway off the tee of a par 4/5, else flag, green, lay-up', () => {
    // off the tee no chips since 16.11.2026 (Sascha: "Bahnmitte, Bahn links und Bahn rechts kann entfernt werden")
    expect(aimChoices(true)).toEqual([]);
    expect(aimChoices(false).map((c) => c.value)).toEqual(['flag', 'green', 'layup']);
  });
  it('a lay-up: "Vorlegen" or an aim well short of what the club goes', () => {
    expect(laidUp({ aimKind: 'layup', pos: at(0, 0), aim: at(0, 100) }, 170)).toBe(true);
    expect(laidUp({ aimKind: 'map', pos: at(0, 0), aim: at(0, 120) }, 170)).toBe(true);
    expect(laidUp({ aimKind: 'map', pos: at(0, 0), aim: at(0, 165) }, 170)).toBe(false);
    expect(laidUp({ pos: at(0, 0) }, 170)).toBe(false);
  });
});

describe('the spread with the aims', () => {
  // five drives aimed at the left side of the fairway, ending 8 … 14 m left of the middle – 0 … 4 m off the aim
  const lefts = [-12, -10, -14, -8, -11];
  const drives = (aimed: boolean) =>
    round((x) => [
      { pos: at(0, 0), lie: 'tee', club: 'Dr', penalty: false, ...(aimed ? { aim: at(-10, 230), aimKind: 'left' as const } : {}) },
      { pos: at(x, 230), lie: 'fairway', club: '9i', penalty: false },
    ], lefts);
  it('without aims the drives stand left of the middle, with them on the aim', () => {
    const lineOf = () => line;
    const before = clubShots([drives(false)], lineOf).filter((s) => s.club === 'Dr').map((s) => rnd(s.side!));
    const after = clubShots([drives(true)], lineOf).filter((s) => s.club === 'Dr').map((s) => rnd(s.side!));
    expect(before).toEqual([-12, -10, -14, -8, -11]);
    expect(after).toEqual([-2, 0, -4, 2, -1]);
    const rb = clubReports([drives(false)], lineOf).find((r) => r.club === 'Dr')!;
    const ra = clubReports([drives(true)], lineOf).find((r) => r.club === 'Dr')!;
    expect(ra.corridor!.lo).toBeGreaterThan(rb.corridor!.lo); // the corridor moves onto the aim
    expect(ra.corridor!.hi - ra.corridor!.lo).toBe(rb.corridor!.hi - rb.corridor!.lo); // as wide as before, only centred
  });
  it('a lay-up keeps its side but not its length for the club', () => {
    const r = round((x, k) => [
      { pos: at(0, 0), lie: 'tee', club: 'Dr', penalty: false },
      { pos: at(0, 230), lie: 'fairway', club: '7i', penalty: false, ...(k === 0 ? { aim: at(x, 330), aimKind: 'layup' as const } : {}) },
    ], [0, 0, 0, 0, 0, 0]);
    // the 7i of hole 1 laid up to 100 m (ends on the aim); the others reach the green 165 m on
    r.entries.me[0].detail!.onGreen = at(0, 330);
    const shots = clubShots([r], () => line).filter((s) => s.club === '7i');
    expect(shots.filter((s) => s.laidUp)).toHaveLength(1);
    const rep = clubReports([r], () => line).find((x) => x.club === '7i')!;
    expect(rep.median).toBeGreaterThan(150); // the 100 m lay-up does not pull the 7-iron short
    expect(rep.shots).toBe(6);
  });
  it('the caddie\'s tendency: an approach aimed at the green\'s middle is measured against it', () => {
    const r = round(() => [
      { pos: at(0, 0), lie: 'tee', club: 'Dr', penalty: false },
      { pos: at(0, 230), lie: 'fairway', club: '7i', penalty: false, aim: at(-6, 395), aimKind: 'green' },
    ], [0, 0, 0]);
    for (const e of r.entries.me) e.detail!.onGreen = at(-6, 395);
    const d = clubDispersion([r]).find((x) => x.club === '7i')!;
    expect(d.sideMean).toBe(0); // on the green's middle, not 6 m left of the flag
  });
});
