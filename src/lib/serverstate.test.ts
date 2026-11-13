import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sascha 14.11.2026: Supabase blocked the project (402, "exceed_egress_quota") and the standing showed old figures as right
describe('the server watched', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, get length() { return store.size; } } as Storage;
    globalThis.window = Object.assign(globalThis.window ?? {}, { dispatchEvent: () => true }) as unknown as Window & typeof globalThis;
  });
  it('402 or 5xx: down since then; any other answer: up again; offline: not the server\'s fault', async () => {
    const { noteServer, serverDownSince } = await import('./serverstate');
    noteServer(200);
    expect(serverDownSince()).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T21:52:00Z'));
    noteServer(402);
    const since = serverDownSince();
    expect(since).toBe('2026-11-13T21:52:00.000Z');
    vi.setSystemTime(new Date('2026-11-13T22:30:00Z'));
    noteServer(503);
    expect(serverDownSince()).toBe(since); // still the first time
    noteServer(404); // an answer – the server is there
    expect(serverDownSince()).toBeNull();
    vi.useRealTimers();
  });
});
