import { describe, expect, it } from 'vitest';
import { seriesStandings } from './seriesstandings';
import type { Round } from '../types';
import { emptyEntry } from './scoring';
import { classOf, defaultMarkers, markersOf, saneMarkers, marksIn, differences, eventBoard, eventOf, eventStandings, isSigned, mergeFlight, newFlightRound, quietKeeper, roundFromEvent, settle, shareView, signable, standingsCsv, type RoundEvent } from './sharedround';

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
    // more than four classes (03.11.2026): six, the last E … F up to 54
    expect(classOf(30, [6, 12, 18, 24, 28])).toBe('F');
    expect(classOf(19, [6, 12, 18, 24, 28])).toBe('D');
  });
  it('a tournament marks unless "everyone his own" (marker: false, 03.11.2026)', () => {
    expect(marksIn({ mode: 'single', scoring: 'net' }, true)).toBe(true);
    expect(marksIn({ mode: 'single', scoring: 'net', marker: false }, true)).toBe(false);
    expect(marksIn({ mode: 'single', scoring: 'net' }, false)).toBe(false);
    expect(marksIn({ mode: 'single', scoring: 'net', marker: true }, false)).toBe(true);
  });
  it('the results as CSV: place, player, flight, class, score, holes', () => {
    const csv = standingsCsv(event({ a: [4, 4, 4], b: [5, 5, 5] }, { a: 3, b: 30 }, { allowance: 100, classes: [18] }), true); // a net event's gross view – a gross event has no classes (09.11.2026)
    const lines = csv.split('\n');
    expect(lines[0]).toContain('"Clubturnier"');
    expect(lines[1]).toBe('"Place";"Player";"Flight";"Class";"To par";"Holes";"Countback"'); // the tests speak English
    expect(lines[2]).toBe('"1";"A";"A · B";"A";"0";"3";""');
    expect(lines[3]).toBe('"2";"B";"A · B";"B";"3";"3";""');
  });
});
// Sascha's concept 30.10.2026: the card handed in – player and marker sign, then it is locked
describe('a tournament: the card signed and locked', () => {
  it('signable once every hole has both counts and none differs; signed by both, nobody changes it', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Cedric' }]), true);
    let cedric = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-cedric', 'Cedric');
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    for (let i = 0; i < 3; i++) {
      sascha = score(score(sascha, 'me', i, 4), 'c', i, 5);
      cedric = score(score(cedric, 'c', i, i === 2 ? 6 : 5), 'me', i, 4);
    }
    ({ ev, r: sascha } = exchange(ev, sascha));
    ({ ev, r: cedric } = exchange(ev, cedric));
    expect(signable(ev.flights.f1, 'me', 3)).toEqual({ ok: true });
    expect(signable(ev.flights.f1, 'c', 3)).toEqual({ ok: false, missing: [], differ: [2] }); // Cedric 6, Sascha counted 5
    // signed by Sascha and by Cedric as his marker: locked – a late change on Sascha's phone is not taken
    const f = { ...ev.flights.f1, signed: { me: { player: 't1', marker: 't2' } } };
    expect(isSigned(f, 'me') && !isSigned(f, 'c')).toBe(true);
    ev = { ...ev, flights: { f1: f } };
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(sascha.shared!.roles!.me).toBe('view');
    expect(shareView(sascha, ev.flights.f1, true).me.locked).toBe(true);
    sascha = score(sascha, 'me', 0, 3);
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(ev.flights.f1.scores.me[0]).toEqual({ s: 4 });
    expect(strokes(sascha, 'me')[0]).toBe(4);
    expect(eventStandings(ev).rows.find((r) => r.key === 'f1/me')?.signed).toBe(true);
  });
});
describe('the marker enters everything for the player he marks (Sascha 01.11.2026)', () => {
  const detail = (r: Round, pid: string, i: number, d: Partial<Round['entries'][string][number]>): Round => ({ ...r, entries: { ...r.entries, [pid]: r.entries[pid].map((e, k) => (k === i ? { ...e, ...d } : e)) } });
  it('his putts, sand, penalties and tee shot go with the count – the score compared alone', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Cedric' }], 'single', true));
    sascha = detail(sascha, 'c', 0, { strokes: 5, putts: 2, sandShots: 1, penalties: 0, fairway: 'left' });
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(ev.flights.f1.marks!.c[0]).toEqual({ s: 5, d: { pu: 2, sa: 1, fw: 'left' } });
    // Cedric's own 5 with 3 putts: the same score – no difference to sign off, the details are each one's own
    let cedric = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-cedric', 'Cedric');
    cedric = detail(cedric, 'c', 0, { strokes: 5, putts: 3 });
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    expect(differences(ev.flights.f1, 'c')).toEqual([]);
    // only the putts changed by the marker: that goes to the server too
    sascha = detail(sascha, 'c', 0, { putts: 1 });
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(ev.flights.f1.marks!.c[0]).toEqual({ s: 5, d: { pu: 1, sa: 1, fw: 'left' } });
    // details changed elsewhere (the marker on the website, then in the app): they come to this phone with the count
    ev = { ...ev, flights: { ...ev.flights, f1: { ...ev.flights.f1, marks: { ...ev.flights.f1.marks, c: [{ s: 5, d: { pu: 2, pe: 1 } }, null, null] } } } };
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(sascha.entries.c[0]).toMatchObject({ strokes: 5, putts: 2, penalties: 1, sandShots: 0, greensideBunker: false, fairway: null });
  });
  it('a count without details (an older app) leaves the details here alone', () => {
    let { ev, r: sascha } = host(round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Cedric' }], 'single', true));
    sascha = detail(sascha, 'c', 0, { strokes: 4, putts: 2 });
    ({ ev, r: sascha } = exchange(ev, sascha));
    ev = { ...ev, flights: { ...ev.flights, f1: { ...ev.flights.f1, marks: { ...ev.flights.f1.marks, c: [{ s: 4, d: { pu: 2 } }, { s: 3 }, null] } } } };
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(sascha.entries.c[1]).toMatchObject({ strokes: 3, putts: null });
    expect(sascha.entries.c[0]).toMatchObject({ strokes: 4, putts: 2 });
  });
});
import { plannedEvent, plannedFlight } from './sharedround';
import { playingHandicapFor } from './handicap';
describe('a tournament planned in Games, played in Rounds (Sascha 01.11.2026)', () => {
  const plan = () =>
    plannedEvent({
      name: 'Herbstpreis', date: '2026-11-06', course, holes, loopOrder: ['A'], format: { mode: 'single', scoring: 'stableford' },
      flights: [
        { teeTime: '09:20', players: [{ name: 'Sascha', playingHandicap: 12, hcpIndex: 11.8 }, { name: 'Cedric', playingHandicap: 20, hcpIndex: 19.6 }] },
        { players: [{ name: 'Ben', playingHandicap: 8 }, { name: 'Max', playingHandicap: 15 }, { name: 'Erik', playingHandicap: 30 }] },
      ],
    });
  it('the plan: a tournament with its day, flights, players and markers – nobody playing yet', () => {
    const ev = plan();
    expect(ev).toMatchObject({ kind: 'round-event', tournament: true, planned: true, date: '2026-11-06', name: 'Herbstpreis' });
    const [f1, f2] = Object.values(ev.flights);
    expect(f1.players.map((p) => [p.id, p.name, p.hcpIndex])).toEqual([['p1', 'Sascha', 11.8], ['p2', 'Cedric', 19.6]]);
    expect(f1.teeTime).toBe('09:20');
    expect(f1.markers).toEqual({ p1: 'p2', p2: 'p1' });
    expect(Object.keys(f2.markers!)).toHaveLength(3);
    expect(f1.scores.p1).toEqual([null, null, null]);
    expect(f1.phones).toEqual({});
  });
  it('on the day Cedric joins his flight as "p2": he keeps his score and marks Sascha; the plan stays as it was', () => {
    let ev = plan();
    const fid = Object.keys(ev.flights)[0];
    let cedric = roundFromEvent(ev, fid, 'p2', 'ABCDEF', 'ph-cedric', 'Cedric');
    expect(cedric.players.find((p) => p.isMe)?.name).toBe('Cedric');
    ({ ev, r: cedric } = exchange(ev, cedric, 'Cedric'));
    expect(cedric.shared!.roles).toEqual({ p1: 'mark', p2: 'own' });
    expect(ev.flights[fid].players.map((p) => p.name)).toEqual(['Sascha', 'Cedric']);
    expect(ev.flights[fid].phones!['ph-cedric'].player).toBe('p2');
    // the next exchange: nothing new (the plan's handicap index is no change of the players)
    const before = cedric;
    ({ r: cedric } = exchange(ev, cedric, 'Cedric'));
    expect(cedric.players).toBe(before.players);
  });
  it('the host adds a flight later', () => {
    const ev = plan();
    const f = plannedFlight(ev, { players: [{ name: 'Tom', playingHandicap: 4 }] });
    expect(f).toMatchObject({ by: ev.by, players: [{ id: 'p1', name: 'Tom' }], scores: { p1: [null, null, null] } });
  });
  it('the playing handicap from the index: without course rating the rounded index – half for 9 holes', () => {
    const h18 = Array.from({ length: 18 }, (_, i) => ({ loop: 'A', par: 4 + (i % 2) }));
    expect(playingHandicapFor('osm:way/none', h18, 'yellow', '12,4')).toBe(12);
    expect(playingHandicapFor('osm:way/none', h18.slice(0, 9), 'yellow', '12,4')).toBe(6);
    expect(playingHandicapFor('osm:way/none', h18, 'yellow', '')).toBeNull();
  });
});
import { markerOf } from './sharedround';
describe('one player keeps the score of all (Sascha 02.11.2026: "Chris enters it for everyone")', () => {
  const withScorer = () => {
    const r = round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Chris' }, { id: 'e', name: 'Erik' }]);
    return { ...r, format: { ...r.format!, scorer: 'c' } };
  };
  const set = (r: Round, pid: string, i: number, d: Partial<Round['entries'][string][number]>): Round => ({ ...r, entries: { ...r.entries, [pid]: r.entries[pid].map((e, k) => (k === i ? { ...e, ...d } : e)) } });
  it("Chris's phone writes every card in full, the others only see it", () => {
    let { ev, r: sascha } = host(withScorer());
    expect(ev.flights.f1.scorer).toBe('c');
    let chris = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-chris', 'Chris');
    ({ ev, r: chris } = exchange(ev, chris, 'Chris'));
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(chris.shared!.roles).toEqual({ me: 'free', c: 'own', e: 'free' });
    expect(sascha.shared!.roles).toEqual({ me: 'view', c: 'view', e: 'view' });
    chris = set(chris, 'me', 0, { strokes: 5, putts: 2 });
    chris = set(chris, 'e', 0, { strokes: 6, putts: 3, sandShots: 1 });
    chris = set(chris, 'c', 0, { strokes: 4 });
    ({ ev, r: chris } = exchange(ev, chris));
    // Sascha types his own 3 – not taken, Chris keeps the cards
    sascha = set(sascha, 'me', 0, { strokes: 3 });
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(ev.flights.f1.scores.me[0]).toEqual({ s: 5, d: { pu: 2 } });
    expect(ev.flights.f1.scores.e[0]).toEqual({ s: 6, d: { pu: 3, sa: 1 } });
    expect(strokes(sascha, 'me')[0]).toBe(5);
    expect(ev.flights.f1.marks ?? {}).toEqual({});
  });
  it('the cards: signed by each player and by Chris as everyone\'s marker – no second count needed', () => {
    let { ev } = host(withScorer());
    let chris = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-chris', 'Chris');
    for (const pid of ['me', 'c', 'e']) for (let i = 0; i < 3; i++) chris = set(chris, pid, i, { strokes: 4 });
    ({ ev, r: chris } = exchange(ev, chris, 'Chris'));
    const f = ev.flights.f1;
    expect(markerOf(f, 'me')).toBe('c');
    expect(markerOf(f, 'e')).toBe('c');
    expect(signable(f, 'me', 3)).toEqual({ ok: true });
    const signed = { ...f, signed: { me: { player: 'x', marker: 'y' } } };
    expect(isSigned(signed, 'me')).toBe(true);
    expect(isSigned({ ...f, signed: { me: { player: 'x' } } }, 'me')).toBe(false);
  });
  it('a player gives up after 2 of 3 holes (Sascha 12.11.2026): his card signable up to there, the board "WD after 2"', () => {
    let { ev } = host(withScorer());
    let chris = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-chris', 'Chris');
    for (const pid of ['me', 'c']) for (let i = 0; i < 3; i++) chris = set(chris, pid, i, { strokes: 4 });
    for (let i = 0; i < 2; i++) chris = set(chris, 'e', i, { strokes: 5 });
    ({ ev, r: chris } = exchange(ev, chris, 'Chris'));
    const f = ev.flights.f1;
    expect(signable(f, 'e', 3)).toEqual({ ok: false, missing: [2], differ: [] });
    const out = { ...f, retired: { e: 2 } };
    expect(signable(out, 'e', 3)).toEqual({ ok: true });
    const st = eventStandings({ ...ev, format: { ...(ev.format ?? {}), scoring: 'stroke' } as RoundEvent['format'], flights: { ...ev.flights, f1: out } }).rows;
    const erik = st.find((r) => r.key === 'f1/e')!;
    expect(erik.retired).toBe(true);
    expect(erik.finished).toBe(true);
    expect(erik.thru).toBe(2);
    expect(erik.sort).toBeNull();
    expect(st[st.length - 1].key).toBe('f1/e'); // stroke play: below everyone
  });
  it('the holes missing in the series total: double bogey, by the handicap or par – he stays in it (Sascha 12.11.2026)', () => {
    let { ev } = host(withScorer());
    let chris = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-chris', 'Chris');
    for (const pid of ['me', 'c']) for (let i = 0; i < 3; i++) chris = set(chris, pid, i, { strokes: 4 });
    for (let i = 0; i < 2; i++) chris = set(chris, 'e', i, { strokes: 5 });
    ({ ev, r: chris } = exchange(ev, chris, 'Chris'));
    const stroke = { ...ev, format: { ...(ev.format ?? {}), scoring: 'stroke' } as RoundEvent['format'] };
    const with_ = (fill?: 'double' | 'net' | 'par') => ({ ...stroke, flights: { ...stroke.flights, f1: { ...stroke.flights.f1, retired: { e: 2 }, ...(fill ? { retiredFill: { e: fill } } : {}) } } });
    const erik = (e: RoundEvent) => eventStandings(e).rows.find((r) => r.key === 'f1/e')!;
    const dbl = erik(with_()).filled!;
    expect(erik(with_('double')).filled).toBe(dbl);
    expect(dbl - erik(with_('par')).filled!).toBe(2);
    expect(erik(with_('net')).filled!).toBeGreaterThanOrEqual(erik(with_('par')).filled!);
    const total = seriesStandings([with_()]).rows.find((r) => r.name === 'Erik')!;
    expect(total.sum).toBe(dbl);
    expect(total.parts[0].retired).toBe(true);
  });
});

describe("a player's own analysis beside the scorer's card (Sascha 02.11.2026)", () => {
  it('his putts stay on his phone, the strokes and penalties are the scorer\'s – nothing of it goes to the flight', () => {
    const r0 = round([{ id: 'me', name: 'Sascha' }, { id: 'c', name: 'Chris' }]);
    let { ev, r: sascha } = host({ ...r0, format: { ...r0.format!, scorer: 'c' } });
    let chris = roundFromEvent(ev, 'f1', 'c', 'ABCDEF', 'ph-chris', 'Chris');
    ({ ev, r: chris } = exchange(ev, chris, 'Chris'));
    chris = { ...chris, entries: { ...chris.entries, me: chris.entries.me.map((e, k) => (k === 0 ? { ...e, strokes: 5, penalties: 1 } : e)) } };
    ({ ev, r: chris } = exchange(ev, chris));
    // Sascha's own analysis: 2 putts, a fairway – on his phone
    sascha = { ...sascha, entries: { ...sascha.entries, me: sascha.entries.me.map((e, k) => (k === 0 ? { ...e, putts: 2, fairway: 'hit' as const } : e)) } };
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(sascha.entries.me[0]).toMatchObject({ strokes: 5, penalties: 1, putts: 2, fairway: 'hit' });
    expect(ev.flights.f1.scores.me[0]).toEqual({ s: 5, d: { pe: 1 } });
    // the scorer corrects the score: it comes over, the analysis stays
    chris = { ...chris, entries: { ...chris.entries, me: chris.entries.me.map((e, k) => (k === 0 ? { ...e, strokes: 6 } : e)) } };
    ({ ev, r: chris } = exchange(ev, chris));
    ({ ev, r: sascha } = exchange(ev, sascha));
    expect(sascha.entries.me[0]).toMatchObject({ strokes: 6, penalties: 1, putts: 2, fairway: 'hit' });
  });
});

import { tournamentOver } from './sharedround';
describe('an expired tournament goes from the start page (Sascha 02.11.2026)', () => {
  // set up days before its day – a plan made "now" failed on 06.11.2026 itself: set up after its tee time, the six hours
  // counted from the real clock
  const plan = () => ({
    ...plannedEvent({
      name: 'Herbstpreis', date: '2026-11-06', course, holes, loopOrder: ['A'], format: { mode: 'single', scoring: 'stableford' },
      flights: [
        { teeTime: '09:20', players: [{ name: 'Sascha', playingHandicap: 12 }, { name: 'Cedric', playingHandicap: 20 }] },
        { teeTime: '10:00', players: [{ name: 'Ben', playingHandicap: 8 }, { name: 'Max', playingHandicap: 15 }] },
      ],
    }),
    createdAt: new Date(2026, 10, 1, 12, 0).toISOString(),
  });
  const at = (hhmm: string, day = 6) => new Date(2026, 10, day, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)));
  it('on its day, before and during play: shown', () => {
    expect(tournamentOver(plan(), 'Sascha', at('00:01'))).toBe(false);
    expect(tournamentOver(plan(), 'Sascha', at('14:30'))).toBe(false);
  });
  it('his own flight finished: over for him – not yet for the other flight', () => {
    const ev = plan();
    const [f1] = Object.values(ev.flights);
    f1.finishedAt = '2026-11-06T13:40:00Z';
    expect(tournamentOver(ev, 'Sascha', at('13:45'))).toBe(true);
    expect(tournamentOver(ev, 'Ben', at('13:45'))).toBe(false);
  });
  it('every flight finished: over for all, the host too', () => {
    const ev = plan();
    for (const f of Object.values(ev.flights)) f.finishedAt = '2026-11-06T14:00:00Z';
    expect(tournamentOver(ev, 'Gast', at('14:05'))).toBe(true);
  });
  it('six hours after the last tee time (nobody finished on the app), and the next day', () => {
    expect(tournamentOver(plan(), 'Sascha', at('16:01'))).toBe(true);
    expect(tournamentOver(plan(), 'Sascha', at('15:59'))).toBe(false);
    expect(tournamentOver(plan(), 'Sascha', at('08:00', 7))).toBe(true);
  });
  it('set up after its tee time (03.11.2026: "Durchfall Open" at four, 09:00 left): the six hours from then', () => {
    const ev = { ...plan(), createdAt: at('15:50').toISOString() };
    expect(tournamentOver(ev, 'Sascha', at('16:01'))).toBe(false);
    expect(tournamentOver(ev, 'Sascha', at('21:40'))).toBe(false);
    expect(tournamentOver(ev, 'Sascha', at('21:51'))).toBe(true);
  });
});

// Sascha 08.11.2026: "we also need to enter yesterday's scores afterwards" – the host's scores of a flight
describe('scores entered afterwards', () => {
  it('are the card: the own score and the marker\'s count, details kept where the strokes stay', async () => {
    const { withScores } = await import('./sharedround');
    const f = {
      id: 'f1', name: 'Flight', by: 'x', finishedAt: '2026-11-07T20:00:00Z',
      players: [{ id: 'p1', name: 'Sascha', playingHandicap: 7 }, { id: 'p2', name: 'Cedric', playingHandicap: 13 }],
      scores: { p1: [{ s: 4, d: { pu: 2 } }, { s: 5 }, null], p2: [null, null, null] },
      marks: { p1: [{ s: 5 }, null, null] },
    } as unknown as import('./sharedround').Flight;
    const g = withScores(f, { p1: [4, 6, 3], p2: [5, null, 4], ghost: [1, 1, 1] });
    expect(g.scores.p1).toEqual([{ s: 4, d: { pu: 2 } }, { s: 6 }, { s: 3 }]);
    expect(g.scores.p2).toEqual([{ s: 5 }, null, { s: 4 }]);
    expect(g.marks?.p1).toEqual([{ s: 4 }, { s: 6 }, { s: 3 }]); // no "marker differs" left
    expect(g.marks?.p2).toBeUndefined();
    expect('ghost' in g.scores).toBe(false);
    expect(g.finishedAt).toBe(f.finishedAt);
  });
});

describe('markers make sense; one scorer countersigns, each player signs his own (Sascha 10./11.11.2026)', () => {
  const players = [{ id: 'c', name: 'Christopher' }, { id: 'd', name: 'Cedric' }, { id: 's', name: 'Stefan' }].map((p) => ({ ...p, playingHandicap: 0 }));
  it('a marker twice is no plan – paired anew, a ring', () => {
    expect(saneMarkers(['c', 'd', 's'], { c: 'd', d: 'c', s: 'd' })).toBe(false);
    expect(saneMarkers(['c', 'd', 's'], { c: 's', d: 'c', s: 'd' })).toBe(true);
    const m = markersOf({ players, markers: { c: 'd', d: 'c', s: 'd' } })!;
    expect(new Set(Object.values(m)).size).toBe(3);
    expect(Object.entries(m).every(([k, v]) => k !== v)).toBe(true);
  });
  it('one scorer: he countersigns the others, not his own – a card is in only with the player signing it himself', () => {
    const f = { id: 'f', name: 'F', players, scores: {}, scorer: 'd', signed: { c: { marker: '2026-11-10' }, s: { marker: '2026-11-10', player: '2026-11-10' }, d: { player: '2026-11-10' } } } as never;
    expect(markerOf(f, 'c')).toBe('d');
    expect(markerOf(f, 'd')).toBeUndefined(); // no markers: the scorer's own card by himself
    expect(isSigned(f, 'c')).toBe(false); // the scorer's signature alone is not the card's
    expect(isSigned(f, 's')).toBe(true);
    expect(isSigned(f, 'd')).toBe(true);
    const m = { ...(f as object), markers: { c: 's', d: 'c', s: 'd' } } as never;
    expect(markerOf(m, 'd')).toBeUndefined(); // markers left in the plan beside a scorer do not count
    expect(markerOf(m, 'c')).toBe('d');
    expect(isSigned(m, 'd')).toBe(true);
  });
});
