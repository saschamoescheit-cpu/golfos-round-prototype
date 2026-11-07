import { beforeEach, describe, expect, it } from 'vitest';
import { useLangForTests } from './i18n';
import { eventStandings, type Flight, type RoundEvent } from './sharedround';

// Every mode in a tournament (Sascha 07.11.2026: "the whole block Format – Rundenart, Modus, Scoring, HCP-Vorgabe"):
// Better Ball ranks each flight's pairs – players 1 & 2, 3 & 4 – the better score on each hole counting.

const holes = [3, 4, 5].map((par, i) => ({ label: String(i + 1), par, si: i + 1 }));
const cells = (...s: number[]) => s.map((x) => ({ s: x }));
const flight = (id: string, players: [string, number][], scores: number[][], o: Partial<Flight> = {}): Flight => ({
  id,
  name: players.map((p) => p[0]).join(' · '),
  players: players.map(([name, hcp], k) => ({ id: `p${k + 1}`, name, playingHandicap: hcp })),
  scores: Object.fromEntries(scores.map((s, k) => [`p${k + 1}`, cells(...s)])),
  ...o,
});
const event = (format: RoundEvent['format'], flights: Flight[]) =>
  ({
    kind: 'round-event',
    id: 'e1',
    name: 'Orlando',
    tournament: true,
    course: { id: 'c1', name: 'Kissimmee Bay', source: 'osm', lat: 28, lon: -81 },
    loopOrder: [],
    holes,
    format,
    createdAt: '2026-11-01T10:00:00Z',
    flights: Object.fromEntries(flights.map((f) => [f.id, f])),
  }) as unknown as RoundEvent;

describe('Better Ball in a tournament: the pairs of each flight', () => {
  beforeEach(() => useLangForTests('de'));
  const f1 = flight('f1', [['Erik', 0], ['Cedric', 0], ['Sascha', 0], ['Christopher', 0]], [
    [3, 6, 6], // Erik
    [5, 4, 5], // Cedric – with Erik: 3, 4, 5 = par
    [4, 5, 7], // Sascha
    [4, 4, 6], // Christopher – with Sascha: 4, 4, 6 = +2
  ]);
  const f2 = flight('f2', [['Stefan', 0], ['Tim', 0]], [
    [4, 4, 4], // Stefan
    [3, 5, 6], // Tim – with Stefan (a flight of two: one team): 3, 4, 4 = −1
  ]);

  it('gross: each pair one row, the better ball per hole – the flight of two one team', () => {
    const st = eventStandings(event({ mode: 'fourball', scoring: 'stroke', allowance: 0 }, [f1, f2]));
    expect(st.rows.map((r) => `${r.pos} ${r.name} ${r.value}`)).toEqual(['1 Stefan & Tim -1', '2 Erik & Cedric Par', '3 Sascha & Christopher +2']);
    expect(st.rows.every((r) => r.finished && r.thru === 3)).toBe(true);
  });
  it('a hole only one of the pair played still counts – thru as the pair', () => {
    const half = flight('f1', [['Erik', 0], ['Cedric', 0]], [[3, 4], [4]]);
    const st = eventStandings(event({ mode: 'fourball', scoring: 'stroke', allowance: 0 }, [half]));
    expect(st.rows).toHaveLength(1);
    expect(st.rows[0].name).toBe('Erik & Cedric');
    expect(st.rows[0].thru).toBe(2);
    expect(st.rows[0].finished).toBe(false);
  });
  it('Stableford: the more points of the pair count', () => {
    const st = eventStandings(event({ mode: 'fourball', scoring: 'stableford', allowance: 0 }, [f1]));
    expect(st.higherBetter).toBe(true);
    expect(st.rows.map((r) => `${r.name} ${r.value}`)).toEqual(['Erik & Cedric 6 Pkt.', 'Sascha & Christopher 4 Pkt.']);
  });
  it('the simple game as before: every player his own row', () => {
    const st = eventStandings(event({ mode: 'single', scoring: 'stroke', allowance: 0 }, [f1]));
    expect(st.rows.map((r) => `${r.name} ${r.value}`)).toEqual(['Cedric +2', 'Christopher +2', 'Erik +3', 'Sascha +4']);
  });
});
