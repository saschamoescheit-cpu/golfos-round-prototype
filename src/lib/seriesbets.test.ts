import { describe, expect, it } from 'vitest';
import { applySeriesAnswer, type BetGroup } from './seriesbets';
import { inPool, type Wager, type WagerPool } from './wagers';

// Sascha 14.11.2026: Hawks Landing added to the series for the 15th – "sollte abgefragt werden, ob die laufenden Wetten
// auch für die neue hinzugefügte Runde zählen sollen. Danach muss sich entsprechend alles anpassen".
const r = { day: '2026-11-15', course: 'Hawks Landing Golf Club', courseId: 'osm:hl' };
const pick = (day: string, course: string) => ({ day, course });
const bet = (id: string, patch: Partial<Wager> = {}): Wager => ({ id, player: 'cedric', kind: 'pars', target: 10, stake: 20, payout: 'success', attempts: 'any', ...patch });
const pool: WagerPool = {
  kind: 'wager-pool',
  id: 'p',
  name: 'USA-Wetten',
  from: '2026-11-05',
  to: '2026-11-14',
  createdAt: '',
  players: [{ id: 'cedric', name: 'Cedric' }],
  wagers: [bet('pars'), bet('sum6', { kind: 'scoreSum', rounds: 6, picks: [pick('2026-11-09', 'Kissimmee Bay'), pick('2026-11-16', 'Legends')] })],
  progress: {},
};
const groups: BetGroup[] = [
  { key: 'pars', label: 'Pars', who: ['Cedric'], ids: ['pars'], counts: true },
  { key: 'sum', label: 'Ergebnis in 6 Runden', who: ['Cedric'], ids: ['sum6'], counts: false },
];

describe('a round added to the series', () => {
  it('ticked: counts – the period stretched to the 15th, the chosen rounds take it', () => {
    const p = applySeriesAnswer(pool, r, groups, new Set(['pars', 'sum']));
    expect(p.to).toBe('2026-11-15');
    expect(inPool(r, p, p.wagers[0])).toBe(true);
    expect(p.wagers[1].picks?.map((x) => x.day)).toEqual(['2026-11-09', '2026-11-16', '2026-11-15']);
    expect(inPool(r, p, p.wagers[1])).toBe(true);
  });
  it('the score over 6 rounds not ticked: it stays on its chosen rounds; Pars count the new one', () => {
    const p = applySeriesAnswer(pool, r, groups, new Set(['pars']));
    expect(inPool(r, p, p.wagers[0])).toBe(true);
    expect(inPool(r, p, p.wagers[1])).toBe(false);
    expect(p.wagers[1].picks?.length).toBe(2);
  });
  it('none ticked: the period stays, Pars do not count the round (taken out of the bet)', () => {
    const wide = { ...pool, to: '2026-11-18' };
    const p = applySeriesAnswer(wide, r, groups, new Set());
    expect(p.to).toBe('2026-11-18');
    expect(inPool(r, p, p.wagers[0])).toBe(false);
    expect(p.wagers[0].voided?.[0]).toMatchObject({ day: '2026-11-15', course: 'Hawks Landing Golf Club' });
  });
  it("the trip's rounds listed: the new one joins them", () => {
    const listed = { ...pool, to: '2026-11-18', rounds: [{ id: 'a', day: '2026-11-14', course: 'Celebration' }] };
    const p = applySeriesAnswer(listed, r, groups, new Set(['pars']));
    expect(p.rounds?.map((x) => x.day)).toEqual(['2026-11-14', '2026-11-15']);
    expect(inPool(r, p, p.wagers[0])).toBe(true);
  });
});
