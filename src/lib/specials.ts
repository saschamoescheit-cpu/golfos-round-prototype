import { tr } from './i18n';

// Special prizes of a tournament (Sascha 01.11.2026: "Long Drive or Nearest to the Pin, set optionally"). The host
// sets them when planning – which prize on which hole; on the day the players enter their figure at the hole in Rounds
// (Nearest to the Pin: the distance to the hole; Long Drive: the length from the tee, suggested by GPS and corrected,
// only a ball in the fairway counts) – everyone sees who leads. The host can correct an entry on the tournament's page.
// The plan's prizes live in the event (ev.specials), each flight's entries in its own row (flight.specials) – a
// flight's phones write only their row, as their scores.

export type SpecialKind = 'longDrive' | 'nearestPin';
export interface Special {
  id: string;
  kind: SpecialKind;
  /** the hole: its index in the event's holes */
  hole: number;
}
export interface SpecialEntry {
  /** metres – Nearest to the Pin to the hole, Long Drive from the tee; null: taken back */
  m: number | null;
  /** Long Drive: in the fairway (only then it counts) */
  fairway?: boolean;
  at: string;
  /** who entered it: the phone, or 'host' for the host's correction */
  by?: string;
}
/** A flight's entries: entries[special id][player id]. */
export type SpecialEntries = Record<string, Record<string, SpecialEntry>>;

interface HoleLike {
  label: string;
  par: number | null;
}
interface FlightLike {
  id: string;
  name: string;
  players: { id: string; name: string }[];
  specials?: SpecialEntries;
}
interface EventLike {
  holes: HoleLike[];
  flights: Record<string, FlightLike>;
  specials?: Special[];
}

export const specialName = (k: SpecialKind): string => (k === 'longDrive' ? tr('Long Drive', 'Long Drive') : tr('Nearest to the Pin', 'Nearest to the Pin'));

/** Which prize fits a hole: Nearest to the Pin on a par 3, Long Drive on a par 4 or 5. */
export const fits = (k: SpecialKind, par: number | null | undefined): boolean => (k === 'nearestPin' ? par === 3 : par == null || par >= 4);

/** The holes suggested for a prize – the fitting ones, else all. */
export function holesFor(k: SpecialKind, holes: HoleLike[]): number[] {
  const all = holes.map((_, i) => i);
  const ok = all.filter((i) => fits(k, holes[i].par));
  return ok.length ? ok : all;
}

/** The prizes on a hole (Rounds' hint at the hole). */
export const specialsAt = (ev: EventLike, hole: number): Special[] => (ev.specials ?? []).filter((s) => s.hole === hole);

/** "1,8 m" / "245 m". */
export function metres(m: number, k: SpecialKind): string {
  const v = k === 'nearestPin' ? Math.round(m * 10) / 10 : Math.round(m);
  return `${String(v).replace('.', tr('.', ','))} m`;
}

export interface SpecialRow {
  flight: string;
  player: string;
  name: string;
  m: number;
  entry: SpecialEntry;
}
/** Each prize with its entries over all flights (not the emptied ones), best first: nearest to the hole, longest in
 *  the fairway. A Long Drive outside the fairway is not ranked. */
export function specialBoard(ev: EventLike): { special: Special; rows: SpecialRow[] }[] {
  const flights = Object.values(ev.flights).filter((f) => f.players.length);
  return (ev.specials ?? []).map((special) => {
    const rows: SpecialRow[] = [];
    for (const f of flights)
      for (const [pid, e] of Object.entries(f.specials?.[special.id] ?? {})) {
        const p = f.players.find((x) => x.id === pid);
        if (!p || e.m == null || !(e.m > 0)) continue;
        if (special.kind === 'longDrive' && e.fairway === false) continue;
        rows.push({ flight: f.id, player: pid, name: p.name, m: e.m, entry: e });
      }
    rows.sort((a, b) => (special.kind === 'nearestPin' ? a.m - b.m : b.m - a.m) || a.entry.at.localeCompare(b.entry.at));
    return { special, rows };
  });
}
