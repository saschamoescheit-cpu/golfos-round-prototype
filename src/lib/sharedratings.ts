import type { TeeRating } from '../data/ratings';
import { SUPABASE_KEY, SUPABASE_URL, authToken, loadSession, syncConfigured } from './sync';

// Course rating and slope shared between players (night run 22./23.10.2026, final list – Sascha: "nobody should have to
// type them in"): what one signed-in player entered from the club's scorecard, every other player gets for the same
// course, loops and tee – men's and ladies' values apart. Read by everyone (they are public figures), written by
// signed-in players, each his own row. When several players entered a tee, the value most of them agree on counts.
// The table: supabase/golfos-ratings.sql – without it nothing is shared and nothing breaks.

const CACHE = 'golfos.sharedratings.v1.';
export interface SharedRow {
  tee: string;
  loops: string;
  lady: boolean;
  cr: number;
  slope: number;
  updated_at?: string;
}

/** The value most players agree on (newest first on a tie). */
export function agreed(rows: SharedRow[]): TeeRating | null {
  if (!rows.length) return null;
  const votes = new Map<string, { r: TeeRating; n: number; at: string }>();
  for (const x of rows) {
    const k = `${x.cr}|${x.slope}`;
    const v = votes.get(k);
    if (v) v.n++;
    else votes.set(k, { r: { cr: x.cr, slope: x.slope }, n: 1, at: x.updated_at ?? '' });
  }
  return [...votes.values()].sort((a, b) => b.n - a.n || b.at.localeCompare(a.at))[0].r;
}

export function sharedRating(courseId: string, tee: string, loops: string, lady: boolean): TeeRating | null {
  try {
    const rows: SharedRow[] = JSON.parse(localStorage.getItem(CACHE + courseId) ?? '[]');
    return agreed(rows.filter((x) => x.tee === tee && x.loops === loops && x.lady === lady));
  } catch {
    return null;
  }
}

/** The shared values of a course, kept on the phone (also offline later). True when something new came. */
export async function fetchShared(courseId: string): Promise<boolean> {
  if (!syncConfigured()) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/golfos_ratings?select=tee,loops,lady,cr,slope,updated_at&course_id=eq.${encodeURIComponent(courseId)}`, {
      headers: { apikey: SUPABASE_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return false;
    const rows: SharedRow[] = await r.json();
    const before = localStorage.getItem(CACHE + courseId);
    const now = JSON.stringify(rows);
    if (before === now) return false;
    localStorage.setItem(CACHE + courseId, now);
    return true;
  } catch {
    return false;
  }
}

/** The player's own values go to the others – signed in only; quietly nothing without the table or a connection. */
export async function shareRating(courseId: string, tee: string, loops: string, lady: boolean, rating: TeeRating): Promise<void> {
  if (!syncConfigured() || !loadSession() || tee === '–') return;
  try {
    const t = await authToken();
    if (!t) return;
    await fetch(`${SUPABASE_URL}/rest/v1/golfos_ratings?on_conflict=course_id,tee,loops,lady,user_id`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ course_id: courseId, tee, loops, lady, cr: rating.cr, slope: rating.slope }),
    });
  } catch {
    // offline – it stays the player's own value; shared the next time he saves it
  }
}
