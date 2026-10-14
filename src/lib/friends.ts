// Friends (Sascha 15.10.2026): the people you play with, kept once with their handicap – Rounds and Games offer them
// when setting up a flight or a game. Stored on the device.

export interface Friend {
  id: string;
  name: string;
  hcp: string; // handicap index as typed, e.g. "18,4" or "+1,2"
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
