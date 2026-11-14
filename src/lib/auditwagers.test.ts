import { describe, expect, it } from 'vitest';
import { plannedEvent, withScores, type RoundEvent } from './sharedround';
import type { Wager, WagerPool } from './wagers';
import { audit } from '../../scripts/auditwagers';

// The audit for 01.12.2026 (Sascha 14.11.2026: "Moritz hat keine 2 Birdie gespielt … Chris hat seine Parserie
// geschafft … Alle Auswertungen müssen richtig sein – immer!"): every bet judged anew from the tournament cards, the
// pool's standing beside it – a wrong one is found, a right one passes.
const holes = Array.from({ length: 6 }, (_, i) => ({ index: i, label: String(i + 1), loop: 'A', number: i + 1, par: 4, strokeIndex: i + 1 }));
const course = { id: 'osm:relation/4039888', source: 'osm' as const, name: 'Orange Lake – The Reserve', lat: 28.35, lon: -81.62 };
const ev0: RoundEvent = plannedEvent({ name: 'USA Tag 6', date: '2026-11-13', course, holes, loopOrder: ['A'], format: { mode: 'single', scoring: 'stroke' }, flights: [{ players: [{ name: 'Moritz', playingHandicap: 12 }, { name: 'Chris', playingHandicap: 8 }] }] });
const fid = Object.keys(ev0.flights)[0];
const pid = (name: string) => ev0.flights[fid].players.find((p) => p.name === name)!.id;
// entered afterwards by the host – counts as signed (countedRound): Moritz one birdie (corrected), Chris 5 pars in a row
const ev: RoundEvent = { ...ev0, flights: { [fid]: withScores(ev0.flights[fid], { [pid('Moritz')]: [5, 3, 5, 4, 6, 4], [pid('Chris')]: [5, 4, 4, 4, 4, 4] }) } };
const W = (id: string, player: string, kind: string, target: number): Wager => ({ id, player, kind, target, stake: 20, payout: 'success', attempts: 'any', counted: true }) as unknown as Wager;
const pool = (progress: WagerPool['progress']): WagerPool =>
  ({
    name: 'USA-Wetten',
    from: '2026-11-07',
    to: '2026-11-18',
    players: [
      { id: 'm', name: 'Moritz' },
      { id: 'c', name: 'Chris' },
    ],
    wagers: [W('mb', 'm', 'birdieRun', 2), W('cp', 'c', 'parRun', 5)],
    progress,
  }) as unknown as WagerPool;

describe('the audit of the bets against the cards', () => {
  const events = [{ code: 'RESERV', ev }];
  it('Moritz\'s two birdies (corrected to one) and Chris\'s par run not made: both found', () => {
    const rows = audit(pool({ mb: { best: 2, done: true, rounds: 1, at: 'x' }, cp: { best: 3, done: false, rounds: 1, at: 'x' } }), events, '2026-11-14T12:00:00Z');
    const by = Object.fromEntries(rows.map((r) => [r.wager, r]));
    expect(by.mb.cards.best).toBe(1);
    expect(by.mb.cards.done).toBe(false);
    expect(by.mb.differs).toBe(true);
    expect(by.cp.cards.best).toBe(5);
    expect(by.cp.cards.done).toBe(true);
    expect(by.cp.differs).toBe(true);
  });
  it('the standing as the cards say: nothing to report', () => {
    const fromCards = audit(pool({}), events, '2026-11-14T12:00:00Z');
    const right = Object.fromEntries(fromCards.map((r) => [r.wager, r.cards]));
    expect(audit(pool(right), events, '2026-11-14T12:00:00Z').every((r) => !r.differs)).toBe(true);
  });
  it('a bet decided by hand is not reported', () => {
    const rows = audit(pool({ mb: { best: 2, done: true, rounds: 1, at: 'x', manual: { done: false, by: 'host' } } }), events, '2026-11-14T12:00:00Z');
    expect(rows.find((r) => r.wager === 'mb')!.differs).toBe(false);
  });
});
