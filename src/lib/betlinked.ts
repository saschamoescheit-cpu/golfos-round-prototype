import type { Round } from '../types';
import { inPool } from './wagers';
import { loadPools } from './wagerstore';
import { localDay } from './sharedround';

// Does a bet count this round (Sascha 02.11.2026: "a tournament without a bet: the player's own card in detail, the
// marker's and the others' only the score with penalty strokes – a tournament coupled with a bet: in detail for the
// player and the one he marks")? A pool of this account with bets, running, whose days (and rounds, if it names them)
// take this round's day and course.
export function betLinked(round: Pick<Round, 'createdAt' | 'courseId' | 'courseName'>): boolean {
  const day = localDay(new Date(round.createdAt));
  return loadPools().some(
    (e) => !e.pool.deletedAt && !e.pool.finishedAt && e.pool.wagers.length > 0 && inPool({ day, course: round.courseName, courseId: round.courseId }, e.pool),
  );
}
