import type { Club, Round } from '../types';
import { CLUB_ORDER } from './clubs';
import { distanceM } from './geo';
import { loadCaddieLog, type CaddieLogEntry } from './caddielog';
import { clubCode, dec, tr } from './i18n';

// One hole of a course over all the player's rounds there (Sascha 22.10.2026, round check): which club off the tee
// brought which score, and what it cost to play otherwise than the caddie said – the player's own course strategy,
// shown in the round check, the birdie book and with the caddie.

export interface TeeClubLine {
  club: Club;
  rounds: number;
  avgToPar: number;
}
export interface HoleHistory {
  rounds: number;
  byTeeClub: TeeClubLine[];
  /** Holes where the tee club was the caddie's advice, and where it was not. */
  followed: { rounds: number; avgToPar: number } | null;
  other: { rounds: number; avgToPar: number } | null;
}

/** The caddie's club for the tee shot of a hole in one round (the advice given within 30 m of the tee shot). */
export function adviceAtTee(log: CaddieLogEntry[] | undefined, teePos: [number, number] | null): Club | null {
  if (!log?.length || !teePos) return null;
  const at = log.filter((c) => c.club !== 'Putt' && distanceM(c.pos, teePos) <= 30);
  return at.length ? clubOf(at[at.length - 1].club.split(' ')[0]) : null;
}

/** The caddie log keeps the short label ("D", "7i", "4H") – back to the club ("Dr", "7i", "Hy"); older logs kept the club. */
function clubOf(label: string): Club | null {
  if ((CLUB_ORDER as string[]).includes(label)) return label as Club;
  return CLUB_ORDER.find((c) => clubCode(c) === label) ?? null;
}

const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;

/** The history of one hole (by its label, e.g. "8C") on one course; `rounds` = all the player's rounds. */
export function holeHistory(rounds: Round[], courseId: string, label: string, logOf: (roundId: string) => Record<number, CaddieLogEntry[]> = loadCaddieLog): HoleHistory {
  const by = new Map<Club, number[]>();
  const yes: number[] = [];
  const no: number[] = [];
  let n = 0;
  for (const r of rounds) {
    if (r.courseId !== courseId || !r.finishedAt || r.preview) continue;
    const me = r.players.find((p) => p.isMe);
    const i = r.holes.findIndex((h) => h.label === label);
    if (!me || i < 0) continue;
    const e = r.entries[me.id]?.[i];
    if (!e || e.strokes == null || e.pickedUp) continue;
    n++;
    const toPar = e.strokes - r.holes[i].par;
    const tee = e.detail?.shots[0];
    if (!tee?.club) continue;
    by.set(tee.club, [...(by.get(tee.club) ?? []), toPar]);
    const advised = adviceAtTee(logOf(r.id)[i], tee.pos);
    if (advised) (advised === tee.club ? yes : no).push(toPar);
  }
  return {
    rounds: n,
    byTeeClub: [...by.entries()].map(([club, xs]) => ({ club, rounds: xs.length, avgToPar: avg(xs) })).sort((a, b) => a.avgToPar - b.avgToPar),
    followed: yes.length ? { rounds: yes.length, avgToPar: avg(yes) } : null,
    other: no.length ? { rounds: no.length, avgToPar: avg(no) } : null,
  };
}

const toParText = (v: number) => (v === 0 ? 'Par' : dec(`${v > 0 ? '+' : ''}${v.toFixed(1)}`));

/** The tee club that served the player best here – once two clubs have 2 rounds each and differ by 0.3 strokes. */
export function bestTeeClub(h: HoleHistory): { club: Club; text: string } | null {
  const solid = h.byTeeClub.filter((x) => x.rounds >= 2);
  if (solid.length < 2) return null;
  const [best, next] = solid;
  if (next.avgToPar - best.avgToPar < 0.3) return null;
  return {
    club: best.club,
    text: tr(
      `Your record here: ${clubCode(best.club)} off the tee ${toParText(best.avgToPar)} on average, ${clubCode(next.club)} ${toParText(next.avgToPar)} (${best.rounds + next.rounds} rounds).`,
      `Deine Bilanz hier: mit ${clubCode(best.club)} vom Tee im Schnitt ${toParText(best.avgToPar)}, mit ${clubCode(next.club)} ${toParText(next.avgToPar)} (${best.rounds + next.rounds} Runden).`,
    ),
  };
}

/** "Caddie's club: +0.4 · otherwise +1.1" – what following the caddie was worth here (from 2 rounds each side). */
export function adviceText(h: HoleHistory): string | null {
  if (!h.followed || !h.other || h.followed.rounds < 2 || h.other.rounds < 2) return null;
  return tr(
    `With the caddie's tee club ${toParText(h.followed.avgToPar)} on average, with another ${toParText(h.other.avgToPar)}.`,
    `Mit dem Abschlag-Schläger des Caddies im Schnitt ${toParText(h.followed.avgToPar)}, mit einem anderen ${toParText(h.other.avgToPar)}.`,
  );
}

/** The lines for the birdie book and the caddie: the tee club that served best here, what following the caddie was worth. */
export function historyLines(rounds: Round[], courseId: string, label: string): string[] {
  const h = holeHistory(rounds, courseId, label);
  return [bestTeeClub(h)?.text, adviceText(h)].filter((x): x is string => !!x);
}
