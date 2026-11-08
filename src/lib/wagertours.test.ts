import { describe, expect, it } from 'vitest';
import { plannedEvent, withScores, type RoundEvent } from './sharedround';
import { flightPlayerOf, tourRoundOf } from './wagerstore';
import { judge, perRoundOf, playedRounds, type PlayedRound, type Wager } from './wagers';
import { figuresOf, standingRounds } from '../screens/Wagers';
import { emptyEntry } from './scoring';

// Sascha 08.11.2026, USA: "the bets hold for one round – an overview over all rounds for a total, and then per round";
// Erik showed "2/1" and the others nothing – the rounds on their phones were missing after the app failed yesterday;
// the scores entered afterwards by the host must count, fully ("Zählen voll").

const holes = Array.from({ length: 4 }, (_, i) => ({ index: i, label: String(i + 1), loop: 'A', number: i + 1, par: 4, strokeIndex: i + 1 }));
const course = { id: 'osm:way/1', source: 'osm' as const, name: 'Celebration', lat: 28.3, lon: -81.5 };
const plan = (names: string[]): RoundEvent =>
  plannedEvent({ name: 'Celebration', date: '2026-11-07', course, holes, loopOrder: ['A'], format: { mode: 'single', scoring: 'stroke' }, flights: [{ players: names.map((name) => ({ name, playingHandicap: 10 })) }] });
const fid = (ev: RoundEvent) => Object.keys(ev.flights)[0];
const pid = (ev: RoundEvent, name: string) => ev.flights[fid(ev)].players.find((p) => p.name === name)!.id;

describe('the tournaments count for the bets', () => {
  it('finds the pool player in the flight: by account, by name, "Chris" for "Christopher" – never a guess between two', () => {
    const ev = plan(['Sascha', 'Christopher', 'Erik Hausotter']);
    const f = ev.flights[fid(ev)];
    ev.flights[f.id] = { ...f, phones: { ph1: { player: pid(ev, 'Sascha'), name: 'S. M.', at: '2026-11-07T10:00:00Z', uid: 'u-sascha' } } };
    expect(flightPlayerOf(ev, { name: 'Ich', joined: { name: 'x', at: '', uid: 'u-sascha' } })?.player).toBe(pid(ev, 'Sascha'));
    expect(flightPlayerOf(ev, { name: 'Erik' })?.player).toBe(pid(ev, 'Erik Hausotter'));
    expect(flightPlayerOf(ev, { name: 'Chris' })?.player).toBe(pid(ev, 'Christopher'));
    expect(flightPlayerOf(plan(['Christopher', 'Christian']), { name: 'Chris' })).toBeNull();
    expect(flightPlayerOf(ev, { name: 'Moritz' })).toBeNull();
  });

  it('the scores entered afterwards: a round of the tournament’s day, finished, its strokes – marked as entered', () => {
    const ev = plan(['Sascha', 'Christopher']);
    const f = withScores(ev.flights[fid(ev)], { [pid(ev, 'Christopher')]: [3, 3, 3, 4] });
    expect(f.entered?.[pid(ev, 'Christopher')]).toBeTruthy();
    expect(f.entered?.[pid(ev, 'Sascha')]).toBeUndefined();
    const ev2 = { ...ev, flights: { [f.id]: f } };
    const r = tourRoundOf(ev2, 'CELEBR', '2026-11-07', { name: 'Chris' }, '2026-11-08')!;
    expect(r.createdAt.slice(0, 10)).toBe('2026-11-07');
    expect(r.finishedAt).toBeTruthy();
    expect(r.players.find((p) => p.isMe)?.name).toBe('Christopher');
    expect(r.entries[pid(ev, 'Christopher')].map((e) => e.strokes)).toEqual([3, 3, 3, 4]);
    // nothing of his in the flight: no round; a day still to come: none
    expect(tourRoundOf(ev2, 'CELEBR', '2026-11-07', { name: 'Sascha' }, '2026-11-08')).toBeNull();
    expect(tourRoundOf(ev2, 'CELEBR', '2026-11-09', { name: 'Chris' }, '2026-11-08')).toBeNull();
    // judged: 3 birdies in a row from those scores
    const played = playedRounds([r], () => true);
    const w: Wager = { id: 'w', player: 'chris', kind: 'birdieRun', target: 3, stake: 20, payout: 'success', attempts: 'any', counted: true };
    const p = judge(w, { from: '2026-11-05', to: '2026-11-18' }, played);
    expect(p.best).toBe(3);
    expect(p.done).toBe(true);
  });
});

describe('the standing per round', () => {
  const PARS = [4, 4, 4, 4];
  const pr = (day: string, course: string, scores: number[], counted = true): PlayedRound => ({ id: day + course, day, course, pars: PARS, entries: scores.map((s) => ({ ...emptyEntry(), strokes: s })), hcp: 10, counted });
  const w: Wager = { id: 'w', player: 'p', kind: 'birdieRun', target: 2, stake: 20, payout: 'success', attempts: 'any' };
  it('each round its own figure, oldest first; a round twice (two phones): its best', () => {
    const per = perRoundOf(w, [pr('2026-11-09', 'Kissimmee', [4, 3, 4, 4]), pr('2026-11-07', 'Celebration', [3, 3, 4, 3]), pr('2026-11-09', 'Kissimmee', [3, 3, 3, 4])]);
    expect(per).toEqual([
      { day: '2026-11-07', course: 'Celebration', value: 2, counted: true },
      { day: '2026-11-09', course: 'Kissimmee', value: 3, counted: true },
    ]);
  });
  it('judge keeps the rounds; the standing’s rounds from all bets; a round’s figure as the cell shows it', () => {
    const p = judge(w, { from: '2026-11-05', to: '2026-11-18' }, [pr('2026-11-07', 'Celebration', [3, 3, 4, 3]), pr('2026-11-09', 'Kissimmee', [4, 4, 4, 4], false)]);
    expect(p.perRound?.map((x) => x.value)).toEqual([2, 0]);
    expect(standingRounds({ progress: { w: p, d: { best: null, done: false, rounds: 1, at: '', duels: [{ day: '2026-11-08', course: 'Orange', front: 1, back: 0, total: 1 }] } } }).map((r) => r.key)).toEqual([
      '2026-11-07|Celebration',
      '2026-11-08|Orange',
      '2026-11-09|Kissimmee',
    ]);
    expect(figuresOf(w, 0)).toBe('2/–');
    expect(figuresOf(w, 3)).toBe('2/3');
  });
});
