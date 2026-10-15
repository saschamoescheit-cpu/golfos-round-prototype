import type { Club, LngLat } from '../types';
import { clubCode, tr } from './i18n';

// The round plan (Sascha 16.10.2026: "plan a round – the tee shot with the 4-iron on 1A, then a 9-iron into the
// green – as for a practice round before a league match"): per course and hole the targets and the club of every
// shot. Made in "Plan round" from the round setup, used in the live round: the targets stand on the map, the caddie
// says the plan and when today's conditions call for another club.

export interface PlannedHole {
  targets: LngLat[];
  clubs: (Club | null)[]; // per shot: tee → target 1, target 1 → target 2 …, last target → green; null = suggested
  at: string;
}
export type CourseStrategy = Record<string, PlannedHole>; // by hole label

const KEY = 'golfos.strategy.v1.';

export function loadStrategy(courseId: string): CourseStrategy {
  try {
    return JSON.parse(localStorage.getItem(KEY + courseId) ?? '{}') as CourseStrategy;
  } catch {
    return {};
  }
}

export function savePlannedHole(courseId: string, label: string, h: PlannedHole | null): CourseStrategy {
  const all = loadStrategy(courseId);
  if (h) all[label] = h;
  else delete all[label];
  try {
    localStorage.setItem(KEY + courseId, JSON.stringify(all));
  } catch {
    /* storage full – this visit only */
  }
  return all;
}

/** "4i to target 1 – then 9i into the green" from shot `from` on. */
export function planSteps(clubs: Club[], from: number): string {
  const rest = clubs.slice(from);
  return rest
    .map((c, k) => {
      const last = from + k === clubs.length - 1;
      const where = last ? tr('into the green', 'ins Grün') : tr(`to target ${from + k + 1}`, `auf Ziel ${from + k + 1}`);
      return `${clubCode(c)} ${where}`;
    })
    .join(tr(' – then ', ' – danach '));
}
