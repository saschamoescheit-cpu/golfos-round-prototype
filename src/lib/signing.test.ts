import { describe, expect, it } from 'vitest';
import { deviceName, sign, unsign } from './signing';
import type { Round } from '../types';

// The signing trace (Sascha 28.10.2026: a round "jumped to signed by itself" – the next time the round says where from).
describe('signing trace', () => {
  const r = { id: 'r1', finishedAt: '2026-10-28T12:00:00Z', signedAt: null } as unknown as Round;
  it('every signature and withdrawal with its way, the last 10', () => {
    const a = sign(r, 'check');
    expect(a.signedAt).toBe(a.signLog![0].at);
    expect(a.signLog!.map((x) => x.how)).toEqual(['check']);
    const b = sign(unsign(a), 'confirm');
    expect(b.signLog!.map((x) => x.how)).toEqual(['check', 'withdraw', 'confirm']);
    expect(unsign(b).signedAt).toBeNull();
    let c = r;
    for (let i = 0; i < 12; i++) c = sign(unsign(c));
    expect(c.signLog).toHaveLength(10);
    expect(sign(r).signLog![0].how).toBe('status'); // the state on the scorecard
  });
  it('the device from the browser', () => {
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15')).toBe('iPhone');
    expect(deviceName('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('iPad');
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe('Windows');
    expect(deviceName('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe('Android');
    expect(deviceName('')).toBe('');
  });
});
