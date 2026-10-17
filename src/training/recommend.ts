import type { Round } from '../types';
import { analyse, focusAreas, pct } from '../lib/stats';
import { comparisonGroup, groupSg, GROUPS, roundsSg, SG_CATEGORIES, type SgCategory } from '../lib/sg';
import { getLang, tr } from '../lib/i18n';
import { loadProfile } from '../lib/profile';
import type { CategoryId } from './types';

/** German decimal comma in a text with numbers ("30.5" → "30,5"). */
const num = (s: string) => (getLang() === 'de' ? s.replace(/(\d)\.(\d)/g, '$1,$2') : s);

// Training from the rounds (Sascha 15.10.2026): the weak spots of the player's own statistics – focus areas against
// the next better handicap band and strokes gained against his comparison group – point to categories and drills.
// Training stays a module of its own; it only reads the rounds.

export interface Advice {
  cat: CategoryId;
  why: string; // the number behind it, in the player's language
  drills: string[]; // best drills first
  weight: number; // how big the gap is (sorting)
}

const SG_TO_CAT: Record<SgCategory, { cat: CategoryId; drills: string[] }> = {
  tee: { cat: 'driver', drills: ['fairway-gate', 'tee-height', 'driver-9-shot'] },
  long: { cat: 'woods', drills: ['woods-sweep', 'hybrid-tee-down'] },
  approach: { cat: 'irons', drills: ['towel-behind', 'line-drill-irons', 'three-distances'] },
  around: { cat: 'chipping', drills: ['landing-ring', 'up-and-down-9', 'chip-ladder'] },
  putting: { cat: 'putting', drills: ['lag-circle', 'clock', 'ball-gate'] },
};

const SG_NAME = (c: SgCategory): string =>
  ({
    tee: tr('off the tee', 'vom Abschlag'),
    long: tr('long game', 'langes Spiel'),
    approach: tr('approach', 'Annäherung'),
    around: tr('around the green', 'rund ums Grün'),
    putting: tr('putting', 'Putten'),
  })[c];

/** Up to four pieces of advice from the rounds; empty when there are too few holes. */
export function adviceFromRounds(rounds: Round[]): Advice[] {
  const done = rounds.filter((r) => r.finishedAt);
  if (!done.length) return [];
  const a = analyse(done);
  if (a.holes < 9) return [];
  // 9-hole players (like the Rounds statistics, 16.10.2026): values per round shown per 9 holes, the target halved –
  // never doubled
  const nine = done.filter((r) => r.holes.length <= 9).length > done.length / 2;
  const half = (s: string) => s.replace(/\d+(?:[.,]\d+)?/, (m) => String(Math.round((parseFloat(m.replace(',', '.')) / 2) * 10) / 10));
  const perNine = (fo: { metric: string; yours: string; target: string }) =>
    nine && /per round|pro Runde/.test(fo.metric)
      ? { metric: fo.metric.replace('per round', 'per 9 holes').replace('pro Runde', 'je 9 Löcher'), yours: half(fo.yours), target: half(fo.target) }
      : fo;
  const out: Advice[] = [];
  const add = (x: Advice) => {
    const has = out.find((o) => o.cat === x.cat);
    if (has) {
      if (x.weight > has.weight) Object.assign(has, x);
    } else out.push(x);
  };

  // 1. focus areas against the next better handicap band
  const f = focusAreas(a);
  for (const fo of f?.focus ?? []) {
    // the numbers come formatted from Rounds' stats with a decimal point – a comma in German
    const shown = perNine(fo);
    const why = num(`${shown.metric}: ${shown.yours} – ${tr('goal', 'Ziel')} ${shown.target} (${f!.target})`);
    if (fo.area === 'Putting') {
      const three = pct(a.threePutts) ?? 0;
      add(three >= 12 ? { cat: 'putting', why, drills: ['lag-circle', 'ladder', 'fringe', 'pelz-17'], weight: fo.gap } : { cat: 'putting', why, drills: ['clock', 'ball-gate', 'tiger-gate', 'mickelson-circle'], weight: fo.gap });
    } else if (fo.area === 'Short game') {
      add({ cat: 'chipping', why, drills: ['landing-ring', 'up-and-down-9', 'chip-ladder', 'three-clubs-one-spot'], weight: fo.gap });
    } else if (fo.area === 'Approach') {
      add({ cat: 'irons', why, drills: ['towel-behind', 'three-distances', 'line-drill-irons'], weight: fo.gap });
    } else if (fo.area === 'Driving') {
      const left = a.missLeft.n;
      const right = a.missRight.n;
      add({ cat: 'driver', why, drills: ['fairway-gate', 'driver-9-shot', 'tee-height'], weight: fo.gap });
      if (left + right >= 4 && Math.max(left, right) >= 2 * Math.min(left, right))
        add({
          cat: 'ballflight',
          why: right > left ? tr(`Fairway misses: ${right}× right, ${left}× left – a slice pattern`, `Fairway verfehlt: ${right}× rechts, ${left}× links – Slice-Muster`) : tr(`Fairway misses: ${left}× left, ${right}× right – a hook pattern`, `Fairway verfehlt: ${left}× links, ${right}× rechts – Hook-Muster`),
          drills: right > left ? ['slice-gate', 'split-grip', 'headcover-outside'] : ['hook-gate', 'hold-finish', 'grip-check'],
          weight: fo.gap * 0.9,
        });
    } else if (fo.area === 'Course management') {
      add({ cat: 'strategy', why, drills: ['safe-target', 'decade-light', 'nine-hole-plan'], weight: fo.gap });
    }
  }

  // 2. bunker: sand saves
  if (a.sandSaves.of >= 3) {
    const p = pct(a.sandSaves) ?? 0;
    if (p < 35) add({ cat: 'bunker', why: tr(`Sand saves ${p}% (${a.sandSaves.n} of ${a.sandSaves.of})`, `Sand Saves ${p} % (${a.sandSaves.n} von ${a.sandSaves.of})`), drills: ['line-in-sand', 'bunker-circle', 'one-foot-bunker'], weight: (35 - p) / 15 });
  }

  // 3. strokes gained against the player's comparison group
  const sg = roundsSg(done);
  if (sg && sg.holes >= 9) {
    const index = Number((loadProfile().hcpIndex ?? '').replace(',', '.'));
    // the comparison group chosen in the profile, or else the next better one – the same as Rounds (17.10.2026)
    const groupId = comparisonGroup(loadProfile().hcpIndex && Number.isFinite(index) ? index : a.handicap);
    const g = groupSg(groupId);
    const groupLabel = GROUPS.find((x) => x.id === groupId)?.label ?? groupId;
    const gaps = SG_CATEGORIES.map((c) => ({ c, d: sg.per18[c] - g[c] })).sort((x, y) => x.d - y.d);
    const worst = gaps[0];
    if (worst.d < -0.5) {
      const m = SG_TO_CAT[worst.c];
      // 9-hole players: per 9 holes, like the Rounds SG card with base 9 (17.10.2026) – never doubled
      const shown = nine ? worst.d / 2 : worst.d;
      const per = nine ? tr('per 9 holes', 'je 9 Löcher') : tr('per round', 'pro Runde');
      add({
        cat: m.cat,
        why: tr(`Strokes gained ${SG_NAME(worst.c)}: ${shown.toFixed(1)} ${per} against your comparison group (${groupLabel})`, `Strokes Gained ${SG_NAME(worst.c)}: ${shown.toFixed(1).replace('.', ',')} ${per} gegenüber deiner Vergleichsgruppe (${groupLabel})`),
        drills: m.drills,
        weight: -worst.d / 2,
      });
    }
  }

  // 4. penalties → strategy, many double bogeys → strategy + mental
  if (a.scoreMix.doublePlus >= 25) add({ cat: 'strategy', why: tr(`${a.scoreMix.doublePlus}% of holes double bogey or worse`, `${a.scoreMix.doublePlus} % der Löcher Doppelbogey oder schlechter`), drills: ['safe-target', 'bogey-plan', 'nine-hole-plan'], weight: (a.scoreMix.doublePlus - 20) / 15 });

  return out.sort((x, y) => y.weight - x.weight).slice(0, 4);
}
