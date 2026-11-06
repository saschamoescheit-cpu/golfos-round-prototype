import { describe, expect, it } from 'vitest';
import { canLinkInto, meOf } from './wagerstore';
import type { WagerPool } from './wagers';

// Who a phone is in a pool (Sascha 06.11.2026, USA trip: "Chris made by hand, Christopher joined – twice"; "invite Erik
// Hausotter right at Erik").
const pool = (players: WagerPool['players'], wagers: Partial<WagerPool['wagers'][number]>[] = []): WagerPool =>
  ({ kind: 'wager-pool', id: 'p', name: 'USA', from: '2026-11-05', to: '2026-11-18', createdAt: '', players, wagers, progress: {} }) as unknown as WagerPool;

describe('who this phone is in a pool', () => {
  it('the player kept – while he is still in the pool', () => {
    expect(meOf(pool([{ id: 'pc', name: 'Chris' }]), 'pc', 'u1')).toBe('pc');
  });
  it('linked by the host into another: found again by the account, not the gone one', () => {
    const p = pool([{ id: 'pc', name: 'Chris', joined: { name: 'Christopher', at: '', uid: 'u-chris' } }]);
    expect(meOf(p, 'gone', 'u-chris')).toBe('pc');
  });
  it('invited right at a player: that one – unless another account took him', () => {
    expect(meOf(pool([{ id: 'pe', name: 'Erik', invited: { uid: 'u-erik', name: 'Erik Hausotter', at: '' } }]), undefined, 'u-erik')).toBe('pe');
    expect(meOf(pool([{ id: 'pe', name: 'Erik', invited: { uid: 'u-erik', name: 'Erik', at: '' }, joined: { name: 'X', at: '', uid: 'u-x' } }]), undefined, 'u-erik')).toBe('');
  });
  it('nothing known: asked "who are you?"', () => {
    expect(meOf(pool([{ id: 'pe', name: 'Erik' }]), undefined, 'u-erik')).toBe('');
    expect(meOf(pool([{ id: 'pe', name: 'Erik' }]), undefined, null)).toBe('');
  });
});

describe('a player joined as a new one, linked into the one made by hand', () => {
  const christopher = { id: 'px', name: 'Christopher', joined: { name: 'Christopher', at: '', uid: 'u-chris' } };
  it('only one on a phone, without bets or payments', () => {
    expect(canLinkInto(pool([christopher]), christopher)).toBe(true);
    expect(canLinkInto(pool([christopher], [{ id: 'w', player: 'px' }]), christopher)).toBe(false);
    expect(canLinkInto(pool([christopher], [{ id: 'w', player: 'pc', opponent: 'px' }]), christopher)).toBe(false);
    expect(canLinkInto(pool([{ id: 'pm', name: 'Moritz' }]), { id: 'pm', name: 'Moritz' })).toBe(false);
  });
});
