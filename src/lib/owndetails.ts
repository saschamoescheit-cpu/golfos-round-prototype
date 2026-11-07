// "Eigene Detailerfassung" (Sascha 07.11.2026: "one enters the whole score of the flight, and a player still enters his
// own details for his own analysis – ideally set per person: Chris enters the score for all, Moritz and Sascha (or one
// of them) still enter their own"). The setup names the players who want it (format.ownDetails, by name); each phone can
// change it for itself on the round (kept here, per round). The scorer's count stays the score – the own details are
// the player's analysis only, on his phone.

const KEY = 'golfos.owndetails.v1';
/** A player's name as the setup keeps it in format.ownDetails. */
export const ownKey = (name: string): string => name.trim().toLowerCase();

function chosen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}
/** Does this phone enter its own details on this round: as chosen on the phone, else as the setup named it. */
export function ownDetailsOn(roundId: string, name: string, planned: string[] | undefined): boolean {
  const own = chosen()[roundId];
  return own ?? (planned ?? []).includes(ownKey(name));
}
/** The phone's own choice for this round. */
export function setOwnDetails(roundId: string, on: boolean): void {
  try {
    const all = chosen();
    all[roundId] = on;
    // only the latest rounds kept
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full – asked again next time */
  }
}
