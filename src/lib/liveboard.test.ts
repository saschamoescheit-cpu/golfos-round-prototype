import { describe, expect, it } from 'vitest';
import { boardLive, liveFrom, plannedEvent, type RoundEvent } from './sharedround';
import { liveNote } from '../screens/Tournaments';

// Sascha 09.11.2026, USA: "back from a round of the series the live leaderboard takes a moment – the load time should be
// zero as long as the tournament has not begun. Make it live only 30 min before the tee time, until then show what is
// loaded, at once."

const holes = Array.from({ length: 4 }, (_, i) => ({ index: i, label: String(i + 1), loop: 'A', number: i + 1, par: 4, strokeIndex: i + 1 }));
const course = { id: 'osm:way/1', source: 'osm' as const, name: 'Stonegate Oaks', lat: 28.1, lon: -81.5 };
const plan = (date: string, tees: (string | undefined)[]): RoundEvent =>
  plannedEvent({
    name: 'Stonegate Oaks',
    date,
    course,
    holes,
    loopOrder: ['A'],
    format: { mode: 'single', scoring: 'stroke' },
    flights: tees.map((teeTime, k) => ({ ...(teeTime ? { teeTime } : {}), players: [{ name: `P${k}a`, playingHandicap: 5 }, { name: `P${k}b`, playingHandicap: 9 }] })),
  });
const at = (s: string) => new Date(s); // local time

describe('the live leaderboard: 30 minutes before the first tee time', () => {
  it('goes live 30 minutes before the earliest tee time of the day', () => {
    const ev = plan('2026-11-12', ['13:08', '13:00']);
    const from = liveFrom(ev)!;
    expect([from.getFullYear(), from.getMonth() + 1, from.getDate(), from.getHours(), from.getMinutes()]).toEqual([2026, 11, 12, 12, 30]);
    expect(boardLive(ev, at('2026-11-12T12:29:00'))).toBe(false);
    expect(boardLive(ev, at('2026-11-12T12:30:00'))).toBe(true);
    expect(boardLive(ev, at('2026-11-11T20:00:00'))).toBe(false);
  });
  it('without tee times: the day from its start', () => {
    const ev = plan('2026-11-12', [undefined]);
    expect(liveFrom(ev)!.getHours()).toBe(0);
    expect(boardLive(ev, at('2026-11-12T07:00:00'))).toBe(true);
  });
  it('no longer once every flight is in', () => {
    const ev = plan('2026-11-12', ['13:00', '13:08']);
    const done: RoundEvent = { ...ev, flights: Object.fromEntries(Object.entries(ev.flights).map(([k, f]) => [k, { ...f, finishedAt: '2026-11-12T18:00:00Z' }])) };
    expect(boardLive(done, at('2026-11-12T19:00:00'))).toBe(false);
  });
  it('the line under the board: when it goes live, then when it was read', () => {
    const ev = plan('2026-11-12', ['13:00']);
    expect(liveNote([ev], null, at('2026-11-12T09:00:00'))).toMatch(/^Live from today, 12:30 – 30 minutes before the first tee time/);
    expect(liveNote([ev], null, at('2026-11-10T09:00:00'))).toMatch(/^Live from .*12.*, 12:30/);
    // live: no line – the LIVE mark (Sascha 12.11.2026)
    expect(liveNote([ev], at('2026-11-12T12:41:00'), at('2026-11-12T12:41:30'))).toBeUndefined();
  });
});
