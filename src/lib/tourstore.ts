import { publishPlannedEvent, updatePlannedEvent, type RoundEvent } from './sharedround';
import { authToken, loadSession, SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './sync';
import { myAccount } from './wagerstore';

// The tournaments planned in Games (Sascha 01.11.2026: "I could set up the tournaments for the USA now, put the flights
// together and choose the markers, and send the invitations once everyone has the app – in the USA everything is
// ready"). A tournament is a round's event of Rounds (lib/sharedround.ts), set up ahead: its row and one row per flight
// in the table of the shared games. Rounds shows it to the invited and plays it on the day; here the host plans it,
// changes it, deletes it – and everyone in it sees it, with the result once played. Only the host changes it.

/** A tournament set up ahead: the day it is played; deleted only marked (the bin brings it back). */
export type PlannedEvent = RoundEvent & { date: string; planned: true; deletedAt?: string | null };

export interface TourEntry {
  code: string;
  ev: PlannedEvent;
  /** the account that set it up (the row's owner) – only it changes the tournament */
  owner?: string;
}

export const isPlanned = (x: unknown): x is PlannedEvent => {
  const e = x as PlannedEvent | null;
  return !!e && e.kind === 'round-event' && e.planned === true && typeof e.date === 'string' && !!e.flights;
};

const KEY = 'golfos.tours.v1';
export function loadTours(): TourEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as TourEntry[];
    return Array.isArray(list) ? list.filter((e) => e && e.code && isPlanned(e.ev)) : [];
  } catch {
    return [];
  }
}
function saveTours(list: TourEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...list].sort((a, b) => a.ev.date.localeCompare(b.ev.date))));
  } catch {
    /* the server keeps them – they come back with the next look */
  }
  window.dispatchEvent(new Event('golfos:tours-changed'));
}
export function keepTour(code: string, ev: PlannedEvent, owner?: string): void {
  const list = loadTours();
  const host = owner ?? list.find((e) => e.code === code)?.owner;
  saveTours([{ code, ev, ...(host ? { owner: host } : {}) }, ...list.filter((e) => e.code !== code)]);
}

/** Is this phone's account the host of the tournament – the one who set it up. */
export const isTourHost = (e: TourEntry): boolean => !!e.owner && e.owner === myAccount();

/** Still to come (or today), played, deleted. */
export const tourState = (e: TourEntry, today: string): 'planned' | 'today' | 'played' | 'deleted' =>
  e.ev.deletedAt ? 'deleted' : e.ev.date > today ? 'planned' : e.ev.date === today ? 'today' : 'played';

const table = () => `${SUPABASE_URL}/rest/v1/golfos_shared_games`;
async function headers(): Promise<Record<string, string> | null> {
  if (!syncConfigured() || !loadSession()) return null;
  const t = await authToken();
  return t ? { apikey: SUPABASE_KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : null;
}

/** Every planned tournament this account is in (host or let in), from the server – a phone emptied or new gets them
 *  back, as the pools of bets. Nothing on the phone is dropped. */
export async function syncTours(): Promise<boolean> {
  const h = await headers();
  if (!h) return false;
  try {
    const r = await fetch(`${table()}?select=code,game,owner&event_code=is.null&game->>kind=eq.round-event&game->>planned=eq.true`, { headers: h });
    if (!r.ok) return false;
    const rows = (await r.json()) as { code: string; game: unknown; owner?: string }[];
    const list = loadTours();
    let changed = false;
    for (const row of rows) {
      if (!row?.code || !isPlanned(row.game)) continue;
      const old = list.find((e) => e.code === row.code);
      if (old && old.owner === row.owner && JSON.stringify(old.ev) === JSON.stringify(row.game)) continue;
      const entry: TourEntry = { code: row.code, ev: row.game, ...(row.owner ? { owner: row.owner } : {}) };
      const at = list.findIndex((e) => e.code === row.code);
      if (at >= 0) list[at] = entry;
      else list.push(entry);
      changed = true;
    }
    if (changed) saveTours(list);
    return true;
  } catch {
    return false;
  }
}

/** A new tournament on the server – the event and its flights (Rounds' publishPlannedEvent). Its code, or null. */
export async function createTour(ev: PlannedEvent): Promise<string | null> {
  const code = await publishPlannedEvent(ev);
  if (!code) return null;
  keepTour(code, ev, myAccount() ?? undefined);
  return code;
}

/** The host changes the tournament: name, day, players, flights, markers – or deletes it (only marked) and brings it
 *  back. True when the server took it; the tournament kept as the server has it now. */
export async function changeTour(code: string, ev: PlannedEvent): Promise<boolean> {
  const written = await updatePlannedEvent(code, ev);
  if (written) keepTour(code, isPlanned(written) ? written : ev);
  return !!written;
}

/** Gone for good from this phone (it stays on the server, marked deleted). */
export function forgetTour(code: string): void {
  saveTours(loadTours().filter((e) => e.code !== code));
}
