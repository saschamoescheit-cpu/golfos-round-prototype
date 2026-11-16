import { L, type CategoryId, type Level, type Plan } from './types';
import type { Advice } from './recommend';

// The topics in five areas (Sascha 17.11.2026, the overhaul of Training: "Wissen" by areas, "Üben" with a
// recommendation and the plans by the same areas) – a player finds the topic by what part of the game it is.

export type AreaId = 'short' | 'long' | 'swing' | 'course' | 'body';
export const AREAS: { id: AreaId; name: L; cats: CategoryId[] }[] = [
  { id: 'short', name: L('Short game', 'Kurzes Spiel'), cats: ['putting', 'greenreading', 'chipping', 'pitching', 'lob', 'spin', 'bunker'] },
  { id: 'long', name: L('Long game', 'Langes Spiel'), cats: ['irons', 'woods', 'driver', 'highlow', 'lowpoint'] },
  { id: 'swing', name: L('Swing and ball flight', 'Schwung & Ballflug'), cats: ['basics', 'swing', 'ballflight'] },
  { id: 'course', name: L('On the course', 'Auf dem Platz'), cats: ['slopes', 'trouble', 'strategy'] },
  { id: 'body', name: L('Mind and body', 'Kopf & Körper'), cats: ['mental', 'fitness', 'practice'] },
];

/** the area of a topic */
export const areaOf = (cat: CategoryId): AreaId => AREAS.find((a) => a.cats.includes(cat))?.id ?? 'body';

/** the level that fits a handicap: up to 10 Können, 11–20 Fortgeschritten, above (or none) Einsteiger */
export const levelForHcp = (hcp: number | null | undefined): Level => (hcp == null || !Number.isFinite(hcp) ? 1 : hcp <= 10 ? 3 : hcp <= 20 ? 2 : 1);

/**
 * "Für dich" in Üben (17.11.2026): two or three plans – first the ones on the weak spots of the player's rounds
 * (their topic first among the plan's), then the ones of the player's level; never a weekly plan, never twice.
 */
export function plansForYou(plans: Plan[], advice: Pick<Advice, 'cat'>[], hcp: number | null | undefined, n = 3): Plan[] {
  const single = plans.filter((p) => !p.week);
  const out: Plan[] = [];
  const add = (p?: Plan) => p && !out.includes(p) && out.length < n && out.push(p);
  const level = levelForHcp(hcp);
  const fits = (p: Plan) => p.level === 0 || p.level === level;
  for (const a of advice) add(single.find((p) => p.focus[0] === a.cat && fits(p)) ?? single.find((p) => p.focus[0] === a.cat));
  // the level, then the one below it (there is no ready-made plan for every level), then the plans for everyone
  for (const l of [level, level - 1, 0]) for (const p of single) if (p.level === l) add(p);
  return out;
}

// ---------- the review for our golf pro: only on a device that opened the review link ----------
const REVIEWER = 'golfos.training.reviewer.v1';
let reviewerNow = false;
/** "Inhalte prüfen" only for Chris and Sascha (17.11.2026): a device shows it once the app was opened with #pruefen */
export function isReviewer(): boolean {
  try {
    return reviewerNow || localStorage.getItem(REVIEWER) === '1';
  } catch {
    return reviewerNow;
  }
}
/** The review link (#pruefen): this device shows "Inhalte prüfen" from now on; true when it was the link. */
export function takeReviewerLink(): boolean {
  if (typeof location === 'undefined' || location.hash !== '#pruefen') return false;
  reviewerNow = true;
  try {
    localStorage.setItem(REVIEWER, '1');
  } catch {
    /* blocked – shown for this visit only */
  }
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  return true;
}
