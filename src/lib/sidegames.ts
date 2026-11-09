import type { Round } from '../types';
import type { FormId, Game } from './gameforms';
import { sameName } from './wagers';

// A side game in a round (Sascha 10.11.2026: "a side bet – choose the game form; 5+5+10, Skins, Nassau, match play,
// Stableford"): a game of Games judged from the round's own strokes – no second round on the map, no score entered twice.
// Kept on the phone that set it up, beside the round (by its id); its standing in the round's leaderboard ("Wetten").

const KEY = 'golfos.sidegames.v1';
/** the round being set up – the side game is bound to it once it starts */
export const NEXT_ROUND = 'next';

export interface SideGame {
  id: string;
  /** the round's id (NEXT_ROUND while it is set up) */
  round: string;
  form: FormId;
  /** the round's players by name, with their playing handicap */
  players: { id: string; name: string; hcp: number | null }[];
  settings: Record<string, number | boolean | string>;
  createdAt: string;
}
/** the forms that make sense beside a round – judged from the strokes alone (Sascha 10.11.2026: "the list fits") */
export const SIDE_FORMS: FormId[] = ['fivefiveten', 'skins', 'nassau', 'match', 'stableford'];

export function loadSideGames(): SideGame[] {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(x) ? x.filter((s) => s && typeof s.id === 'string' && typeof s.round === 'string') : [];
  } catch {
    return [];
  }
}
function saveSideGames(list: SideGame[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('golfos:sidegames-changed'));
  } catch {
    /* storage full – the guard tells */
  }
}
export function addSideGame(s: SideGame): void {
  saveSideGames([...loadSideGames(), s]);
}
export function removeSideGame(id: string): void {
  saveSideGames(loadSideGames().filter((s) => s.id !== id));
}
/** A round started: the side games set up with it are its own now (set up within the last 12 hours). */
export function bindSideGames(roundId: string, now = Date.now()): void {
  const list = loadSideGames();
  if (!list.some((s) => s.round === NEXT_ROUND)) return;
  saveSideGames(list.map((s) => (s.round === NEXT_ROUND && now - Date.parse(s.createdAt) < 12 * 3600e3 ? { ...s, round: roundId } : s)));
}
export const sideGamesOf = (roundId: string): SideGame[] => loadSideGames().filter((s) => s.round === roundId);

/** The side game as a game of Games – its holes the round's, each player's strokes his entries in the round (by name);
 *  a hole picked up or not played yet: none. */
export function sideGameView(s: SideGame, round: Round): Game {
  const scores: Record<string, (number | null)[]> = {};
  for (const p of s.players) {
    const rp = round.players.find((x) => sameName(x.name, p.name));
    scores[p.id] = round.holes.map((_, i) => {
      const e = rp ? round.entries[rp.id]?.[i] : undefined;
      return !e || e.pickedUp || e.strokes == null ? null : e.strokes;
    });
  }
  const played = round.holes.map((_, i) => s.players.every((p) => scores[p.id][i] != null)).lastIndexOf(true) + 1;
  return {
    id: s.id,
    createdAt: s.createdAt,
    finishedAt: round.finishedAt ?? null,
    courseName: round.courseName,
    holes: round.holes.map((h) => ({ label: h.label, par: h.par, si: h.strokeIndex })),
    players: s.players,
    form: s.form,
    settings: s.settings,
    scores,
    extra: round.holes.map(() => ({})),
    current: Math.min(played, round.holes.length - 1),
  };
}
