// The player's own data (profile tab, Sascha 14.10.2026): name, handicap index and home club. The round setup
// takes name and index from here; everything stays on the phone.

const KEY = 'golfos.profile.v1';

export interface Profile {
  firstName: string;
  lastName: string;
  hcpIndex: string; // as typed, e.g. "12,4" or "+1,2"
  homeClub: string;
  /** Profile photo: from the Google sign-in (URL) or chosen in the app (small JPEG as data URL). */
  photo?: string;
  /** Left- or right-handed (Sascha 17.10.2026): the Training pictures are mirrored for left-handers. Default right. */
  hand?: 'right' | 'left';
  /** Strokes gained compared with this group (Sascha 17.10.2026); missing = the next better group to the index. */
  sgGroup?: string;
}

export const EMPTY_PROFILE: Profile = { firstName: '', lastName: '', hcpIndex: '', homeClub: '' };

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) } : EMPTY_PROFILE;
  } catch {
    return EMPTY_PROFILE;
  }
}

/** The player plays left-handed (from the profile). */
export const isLeftHanded = (): boolean => loadProfile().hand === 'left';

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage blocked – the profile is kept for this visit only
  }
}

/** The name the app shows – on the leaderboard, in games, everywhere: the first name only (Sascha 15.10.2026);
 *  the last name when no first name is set. */
export const shownName = (p: Profile): string => p.firstName.trim() || p.lastName.trim();

/** "Sascha Möscheit", or "" when no name is set. */
export const fullName = (p: Profile): string => [p.firstName.trim(), p.lastName.trim()].filter(Boolean).join(' ');

/** The current handicap index from the profile ("12,4" → 12.4, "+1,2" → −1.2), null when empty or unreadable. */
export function profileIndex(p: Profile = loadProfile()): number | null {
  const t = p.hcpIndex.trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t.replace(/^\+/, ''));
  if (!Number.isFinite(v)) return null;
  return t.startsWith('+') ? -v : v;
}
