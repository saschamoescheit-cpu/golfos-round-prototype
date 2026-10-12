// Hole notes (feature 017): what the player (or the club) knows about a hole that no map shows –
// out of bounds inside the course, a blind tee shot, "never short-right". The caddie learns the course this way.
// Stored per course on the device; in the product shared between players of a club.

export interface HoleNote {
  obLeft?: boolean;
  obRight?: boolean;
  obLong?: boolean;
  text?: string;
}

const KEY = 'golfos.holenotes.v1.';

/** Known from players (Sascha, 11.10.2026). */
const DEFAULTS: Record<string, Record<string, HoleNote>> = {
  'osm:relation/1326323': { '1A': { obLeft: true, obRight: true } },
  // Son Antem West, local rules (scorecard 2023): the driving range right of 10, behind the 11th green and right of 12 is out of bounds.
  'osm:way/28625559': { '10': { obRight: true }, '11': { obLong: true }, '12': { obRight: true } },
  'osm:relation/3977168': { '10': { obRight: true }, '11': { obLong: true }, '12': { obRight: true } },
};

export function loadHoleNotes(courseId: string): Record<string, HoleNote> {
  let own: Record<string, HoleNote> = {};
  try {
    own = JSON.parse(localStorage.getItem(KEY + courseId) ?? '{}');
  } catch {
    // storage blocked
  }
  return { ...(DEFAULTS[courseId] ?? {}), ...own };
}

export function saveHoleNote(courseId: string, hole: string, note: HoleNote): void {
  try {
    const all = JSON.parse(localStorage.getItem(KEY + courseId) ?? '{}');
    all[hole] = note;
    localStorage.setItem(KEY + courseId, JSON.stringify(all));
  } catch {
    // storage full – the note lives for this session only
  }
}
