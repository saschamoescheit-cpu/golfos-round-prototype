import { publishPlannedEvent, refreshEvent, updatePlannedEvent, type RoundEvent } from './sharedround';
import { newCode } from './sharedgame';
import { authToken, loadSession, SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './sync';
import { myAccount } from './wagerstore';
import { dayOf } from './wagers';
import type { Special } from './specials';
import type { TourDraw } from './tourdraw';

// The tournaments planned in Games (Sascha 01.11.2026: "I could set up the tournaments for the USA now, put the flights
// together and choose the markers, and send the invitations once everyone has the app – in the USA everything is
// ready"). A tournament is a round's event of Rounds (lib/sharedround.ts), set up ahead: its row and one row per flight
// in the table of the shared games. Rounds shows it to the invited and plays it on the day; here the host plans it,
// changes it, deletes it – and everyone in it sees it, with the result once played. Only the host changes it.

/** A tournament set up ahead: the day it is played; deleted only marked (the bin brings it back); its special prizes
 *  (Long Drive, Nearest to the Pin – lib/specials.ts). */
export type PlannedEvent = RoundEvent & {
  date: string;
  planned: true;
  deletedAt?: string | null;
  specials?: Special[];
  series?: { code: string; name: string } | null;
  /** how its flights are drawn (Sascha 04.11.2026) – "by result" waits for the rounds before */
  draw?: TourDraw;
};

/** A tournament series (Sascha 01.11.2026: "our golf trip is a tournament series of six tournament rounds"): its own
 *  row with its own code – one code for all its rounds – and a copy of the rounds for showing them (the rounds' events
 *  are what counts; each points back to its series). */
export interface SeriesRound {
  code: string;
  /** YYYY-MM-DD */
  date: string;
  name: string;
  course: { id: string; name: string };
}
export interface TourSeries {
  kind: 'tour-series';
  id: string;
  name: string;
  createdAt: string;
  deletedAt?: string | null;
  /** by date */
  rounds: SeriesRound[];
  /** one tournament over several rounds (Sascha 04.11.2026: "a tournament over three rounds – or a series of three
   *  tournaments"): one name, one field, set up together; the cut after a round – the best `top` and ties play on */
  multi?: { cut?: { after: number; top: number } | null };
}
export interface SeriesEntry {
  code: string;
  series: TourSeries;
  owner?: string;
}
export const isSeries = (x: unknown): x is TourSeries => !!x && (x as TourSeries).kind === 'tour-series' && Array.isArray((x as TourSeries).rounds);

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

const SERIES = 'golfos.tourseries.v1';
export function loadSeries(): SeriesEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(SERIES) ?? '[]') as SeriesEntry[];
    return Array.isArray(list) ? list.filter((e) => e && e.code && isSeries(e.series)) : [];
  } catch {
    return [];
  }
}
function keepSeries(code: string, series: TourSeries, owner?: string): void {
  const list = loadSeries();
  const host = owner ?? list.find((e) => e.code === code)?.owner;
  try {
    localStorage.setItem(SERIES, JSON.stringify([{ code, series, ...(host ? { owner: host } : {}) }, ...list.filter((e) => e.code !== code)]));
  } catch {
    /* the server keeps it */
  }
  window.dispatchEvent(new Event('golfos:tours-changed'));
}
export const isSeriesHost = (e: SeriesEntry): boolean => !!e.owner && e.owner === myAccount();
const roundOf = (code: string, ev: PlannedEvent): SeriesRound => ({ code, date: ev.date, name: ev.name, course: { id: ev.course.id, name: ev.course.name } });

/** Is this phone's account the host of the tournament – the one who set it up. */
export const isTourHost = (e: TourEntry): boolean => !!e.owner && e.owner === myAccount();

/** Still to come (or today), played, deleted. */
export const tourState = (e: TourEntry, today: string): 'planned' | 'today' | 'played' | 'deleted' =>
  e.ev.deletedAt ? 'deleted' : e.ev.date > today ? 'planned' : e.ev.date === today ? 'today' : 'played';

/** For the module card on the start page (03.11.2026): the names of today's tournaments and how many are planned after today. */
export function toursSoon(now = new Date()): { today: string[]; planned: number } {
  const today = dayOf(now);
  const live = loadTours();
  return { today: live.filter((e) => tourState(e, today) === 'today').map((e) => e.ev.name), planned: live.filter((e) => tourState(e, today) === 'planned').length };
}

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
    // the series this account is in
    const sr = await fetch(`${table()}?select=code,game,owner&event_code=is.null&game->>kind=eq.tour-series`, { headers: h });
    if (sr.ok) for (const row of (await sr.json()) as { code: string; game: unknown; owner?: string }[]) if (row?.code && isSeries(row.game)) keepSeries(row.code, row.game, row.owner);
    const r = await fetch(`${table()}?select=code,game,owner&event_code=is.null&game->>kind=eq.round-event&game->>planned=eq.true`, { headers: h });
    if (!r.ok) return false;
    const rows = (await r.json()) as { code: string; game: unknown; owner?: string }[];
    const list = loadTours();
    const hidden = hiddenTours();
    let changed = false;
    for (const row of rows) {
      if (!row?.code || !isPlanned(row.game) || hidden.has(row.code)) continue;
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

/** A row of the table changed by `change` – only if nobody wrote in between (else read again, up to four times). */
async function changeRow<T>(code: string, ok: (x: unknown) => x is T, change: (x: T) => T): Promise<{ game: T; owner?: string } | null> {
  const h = await headers();
  if (!h) return null;
  const at = `${table()}?code=eq.${encodeURIComponent(code)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`${at}&select=game,updated_at,owner`, { headers: h });
      if (!r.ok) return null;
      const rows = (await r.json()) as { game: unknown; updated_at?: string | null; owner?: string }[];
      if (!rows.length || !ok(rows[0].game)) return null;
      const next = change(rows[0].game);
      const seen = rows[0].updated_at ? `updated_at=eq.${encodeURIComponent(rows[0].updated_at)}` : 'updated_at=is.null';
      const w = await fetch(`${at}&${seen}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ game: next, updated_at: new Date().toISOString() }) });
      if (!w.ok) return null;
      if (((await w.json()) as unknown[]).length) return { game: next, owner: rows[0].owner };
    } catch {
      return null;
    }
  }
  return null;
}
/** The tournament as the server has it now (its flights' own rows too) – or as kept here. */
async function freshTour(code: string): Promise<PlannedEvent | null> {
  const ev = await refreshEvent(code);
  return isPlanned(ev) ? ev : (loadTours().find((e) => e.code === code)?.ev ?? null);
}

/** Tournaments set up one by one made a series (Sascha 01.11.2026: "copy six single tournaments into a tournament
 *  series"): the series' row with its own code, and each tournament points to it. Its code, or null. */
export async function createSeries(name: string, codes: string[], multi?: TourSeries['multi']): Promise<string | null> {
  const h = await headers();
  if (!h) return null;
  const evs: { code: string; ev: PlannedEvent }[] = [];
  for (const c of codes) {
    const ev = await freshTour(c);
    if (ev) evs.push({ code: c, ev });
  }
  if (evs.length < 2) return null;
  const series: TourSeries = { kind: 'tour-series', id: crypto.randomUUID?.() ?? newCode() + Date.now(), name, createdAt: new Date().toISOString(), rounds: evs.map((x) => roundOf(x.code, x.ev)).sort((a, b) => a.date.localeCompare(b.date)), ...(multi ? { multi } : {}) };
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newCode();
    try {
      const r = await fetch(table(), { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ code, game: series }) });
      if (r.status === 409) continue;
      if (!r.ok) return null;
      keepSeries(code, series, myAccount() ?? undefined);
      for (const x of evs) await changeTour(x.code, { ...x.ev, series: { code, name } });
      return code;
    } catch {
      return null;
    }
  }
  return null;
}

/** A tournament into a series (a round added later) – or its series' copy brought up to date (a round changed). */
export async function addToSeries(seriesCode: string, tourCode: string): Promise<boolean> {
  const ev = await freshTour(tourCode);
  if (!ev) return false;
  const s = await changeRow(seriesCode, isSeries, (x) => ({ ...x, rounds: [...x.rounds.filter((r) => r.code !== tourCode), roundOf(tourCode, ev)].sort((a, b) => a.date.localeCompare(b.date)) }));
  if (!s) return false;
  keepSeries(seriesCode, s.game, s.owner);
  if (ev.series?.code !== seriesCode || ev.series.name !== s.game.name) await changeTour(tourCode, { ...ev, series: { code: seriesCode, name: s.game.name } });
  return true;
}

/** A tournament over several rounds changed (Sascha 04.11.2026): its cut – and a round taken out of it (the round
 *  itself deleted by its own change). */
export async function changeMulti(code: string, multi: TourSeries['multi'], drop: string[] = []): Promise<boolean> {
  const s = await changeRow(code, isSeries, (x) => ({ ...x, ...(multi ? { multi } : {}), rounds: x.rounds.filter((r) => !drop.includes(r.code)) }));
  if (!s) return false;
  keepSeries(code, s.game, s.owner);
  return true;
}

/** The host renames the series (its rounds say it too). */
export async function renameSeries(code: string, name: string): Promise<boolean> {
  const s = await changeRow(code, isSeries, (x) => ({ ...x, name }));
  if (!s) return false;
  keepSeries(code, s.game, s.owner);
  for (const r of s.game.rounds) {
    const ev = await freshTour(r.code);
    if (ev) await changeTour(r.code, { ...ev, series: { code, name } });
  }
  return true;
}

/** The series undone: its tournaments stay as single ones, the series is gone (marked deleted). */
export async function dissolveSeries(code: string): Promise<boolean> {
  const s = await changeRow(code, isSeries, (x) => ({ ...x, deletedAt: new Date().toISOString() }));
  if (!s) return false;
  keepSeries(code, s.game, s.owner);
  for (const r of s.game.rounds) {
    const ev = await freshTour(r.code);
    // null, not left out: the server keeps what a change leaves out
    if (ev?.series?.code === code) await changeTour(r.code, { ...ev, series: null });
  }
  return true;
}

/** Gone for good from this phone (it stays on the server, marked deleted). */
/** Deleted for good from the bin (Sascha 06.11.2026: "deleted for good under 'gelöscht' – they come back"): the server
 *  keeps the row (marked deleted, for the others), so the code is remembered and the sync no longer brings it back – on
 *  every device of the account, as the pools (sync.ts). */
export function forgetTour(code: string): void {
  try {
    const hidden = hiddenTours();
    hidden.add(code);
    localStorage.setItem(HIDDEN, JSON.stringify([...hidden]));
  } catch {
    /* fetched again next time */
  }
  saveTours(loadTours().filter((e) => e.code !== code));
}
const HIDDEN = 'golfos.tours.hidden.v1';
const hiddenTours = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};
