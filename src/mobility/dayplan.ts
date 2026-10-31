import { coachOf, drillSeconds, type DrillCoach } from './drillcoach';

// The training of the day for the time the player has (Sascha 31.10.2026: "special drills for 15, 30, 45 and 60 min a
// day that someone can do at home"). A coach builds a longer session in blocks, not as a longer list of the same: first
// moving through the body (from 30 min), then the drills of the focus areas – mobility before stability, as the pillar
// orders them –, then the other areas below the goal, and what time is left goes into more sets of the focus drills
// (the dose rises where the gap is). Pure function – the screen gives it the drills, the tests check the times.
// REVIEW(golf): Chris – the blocks and the dose.

export const DAY_MINUTES = [15, 30, 45, 60] as const;
export type DayMinutes = (typeof DAY_MINUTES)[number];

/** Moving through the body before the focus (from 30 min): spine, hips, thoracic turn – easy on the floor (the later
 *  ones when the focus has the first ones anyway). */
export const PREP_DRILLS = ['mob-cat-camel', 'hip-9090', 'open-books', 'mob-pelvic-tilt', 'mob-thread-needle'];

/** Seconds around a drill that are not the sets: the demo, finding the place to the phone, 3-2-1, the result. */
export const DRILL_OVERHEAD = 60;
/** At most this many extra sets per focus drill (a longer day is more drills first, then more sets), and per other drill. */
export const MAX_EXTRA_SETS = 3;
export const MAX_EXTRA_SETS_MORE = 1;

export interface DayPlan {
  /** the drills in order */
  drills: string[];
  /** sets on top of the drill's plan (focus drills on long days) */
  extraSets: Record<string, number>;
  /** the moving-through drills at the start */
  warm: string[];
  /** about how long, in seconds */
  seconds: number;
}

/** The plan of a drill with extra sets. */
export const withSets = (c: DrillCoach, extra = 0): DrillCoach => (extra > 0 ? { ...c, sets: (c.sets ?? 1) + extra } : c);

/** About how long a drill takes as led, in seconds. */
export function drillTime(id: string, extra = 0, planOf: (id: string) => DrillCoach = coachOf): number {
  return DRILL_OVERHEAD + drillSeconds(withSets(planOf(id), extra));
}

/**
 * The plan of the day. `focus`: the drills of the focus areas, most important first (already turned to today's start);
 * `more`: the drills of the other areas below the goal, then the ones to keep. Nothing is taken twice; at least one
 * drill always.
 */
export function buildDayPlan(o: { minutes: number; focus: string[]; more: string[]; prep?: string[]; planOf?: (id: string) => DrillCoach }): DayPlan {
  const planOf = o.planOf ?? coachOf;
  const budget = o.minutes * 60;
  // a plan may run a little over rather than leave a gap of a whole drill
  const room = budget * 1.05;
  const drills: string[] = [];
  const extraSets: Record<string, number> = {};
  let seconds = 0;
  const take = (id: string) => {
    if (drills.includes(id)) return false;
    const s = drillTime(id, 0, planOf);
    if (drills.length && seconds + s > room) return false;
    drills.push(id);
    seconds += s;
    return true;
  };
  const warm: string[] = [];
  if (o.minutes >= 30) {
    // two to move through (three on the longest day), not the ones the focus has anyway
    const want = o.minutes >= 60 ? 3 : 2;
    for (const id of (o.prep ?? PREP_DRILLS).filter((x) => !o.focus.includes(x))) if (warm.length < want && take(id)) warm.push(id);
  }
  for (const id of o.focus) take(id);
  for (const id of o.more) take(id);
  // the time left: more sets of the focus drills, round by round in their order – then of the others (not the warm-up)
  const focusIn = o.focus.filter((id) => drills.includes(id));
  const moreIn = drills.filter((id) => !focusIn.includes(id) && !warm.includes(id));
  const rounds: [string[], number][] = [[focusIn, 1], [focusIn, 2], [moreIn, 1], [focusIn, 3]];
  for (const [list, round] of rounds)
    for (const id of list) {
      if (round > (list === focusIn ? MAX_EXTRA_SETS : MAX_EXTRA_SETS_MORE)) continue;
      if ((extraSets[id] ?? 0) !== round - 1) continue;
      const add = drillTime(id, round, planOf) - drillTime(id, round - 1, planOf);
      if (seconds + add > room) continue;
      extraSets[id] = round;
      seconds += add;
    }
  return { drills, extraSets, warm, seconds };
}
