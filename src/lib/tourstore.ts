import { cachedEvent, publishPlannedEvent, refreshEvent, updatePlannedEvent, type RoundEvent } from './sharedround';
import { roundOver, seriesOver } from './seriesstandings';
import { newCode } from './sharedgame';
import { authToken, loadSession, SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './sync';
import { myAccount } from './wagerstore';
import { dayOf } from './wagers';
import type { Special } from './specials';
import type { TourDraw } from './tourdraw';
import type { TourPrizes } from './tourprizes';
import { tellTourResult, tourChanges } from './tourpush';
import { pushTourChanged } from './push';
import { invitePlanned } from './planinvite';

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
  /** what is played for – the entry fee, the prizes per place, the payments (Sascha 14.11.2026, lib/tourprizes) */
  prizes?: TourPrizes;
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
  /** what the whole series is played for (Sascha 15.11.2026: "Sieger der Turnierserie aus X Runden") – on its total */
  prizes?: TourPrizes | null;
  /** the one settlement at its end – day prizes and its own together: a payment marked paid by the host, `${from}>${to}` → when */
  paid?: Record<string, string>;
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
/** Played – today's too once played out, every card in (Sascha 17.11.2026): the tiles "geplant" / "gespielt" of the
 *  tournaments' list. ("Turnier heute" on the start page and in Rounds stays by the day: tourState.) */
export const tourPlayed = (e: TourEntry, today: string): boolean => {
  const st = tourState(e, today);
  if (st !== 'today') return st === 'played';
  const live = cachedEvent(e.code);
  return !!live && roundOver(live);
};

/** A series as the list shows it (Sascha 17.11.2026: "das Turnier sollte auch als abgeschlossen dargestellt werden"):
 *  before its first day, on its days, every round played out – or its last day past and cards still missing. */
export function seriesState(s: Pick<SeriesEntry['series'], 'rounds'>, today: string): 'planned' | 'running' | 'over' | 'waiting' {
  const days = s.rounds.map((r) => r.date).filter(Boolean).sort();
  if (!days.length || days[0] > today) return 'planned';
  if (seriesOver(s.rounds.map((r) => cachedEvent(r.code)))) return 'over';
  return days[days.length - 1] < today ? 'waiting' : 'running';
}

/** For the module card on the start page (03.11.2026): the names of today's tournaments and how many are planned after today. */
/** The codes of today's tournaments (the start page's card opens the one of today – night 10./11.11.2026). */
export const toursTodayCodes = (now = new Date()): string[] => loadTours().filter((e) => tourState(e, dayOf(now)) === 'today').map((e) => e.code);
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
/** the series this phone joined into all its rounds this session */
const joinedSeries = new Set<string>();
export async function syncTours(): Promise<boolean> {
  const h = await headers();
  if (!h) return false;
  try {
    // the series this account is in
    const sr = await fetch(`${table()}?select=code,game,owner&event_code=is.null&game->>kind=eq.tour-series`, { headers: h });
    const seriesRows = sr.ok ? ((await sr.json()) as { code: string; game: unknown; owner?: string }[]) : [];
    for (const row of seriesRows) if (row?.code && isSeries(row.game)) keepSeries(row.code, row.game, row.owner);
    const fetchRounds = () => fetch(`${table()}?select=code,game,owner&event_code=is.null&game->>kind=eq.round-event&game->>planned=eq.true`, { headers: h });
    let r = await fetchRounds();
    if (!r.ok) return false;
    let rows = (await r.json()) as { code: string; game: unknown; owner?: string }[];
    // in a series but not yet in all its rounds (Sascha 09.11.2026: invited to the series by a tap, not joined by its code –
    // a round would not show on its day): in by the series' code, which lets him into every round of it – once a session
    const have = new Set(rows.map((x) => x.code));
    const missing = seriesRows.filter((s) => isSeries(s.game) && !s.game.deletedAt && !joinedSeries.has(s.code) && s.game.rounds.some((x) => !have.has(x.code)));
    if (missing.length) {
      for (const s of missing) {
        joinedSeries.add(s.code);
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/golfos_join_game`, { method: 'POST', headers: h, body: JSON.stringify({ join_code: s.code }) }).catch(() => null);
      }
      r = await fetchRounds();
      if (!r.ok) return false;
      rows = (await r.json()) as { code: string; game: unknown; owner?: string }[];
    }
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
    // the hosted plans' linked friends not in yet: invited now (Sascha 17.11.2026) – in the background
    void inviteHostedPlans().catch(() => null);
    // a series just over: its rounds fetched, the inbox says it (17.11.2026)
    void refreshSeriesEnds().catch(() => null);
    return true;
  } catch {
    return false;
  }
}

let hostedAt = 0;
/** The plans this account hosts, saved before the invitations went by themselves (Sascha 17.11.2026: "Die Nachricht in
 *  die Inbox sollten Daniel und Thomas auf jeden Fall dann noch nachträglich erhalten"): every linked friend in one of
 *  today's or a later round, or with his card of the last two weeks still to sign, who is not in it yet gets the
 *  invitation now – once (a member is not asked again), nothing taken away. At most every ten minutes. */
export async function inviteHostedPlans(now = Date.now()): Promise<number> {
  const me = myAccount();
  if (!me || now - hostedAt < 10 * 60000) return 0;
  hostedAt = now;
  const from = dayOf(new Date(now - 14 * 86400000));
  let n = 0;
  for (const e of loadTours()) {
    if (e.owner !== me || e.ev.deletedAt || e.ev.date < from) continue;
    // the flights as their own rows have them (a guest put into one round later lives there)
    const ev = await refreshEvent(e.code).catch(() => null);
    if (ev && !ev.deletedAt) n += (await invitePlanned(e.code, ev).catch(() => ({ invited: [] }))).invited.length;
  }
  return n;
}

let endsAt = 0;
/** The series of the last two weeks not yet over on this phone: their rounds fetched again – so the inbox says
 *  "… ist beendet" by itself, without the series opened (Sascha 17.11.2026: no message after the last round). At
 *  most every ten minutes; each round's event kept as the tournament's page keeps it. */
export async function refreshSeriesEnds(now = Date.now()): Promise<number> {
  if (now - endsAt < 10 * 60000) return 0;
  endsAt = now;
  const today = dayOf(new Date(now));
  const from = dayOf(new Date(now - 14 * 86400000));
  let n = 0;
  for (const s of loadSeries()) {
    const days = s.series.rounds.map((r) => r.date).filter(Boolean).sort();
    if (s.series.deletedAt || !days.length || days[days.length - 1] < from || days[0] > today) continue;
    if (seriesOver(s.series.rounds.map((r) => cachedEvent(r.code)))) continue;
    for (const r of s.series.rounds) if (r.date <= today && (await refreshEvent(r.code).catch(() => null))) n++;
  }
  if (n) window.dispatchEvent(new Event('golfos:tours-changed'));
  return n;
}

/** A new tournament on the server – the event and its flights (Rounds' publishPlannedEvent). Its code, or null. */
export async function createTour(ev: PlannedEvent): Promise<string | null> {
  const code = await publishPlannedEvent(ev);
  if (!code) return null;
  keepTour(code, ev, myAccount() ?? undefined);
  // its linked friends invited by themselves – inbox and push (Sascha 17.11.2026, "Automatisch einladen")
  void invitePlanned(code, ev).catch(() => null);
  return code;
}

/** The host changes the tournament: name, day, players, flights, markers – or deletes it (only marked) and brings it
 *  back. True when the server took it; the tournament kept as the server has it now. */
export async function changeTour(code: string, ev: PlannedEvent, o: { /** saved by itself while being changed: the players hear it once, when the host is done (tellTourChanged) */ quiet?: boolean } = {}): Promise<boolean> {
  const before = loadTours().find((e) => e.code === code)?.ev;
  const written = await updatePlannedEvent(code, ev);
  if (written) keepTour(code, isPlanned(written) ? written : ev);
  // a linked friend put in: invited; one taken out before he answered: withdrawn (Sascha 17.11.2026)
  if (written) void invitePlanned(code, written, before ?? null).catch(() => null);
  // the players hear what changed for them (Sascha 07.11.2026) – the flight, the tee time, the marker; the day, the
  // course, called off
  if (written && before && !o.quiet) {
    const c = tourChanges(before, isPlanned(written) ? written : ev);
    if (c.general || Object.keys(c.changes).length) pushTourChanged(code, c.changes, c.general);
  }
  return !!written;
}

/** A tournament saved quietly while it was changed (Sascha 11.11.2026: changes saved by itself): what changed since
 *  `before` – as it was when the change began – told to its players once. */
export function tellTourChanged(code: string, before: PlannedEvent): void {
  const now = loadTours().find((e) => e.code === code)?.ev;
  if (!now) return;
  const c = tourChanges(before, now);
  if (c.general || Object.keys(c.changes).length) pushTourChanged(code, c.changes, c.general);
}

let resultsHeard = false;
/** Every flight of a tournament in (a phone ended its flight, or the tournament's page saw it): the result to everyone
 *  in it (Sascha 07.11.2026) – in a series with the total of the rounds played so far. */
export function startTourPush(): void {
  if (resultsHeard) return;
  resultsHeard = true;
  window.addEventListener('golfos:event-in', (e) => {
    const { code, ev } = (e as CustomEvent<{ code: string; ev: RoundEvent }>).detail;
    const ser = (ev as PlannedEvent).series;
    const rounds = ser ? loadSeries().find((x) => x.code === ser.code)?.series.rounds : undefined;
    const today = dayOf(new Date());
    void tellTourResult(code, ev, rounds ? async () => (await Promise.all(rounds.filter((r) => r.date <= today).map((r) => refreshEvent(r.code)))).filter((x): x is RoundEvent => !!x) : undefined);
  });
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
  const wasIn = loadSeries().find((x) => x.code === seriesCode)?.series.rounds.some((r) => r.code === tourCode);
  const s = await changeRow(seriesCode, isSeries, (x) => ({ ...x, rounds: [...x.rounds.filter((r) => r.code !== tourCode), roundOf(tourCode, ev)].sort((a, b) => a.date.localeCompare(b.date)) }));
  if (!s) return false;
  keepSeries(seriesCode, s.game, s.owner);
  // a round new to the series: the host of a pool over it is asked whether the running bets count it (Sascha 14.11.2026)
  if (!wasIn && !ev.deletedAt)
    window.dispatchEvent(new CustomEvent('golfos:series-round-added', { detail: { round: { day: ev.date, course: ev.course.name, courseId: ev.course.id, tour: tourCode }, others: s.game.rounds.filter((r) => r.code !== tourCode).map((r) => ({ day: r.date })) } }));
  if (ev.series?.code !== seriesCode || ev.series.name !== s.game.name) await changeTour(tourCode, { ...ev, series: { code: seriesCode, name: s.game.name } });
  return true;
}

/** The cut of a tournament over several rounds once a round is taken in on `date` (Sascha 08.11.2026: yesterday's
 *  tournament into the series that starts on Monday): a round before the cut moves it one on – it stays after the same
 *  round as set; the rounds taken in count in the total. */
export function cutAfterAdding(s: Pick<TourSeries, 'rounds' | 'multi'>, date: string): NonNullable<TourSeries['multi']>['cut'] | undefined {
  const cut = s.multi?.cut;
  if (!cut) return undefined;
  const at = s.rounds.filter((r) => r.date <= date).length; // the new round's place (same day: after the ones there)
  return at < cut.after ? { ...cut, after: cut.after + 1 } : cut;
}

/** A tournament already set up – played already too (Sascha 08.11.2026: "integrate yesterday's tournament afterwards,
 *  with its scores and the live leaderboard") – taken into a series: its scores stay where they are, the series counts
 *  them in its total; a cut stays after the same round. */
export async function adoptIntoSeries(seriesCode: string, tourCode: string): Promise<boolean> {
  const before = loadSeries().find((e) => e.code === seriesCode)?.series;
  const ev = await freshTour(tourCode);
  if (!ev) return false;
  const cut = before ? cutAfterAdding(before, ev.date) : undefined;
  if (!(await addToSeries(seriesCode, tourCode))) return false;
  if (before?.multi && cut && cut !== before.multi.cut) await changeMulti(seriesCode, { ...before.multi, cut });
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

/** The host sets what the series is played for, or marks a payment of its settlement paid (Sascha 15.11.2026). */
export async function changeSeriesPrizes(code: string, patch: { prizes?: TourPrizes | null; paid?: Record<string, string> }): Promise<boolean> {
  const s = await changeRow(code, isSeries, (x) => ({ ...x, ...patch }));
  if (!s) return false;
  keepSeries(code, s.game, s.owner);
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
