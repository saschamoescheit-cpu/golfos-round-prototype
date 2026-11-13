/**
 * The shot suggestions learnt from the player's own checked shots (Sascha 13.11.2026: "Bei der Schlagnachbereitung
 * werden oft falsche Positionen und Schläger vorgeschlagen … aus Pitch-Distanzen oft volle Schwünge"). Fixed bounds
 * (chip up to 30 m, pitch up to 80 m) do not know the player: one pitches the gap wedge from 100 m, another hits it
 * full. Every shot checked after a round says which shot type and – for the short game – which club he took from how
 * far, from which lie. The nearest of those decide; too few of them: the fixed bounds as before.
 */
import type { Club, Lie, Round, ShotKind } from '../types';
import { distanceM } from './geo';

export interface LearnedShot {
  toPin: number;
  lie: Lie;
  kind: ShotKind;
  club: Club | null;
}

/** Lies that play alike for the choice of the shot: the bunker and the trees have their own. */
const group = (lie: Lie): string => (lie === 'bunker' ? 'bunker' : lie === 'recovery' ? 'recovery' : lie === 'tee' ? 'tee' : 'play');

/** The player's checked shots of the finished rounds: from where to the flag, the lie, the shot type and the club. */
export function learnedShots(rounds: Round[]): LearnedShot[] {
  const out: LearnedShot[] = [];
  for (const r of rounds) {
    if (!r.finishedAt) continue;
    const me = r.players.find((p) => p.isMe) ?? r.players[0];
    for (const e of (me && r.entries[me.id]) || []) {
      const d = e?.detail;
      if (!d?.shots?.length) continue;
      // the flag as the player set it, else where the ball reached the green (a few metres from it)
      const pin = e.puttsAt?.pin ?? d.pin ?? e.puttsAt?.balls?.[0] ?? d.onGreen ?? null;
      if (!pin) continue;
      for (const s of d.shots) {
        // only what the player saw: a suggestion not checked yet teaches nothing
        if (s.review || !s.pos || !s.kind || s.lie === 'tee') continue;
        out.push({ toPin: distanceM(s.pos, pin), lie: s.lie, kind: s.club === 'Pt' ? 'chip' : s.kind, club: s.club });
      }
    }
  }
  return out;
}

/** The shots near this distance (and lie group), each with its weight – the nearer, the more. */
function near(list: LearnedShot[], toPin: number, ok: (s: LearnedShot) => boolean, spread: number): { s: LearnedShot; w: number }[] {
  const band = Math.max(8, spread * toPin);
  return list.filter((s) => ok(s) && Math.abs(s.toPin - toPin) <= band).map((s) => ({ s, w: 1 / (1 + Math.abs(s.toPin - toPin) / 5) }));
}

function vote<T>(items: { key: T; w: number }[], min: number, share = 0.5): T | null {
  if (items.length < min) return null;
  const sum = new Map<T, number>();
  let all = 0;
  for (const x of items) {
    sum.set(x.key, (sum.get(x.key) ?? 0) + x.w);
    all += x.w;
  }
  const [best, w] = [...sum.entries()].sort((a, b) => b[1] - a[1])[0];
  return w / all >= share ? best : null;
}

/** The shot type the player plays from here, as his checked shots tell – or null (too few of them, no clear one). */
export function learnedKind(list: LearnedShot[], lie: Lie, toPin: number | null): ShotKind | null {
  if (toPin == null || lie === 'tee' || !list.length) return null;
  const g = group(lie);
  return vote(near(list, toPin, (s) => group(s.lie) === g, 0.15).map((x) => ({ key: x.s.kind, w: x.w })), 4);
}

/** The club of a short-game shot (pitch, chip, bunker, punch) from here, as the player took it – or null. */
export function learnedClub(list: LearnedShot[], kind: ShotKind, toPin: number | null): Club | null {
  if (toPin == null || kind === 'full' || !list.length) return null;
  return vote(near(list, toPin, (s) => s.kind === kind && !!s.club, 0.2).map((x) => ({ key: x.s.club as Club, w: x.w })), 3, 0.35); // the clubs spread more (PW or GW from 108 m): the most taken one
}

// The checked shots of this phone – set where rounds are checked or played (RoundReview, HoleScreen); suggestKind and
// the detection read them. Empty: the fixed bounds.
let current: LearnedShot[] = [];
let currentKey = '';
export function setLearnedShots(rounds: Round[]): void {
  const key = rounds.map((r) => `${r.id}:${r.finishedAt ?? ''}`).join('|') + `#${rounds.length}`;
  // the same rounds again: nothing to learn anew (a round checked changes its shots – the caller passes it again)
  if (key === currentKey && current.length) return;
  currentKey = key;
  current = learnedShots(rounds);
}
/** For tests and a round checked just now: learn from these shots. */
export function useLearned(list: LearnedShot[]): void {
  current = list;
  currentKey = '';
}
export const learned = (): LearnedShot[] => current;
