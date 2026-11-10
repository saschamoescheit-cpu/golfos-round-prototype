import { describe, expect, it } from 'vitest';
import { courseZone, teeDue, teeNote, teeTimeFor, type TeeFlight } from '../../supabase/functions/golfos-push/index';

// The tee time reminder (Sascha 01.11.2026): about 45 minutes before your flight's tee time, on the tournament's day.
const flights: TeeFlight[] = [
  { id: 'f2', teeTime: '09:20', players: [{ id: 'p1', name: 'Erik' }, { id: 'p2', name: 'Cedric' }], phones: { ph3: { player: 'p1', uid: 'u-erik' } } },
  { id: 'f1', teeTime: '9:00', players: [{ id: 'p1', name: 'Sascha' }, { id: 'p2', name: 'Chris' }], phones: { ph1: { player: 'p1', uid: 'u-sascha' } } },
  { id: 'f3', teeTime: '08:00', players: [] }, // a flight taken out of the plan: no tee time
];

describe('the tee time in the course\'s time zone (Sascha 11.11.2026: "50 min – German time, we tee off in 6 hours")', () => {
  it('the zone from the course\'s place – not the phone\'s', async () => {
    const urls: string[] = [];
    const tz = await courseZone({ lat: 28.33, lon: -81.6 }, async (u) => (urls.push(u), { timezone: 'America/New_York' }));
    expect(tz).toBe('America/New_York');
    expect(urls[0]).toMatch(/latitude=28.33&longitude=-81.6.*timezone=auto/);
    // 12:00 in Florida: from Berlin's clock it would be due at 11:10 Berlin (05:10 Florida) – in Florida's only at 11:10
    expect(teeDue('2026-11-10', '12:00', tz, new Date('2026-11-10T10:10:00Z'))).toBeNull();
    expect(teeDue('2026-11-10', '12:00', 'Europe/Berlin', new Date('2026-11-10T10:10:00Z'))).toBe(50);
    expect(teeDue('2026-11-10', '12:00', tz, new Date('2026-11-10T16:10:00Z'))).toBe(50);
  });
  it('no place, or no answer: null (the phone\'s zone then)', async () => {
    expect(await courseZone(undefined)).toBeNull();
    expect(await courseZone({ lat: 1.5, lon: 2.5 }, async () => { throw new Error('offline'); })).toBeNull();
    expect(await courseZone({ lat: 3.5, lon: 4.5 }, async () => ({ timezone: 'not a zone; drop table' }))).toBeNull();
  });
});

describe('the tee time reminder', () => {
  it('your own flight\'s tee time – else the first of the day', () => {
    expect(teeTimeFor('u-erik', flights)).toMatchObject({ time: '09:20', own: true });
    expect(teeTimeFor('u-sascha', flights)).toMatchObject({ time: '9:00', own: true });
    expect(teeTimeFor('u-cedric', flights)).toEqual({ time: '9:00', own: false }); // not taken a place yet
    expect(teeTimeFor('u-x', [{ id: 'f', players: [{ id: 'p1', name: 'A' }] }])).toBeNull(); // no tee times planned
  });
  it('due 31–60 minutes before, on its day on the phone\'s clock – in the USA in its time zone', () => {
    // 09:20 in New York = 14:20 UTC (EST, after 1.11.)
    const ny = 'America/New_York';
    expect(teeDue('2026-11-06', '09:20', ny, new Date('2026-11-06T13:35:00Z'))).toBe(45);
    expect(teeDue('2026-11-06', '09:20', ny, new Date('2026-11-06T13:50:00Z'))).toBeNull(); // 30 left: too late, said before
    expect(teeDue('2026-11-06', '09:20', ny, new Date('2026-11-06T13:15:00Z'))).toBeNull(); // 65 left: too early
    expect(teeDue('2026-11-07', '09:20', ny, new Date('2026-11-06T13:35:00Z'))).toBeNull(); // another day
  });
  it('the message: your flight, the minutes, the course – to the Rounds start page', () => {
    expect(teeNote({ name: 'USA Tag 1', course: 'Bethpage Black', time: '09:20', left: 44, own: true, flight: 'Erik · Cedric' }, 'de')).toEqual({
      title: 'USA Tag 1 · Startzeit 09:20',
      body: 'Dein Flight (Erik · Cedric) startet in etwa 45 Min. · Bethpage Black',
      tag: 'golfos-tee-USA Tag 1',
      url: './#rounds',
    });
    expect(teeNote({ name: 'USA Day 1', time: '9:00', left: 50, own: false }, 'en').body).toBe('The first flight tees off in about 50 min – take part in Rounds.');
  });
});
