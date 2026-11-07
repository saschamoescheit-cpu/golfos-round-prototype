import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLangForTests } from './i18n';
import { resultOf, tourChanges } from './tourpush';
import type { Flight, RoundEvent } from './sharedround';
import type { PoolEntry } from './wagerstore';

// The pushes worked out on the phone (Sascha 07.11.2026: "please build 1–6"): what the host's change means for each
// player, the result once every flight is in, the settlement of a pool that is over.

const holes = Array.from({ length: 3 }, (_, i) => ({ label: String(i + 1), par: 4 }));
const flight = (id: string, name: string, players: string[], o: Partial<Flight> = {}): Flight => ({
  id,
  name,
  players: players.map((n, k) => ({ id: `${id}p${k}`, name: n, playingHandicap: 0 })),
  scores: Object.fromEntries(players.map((_, k) => [`${id}p${k}`, [null, null, null]])),
  ...o,
});
const event = (flights: Flight[], o: Partial<RoundEvent & { date: string; deletedAt: string | null }> = {}) =>
  ({
    kind: 'round-event',
    id: 'e1',
    name: 'USA Tag 1',
    tournament: true,
    course: { id: 'c1', name: 'Kissimmee Bay', source: 'osm', lat: 28, lon: -81 },
    loopOrder: [],
    holes,
    format: { mode: 'single', scoring: 'stroke' },
    createdAt: '2026-11-01T10:00:00Z',
    date: '2026-11-09',
    planned: true,
    flights: Object.fromEntries(flights.map((f) => [f.id, f])),
    ...o,
  }) as unknown as RoundEvent & { date: string };

describe('the host changed the tournament: what it means for each player', () => {
  beforeEach(() => useLangForTests('de'));
  const before = event([flight('f1', 'Flight 1', ['Erik', 'Cedric'], { teeTime: '12:08', markers: { f1p0: 'f1p1', f1p1: 'f1p0' } }), flight('f2', 'Flight 2', ['Sascha', 'Christopher'], { teeTime: '12:16' })]);

  it('nothing that matters changed: nothing to tell', () => {
    expect(tourChanges(before, before)).toEqual({ changes: {}, general: '' });
  });
  it('a player moved: his new flight with its tee time and players – for him and for those whose flight changed', () => {
    const after = event([flight('f1', 'Flight 1', ['Erik'], { teeTime: '12:08' }), flight('f2', 'Flight 2', ['Sascha', 'Christopher', 'Cedric'], { teeTime: '12:16' })]);
    const c = tourChanges(before, after);
    expect(c.changes.cedric).toBe('dein Flight: Flight 2 · 12:16 · mit Christopher, Sascha');
    expect(c.changes.erik).toBe('dein Flight: Flight 1 · 12:08');
    expect(c.changes.sascha).toBe('dein Flight: Flight 2 · 12:16 · mit Cedric, Christopher');
    expect(c.general).toBe('');
  });
  it('a new tee time, a tee 10 start, a new marker, a new player', () => {
    const after = event([
      flight('f1', 'Flight 1', ['Erik', 'Cedric'], { teeTime: '12:30', startHole: 9, markers: { f1p0: 'f1p1', f1p1: 'f1p0' } }),
      flight('f2', 'Flight 2', ['Sascha', 'Christopher', 'Stefan'], { teeTime: '12:16', markers: { f2p0: 'f2p2', f2p1: 'f2p0', f2p2: 'f2p1' } }),
    ]);
    const c = tourChanges(before, after);
    expect(c.changes.erik).toBe('dein Flight: Flight 1 · 12:30 · Tee 10 · mit Cedric');
    expect(c.changes.stefan).toBe('du bist dabei: Flight 2 · 12:16 · mit Christopher, Sascha');
    expect(c.changes.sascha).toBe('dein Flight: Flight 2 · 12:16 · mit Christopher, Stefan · dein Zähler: Stefan');
  });
  it('the day, the course – for all; called off says only that', () => {
    const moved = { ...before, date: '2026-11-10', course: { ...before.course, id: 'c2', name: 'Orange County National' } } as typeof before;
    expect(tourChanges(before, moved).general).toBe('neuer Tag: Di., 10.11. · neuer Platz: Orange County National');
    expect(tourChanges(before, { ...before, deletedAt: '2026-11-08T10:00:00Z' } as typeof before)).toEqual({ changes: {}, general: 'abgesagt' });
  });
  it('a name twice in the field: nobody to tell by that name', () => {
    const twice = event([flight('f1', 'Flight 1', ['Chris', 'Erik']), flight('f2', 'Flight 2', ['Chris'])]);
    expect(tourChanges(event([]), twice).changes).toEqual({ erik: 'du bist dabei: Flight 1 · mit Chris' });
  });
});

describe('every flight in: the result', () => {
  it('only once every flight with players has finished – the standing gross for stroke play', () => {
    const sc = (a: number, b: number, c: number) => [{ s: a }, { s: b }, { s: c }];
    const f1 = flight('f1', 'Flight 1', ['Erik', 'Cedric'], { scores: { f1p0: sc(4, 4, 3), f1p1: sc(5, 5, 5) } as unknown as Flight['scores'] });
    const f2 = flight('f2', 'Flight 2', ['Sascha'], { scores: { f2p0: sc(4, 5, 4) } as unknown as Flight['scores'] });
    expect(resultOf(event([{ ...f1, finishedAt: '2026-11-09T16:00:00Z' }, f2]))).toBeNull();
    const r = resultOf(event([{ ...f1, finishedAt: '2026-11-09T16:00:00Z' }, { ...f2, finishedAt: '2026-11-09T16:10:00Z' }, flight('f3', 'Leer', [])]));
    expect(r?.hb).toBe(false);
    expect(r?.rows.map((x) => `${x.pos} ${x.name} ${x.sort}`)).toEqual(['1 Erik -1', '2 Sascha 1', '3 Cedric 3']);
  });
});

describe('a pool over: the settlement told from the phone', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
    vi.resetModules();
  });
  it('a pool over within ten days, at most every six hours – running, deleted or long over: not', async () => {
    const calls: unknown[] = [];
    vi.doMock('./push', async (orig) => ({ ...(await orig<typeof import('./push')>()), pushSettle: (...a: unknown[]) => calls.push(a) }));
    const { tellSettlements } = await import('./wagerstore');
    const pool = (code: string, to: string, o: Record<string, unknown> = {}): PoolEntry =>
      ({ code, me: 'a', pool: { kind: 'wager-pool', id: code, name: code, from: '2026-11-01', to, createdAt: '2026-11-01T00:00:00Z', players: [{ id: 'a', name: 'Sascha' }, { id: 'b', name: 'Max' }], wagers: [], progress: {}, currency: 'USD', ...o } }) as unknown as PoolEntry;
    const now = Date.parse('2026-11-16T09:00:00');
    const list = [pool('OVER01', '2026-11-15'), pool('LIVE01', '2026-11-20'), pool('GONE01', '2026-11-15', { deletedAt: '2026-11-15T10:00:00Z' }), pool('OLD001', '2026-10-01'), pool('DONE01', '2026-11-20', { finishedAt: '2026-11-15T20:00:00Z' })];
    expect(tellSettlements(list, now)).toEqual(['OVER01', 'DONE01']);
    expect((calls[0] as unknown[])[0]).toBe('OVER01');
    expect((calls[0] as unknown[])[2]).toBe('$');
    expect(tellSettlements(list, now + 3600e3)).toEqual([]); // within six hours: not again
    expect(tellSettlements(list, now + 7 * 3600e3)).toEqual(['OVER01', 'DONE01']); // the reminder's chance
    vi.doUnmock('./push');
  });
});
