import { describe, expect, it } from 'vitest';
import type { Round } from '../types';
import { emptyEntry } from './scoring';
import { eventBoard, eventOf, mergeFlight, newFlightRound, roundFromEvent, scoresOf, settle, type RoundEvent } from './sharedround';

// A round on several phones (Sascha 29.10.2026): the same scramble team on two phones, and a tournament of flights.

const holes = Array.from({ length: 3 }, (_, i) => ({ index: i, label: String(i + 1), loop: 'A', number: i + 1, par: 4, strokeIndex: i + 1 }));
function hostRound(): Round {
  return {
    id: 'r-host', createdAt: '2026-11-01T09:00:00Z', finishedAt: null, courseId: 'osm:way/1', courseName: 'Hetzenhof', loopOrder: ['A'], holes, mode: 'detail',
    players: [{ id: 'me', name: 'Sascha & Ben', playingHandicap: 3, isMe: true }],
    entries: { me: holes.map(() => emptyEntry()) },
    currentHole: 0,
    format: { mode: 'scramble', scoring: 'stroke' },
  };
}
const course = { id: 'osm:way/1', source: 'osm' as const, name: 'Hetzenhof', lat: 48.78, lon: 9.69 };
const score = (r: Round, pid: string, i: number, s: number | null): Round => ({ ...r, entries: { ...r.entries, [pid]: r.entries[pid].map((e, k) => (k === i ? { ...e, strokes: s } : e)) } });
const strokes = (r: Round, pid = 'me') => r.entries[pid].map((e) => e.strokes);

/** The server's copy and one exchange of a phone with it (as exchangeRound does, without the network). */
function exchange(ev: RoundEvent, r: Round): { ev: RoundEvent; r: Round } {
  const m = mergeFlight(r, ev.flights[r.shared!.flight]);
  const next = m.changedHere ? { ...ev, flights: { ...ev.flights, [r.shared!.flight]: m.flight } } : ev;
  return { ev: next, r: { ...m.round, shared: { ...r.shared!, base: m.flight.scores } } };
}
function shared(): { ev: RoundEvent; host: Round } {
  const h = hostRound();
  const ev = eventOf(h, course, { name: 'Scramble', tournament: false, flight: 'f1' });
  return { ev, host: { ...h, shared: { code: 'ABCDEF', flight: 'f1', base: ev.flights.f1.scores } } };
}

describe('a round on several phones', () => {
  it('the same team on two phones: a score entered on either reaches the other', () => {
    let { ev, host } = shared();
    let ben = roundFromEvent(ev, 'f1', 'me', 'ABCDEF');
    expect(ben.players[0]).toMatchObject({ name: 'Sascha & Ben', isMe: true });
    expect(ben.id).not.toBe(host.id); // every phone its own round
    host = score(host, 'me', 0, 4);
    ({ ev, r: host } = exchange(ev, host));
    ({ ev, r: ben } = exchange(ev, ben));
    expect(strokes(ben)).toEqual([4, null, null]);
    ben = score(ben, 'me', 1, 3);
    ({ ev, r: ben } = exchange(ev, ben));
    ({ ev, r: host } = exchange(ev, host));
    expect(strokes(host)).toEqual([4, 3, null]);
    // nothing changed: nothing to write
    expect(mergeFlight(host, ev.flights.f1).changedHere).toBe(false);
  });
  it('a score corrected on one phone wins over the old value on the other – never back', () => {
    let { ev, host } = shared();
    let ben = roundFromEvent(ev, 'f1', 'me', 'ABCDEF');
    host = score(host, 'me', 0, 5);
    ({ ev, r: host } = exchange(ev, host));
    ({ ev, r: ben } = exchange(ev, ben));
    ben = score(ben, 'me', 0, 4); // Ben corrects the 5 to a 4
    ({ ev, r: ben } = exchange(ev, ben));
    ({ ev, r: host } = exchange(ev, host));
    expect(strokes(host)[0]).toBe(4);
    ({ ev, r: host } = exchange(ev, host));
    ({ ev, r: ben } = exchange(ev, ben));
    expect(strokes(ben)[0]).toBe(4);
    // a hole cleared on one phone is cleared on the other
    host = score(host, 'me', 0, null);
    ({ ev, r: host } = exchange(ev, host));
    ({ ev, r: ben } = exchange(ev, ben));
    expect(strokes(ben)[0]).toBeNull();
  });
  it('a score entered while the exchange was on its way stays', () => {
    const { ev, host } = shared();
    const sent = host;
    const got = exchange({ ...ev, flights: { f1: { ...ev.flights.f1, scores: { me: [{ s: 6 }, null, null] } } } }, sent).r; // another phone: 6 on hole 1
    const now = score(sent, 'me', 1, 4); // meanwhile here: 4 on hole 2
    const r = settle(now, sent, got);
    expect(strokes(r)).toEqual([6, 4, null]);
    expect(mergeFlight(r, { ...ev.flights.f1, scores: r.shared!.base }).changedHere).toBe(true); // the 4 goes with the next one
  });
  it('a picked-up hole travels as picked up', () => {
    let { ev, host } = shared();
    let ben = roundFromEvent(ev, 'f1', 'me', 'ABCDEF');
    host = { ...host, entries: { me: host.entries.me.map((e, k) => (k === 2 ? { ...e, pickedUp: true } : e)) } };
    ({ ev, r: host } = exchange(ev, host));
    ({ ev, r: ben } = exchange(ev, ben));
    expect(ben.entries.me[2]).toMatchObject({ pickedUp: true, strokes: null });
  });
  it('a tournament: a second flight joins with its own players – the leaderboard ranks all teams', () => {
    let { ev, host } = shared();
    ev = { ...ev, tournament: true };
    const { round: other, flight } = newFlightRound(ev, [{ name: 'Max', playingHandicap: 10 }, { name: 'Simon', playingHandicap: 20 }], 'ABCDEF');
    expect(flight.players).toEqual([{ id: 'me', name: 'Max & Simon', playingHandicap: 7 }]); // one scramble team, 35/15 %: 3.5 + 3
    expect(other.players[0].isMe).toBe(true);
    ev = { ...ev, flights: { ...ev.flights, [flight.id]: flight } };
    let o = other;
    host = score(score(host, 'me', 0, 4), 'me', 1, 4);
    o = score(o, 'me', 0, 3);
    ({ ev, r: host } = exchange(ev, host));
    ({ ev, r: o } = exchange(ev, o));
    expect(Object.keys(ev.flights)).toHaveLength(2);
    expect(scoresOf(o).me[0]).toEqual({ s: 3 });
    const b = eventBoard(ev);
    expect(b.rows.map((x) => [x.name, x.value, x.thru])).toEqual([
      ['Max & Simon', '-1', 1],
      ['Sascha & Ben', 'Par', 2],
    ]);
    // the host's phone never touches the other flight's scores
    expect(strokes(host)).toEqual([4, 4, null]);
  });
  it('a stroke play tournament of single players: every player of every flight on the board', () => {
    const h = { ...hostRound(), format: { mode: 'single' as const, scoring: 'stroke' as const }, players: [{ id: 'me', name: 'Sascha', playingHandicap: 8, isMe: true }, { id: 'p2', name: 'Ben', playingHandicap: 12, isMe: false }], entries: { me: holes.map(() => emptyEntry()), p2: holes.map(() => emptyEntry()) } };
    let ev = eventOf(h, course, { name: 'Clubturnier', tournament: true, flight: 'f1' });
    const { flight } = newFlightRound(ev, [{ name: 'Max', playingHandicap: null }, { name: 'Simon', playingHandicap: null }], 'ABCDEF');
    expect(flight.players.map((p) => p.name)).toEqual(['Max', 'Simon']);
    ev = { ...ev, flights: { ...ev.flights, [flight.id]: { ...flight, scores: { me: [{ s: 3 }, null, null], t2: [{ s: 6 }, null, null] } } } };
    expect(eventBoard(ev).rows.map((r) => r.name)).toEqual(['Max', 'Simon', 'Sascha', 'Ben']);
  });
});
