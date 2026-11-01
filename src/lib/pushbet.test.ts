import { describe, expect, it } from 'vitest';
import { betLabel, betNote } from '../../supabase/functions/golfos-push/index';
import { wagerLabel, type Wager } from './wagers';
import { setLang } from './i18n';

// The push about a bet made (Sascha 01.11.2026): the server says the bet as the app does.
const w = (patch: Partial<Wager>): Wager => ({ id: 'w1', player: 'chris', kind: 'birdieRun', target: 3, stake: 20, payout: 'success', attempts: 'any', ...patch });

describe('the push about a bet made', () => {
  it('the bet in the words of the app, in German and in English', () => {
    const bets: Partial<Wager>[] = [
      { kind: 'birdieRun', target: 3 },
      { kind: 'parRun', target: 12 },
      { kind: 'birdies', target: 5 },
      { kind: 'greens', target: 16, holes: 9 },
      { kind: 'score', target: -5 },
      { kind: 'score', target: 2, net: true },
      { kind: 'score', target: 0 },
      { kind: 'free', text: 'Längster Drive an Loch 7' },
    ];
    for (const lang of ['de', 'en'] as const) {
      setLang(lang);
      for (const b of bets) expect(betLabel(w(b), lang)).toBe(wagerLabel(w(b)));
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
