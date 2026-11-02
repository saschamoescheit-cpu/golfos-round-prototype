import type { Round } from '../types';
import { poolNeedsDetails, sameName } from './wagers';
import { loadPools } from './wagerstore';
import { localDay } from './sharedround';

// Does a bet need this round in detail (Sascha 02.11.2026: "a tournament without a bet: the player's own card in detail,
// the marker's and the others' only the score with penalty strokes – coupled with a bet: in detail for the player and
// the one he marks"; "bets only on the score – birdies, to par – strokes with penalties; GIR, 3-putts, up & down need the
// details")? A running pool of this account, with one of the round's players in it, whose days (and rounds, if it names
// them) take this round – and a bet in it that needs details (lib/wagers poolNeedsDetails).
export function betLinked(round: Pick<Round, 'createdAt' | 'courseId' | 'courseName' | 'players'>): boolean {
  const at = { day: localDay(new Date(round.createdAt)), course: round.courseName, courseId: round.courseId };
  // a team plays as "A & B": each name counts
  const names = round.players.flatMap((p) => p.name.split(' & '));
  return loadPools().some(
    (e) =>
      !e.pool.deletedAt &&
      !e.pool.finishedAt &&
      e.pool.players.some((pp) => names.some((n) => sameName(pp.name, n))) &&
      poolNeedsDetails(e.pool, at),
  );
}
