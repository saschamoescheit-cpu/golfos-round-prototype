import { describe, expect, it } from 'vitest';
import type { Round } from '../types';
import { flightOfName, mergeFlight, nameIs, plannedEvent, roundFromEvent, writerOf, type RoundEvent } from './sharedround';

// Sascha 08.11.2026, on the course: Cedric could not join – his place showed "auf dem Handy von Sascha" and the app
// asked whether he is Sascha. The plan changed after Sascha joined, its places (p1, p2 …) moved: Sascha's phone held
// the place that is now Cedric's. Every player has his own profile – his name is his place.

const holes = Array.from({ length: 3 }, (_, i) => ({ index: i, label: String(i + 1), loop: 'A', number: i + 1, par: 4, strokeIndex: i + 1 }));
const course = { id: 'osm:way/1', source: 'osm' as const, name: 'Hetzenhof', lat: 48.78, lon: 9.69 };
const plan = (names: string[]): RoundEvent =>
  plannedEvent({ name: 'Orlando', date: '2026-11-08', course, holes, loopOrder: ['A'], format: { mode: 'single', scoring: 'net' }, flights: [{ players: names.map((name) => ({ name, playingHandicap: 10 })) }] });
const pidOf = (ev: RoundEvent, fid: string, name: string) => ev.flights[fid].players.find((p) => p.name === name)!.id;
function exchange(ev: RoundEvent, r: Round, who: string): { ev: RoundEvent; r: Round } {
  const f = r.shared!.flight;
  const m = mergeFlight(r, ev.flights[f], ev.tournament, who);
  const next = m.changedHere ? { ...ev, flights: { ...ev.flights, [f]: m.flight } } : ev;
  return { ev: next, r: { ...m.round, shared: { ...r.shared!, base: m.base, roles: m.roles } } };
}

describe('a player\'s own place', () => {
  it('names: accents, case and a first name against the full name', () => {
    expect(nameIs('Cedric', 'cedric')).toBe(true);
    expect(nameIs('Cédric', 'Cedric')).toBe(true);
    expect(nameIs('Cedric', 'Cedric Weber')).toBe(true);
    expect(nameIs('Cedric Weber', 'Cedric')).toBe(true);
    expect(nameIs('Cedric Weber', 'Cedric Huber')).toBe(false);
    expect(nameIs('Chris', 'Christian')).toBe(false);
    expect(nameIs('Sascha & Cedric', 'Cedric', true)).toBe(true);
    expect(nameIs('Sascha & Cedric', 'Cedric')).toBe(false);
  });

  it('the plan moved its places: Sascha\'s phone does not hold Cedric – and goes back to Sascha by itself', () => {
    let ev = plan(['Sascha', 'Cedric', 'Erik']);
    const fid = Object.keys(ev.flights)[0];
    // Sascha joins as p1
    let sascha = roundFromEvent(ev, fid, pidOf(ev, fid, 'Sascha'), 'ABCDEF', 'ph-sascha', 'Sascha');
    ({ ev, r: sascha } = exchange(ev, sascha, 'Sascha'));
    expect(writerOf(ev.flights[fid], 'p1', false)).toBe('ph-sascha');
    // the host changes the plan: Cedric now first – p1 is Cedric, Sascha p2 (the phones stay as they were)
    const f = ev.flights[fid];
    ev = { ...ev, flights: { ...ev.flights, [fid]: { ...f, players: [{ ...f.players[1], id: 'p1' }, { ...f.players[0], id: 'p2' }, f.players[2]] } } };
    expect(pidOf(ev, fid, 'Cedric')).toBe('p1');
    // Cedric's place is not "on Sascha's phone": free for him
    expect(writerOf(ev.flights[fid], 'p1', false)).toBeNull();
    // Cedric joins his place
    let cedric = roundFromEvent(ev, fid, 'p1', 'ABCDEF', 'ph-cedric', 'Cedric');
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    expect(cedric.players.find((p) => p.isMe)?.name).toBe('Cedric');
    expect(writerOf(ev.flights[fid], 'p1', false)).toBe('ph-cedric');
    // Sascha's phone: back on Sascha (p2) at its next exchange – his own score his again
    ({ ev, r: sascha } = exchange(ev, sascha, 'Sascha'));
    expect(sascha.players.find((p) => p.isMe)?.name).toBe('Sascha');
    expect(ev.flights[fid].phones!['ph-sascha'].player).toBe('p2');
    expect(writerOf(ev.flights[fid], 'p2', false)).toBe('ph-sascha');
    expect(writerOf(ev.flights[fid], 'p1', false)).toBe('ph-cedric');
    expect(sascha.shared!.roles!.p2).toBe('own');
  });

  it('a phone holding its own player stays as it is', () => {
    let ev = plan(['Sascha', 'Cedric']);
    const fid = Object.keys(ev.flights)[0];
    let cedric = roundFromEvent(ev, fid, 'p2', 'ABCDEF', 'ph-cedric', 'Cedric');
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    expect(cedric.players.find((p) => p.isMe)?.id).toBe('p2');
    expect(writerOf(ev.flights[fid], 'p2', false)).toBe('ph-cedric');
  });

  it('the start page finds the flight by the profile\'s full name', () => {
    const ev = plan(['Sascha', 'Cedric']);
    expect(flightOfName(ev, 'Cedric Weber')).not.toBeNull();
  });
});
