import { describe, expect, it, vi } from 'vitest';

// as the iOS app: Capacitor says "native"
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => ({}) }));

const { WEB_HOME, linkBase } = await import('./native');
const { joinLink } = await import('./sharedgame');
const { roundJoinLink } = await import('./sharedround');

describe('links sent from the app', () => {
  it("open the website – the app's own address opens on no other phone", () => {
    expect(linkBase()).toBe(WEB_HOME);
    expect(joinLink('ABC123')).toBe(`${WEB_HOME}#join=ABC123`);
    expect(roundJoinLink('XYZ789')).toBe(`${WEB_HOME}#round=XYZ789`);
  });
});
