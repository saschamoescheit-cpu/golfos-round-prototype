import type { Game } from './gameforms';

// Games are kept apart from the rounds (Sascha 15.10.2026: the two modules are not linked yet).
const KEY = 'golfos.games.v1';
const MODULE_KEY = 'golfos.module';

export function loadGames(): Game[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Game[];
    return Array.isArray(list) ? list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  } catch {
    return [];
  }
}
export function saveGame(g: Game): void {
  const list = loadGames().filter((x) => x.id !== g.id);
  try {
    localStorage.setItem(KEY, JSON.stringify([g, ...list]));
  } catch {
    /* storage full or blocked */
  }
}
/** Only on the player's own request (feedback 15.10.2026: never delete data by itself). */
export function deleteGame(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadGames().filter((x) => x.id !== id)));
  } catch {
    /* ignore */
  }
}

/** The module open in this browser tab: a reload stays in it, a new start of the app asks again. */
export type AppModule = 'rounds' | 'games';
export function sessionModule(): AppModule | null {
  try {
    const m = sessionStorage.getItem(MODULE_KEY);
    return m === 'rounds' || m === 'games' ? m : null;
  } catch {
    return null;
  }
}
export function setSessionModule(m: AppModule | null): void {
  try {
    if (m) sessionStorage.setItem(MODULE_KEY, m);
    else sessionStorage.removeItem(MODULE_KEY);
  } catch {
    /* ignore */
  }
}
