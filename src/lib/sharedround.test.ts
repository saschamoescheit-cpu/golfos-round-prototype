import { describe, expect, it } from 'vitest';
import type { Round } from '../types';
import { emptyEntry } from './scoring';
import { classOf, defaultMarkers, differences, eventBoard, eventOf, eventStandings, mergeFlight, newFlightRound, quietKeeper, roundFromEvent, settle, shareView, standingsCsv, type RoundEvent } from './sharedround';

// A round on several phones (Sascha 29.10.2026): the flight partners on their own phones – everyone keeps his own
// score, a team's card one phone of the team (another can take it over), in a tournament everyone also marks a partner.

const holes = Array.from({ length: 3 }, (_, i) => ({ index: i, label: String(i + 1), loop: 'A', number: i + 1, par: 4, strokeIndex: i + 1 }));
const course = { id: 'osm:way/1', source: 'osm' as const, name: 'Hetzenhof', lat: 48.78, lon: 9.69 };
function round(players: { id: string; name: string; hcp?: number }[], mode: 'single' | 'scramble' = 'single', marker = false): Round {
  return {
    id: 'r-host', createdAt: '2026-11-01T09:00:00Z', finishedAt: null, courseId: course.id, courseName: 'Hetzenhof', loopOrder: ['A'], holes, mode: 'detail',
    players: players.map((p, k) => ({ id: p.id, name: p.name, playingHandicap: p.hcp ?? null, isMe: k === 0 })),
    entries: Object.fromEntries(players.map((p) => [p.id, holes.map(() => emptyEntry())])),
    currentHole: 0,
    format: { mode, scoring: 'stroke', ...(marker ? { marker: true } : {}) },
  };
}
const score = (r: Round, pid: string, i: number, s: number | null): Round => ({ ...r, entries: { ...r.entries, [pid]: r.entries[pid].map((e, k) => (k === i ? { ...e, strokes: s } : e)) } });
const strokes = (r: Round, pid: string) => r.entries[pid].map((e) => e.strokes);

/** The host's round shared (as shareRound does, without the network). */
function host(r: Round, tournament = false, who = 'Sascha'): { ev: RoundEvent; r: Round } {
  const ev = eventOf(r, course, { name: 'Runde', tournament, flight: 'f1', phone: 'ph-host', who });
  return { ev, r: { ...r, shared: { code: 'ABCDEF', flight: 'f1', tournament, phone: 'ph-host', base: ev.flights.f1.scores } } };
}
/** One exchange of a phone with the server's copy (as exchangeRound does, without the network). */
function exchange(ev: RoundEvent, r: Round, who = ''): { ev: RoundEvent; r: Round } {
  const f = r.shared!.flight;
  const m = mergeFlight(r, ev.flights[f], ev.tournament, who);
  const next = m.changedHere ? { ...ev, flights: { ...ev.flights, [f]: m.flight } } : ev;
  return { ev: next, r: { ...m.round, shared: { ...r.shared!, base: m.base, roles: m.roles } } };
}

describe('the same scramble team on two phones', () => {
  it('the host keeps the card, the other phone shows it and cannot change it', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha & Cedric', hcp: 3 }], 'scramble'));
    let cedric = roundFromEvent(ev, 'f1', 'me', 'ABCDEF', 'ph-cedric', 'Cedric');
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    expect(Object.values(ev.flights.f1.phones!).map((p) => p.name).sort()).toEqual(['Cedric', 'Sascha']);
    expect(cedric.shared!.roles!.me).toBe('view');
    sascha = score(sascha, 'me', 0, 4);
    ({ ev, r: sascha } = exchange(ev, sascha));
    ({ ev, r: cedric } = exchange(ev, cedric));
    expect(strokes(cedric, 'me')).toEqual([4, null, null]);
    // Cedric types a 6 on hole 1: not taken – the card is Sascha's – and his phone shows Sascha's 4 again
    cedric = score(cedric, 'me', 0, 6);
    ({ ev, r: cedric } = exchange(ev, cedric));
    expect(ev.flights.f1.scores.me[0]).toEqual({ s: 4 });
    expect(strokes(cedric, 'me')[0]).toBe(4);
    const v = shareView(cedric, ev.flights.f1, false).me;
    expect(v).toMatchObject({ role: 'view', keptBy: 'Sascha', canTakeOver: true });
  });
  it('Sascha\'s battery is empty: Cedric takes the card over and goes on – Sascha\'s phone then shows Cedric\'s', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha & Cedric' }], 'scramble'));
    let cedric = roundFromEvent(ev, 'f1', 'me', 'ABCDEF', 'ph-cedric', 'Cedric');
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    sascha = score(sascha, 'me', 0, 4);
    ({ ev, r: sascha } = exchange(ev, sascha));
    // the take-over (as takeOver writes it)
    ev = { ...ev, flights: { f1: { ...ev.flights.f1, keeper: { me: 'ph-cedric' } } } };
    ({ ev, r: cedric } = exchange(ev, cedric));
    expect(cedric.shared!.roles!.me).toBe('own');
    cedric = score(cedric, 'me', 1, 5);
    ({ ev, r: cedric } = exchange(ev, cedric));
    expect(ev.flights.f1.scores.me.map((c) => c?.s ?? null)).toEqual([4, 5, null]); // hole 1 from Sascha stays
    // Sascha's phone comes back: it shows Cedric's card, its own late edit is not taken
    sascha = score(sascha, 'me', 1, 7);
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(strokes(sascha, 'me')).toEqual([4, 5, null]);
    expect(shareView(sascha, ev.flights.f1, false).me).toMatchObject({ role: 'view', keptBy: 'Cedric', canTakeOver: true });
  });
});

describe('a flight of single players on their own phones', () => {
  // Sascha, the evening of 29.10.2026, testing with Cedric: "Sascha keeps his own score and, as marker, Cedric's;
  // Cedric his own and, as marker, Sascha's" – in any round of single balls, not only in a tournament
  it('a social round with a marker: everyone keeps his own score and marks his partner – two counts, kept apart', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Cedric' }], 'single', true));
    expect(sascha.players.map((p) => shareView(sascha, ev.flights.f1, false)[p.id].role)).toEqual(['own', 'mark']);
    sascha = score(sascha, 'me', 0, 4);
    sascha = score(sascha, 'c', 0, 5); // his count of Cedric
    ({ ev, r: sascha } = exchange(ev, sascha));
    let cedric = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-cedric', 'Cedric');
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    expect(cedric.players.map((p) => cedric.shared!.roles![p.id])).toEqual(['mark', 'own']);
    cedric = score(cedric, 'c', 0, 6); // his own
    cedric = score(cedric, 'me', 0, 4); // his count of Sascha
    ({ ev, r: cedric } = exchange(ev, cedric));
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(ev.flights.f1.scores.me[0]).toEqual({ s: 4 });
    expect(ev.flights.f1.scores.c[0]).toEqual({ s: 6 });
    expect(ev.flights.f1.marks!.c[0]).toEqual({ s: 5 });
    expect(ev.flights.f1.marks!.me[0]).toEqual({ s: 4 });
    // Sascha's count of Cedric stays his – Cedric's own 6 beside it, the difference shows
    expect(strokes(sascha, 'c')[0]).toBe(5);
    expect(shareView(sascha, ev.flights.f1, false).c.other).toMatchObject({ label: expect.stringMatching(/Cedric/), cells: [{ s: 6 }, null, null] });
    expect(differences(ev.flights.f1, 'c')).toEqual([0]);
    expect(differences(ev.flights.f1, 'me')).toEqual([]);
    // the board ranks by the own scores
    expect(eventBoard(ev).rows.map((x) => x.name)).toEqual(['Sascha', 'Cedric']);
    // and Cedric's own phone keeps his details (putts, penalties) – only the score travels
    expect(JSON.stringify(ev)).not.toContain('putts');
  });
  // Sascha 30.10.2026: "selectable whether one only enters one's own score or plays with a marker" – by default his own
  it('a social round without a marker (the default): everyone keeps only his own score, the others are shown', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Cedric' }]));
    // Cedric not on a phone yet: the host keeps his score too (as on one phone)
    expect(sascha.players.map((p) => shareView(sascha, ev.flights.f1, false)[p.id].role)).toEqual(['own', 'free']);
    sascha = score(sascha, 'c', 0, 5);
    ({ ev, r: sascha } = exchange(ev, sascha));
    let cedric = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-cedric', 'Cedric');
    expect(strokes(cedric, 'c')[0]).toBe(5); // he goes on from there
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    cedric = score(cedric, 'c', 1, 4);
    ({ ev, r: cedric } = exchange(ev, cedric));
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(sascha.shared!.roles!.c).toBe('view');
    expect(strokes(sascha, 'c')).toEqual([5, 4, null]);
    sascha = score(sascha, 'c', 1, 9); // not his to change
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(ev.flights.f1.scores.c[1]).toEqual({ s: 4 });
    expect(ev.flights.f1.markers).toBeUndefined();
  });
  it('a flight from before the marker was chosen gets its markers', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Cedric' }], 'single', true));
    const { markers: _m, marks: _k, ...old } = ev.flights.f1;
    ev = { ...ev, flights: { f1: old } };
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(ev.flights.f1.markers).toEqual({ me: 'c', c: 'me' });
  });
  it('a score entered while the exchange was on its way stays', () => {
    // two teams on two phones: the other team's score comes in while this phone enters its own
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha & Ben' }, { id: 't2', name: 'Cedric & Max' }], 'scramble'));
    let cedric = roundFromEvent(ev, 'f1', 't2', 'ABCDEF', 'ph-cedric', 'Cedric');
    ({ ev, r: cedric } = exchange(ev, cedric));
    cedric = score(cedric, 't2', 0, 6);
    ({ ev } = exchange(ev, cedric));
    const sent = sascha;
    const got = exchange(ev, sent).r; // brings Cedric's 6
    const now = score(sent, 'me', 1, 4); // meanwhile here: 4 on hole 2
    const r = settle(now, sent, got);
    expect(strokes(r, 't2')[0]).toBe(6);
    expect(strokes(r, 'me')).toEqual([null, 4, null]);
    expect(mergeFlight(r, ev.flights.f1, false).changedHere).toBe(true); // the 4 goes with the next one
  });
  it('a picked-up hole travels as picked up', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Cedric' }]));
    let cedric = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-cedric', 'Cedric');
    ({ ev, r: cedric } = exchange(ev, cedric));
    sascha = { ...sascha, entries: { ...sascha.entries, me: sascha.entries.me.map((e, k) => (k === 2 ? { ...e, pickedUp: true } : e)) } };
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(ev.flights.f1.scores.me[2]).toEqual({ s: null, p: true });
    ({ ev, r: cedric } = exchange(ev, cedric));
    expect(cedric.entries.me[2]).toMatchObject({ pickedUp: true, strokes: null }); // shown on Cedric's phone (no marker)
  });
  it('a player added in the setup after the code: the phone that joined earlier gets him', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Cedric' }]));
    let cedric = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-cedric', 'Cedric');
    sascha = { ...sascha, players: [...sascha.players, { id: 'b', name: 'Ben', playingHandicap: null, isMe: false }], entries: { ...sascha.entries, b: holes.map(() => emptyEntry()) } };
    ({ ev, r: sascha } = exchange(ev, sascha));
    ({ ev, r: cedric } = exchange(ev, cedric));
    expect(cedric.players.map((p) => [p.name, p.isMe])).toEqual([['Sascha', false], ['Cedric', true], ['Ben', false]]);
  });
});

describe('a tournament: everyone counts himself and a partner', () => {
  it('pairs in a flight: 1 ↔ 2, 3 ↔ 4 – three in a ring, nobody marks himself', () => {
    expect(defaultMarkers(['a', 'b', 'c', 'd'])).toEqual({ a: 'b', b: 'a', c: 'd', d: 'c' });
    const ring = defaultMarkers(['a', 'b', 'c']);
    expect(Object.entries(ring).every(([p, m]) => p !== m) && new Set(Object.values(ring)).size === 3).toBe(true);
    expect(defaultMarkers(['a'])).toEqual({});
  });
  it('Sascha keeps his own score and marks Cedric; Cedric his own and marks Sascha – a difference shows', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Cedric' }]), true);
    let cedric = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-cedric', 'Cedric');
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(sascha.shared!.roles).toEqual({ me: 'own', c: 'mark' });
    expect(cedric.shared!.roles).toEqual({ me: 'mark', c: 'own' });
    sascha = score(score(sascha, 'me', 0, 4), 'c', 0, 5); // Sascha: himself 4, Cedric 5
    cedric = score(score(cedric, 'c', 0, 5), 'me', 0, 5); // Cedric: himself 5, Sascha 5 (!)
    ({ ev, r: sascha } = exchange(ev, sascha));
    ({ ev, r: cedric } = exchange(ev, cedric));
    ({ ev, r: sascha } = exchange(ev, sascha));
    const f = ev.flights.f1;
    expect(f.scores.me[0]).toEqual({ s: 4 });
    expect(f.marks!.me[0]).toEqual({ s: 5 });
    expect(differences(f, 'me')).toEqual([0]);
    expect(differences(f, 'c')).toEqual([]);
    // each phone keeps its own counts – the marker's count of Sascha does not overwrite Sascha's own
    expect(strokes(sascha, 'me')[0]).toBe(4);
    expect(strokes(sascha, 'c')[0]).toBe(5);
    const v = shareView(sascha, f, true);
    expect(v.me.other!.label).toMatch(/^Cedric \((Zähler|marker)\)$/);
    expect(v.me.other!.cells[0]).toEqual({ s: 5 });
    expect(v.c.other!.cells[0]).toEqual({ s: 5 });
    // the leaderboard takes each player's own score
    expect(eventBoard(ev).rows.map((x) => [x.name, x.value])).toEqual([['Sascha', 'Par'], ['Cedric', '+1']]);
  });
  it('a player without a phone: his marker\'s count stands on the board', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Cedric' }]), true);
    // nobody plays Cedric on a phone – Sascha marks him, his count is Cedric's score
    expect(sascha.players.map((p) => shareView(sascha, ev.flights.f1, true)[p.id].role)).toEqual(['own', 'mark']);
    sascha = score(sascha, 'c', 0, 6);
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(eventBoard(ev).rows.find((x) => x.name === 'Cedric')!.value).toBe('+2');
    // Cedric joins after all: what Sascha entered for him stays Sascha's marker count, Cedric keeps his own
    let cedric = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-cedric', 'Cedric');
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(sascha.shared!.roles!.c).toBe('mark');
    expect(ev.flights.f1.marks!.c[0]).toEqual({ s: 6 });
  });
  it('a second flight starts its own – the leaderboard ranks every player of both, each marks within his flight', () => {
    let { ev } = host(round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Cedric' }]), true);
    const { round: max, flight } = newFlightRound(ev, [{ name: 'Max', playingHandicap: null }, { name: 'Simon', playingHandicap: null }], 'ABCDEF', 'ph-max', 'Max');
    expect(flight.players.map((p) => p.name)).toEqual(['Max', 'Simon']);
    expect(flight.markers).toEqual({ me: 't2', t2: 'me' });
    expect(max.shared!.roles).toEqual({ me: 'own', t2: 'mark' });
    ev = { ...ev, flights: { ...ev.flights, [flight.id]: { ...flight, scores: { me: [{ s: 3 }, null, null], t2: [{ s: 6 }, null, null] } } } };
    expect(eventBoard(ev).rows.map((r) => r.name)).toEqual(['Max', 'Simon', 'Sascha', 'Cedric']);
  });
  it('a scramble tournament: a flight\'s team is one entry on the board', () => {
    let { ev } = host(round([{ id: 'me', name: 'Sascha & Cedric', hcp: 3 }], 'scramble'), true);
    const { flight } = newFlightRound(ev, [{ name: 'Max', playingHandicap: 10 }, { name: 'Simon', playingHandicap: 20 }], 'ABCDEF', 'ph-max', 'Max');
    expect(flight.players).toEqual([{ id: 'me', name: 'Max & Simon', playingHandicap: 7 }]); // 35/15 %: 3.5 + 3
    ev = { ...ev, flights: { ...ev.flights, [flight.id]: { ...flight, scores: { me: [{ s: 3 }, null, null] } } } };
    expect(eventBoard(ev).rows.map((x) => [x.name, x.value, x.thru])).toEqual([['Max & Simon', '-1', 1], ['Sascha & Cedric', '–', 0]]);
  });
});

// Sascha 30.10.2026, the night run: the keeper's battery – the team sees when his phone went quiet
describe('a team keeper gone quiet', () => {
  it('a phone tells the flight it is still there every two minutes; quiet for ten, the others are offered the card', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha & Cedric' }], 'scramble'));
    let cedric = roundFromEvent(ev, 'f1', 'me', 'ABCDEF', 'ph-cedric', 'Cedric');
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    expect(quietKeeper(ev.flights.f1, 'me', 'ph-cedric')).toBeNull(); // Sascha's phone just there
    // twelve minutes without a word from Sascha's phone
    const later = Date.now() + 12 * 60000;
    expect(quietKeeper(ev.flights.f1, 'me', 'ph-cedric', later)).toEqual({ name: 'Sascha', minutes: 12 });
    expect(quietKeeper(ev.flights.f1, 'me', 'ph-host', later)).toBeNull(); // the keeper himself is not told
    // Sascha's phone comes back: three minutes after it was last seen it says so (and only then)
    const f = ev.flights.f1;
    const stale = { ...f, phones: { ...f.phones, 'ph-host': { ...f.phones!['ph-host'], at: new Date(Date.now() - 3 * 60000).toISOString() } } };
    const m = mergeFlight(sascha, stale, false, 'Sascha');
    expect(m.changedHere).toBe(true);
    expect(Date.now() - new Date(m.flight.phones!['ph-host'].seen!).getTime()).toBeLessThan(5000);
    expect(mergeFlight(sascha, m.flight, false, 'Sascha').changedHere).toBe(false); // not again at once
  });
});
// Sascha's concept 30.10.2026 (the night run): a tournament's standings – gross / net, classes, ties, countback
describe('a tournament: the standings', () => {
  const cell = (s: number) => ({ s });
  function event(scores: Record<string, number[]>, hcps: Record<string, number>, o: { allowance?: number; classes?: number[] } = {}): RoundEvent {
    const r = round(Object.keys(scores).map((id) => ({ id, name: id.toUpperCase(), hcp: hcps[id] })));
    const ev = eventOf({ ...r, format: { mode: 'single', scoring: 'net', allowance: o.allowance ?? 100 } }, course, { name: 'Clubturnier', tournament: true, flight: 'f1', phone: 'ph', who: 'Sascha', classes: o.classes });
    const f = ev.flights.f1;
    return { ...ev, flights: { f1: { ...f, scores: Object.fromEntries(Object.entries(scores).map(([id, xs]) => [id, holes.map((_, i) => (xs[i] != null ? cell(xs[i]) : null))])) } } };
  }
  it('gross: a tie is "T1" while not everyone is in – then broken by countback (the last hole)', () => {
    const open = eventStandings(event({ a: [4, 4, 4], b: [5, 4, 3], c: [5, 5] }, { a: 3, b: 10, c: 20 }, { allowance: 0 }));
    expect(open.rows.map((r) => [r.name, r.pos, r.value, r.finished])).toEqual([['A', 'T1', 'Par', true], ['B', 'T1', 'Par', true], ['C', '3', '+2', false]]);
    const done = eventStandings(event({ a: [4, 4, 4], b: [5, 4, 3], c: [5, 5, 5] }, { a: 3, b: 10, c: 20 }, { allowance: 0 }));
    expect(done.rows.map((r) => [r.name, r.pos, r.countback])).toEqual([['B', '1', true], ['A', '2', true], ['C', '3', false]]);
  });
  it('net with the handicap, or gross by choice; classes by playing handicap', () => {
    const ev = event({ a: [5, 5, 5], b: [4, 4, 4] }, { a: 18, b: 0 }, { classes: [12] });
    expect(eventStandings(ev).rows.map((r) => [r.name, r.value, r.cls])).toEqual([['A', '-15', 'B'], ['B', 'Par', 'A']]); // 18 strokes on 3 holes: 6 each – a 5 is net -1, 5 under par
    expect(eventStandings(ev, { gross: true }).rows.map((r) => r.name)).toEqual(['B', 'A']);
    expect(eventStandings(ev, { cls: 'A' }).rows.map((r) => r.name)).toEqual(['B']);
    expect(classOf(12, [12])).toBe('A');
    expect(classOf(12.5, [12, 24])).toBe('B');
    expect(classOf(null, [12, 24])).toBe('C');
  });
  it('the results as CSV: place, player, flight, class, score, holes', () => {
    const csv = standingsCsv(event({ a: [4, 4, 4], b: [5, 5, 5] }, { a: 3, b: 30 }, { allowance: 0, classes: [18] }), true);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('"Clubturnier"');
    expect(lines[1]).toBe('"Place";"Player";"Flight";"Class";"To par";"Holes";"Countback"'); // the tests speak English
    expect(lines[2]).toBe('"1";"A";"A · B";"A";"0";"3";""');
    expect(lines[3]).toBe('"2";"B";"A · B";"B";"3";"3";""');
  });
});