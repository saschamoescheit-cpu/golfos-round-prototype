import { tr } from './i18n';
import { eventStandings, liveFlights, markerOf, type Flight, type RoundEvent } from './sharedround';
import { seriesStandings } from './seriesstandings';
import { pushTourResult } from './push';

// The tournament's pushes worked out on the phone (Sascha 07.11.2026: "please build 1–6") – the server sends them:
// 1 · the host changed the tournament: what changed for each player (his flight, tee time, marker), and for all
// 2 · every flight is in: the standing – and in a series the total after this round

type Planned = RoundEvent & { deletedAt?: string | null; date?: string };
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(tr('en-GB', 'de-DE'), { weekday: 'short', day: '2-digit', month: '2-digit' });

/** Every player by name (lower case) with his flight and its name as the tournament's page shows it ("Flight 2") – a
 *  name twice in the field left out (no one to tell). */
type Seat = { f: Flight; p: Flight['players'][number]; label: string };
function seats(ev: RoundEvent): Map<string, Seat> {
  const out = new Map<string, Seat>();
  const twice = new Set<string>();
  liveFlights(ev).forEach((f, k) => {
    for (const p of f.players) {
      const key = p.name.trim().toLowerCase();
      if (!key) continue;
      if (out.has(key)) twice.add(key);
      out.set(key, { f, p, label: `Flight ${k + 1}` });
    }
  });
  for (const k of twice) out.delete(k);
  return out;
}

/** What the host's change means for each player and for all: "dein Flight: Flight 2 · 12:16 · mit Chris, Sascha",
 *  "dein Zähler: Chris"; "neuer Tag: Mo., 09.11." – nothing when nothing that matters changed. */
export function tourChanges(before: Planned, after: Planned): { changes: Record<string, string>; general: string } {
  if (!before.deletedAt && after.deletedAt) return { changes: {}, general: tr('called off', 'abgesagt') };
  const gen: string[] = [];
  if (before.deletedAt && !after.deletedAt) gen.push(tr('on again', 'findet wieder statt'));
  if (after.date && before.date !== after.date) gen.push(tr(`new day: ${day(after.date)}`, `neuer Tag: ${day(after.date)}`));
  if (before.course?.id !== after.course?.id) gen.push(tr(`new course: ${after.course.name}`, `neuer Platz: ${after.course.name}`));
  const was = seats(before);
  const changes: Record<string, string> = {};
  for (const [key, a] of seats(after)) {
    const b = was.get(key);
    const mates = (x: Seat) => x.f.players.filter((q) => q !== x.p).map((q) => q.name).sort().join(', ');
    const marker = (x: Seat) => {
      const m = markerOf(x.f, x.p.id);
      return m ? (x.f.players.find((q) => q.id === m)?.name ?? '') : '';
    };
    const flight = (x: Seat) =>
      [x.label, x.f.teeTime, x.f.startHole ? tr(`tee ${x.f.startHole + 1}`, `Tee ${x.f.startHole + 1}`) : null, mates(x) ? tr(`with ${mates(x)}`, `mit ${mates(x)}`) : null].filter(Boolean).join(' · ');
    const parts: string[] = [];
    if (!b) parts.push(tr(`you are in: ${flight(a)}`, `du bist dabei: ${flight(a)}`));
    else if (b.f.id !== a.f.id || b.label !== a.label || (b.f.teeTime ?? '') !== (a.f.teeTime ?? '') || (b.f.startHole ?? 0) !== (a.f.startHole ?? 0) || mates(b) !== mates(a))
      parts.push(tr(`your flight: ${flight(a)}`, `dein Flight: ${flight(a)}`));
    if (b && marker(a) && marker(b) !== marker(a)) parts.push(tr(`your marker: ${marker(a)}`, `dein Zähler: ${marker(a)}`));
    if (parts.length) changes[key] = parts.join(' · ');
  }
  return { changes, general: gen.join(' · ') };
}

/** Every flight in: the standing as the tournament's page shows it at first (gross for stroke play, else net). */
export function resultOf(ev: RoundEvent): { rows: { name: string; pos: string; sort: number | null }[]; hb: boolean } | null {
  const flights = liveFlights(ev);
  if (!ev.tournament || !flights.length || !flights.every((f) => f.finishedAt)) return null;
  const st = eventStandings(ev, { gross: (ev.format?.scoring ?? 'net') === 'stroke' });
  return { rows: st.rows.map((r) => ({ name: r.name, pos: r.pos, sort: r.sort })), hb: st.higherBetter };
}

const TOLD = 'golfos.tourresult.v1';
const told = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(TOLD) ?? '[]') as string[];
  } catch {
    return [];
  }
};
const busy = new Set<string>();
/** The result to the server once per tournament from this phone (the server says it once to each player) – again on a
 *  later look when the server did not take it yet (a flight's last write still on its way). */
export async function tellTourResult(code: string, ev: RoundEvent, series?: () => Promise<RoundEvent[]>): Promise<void> {
  const res = resultOf(ev);
  if (!res || busy.has(code) || told().includes(code)) return;
  busy.add(code);
  try {
    const evs = series ? await series().catch(() => []) : [];
    const s = evs.length > 1 ? seriesStandings(evs) : null;
    const ok = await pushTourResult(code, { ...res, series: s ? { rows: s.rows.map((r) => ({ name: r.name, pos: r.pos, sort: r.sum })), hb: s.higherBetter } : null });
    if (ok)
      try {
        localStorage.setItem(TOLD, JSON.stringify([...told(), code].slice(-60)));
      } catch {
        /* told again next time – the server sends once anyway */
      }
  } finally {
    busy.delete(code);
  }
}
