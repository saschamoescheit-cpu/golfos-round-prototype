import type { Game } from './gameforms';
import { syncSoon } from './sync';

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
  syncSoon();
}
const TRASH = 'golfos.games.trash.v1';
/** A game the player deleted – in the bin until he deletes it for good (as rounds, Sascha 15.10.2026). */
export interface TrashedGame {
  game: Game;
  deletedAt: string;
}
export function loadGameTrash(): TrashedGame[] {
  try {
    const list = JSON.parse(localStorage.getItem(TRASH) ?? '[]') as TrashedGame[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
const writeTrash = (list: TrashedGame[]) => {
  try {
    localStorage.setItem(TRASH, JSON.stringify(list));
  } catch {
    /* storage full */
  }
};
const changed = () => window.dispatchEvent(new Event('golfos:games-changed'));

/** Only on the player's own request (feedback 15.10.2026: never delete data by itself) – into the bin, with "Undo". */
export function deleteGame(id: string): void {
  const game = loadGames().find((x) => x.id === id);
  if (game) writeTrash([{ game, deletedAt: new Date().toISOString() }, ...loadGameTrash().filter((t) => t.game.id !== id)]);
  try {
    localStorage.setItem(KEY, JSON.stringify(loadGames().filter((x) => x.id !== id)));
  } catch {
    /* ignore */
  }
  if (game) window.dispatchEvent(new CustomEvent('golfos:deleted', { detail: { kind: 'game', id, label: game.courseName } }));
}
/** Brings a deleted game back from the bin. */
export function restoreGame(id: string): boolean {
  const t = loadGameTrash().find((x) => x.game.id === id);
  if (!t) return false;
  saveGame(t.game);
  writeTrash(loadGameTrash().filter((x) => x.game.id !== id));
  changed();
  return true;
}
/** The player empties one game from the bin – the only way it goes for good. */
export function purgeGame(id: string): void {
  writeTrash(loadGameTrash().filter((x) => x.game.id !== id));
  changed();
}

/** The module open in this browser tab: a reload stays in it, a new start of the app asks again. */
export type AppModule = 'rounds' | 'games' | 'training' | 'mobility';
export function sessionModule(): AppModule | null {
  try {
    const m = sessionStorage.getItem(MODULE_KEY);
    return m === 'rounds' || m === 'games' || m === 'training' || m === 'mobility' ? m : null;
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
