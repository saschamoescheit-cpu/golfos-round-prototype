// Click paths across the app (Sascha 10.11.2026: "tapping USA-Wetten should jump there – check and fix these click paths
// in the whole app"): a pool of bets or a tournament named anywhere opens with one call – App.tsx listens and goes there
// as a tapped push notification does (Games & Bets with the pool, Tournaments with the tournament or series).

export interface NavTarget {
  pool?: string;
  /** the pool's standing on that day's round (Sascha 11.11.2026: "jump to the round – Erik's in Kissimmee") */
  day?: string;
  tour?: string;
  /** a round on this phone (its id): its scorecard – to sign it (the inbox, Sascha 13.11.2026) */
  round?: string;
}

export const NAV_EVENT = 'golfos:go';

/** Opens a pool of bets (its code) in Games & Bets – with a day, its standing on that day's round. */
export function goPool(code: string, day?: string): void {
  window.dispatchEvent(new CustomEvent<NavTarget>(NAV_EVENT, { detail: { pool: code, ...(day ? { day } : {}) } }));
}

/** Opens a round's scorecard in Rounds (its id). */
export function goRound(id: string): void {
  window.dispatchEvent(new CustomEvent<NavTarget>(NAV_EVENT, { detail: { round: id } }));
}

/** Opens a tournament or a series (its code) in Tournaments. */
export function goTour(code: string): void {
  window.dispatchEvent(new CustomEvent<NavTarget>(NAV_EVENT, { detail: { tour: code } }));
}
