import { describe, expect, it } from 'vitest';
import { roundNowOf } from '../screens/Wagers';

// the bets in a round's leaderboard open on that round (Sascha 12.11.2026: "the current round at once, not the total")
describe('the round shown first in a round\'s bets', () => {
  const rs = [
    { key: '2026-11-08|Reunion Resort', day: '2026-11-08', course: 'Reunion Resort' },
    { key: '2026-11-12|Stonegate Golf Club', day: '2026-11-12', course: 'Stonegate Golf Club' },
    { key: '2026-11-12|Kissimmee Bay', day: '2026-11-12', course: 'Kissimmee Bay' },
  ];
  it('its course on its day', () => {
    expect(roundNowOf(rs, { day: '2026-11-12', course: 'Stonegate Golf Club - Cypress Course' })).toBe('2026-11-12|Stonegate Golf Club');
  });
  it('its day without the course – its last round', () => {
    expect(roundNowOf(rs, { day: '2026-11-12', course: 'Elsewhere' })).toBe('2026-11-12|Kissimmee Bay');
  });
  it('not counted yet – the latest round, nothing at all – the total', () => {
    expect(roundNowOf(rs.slice(0, 1), { day: '2026-11-12', course: 'Stonegate' })).toBe('2026-11-08|Reunion Resort');
    expect(roundNowOf([], { day: '2026-11-12' })).toBeNull();
  });
});
