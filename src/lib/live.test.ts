import { describe, expect, it } from 'vitest';
import { liveCodeOf, liveLink } from './live';

// The spectators' link (Sascha 08.11.2026): #live=<watch code> – only that opens the page, never a join code.
describe('the live link', () => {
  it('reads the watch code from the address', () => {
    expect(liveCodeOf('#live=4ea39bc6d1eb429da943f6d3')).toBe('4ea39bc6d1eb429da943f6d3');
    expect(liveCodeOf('#live=4EA39BC6D1EB429DA943F6D3')).toBe('4ea39bc6d1eb429da943f6d3');
  });
  it('nothing else: a join code, a round link, too short', () => {
    expect(liveCodeOf('#join=ABC123')).toBeNull();
    expect(liveCodeOf('#round=ABC123')).toBeNull();
    expect(liveCodeOf('#live=ABC123')).toBeNull();
    expect(liveCodeOf('')).toBeNull();
  });
  it('the link: the web address with the code', () => {
    (globalThis as { location?: unknown }).location ??= { origin: 'https://golfos.example', pathname: '/' };
    expect(liveLink('4ea39bc6d1eb429da943f6d3')).toMatch(/#live=4ea39bc6d1eb429da943f6d3$/);
  });
});
