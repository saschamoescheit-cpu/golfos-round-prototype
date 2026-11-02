// Friends (Sascha 15.10.2026): the people you play with, kept once with their handicap – Rounds and Games offer them
// when setting up a flight or a game. Stored on the device (and synced between the own devices).
//
// Linked friends (Sascha 02.11.2026: "the handicaps change – everyone keeps his in his profile; friends should come from
// their accounts"): a friend with `uid` is an account – name, handicap index, home club and photo come from his friend
// card (his profile, lib/friendlinks), not typed here.

export interface Friend {
  id: string;
  name: string;
  hcp: string; // handicap index as typed, e.g. "18,4" or "+1,2"
  /** linked: his account – the fields below come from his card */
  uid?: string;
  fullName?: string;
  club?: string;
  photo?: string;
}

/** A friend's card on the server (supabase/golfos-friends.sql). */
export interface FriendCard {
  user_id: string;
  first_name: string;
  last_name: string;
  hcp_index: string;
  home_club: string;
  photo: string | null;
}

const KEY = 'golfos.friends.v1';

export function loadFriends(): Friend[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Friend[];
    return Array.isArray(list) ? list.sort((a, b) => a.name.localeCompare(b.name)) : [];
  } catch {
    return [];
  }
}
export function saveFriends(list: Friend[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked */
  }
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The friends with the cards of the linked ones (all of them – the server's whole answer): a card updates its friend,
 * or the friend typed by hand with the same name (linked now), or comes in new; a friend whose link is gone (removed on
 * the other side) stays, as one typed by hand with his last values.
 */
export function mergeCards(list: Friend[], cards: FriendCard[], newId: () => string): Friend[] {
  let next = list.map((f) => (f.uid && !cards.some((c) => c.user_id === f.uid) ? { id: f.id, name: f.name, hcp: f.hcp } : f));
  for (const c of cards) {
    const name = (c.first_name.trim() || c.last_name.trim() || '?').trim();
    const from: Omit<Friend, 'id'> = {
      name,
      hcp: c.hcp_index,
      uid: c.user_id,
      fullName: `${c.first_name.trim()} ${c.last_name.trim()}`.trim() || name,
      ...(c.home_club.trim() ? { club: c.home_club.trim() } : {}),
      ...(c.photo ? { photo: c.photo } : {}),
    };
    const k = next.findIndex((f) => f.uid === c.user_id);
    const typed = k >= 0 ? -1 : next.findIndex((f) => !f.uid && same(f.name, name));
    const at = k >= 0 ? k : typed;
    if (at >= 0) next = next.map((f, i) => (i === at ? { id: f.id, ...from } : f));
    else next = [...next, { id: newId(), ...from }];
  }
  return next;
}
