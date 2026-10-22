import type { Round } from '../types';
import { comparisonGroup, groupSg, holeSg, roundsSg, SG_CATEGORIES, SG_LABELS, type SgCategory } from './sg';
import { playing18 } from './scoring';
import { shotsComplete } from './shots';
import { penaltyName } from './shotfacts';
import { dec, tr } from './i18n';

// The round report after signing (Sascha 22.10.2026, round check): strokes gained per area for this round, against
// players of the same handicap and against the player's last five rounds; the three most expensive holes with what
// cost the strokes. The numbers come from the checked shots only.

export interface AreaLine {
  c: SgCategory;
  label: string;
  round: number; // strokes gained against the comparison group in this round (− = lost)
  last5: number | null; // the same, average of the last five rounds (scaled to this round's holes)
}
export interface CostlyHole {
  hole: string;
  index: number;
  toPar: number;
  cause: string;
}
export interface RoundReport {
  holes: number; // holes with checked shots
  group: string;
  areas: AreaLine[];
  total: number;
  costly: CostlyHole[];
  weakest: SgCategory | null;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
export const sgText = (v: number) => dec(`${v > 0 ? '+' : ''}${v.toFixed(1)}`);

/** What cost the strokes on one hole, in a few words. */
function causeOf(round: Round, i: number): string {
  const me = round.players.find((p) => p.isMe)!;
  const e = round.entries[me.id][i];
  const h = round.holes[i];
  const d = e.detail;
  const pen = d?.shots.findIndex((s) => s.penalty) ?? -1;
  if (d && pen >= 0) {
    const what = penaltyName(d.shots[pen].penaltyKind) ?? tr('penalty', 'Strafschlag');
    return pen === 0 && h.par >= 4 ? tr(`tee shot – ${what}`, `Abschlag – ${what}`) : tr(`shot ${pen + 1} – ${what}`, `Schlag ${pen + 1} – ${what}`);
  }
  if ((e.penalties ?? 0) > 0) return tr('penalty stroke', 'Strafschlag');
  if ((e.putts ?? 0) >= 3) return tr(`${e.putts} putts`, `${e.putts} Putts`);
  if ((e.sandShots ?? 0) >= 2 || d?.shots.filter((s) => s.lie === 'bunker').length! >= 2) return tr('two shots from the sand', 'zwei Schläge aus dem Sand');
  if (d && shotsComplete(d)) {
    const sg = holeSg(d, e.putts, h.par);
    if (sg?.length) {
      let k = 0;
      sg.forEach((x, j) => (x.sg < sg[k].sg ? (k = j) : null));
      const worst = sg[k];
      if (worst.category === 'putting') return tr(`putting ${sgText(worst.sg)}`, `Putten ${sgText(worst.sg)}`);
      return tr(`shot ${k + 1} (${SG_LABELS[worst.category]}) ${sgText(worst.sg)}`, `Schlag ${k + 1} (${SG_LABELS[worst.category]}) ${sgText(worst.sg)}`);
    }
  }
  if ((e.sandShots ?? 0) === 1) return tr('bunker', 'Bunker');
  return tr('more strokes than par', 'mehr Schläge als Par');
}

export function roundReport(round: Round, history: Round[] = []): RoundReport | null {
  const me = round.players.find((p) => p.isMe);
  if (!me) return null;
  const sg = roundsSg([round]);
  if (!sg || sg.holes < 3) return null;
  const scale = sg.holes / 18; // per 18 → this round's checked holes
  const groupId = comparisonGroup(playing18(round.holes.length, me.playingHandicap));
  const g = groupSg(groupId);
  const before = history.filter((r) => r.id !== round.id && r.finishedAt && r.createdAt < round.createdAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const prev = before.length >= 2 ? roundsSg(before) : null;
  const areas: AreaLine[] = SG_CATEGORIES.map((c) => ({
    c,
    label: SG_LABELS[c],
    round: r1((sg.per18[c] - g[c]) * scale),
    last5: prev ? r1((prev.per18[c] - g[c]) * scale) : null,
  }));
  const entries = round.entries[me.id];
  const costly = round.holes
    .map((h, i) => ({ h, i, e: entries[i] }))
    .filter((x) => x.e.strokes != null && !x.e.pickedUp && x.e.strokes - x.h.par >= 1)
    .sort((a, b) => b.e.strokes! - b.h.par - (a.e.strokes! - a.h.par) || a.i - b.i)
    .slice(0, 3)
    .map((x) => ({ hole: x.h.label, index: x.i, toPar: x.e.strokes! - x.h.par, cause: causeOf(round, x.i) }));
  const weakest = areas.slice().sort((a, b) => a.round - b.round)[0];
  return {
    holes: sg.holes,
    group: groupId,
    areas,
    total: r1(areas.reduce((t, a) => t + a.round, 0)),
    costly,
    weakest: weakest && weakest.round <= -0.3 ? weakest.c : null,
  };
}
