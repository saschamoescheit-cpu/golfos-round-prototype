import type { Round } from '../types';
import { saveRound } from './storage';

// A round started from a pool of bets (Sascha 02.11.2026: "start the round right from the bet – else again through
// Rounds and the players set up once more"): played on the map in Games, like a game. While it is played it is kept
// here – not in the rounds of Rounds, so Rounds does not open it as its round in play; finished it goes there (the round
// analysis) and the bets are judged from it as from any round.

const KEY = 'golfos.poolrounds.v1';
export interface PoolRoundEntry {
  /** the pool's code */
  code: string;
  round: Round;
}

export function loadPoolRounds(): PoolRoundEntry[] {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(x) ? x.filter((e) => e && typeof e.code === 'string' && e.round && Array.isArray(e.round.holes)) : [];
  } catch {
    return [];
  }
}
function save(list: PoolRoundEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full – the round is still on screen */
  }
  window.dispatchEvent(new Event('golfos:poolrounds-changed'));
}
/** The round of a pool in play on this phone. */
export const poolRoundOf = (code: string): Round | null => loadPoolRounds().find((e) => e.code === code && !e.round.finishedAt)?.round ?? null;
export function keepPoolRound(code: string, round: Round): void {
  save([{ code, round }, ...loadPoolRounds().filter((e) => e.round.id !== round.id)]);
}
export function dropPoolRound(id: string): void {
  save(loadPoolRounds().filter((e) => e.round.id !== id));
}
/** Finished: into the rounds of Rounds (the round analysis), gone from here. */
export function finishPoolRound(round: Round): Round {
  const done = { ...round, finishedAt: round.finishedAt ?? new Date().toISOString() };
  saveRound(done);
  dropPoolRound(round.id);
  return done;
}
/** The rounds in play here – judged live, as the rounds of Rounds. */
export const roundsInPlay = (): Round[] => loadPoolRounds().map((e) => e.round);
