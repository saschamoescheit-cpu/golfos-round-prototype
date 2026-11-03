import { loadProfile } from './profile';
import { loadFriends, mergeCards, saveFriends, type FriendCard } from './friends';
import { newId } from './storage';
import { authToken, loadSession, SUPABASE_KEY, SUPABASE_URL, syncConfigured, userId } from './sync';
import { AUTH_BACK, WEB_HOME } from './native';
import { reportError } from './errorlog';

// Friends linked by their accounts (Sascha 02.11.2026: "everyone keeps his handicap in his profile – friends should
// come from their accounts"; "a QR code of one's own as with PayPal, and an invitation by WhatsApp"). The server
// (supabase/golfos-friends.sql) keeps every account's friend card – name, handicap index, home club, photo, from his
// profile – with a friend code. Who shows his QR code or sends his link agrees; the other accepts – then both are
// friends and read each other's card. The cards come into the friends list (lib/friends mergeCards).

const CODE = 'golfos.friendcode.v1'; // { uid, code, sent } – this device's copy of the own code and what was sent
const ASK = 'golfos.friendask.v1'; // a friend's code opened by link or scan, until accepted or declined
const PHOTO_MAX = 290_000; // the server takes up to 300 000 characters

/** Linking needs an account of one's own: Google or user name – not the one made only to play along with a round. */
export const canLink = (): boolean => syncConfigured() && !!loadSession() && !loadSession()?.anonymous;

/** The link in the invitation and in the QR code: the website, the app takes it as well. */
export const friendLink = (code: string): string => `${WEB_HOME}#friend=${code}`;
/** The same for the iOS app (its own scheme): "open in the app" on the website. */
export const appFriendLink = (code: string): string => `${AUTH_BACK.replace(/auth$/, 'friend')}/${code}`;

/** A friend code from what was scanned or typed: the link (website or app) or the code itself. */
export function codeFromText(text: string): string | null {
  const t = text.trim();
  const m = /#friend=([0-9A-Za-z]{6,20})/.exec(t) ?? /:\/\/friend\/([0-9A-Za-z]{6,20})/.exec(t) ?? /^([0-9A-Fa-f]{4}[\s-]?[0-9A-Fa-f]{4}[\s-]?[0-9A-Fa-f]{4})$/.exec(t);
  return m ? m[1].replace(/[\s-]/g, '').toUpperCase() : null;
}
/** "A1B2 C3D4 E5F6" – to read out or type. */
export const spacedCode = (code: string): string => code.replace(/(.{4})(?=.)/g, '$1 ');

export const pendingAsk = (): string | null => {
  try {
    return localStorage.getItem(ASK);
  } catch {
    return null;
  }
};
export function setPendingAsk(code: string | null): void {
  try {
    if (code) localStorage.setItem(ASK, code);
    else localStorage.removeItem(ASK);
  } catch {
    /* blocked */
  }
  window.dispatchEvent(new Event('golfos:friend-ask'));
}

async function rpc<T>(fn: string, args: Record<string, unknown>, signedIn = true): Promise<T> {
  const t = signedIn ? await authToken() : await authToken().catch(() => null);
  if (signedIn && !t) throw new Error('not_signed_in');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(/unknown_code|own_code|not_signed_in/.exec(text)?.[0] ?? `HTTP ${r.status}`);
  return (text ? JSON.parse(text) : null) as T;
}

function stored(): { uid: string; code: string; sent: string } | null {
  try {
    const s = JSON.parse(localStorage.getItem(CODE) ?? 'null') as { uid: string; code: string; sent: string } | null;
    return s && s.uid === userId() ? s : null;
  } catch {
    return null;
  }
}
/** The own friend code, as this device knows it (null: not sent yet). */
export const myFriendCode = (): string | null => stored()?.code ?? null;

/** The own card from the profile to the server – only when it changed (or `force`); returns the own friend code. */
export async function publishCard(force = false): Promise<string | null> {
  if (!canLink()) return null;
  const p = loadProfile();
  const args = {
    p_first: p.firstName.trim(),
    p_last: p.lastName.trim(),
    p_hcp: p.hcpIndex.trim(),
    p_club: p.homeClub.trim(),
    p_photo: p.photo && p.photo.length <= PHOTO_MAX ? p.photo : null,
  };
  const sent = JSON.stringify(args);
  const s = stored();
  if (!force && s && s.sent === sent) return s.code;
  const code = await rpc<string>('golfos_friend_card_save', args);
  try {
    localStorage.setItem(CODE, JSON.stringify({ uid: userId(), code, sent }));
  } catch {
    /* blocked */
  }
  return code;
}

/** A new code: the old QR code and links stop working, the friends stay. */
export async function renewFriendCode(): Promise<string> {
  await publishCard();
  const code = await rpc<string>('golfos_friend_new_code', {});
  const s = stored();
  try {
    localStorage.setItem(CODE, JSON.stringify({ uid: userId(), code, sent: s?.sent ?? '' }));
  } catch {
    /* blocked */
  }
  return code;
}

/** The friends' cards into the friends list; false when the server could not be asked. */
export async function refreshFriends(): Promise<boolean> {
  if (!canLink()) return false;
  const t = await authToken();
  const me = userId();
  if (!t || !me) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/golfos_friend_cards?select=user_id,first_name,last_name,hcp_index,home_club,photo&user_id=neq.${encodeURIComponent(me)}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${t}` },
    });
    if (!r.ok) return false;
    const cards = (await r.json()) as FriendCard[];
    const before = loadFriends();
    const next = mergeCards(before, cards, newId);
    if (JSON.stringify(next) !== JSON.stringify(before)) {
      saveFriends(next);
      window.dispatchEvent(new Event('golfos:friends-changed'));
    }
    return true;
  } catch {
    return false; // offline
  }
}

export interface FriendPreview {
  first_name: string;
  last_name: string;
  home_club: string;
  photo: string | null;
  is_me: boolean;
  is_friend: boolean;
}
/** Who sent this code – also before signing in; null: no such code. */
export async function friendPreview(code: string): Promise<FriendPreview | null> {
  const rows = await rpc<FriendPreview[]>('golfos_friend_preview', { p_code: code }, false);
  return rows?.[0] ?? null;
}

/** Accept: both are friends now; his card comes into the list – checked (03.11.2026: Sascha accepted Cedric's
 *  invitation, and neither saw the other): only "you are friends" once he is really in the list; else an error. */
export async function acceptFriend(code: string): Promise<void> {
  await publishCard(true); // he reads mine as I read his – sent anew, so his phone surely finds it
  const friend = await rpc<string>('golfos_friend_add', { p_code: code });
  // the request stays until its sheet is closed: it says "you are friends" first
  for (let k = 0; k < 3; k++) {
    if ((await refreshFriends()) && (!friend || loadFriends().some((f) => f.uid === friend))) return;
    await new Promise((r) => setTimeout(r, 1200));
  }
  reportError('promise', new Error(`friend added, not in the list (${friend ? 'uid' : 'no uid'})`));
  throw new Error('not_listed');
}

/** Remove the link – for both; he leaves the list. */
export async function unfriend(uid: string): Promise<void> {
  await rpc<null>('golfos_friend_remove', { p_friend: uid });
  saveFriends(loadFriends().filter((f) => f.uid !== uid));
  window.dispatchEvent(new Event('golfos:friends-changed'));
}

let lastRefresh = 0;
let started = false;
/** After every sync (the profile may have changed): the own card if changed, the friends' cards every few minutes. */
export function startFriendLinks(): void {
  if (started) return;
  started = true;
  // back on screen (WhatsApp, the other app): a friend may have accepted meanwhile
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && canLink()) {
      lastRefresh = Date.now();
      void refreshFriends();
    }
  });
  window.addEventListener('golfos:synced', () => {
    if (!canLink()) return;
    void publishCard().catch(() => null);
    if (Date.now() - lastRefresh > 60 * 1000) {
      lastRefresh = Date.now();
      void refreshFriends();
    }
  });
}
