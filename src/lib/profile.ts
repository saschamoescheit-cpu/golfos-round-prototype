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
