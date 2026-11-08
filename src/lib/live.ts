import { SUPABASE_KEY, SUPABASE_URL, authToken } from './sync';
import { linkBase } from './native';
import type { RoundEvent } from './sharedround';
import type { TourSeries } from './tourstore';
import type { WagerPool } from './wagers';
import type { Game } from './gameforms';

// The live leaderboard for people outside (Sascha 08.11.2026, USA: "the live leaderboard also for people who are not
// in the tournament – the same for games and bets"). A tournament, a series, a game or a pool gets a watch code of its
// own (supabase/golfos-live.sql): long, only for looking, switched on and off by its players. The link opens the board
// in any browser – no app, no account; what it shows is cut down on the server (no accounts, no phones, the money only
// when switched on). The join code is never part of it.

/** what a watcher sees, by the kind shared */
export type LiveView =
  | { kind: 'event'; event: RoundEvent; at: string }
  | { kind: 'series'; series: TourSeries; events: (RoundEvent | null)[]; at: string }
  | { kind: 'pool'; pool: WagerPool; money: boolean; at: string }
  | { kind: 'game'; game: Game; money: boolean; at: string };

/** how watching stands for a tournament, series, game or pool: its watch code (null: off) and the money shown */
export interface LiveState {
  live: string | null;
  money: boolean;
}

/** The link of a watch code – always the web address (the iOS app's own origin is no address for others). */
export const liveLink = (code: string): string => `${linkBase()}#live=${code}`;

/** The watch code in the address (#live=…), or null. */
export function liveCodeOf(hash: string): string | null {
  const m = /^#live=([0-9a-f]{16,64})$/i.exec(hash.trim());
  return m ? m[1].toLowerCase() : null;
}

async function rpc<T>(fn: string, body: Record<string, unknown>, signedIn: boolean): Promise<T | undefined> {
  const token = signedIn ? await authToken() : SUPABASE_KEY;
  if (!token) return undefined;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return undefined;
    // a function that returns nothing answers with an empty body or "null" – both: nothing (not: no connection)
    const text = await r.text();
    return (text ? JSON.parse(text) : null) as T;
  } catch {
    return undefined;
  }
}

/** What the watch code shows now – null: switched off, deleted or unknown; undefined: no connection (try again). */
export async function fetchLive(code: string): Promise<LiveView | null | undefined> {
  const v = await rpc<LiveView | null>('golfos_live', { live_code: code }, false);
  if (v === undefined) return undefined;
  if (!v || typeof v !== 'object' || !('kind' in v)) return null;
  if (v.kind === 'event' && !v.event) return null;
  return v;
}

/** How watching stands (for the switch) – null: not allowed or no connection; the server without the SQL: null too. */
export async function liveState(rowCode: string): Promise<LiveState | null> {
  const s = await rpc<{ live: string | null; money: boolean } | null>('golfos_live_state', { row_code: rowCode }, true);
  return s && typeof s === 'object' ? { live: s.live ?? null, money: !!s.money } : null;
}

/** Watching switched on (a new link when `renew`), with the money or not – or off. The state as it is now, or null. */
export async function setLive(rowCode: string, on: boolean, money = false, renew = false): Promise<LiveState | null> {
  const c = await rpc<string | null>('golfos_live_set', { row_code: rowCode, turn_on: on, money, renew }, true);
  if (c == null) return null;
  return { live: c || null, money: on && money };
}
