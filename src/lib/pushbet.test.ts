import { describe, expect, it } from 'vitest';
import { betLabel, betNote } from '../../supabase/functions/golfos-push/index';
import { LIBRARY, wagerLabel, type Wager } from './wagers';
import { setLang } from './i18n';

// The push about a bet made (Sascha 01.11.2026): the server says the bet as the app does.
const w = (patch: Partial<Wager>): Wager => ({ id: 'w1', player: 'chris', kind: 'birdieRun', target: 3, stake: 20, payout: 'success', attempts: 'any', ...patch });

describe('the push about a bet made', () => {
  it('every bet of the library in the words of the app – numbers, 9 holes, the whole trip, German and English', () => {
    for (const lang of ['de', 'en'] as const) {
      setLang(lang);
      for (const b of LIBRARY)
        for (const target of [0, 1, 3, b.start])
          for (const holes of [18, 9] as const)
            for (const scope of [undefined, 'trip'] as const) {
              const bet = w({ kind: b.kind, ...b.patch, target, holes, ...(scope ? { scope } : {}), ...(b.kind === 'free' ? { text: 'Längster Drive an Loch 7' } : {}) });
              expect(betLabel(bet, lang)).toBe(wagerLabel(bet));
            }
    }
    setLang('de');
  });
  it('who made which bet, where and in which pool – a tap opens the pool', () => {
    const n = betNote('Chris', w({}), 'Bethpage Black · 05.11.', 'USA 2026', 'K7P4QX', 'de');
    expect(n.title).toBe('Wette geschafft: Chris');
    expect(n.body).toBe('3 Birdies in Folge · Bethpage Black · 05.11. · USA 2026');
    expect(n.url).toBe('./#pool=K7P4QX');
    expect(n.tag).toBe('golfos-bet-w1'); // each bet a notification of its own
  });
});
