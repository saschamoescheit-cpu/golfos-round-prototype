import { describe, expect, it } from 'vitest';
import type { RoundEvent } from './sharedround';
import { roundOver, seriesOver, seriesStandings } from './seriesstandings';

// Sascha 17./18.11.2026: "Nach heute ist die offizielle Turnierserie beendet. Es gab aber keine Meldung in der Inbox.
// Das Turnier sollte auch als abgeschlossen dargestellt werden" – Moritz's card on the Oaks (12.11.) was empty and held
// the series open ("Zählt nicht für ihn"); the final standing "Alle Runden zuerst" (Moritz +30 on 4 rounds stood first).
const holes = Array.from({ length: 18 }, (_, i) => ({ label: String(i + 1), par: 4, hcp: i + 1 })) as unknown as RoundEvent['holes'];
const card = (over: number, n = 18) => Array.from({ length: 18 }, (_, i) => (i < n ? { s: 4 + (i < over ? 1 : 0) } : null));
type P = { name: string; over: number; n?: number };
function ev(id: string, ps: P[], finished = true): RoundEvent {
  const players = ps.map((p, k) => ({ id: `p${k}`, name: p.name }));
  return {
    kind: 'round-event', id, name: id, tournament: true, course: { id: 'c', name: 'Legends' } as RoundEvent['course'], loopOrder: ['A'], holes, createdAt: '',
    format: { mode: 'single', scoring: 'stroke', allowance: 0 } as RoundEvent['format'],
    flights: { f1: { id: 'f1', name: 'Flight 1', players: players as RoundEvent['flights'][string]['players'], scores: Object.fromEntries(ps.map((p, k) => [`p${k}`, card(p.over, p.n ?? 18)])) as RoundEvent['flights'][string]['scores'], ...(finished ? { finishedAt: '2026-11-12T20:00:00Z' } : {}) } },
  } as RoundEvent;
}

describe('a round played out', () => {
  it('everyone through 18', () => expect(roundOver(ev('r', [{ name: 'Sascha', over: 2 }, { name: 'Erik', over: 3 }]))).toBe(true));
  it('one still on hole 12: not over', () => expect(roundOver(ev('r', [{ name: 'Sascha', over: 2 }, { name: 'Erik', over: 3, n: 12 }], false))).toBe(false));
  it('an empty card once the flight is in: over – he did not play it (Moritz, Oaks 12.11.)', () => {
    expect(roundOver(ev('r', [{ name: 'Sascha', over: 2 }, { name: 'Moritz', over: 0, n: 0 }]))).toBe(true);
  });
  it('an empty card while the flight is still out: not over', () => {
    expect(roundOver(ev('r', [{ name: 'Sascha', over: 2 }, { name: 'Moritz', over: 0, n: 0 }], false))).toBe(false);
  });
  it('nobody played yet: not over', () => expect(roundOver(ev('r', [{ name: 'Sascha', over: 0, n: 0 }]))).toBe(false));
  it('a series: every round of it there and played out', () => {
    const a = ev('a', [{ name: 'Sascha', over: 1 }]);
    expect(seriesOver([a, ev('b', [{ name: 'Sascha', over: 1 }])])).toBe(true);
    expect(seriesOver([a, null])).toBe(false);
    expect(seriesOver([])).toBe(false);
  });
});

describe('the final standing: all rounds first', () => {
  // Sascha and Erik in all three; Moritz better, but in two only
  const evs = [
    ev('r1', [{ name: 'Sascha', over: 5 }, { name: 'Erik', over: 8 }, { name: 'Moritz', over: 1 }]),
    ev('r2', [{ name: 'Sascha', over: 5 }, { name: 'Erik', over: 8 }, { name: 'Moritz', over: 0, n: 0 }]),
    ev('r3', [{ name: 'Sascha', over: 5 }, { name: 'Erik', over: 8 }, { name: 'Moritz', over: 1 }]),
  ];
  it('Sascha and Erik before Moritz – he stands on 2 rounds', () => {
    const st = seriesStandings(evs);
    expect(st.rows.map((r) => `${r.pos} ${r.name} ${r.sum}/${r.rounds}`)).toEqual(['1 Sascha 15/3', '2 Erik 24/3', '3 Moritz 2/2']);
    expect(st.anyNoReturn).toBe(true); // "auf N Runden" shown
  });
  it('everyone in every round: by the sum, no "auf N Runden"', () => {
    const st = seriesStandings([evs[0], evs[2]]);
    expect(st.rows.map((r) => r.name)).toEqual(['Moritz', 'Sascha', 'Erik']);
    expect(st.anyNoReturn).toBe(false);
  });
});
