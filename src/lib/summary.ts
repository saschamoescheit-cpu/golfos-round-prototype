import type { Club, LngLat, Round } from '../types';
import { distanceM } from './geo';
import { grossForHole, handicapStrokes, playerTotals, playing18, stablefordPoints } from './scoring';
import { groupForHandicap, groupSg, GROUPS, holeSg, roundsSg, SG_CATEGORIES, SG_LABELS, type SgCategory } from './sg';
import { firstPuttM, shotsComplete } from './shots';
import { playedHandicap } from './handicap';
import { clubCode, dec, tr } from './i18n';

// Round summary and practice plan (feature 014): what happened in this round, why (strokes gained against players of
// the same handicap, backed by the shots), the most expensive and the best shot, and two or three drills for the week
// picked by the pattern behind the weak area. Everything is computed from the round – the facts can later be handed
// to a language model for the wording; the numbers never come from the model.

export interface KeyShot {
  hole: string;
  n: number; // shot number on the hole (1-based); 0 = the putting of the hole
  club: Club | null;
  sg: number;
  text: string;
}
export interface Drill {
  area: SgCategory | 'strategy';
  title: string;
  minutes: number;
  how: string;
  why: string;
}
export interface SummaryFacts {
  holes: number;
  gross: number;
  toPar: number;
  points: number | null;
  playing: number | null;
  vsPlaying: number | null; // strokes over (+) / under (−) the playing handicap, from Stableford (36 per 18)
  nines: [number, number] | null; // Stableford points front / back
  differential: number | null;
  scoreMix: { birdies: number; pars: number; bogeys: number; doubles: number };
  blowUps: string[]; // holes with no point (or triple bogey and worse without handicap)
  group: string | null; // comparison group label
  sg: Record<SgCategory | 'total', number> | null; // per 18, difference to the group (− = lost)
  tee: { fairways: number; of: number; left: number; right: number; penalties: number } | null;
  approach: { shots: number; greens: number; short: number; long: number; left: number; right: number; avgLeaveM: number | null } | null;
  around: { chances: number; upAndDowns: number } | null;
  putting: { putts: number; threePutts: number; shortMisses: number; avgFirstM: number | null } | null;
  penaltyHoles: string[];
  keyShots: { worst: KeyShot[]; best: KeyShot | null };
  trend: { c: SgCategory; change: number } | null; // biggest change against the last rounds (per 18)
  unchecked?: number; // holes with detected shots the player has not checked yet (left out of the shot lines)
}
export interface RoundSummary {
  facts: SummaryFacts;
  headline: string;
  lines: { text: string; tone: 'good' | 'bad' | 'plain' }[];
  plan: Drill[];
  nextRound: string | null;
}

const local = (o: LngLat) => {
  const k = 111320 * Math.cos((o[1] * Math.PI) / 180);
  return (p: LngLat): [number, number] => [(p[0] - o[0]) * k, (p[1] - o[1]) * 111320];
};
const r1 = (v: number) => Math.round(v * 10) / 10;
const sgTxt = (v: number) => dec(`${v > 0 ? '+' : ''}${v.toFixed(1)}`);

export function roundSummary(round: Round, history: Round[] = []): RoundSummary | null {
  const me = round.players.find((p) => p.isMe);
  if (!me) return null;
  const entries = round.entries[me.id];
  const t = playerTotals(round.holes, entries, me.playingHandicap);
  if (t.holesPlayed < Math.min(9, round.holes.length)) return null; // not enough of a round to say something
  const received = handicapStrokes(round.holes, me.playingHandicap);

  // ---- score ----
  const scoreMix = { birdies: 0, pars: 0, bogeys: 0, doubles: 0 };
  const blowUps: string[] = [];
  const nines: [number, number] = [0, 0];
  round.holes.forEach((h, i) => {
    const g = grossForHole(entries[i], h.par, received[i]);
    if (g == null) return;
    const d = g - h.par;
    if (d < 0) scoreMix.birdies++;
    else if (d === 0) scoreMix.pars++;
    else if (d === 1) scoreMix.bogeys++;
    else scoreMix.doubles++;
    const pts = stablefordPoints(entries[i], h.par, received[i]);
    if (pts != null) nines[i < round.holes.length / 2 ? 0 : 1] += pts;
    if (me.playingHandicap != null ? pts === 0 : d >= 3) blowUps.push(h.label);
  });
  const per18 = 18 / t.holesPlayed;
  const vsPlaying = t.stableford != null ? Math.round(36 / per18 - t.stableford) : null;
  const ph = playedHandicap(round);

  // ---- strokes gained against the player's group ----
  const groupId = groupForHandicap(playing18(round.holes.length, me.playingHandicap));
  const sgRound = roundsSg([round]);
  const g = groupSg(groupId);
  const sg = sgRound && sgRound.holes >= 9 ? (Object.fromEntries([...SG_CATEGORIES, 'total'].map((c) => [c, r1(sgRound.per18[c as SgCategory | 'total'] - g[c as SgCategory | 'total'])])) as SummaryFacts['sg']) : null;

  // ---- what the shots show ----
  const tee = { fairways: 0, of: 0, left: 0, right: 0, penalties: 0 };
  const approach = { shots: 0, greens: 0, short: 0, long: 0, left: 0, right: 0, leave: [] as number[] };
  const around = { chances: 0, upAndDowns: 0 };
  const putting = { putts: 0, threePutts: 0, shortMisses: 0, first: [] as number[] };
  const penaltyHoles: string[] = [];
  const shotSg: KeyShot[] = [];
  let detailed = 0;
  let unchecked = 0;
  round.holes.forEach((h, i) => {
    const e = entries[i];
    if (e.pickedUp) return;
    if (h.par >= 4 && e.fairway) {
      tee.of++;
      if (e.fairway === 'hit') tee.fairways++;
      else if (e.fairway !== 'ob') tee[e.fairway]++;
    }
    if (e.putts != null) {
      putting.putts += e.putts;
      if (e.putts >= 3) putting.threePutts++;
    }
    if (e.penalties > 0 || e.detail?.shots.some((s) => s.penalty)) penaltyHoles.push(h.label);
    const d = e.detail;
    if (!d || !d.shots.length) return;
    // only holes the player has checked (as strokes gained): a shot detected wrongly is no "most expensive shot"
    if (!shotsComplete(d) || d.shots.some((s) => s.review)) {
      unchecked++;
      return;
    }
    detailed++;
    if (d.shots[0]?.penalty && h.par >= 4) tee.penalties++;
    const pin = d.pin;
    const fp = pin ? firstPuttM({ ...d, pin }) : null;
    if (fp != null && e.putts != null) {
      putting.first.push(fp);
      if (fp <= 2 && e.putts >= 2) putting.shortMisses++;
    }
    const sgs = holeSg(d, e.putts, h.par);
    d.shots.forEach((s, k) => {
      if (!s.pos || !pin) return;
      const end = k + 1 < d.shots.length ? d.shots[k + 1].pos : d.holedOut ? pin : d.onGreen;
      const from = distanceM(s.pos, pin);
      const cat = sgs?.[k]?.category;
      if (cat === 'approach' && from >= 50 && end && !s.penalty) {
        approach.shots++;
        const onGreen = k === d.shots.length - 1 && (d.onGreen != null || d.holedOut);
        if (onGreen) {
          approach.greens++;
          approach.leave.push(distanceM(end, pin));
        }
        // where the ball finished against the pin, seen along the shot: short/long, left/right (more than 8 m)
        const P = local(pin);
        const [fx, fy] = P(s.pos);
        const [ex, ey] = P(end);
        const len = Math.hypot(fx, fy) || 1;
        const ux = -fx / len;
        const uy = -fy / len; // direction from the ball towards the pin
        const along = ex * ux + ey * uy;
        const side = ex * uy - ey * ux; // + = right of the line
        if (along < -8) approach.short++;
        else if (along > 8) approach.long++;
        if (side > 8) approach.right++;
        else if (side < -8) approach.left++;
      }
      if (cat === 'around') {
        around.chances++;
        if (k === d.shots.length - 1 && (d.holedOut || (e.putts ?? 9) <= 1)) around.upAndDowns++;
      }
      const v = sgs?.[k]?.sg;
      if (v != null) {
        const distTxt = `${Math.round(from)} m`;
        shotSg.push({
          hole: h.label, n: k + 1, club: s.club, sg: r1(v),
          text:
            k === 0 && h.par >= 4
              ? tr(`Hole ${h.label}, tee shot${s.club ? ` with ${clubCode(s.club)}` : ''}${s.penalty ? ' – penalty' : ''}`, `Loch ${h.label}, Abschlag${s.club ? ` mit ${clubCode(s.club)}` : ''}${s.penalty ? ' – Strafschlag' : ''}`)
              : tr(`Hole ${h.label}, shot ${k + 1}${s.club ? ` with ${clubCode(s.club)}` : ''} from ${distTxt}${s.penalty ? ' – penalty' : ''}`, `Loch ${h.label}, ${k + 1}. Schlag${s.club ? ` mit ${clubCode(s.club)}` : ''} aus ${distTxt}${s.penalty ? ' – Strafschlag' : ''}`),
        });
      }
    });
    const pv = sgs?.find((x) => x.category === 'putting');
    if (pv && fp != null) shotSg.push({ hole: h.label, n: 0, club: null, sg: r1(pv.sg), text: tr(`Hole ${h.label}, ${e.putts} putt${e.putts === 1 ? '' : 's'} from ${dec(fp.toFixed(1))} m`, `Loch ${h.label}, ${e.putts} Putt${e.putts === 1 ? '' : 's'} aus ${dec(fp.toFixed(1))} m`) });
  });
  const sorted = shotSg.slice().sort((a, b) => a.sg - b.sg);
  const worst = sorted.filter((s) => s.sg <= -0.5).slice(0, 2);
  const best = sorted.length && sorted[sorted.length - 1].sg >= 0.4 ? sorted[sorted.length - 1] : null;

  // ---- against the last rounds ----
  let trend: SummaryFacts['trend'] = null;
  const before = history.filter((r) => r.id !== round.id && r.finishedAt && r.createdAt < round.createdAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const prev = before.length >= 2 ? roundsSg(before) : null;
  if (prev && sgRound && sgRound.holes >= 9) {
    const ch = SG_CATEGORIES.map((c) => ({ c, change: r1(sgRound.per18[c] - prev.per18[c]) })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
    if (Math.abs(ch.change) >= 0.8) trend = ch;
  }

  const facts: SummaryFacts = {
    holes: t.holesPlayed, gross: t.gross, toPar: t.toPar, points: t.stableford, playing: me.playingHandicap, vsPlaying,
    nines: round.holes.length === 18 && t.stableford != null ? nines : null,
    differential: ph?.differential ?? null, scoreMix, blowUps,
    group: sg ? GROUPS.find((x) => x.id === groupId)!.label : null, sg,
    tee: tee.of ? tee : null,
    approach: approach.shots >= 3 ? { ...approach, avgLeaveM: approach.leave.length ? r1(approach.leave.reduce((s, x) => s + x, 0) / approach.leave.length) : null } : null,
    around: around.chances ? around : null,
    putting: putting.putts ? { putts: putting.putts, threePutts: putting.threePutts, shortMisses: putting.shortMisses, avgFirstM: putting.first.length ? r1(putting.first.reduce((s, x) => s + x, 0) / putting.first.length) : null } : null,
    penaltyHoles, keyShots: { worst, best }, trend, unchecked,
  };
  void detailed;
  return { facts, ...write(facts), plan: planFor(facts) };
}

/** The wording – short sentences a coach would say after the round. */
function write(f: SummaryFacts): Pick<RoundSummary, 'headline' | 'lines' | 'nextRound'> {
  const lines: RoundSummary['lines'] = [];
  const score = `${f.gross} (${f.toPar > 0 ? '+' : ''}${f.toPar === 0 ? 'Par' : f.toPar})`;
  let headline: string;
  if (f.vsPlaying != null && f.points != null) {
    const v = f.vsPlaying;
    headline =
      v <= -2 ? tr(`Great round: ${score}, ${f.points} points – ${-v} strokes better than your handicap.`, `Starke Runde: ${score}, ${f.points} Punkte – ${-v} Schläge besser als deine Spielvorgabe.`)
      : v <= 1 ? tr(`Solid round: ${score}, ${f.points} points – right on your handicap.`, `Solide Runde: ${score}, ${f.points} Punkte – genau im Bereich deiner Spielvorgabe.`)
      : v <= 5 ? tr(`${score}, ${f.points} points – ${v} strokes above your handicap, with clear chances to save them.`, `${score}, ${f.points} Punkte – ${v} Schläge über deiner Spielvorgabe, mit klaren Chancen, sie zu holen.`)
      : tr(`A tough day: ${score}, ${f.points} points – ${v} strokes above your handicap.`, `Ein zäher Tag: ${score}, ${f.points} Punkte – ${v} Schläge über deiner Spielvorgabe.`);
  } else headline = tr(`${score} over ${f.holes} holes.`, `${score} über ${f.holes} Löcher.`);
  if (f.differential != null) lines.push({ text: tr(`Handicap played today: ${dec(f.differential.toFixed(1))}.`, `Heute gespieltes Handicap: ${dec(f.differential.toFixed(1))}.`), tone: 'plain' });
  if (f.nines && Math.abs(f.nines[0] - f.nines[1]) >= 3) {
    const back = f.nines[1] > f.nines[0];
    lines.push({ text: tr(`The ${back ? 'back' : 'front'} nine was clearly better (${f.nines[0]} : ${f.nines[1]} points).`, `Die ${back ? 'zweite' : 'erste'} Neun war deutlich stärker (${f.nines[0]} : ${f.nines[1]} Punkte).`), tone: 'plain' });
  }
  if (f.blowUps.length >= 2) lines.push({ text: tr(`${f.blowUps.length} holes without a point (${f.blowUps.join(', ')}) – avoiding just these is the quickest way down.`, `${f.blowUps.length} Löcher ohne Punkt (${f.blowUps.join(', ')}) – genau diese zu vermeiden ist der schnellste Weg nach unten.`), tone: 'bad' });

  if (f.sg) {
    const cats = SG_CATEGORIES.map((c) => ({ c, v: f.sg![c] })).sort((a, b) => b.v - a.v);
    const strong = cats[0];
    const weak = cats[cats.length - 1];
    if (strong.v >= 0.3) lines.push({ text: tr(`Strength: ${SG_LABELS[strong.c]} – ${sgTxt(strong.v)} strokes against ${f.group} players.`, `Stärke: ${SG_LABELS[strong.c]} – ${sgTxt(strong.v)} Schläge gegen Spieler mit ${f.group}.`) + evidence(strong.c, f, true), tone: 'good' });
    if (weak.v <= -0.3) lines.push({ text: tr(`Most strokes lost: ${SG_LABELS[weak.c]} – ${sgTxt(weak.v)} against ${f.group} players.`, `Die meisten Schläge verloren: ${SG_LABELS[weak.c]} – ${sgTxt(weak.v)} gegen Spieler mit ${f.group}.`) + evidence(weak.c, f, false), tone: 'bad' });
  } else {
    // quick tracking: no shot positions – the scorecard values speak
    if (f.putting && f.putting.threePutts >= 2) lines.push({ text: tr(`${f.putting.threePutts} three-putts – a lot of strokes on the greens.`, `${f.putting.threePutts} Dreiputts – auf den Grüns liegen Schläge.`), tone: 'bad' });
    if (f.tee && f.tee.of >= 7) lines.push({ text: tr(`${f.tee.fairways} of ${f.tee.of} fairways hit${f.tee.left !== f.tee.right ? `, misses mostly ${f.tee.left > f.tee.right ? 'left' : 'right'}` : ''}.`, `${f.tee.fairways} von ${f.tee.of} Fairways getroffen${f.tee.left !== f.tee.right ? `, Fehlschläge meist ${f.tee.left > f.tee.right ? 'links' : 'rechts'}` : ''}.`), tone: f.tee.fairways / f.tee.of >= 0.5 ? 'good' : 'bad' });
  }
  if (f.penaltyHoles.length) lines.push({ text: tr(`Penalty strokes on hole ${f.penaltyHoles.join(', ')}.`, `Strafschläge an Loch ${f.penaltyHoles.join(', ')}.`), tone: 'bad' });
  if (f.keyShots.worst.length) lines.push({ text: tr('Most expensive: ', 'Am teuersten: ') + f.keyShots.worst.map((s) => `${s.text} ${sgTxt(s.sg)}`).join(' · '), tone: 'bad' });
  if (f.keyShots.best) lines.push({ text: tr('Best shot: ', 'Bester Schlag: ') + `${f.keyShots.best.text} ${sgTxt(f.keyShots.best.sg)}`, tone: 'good' });
  if (f.trend) {
    const up = f.trend.change > 0;
    lines.push({ text: tr(`Against your last rounds: ${SG_LABELS[f.trend.c]} ${up ? 'better' : 'worse'} by ${dec(Math.abs(f.trend.change).toFixed(1))} strokes.`, `Gegenüber deinen letzten Runden: ${SG_LABELS[f.trend.c]} um ${dec(Math.abs(f.trend.change).toFixed(1))} Schläge ${up ? 'besser' : 'schlechter'}.`), tone: up ? 'good' : 'bad' });
  }
  if (f.unchecked)
    lines.push({
      text: tr(
        `${f.unchecked} ${f.unchecked === 1 ? 'hole' : 'holes'} not checked yet – the shot lines use the checked ones only ("Check your shots").`,
        `${f.unchecked} ${f.unchecked === 1 ? 'Loch' : 'Löcher'} noch nicht geprüft – die Aussagen zu Schlägen nutzen nur die geprüften („Schläge prüfen“).`,
      ),
      tone: 'plain',
    });
  return { headline, lines, nextRound: nextRoundTip(f) };
}

/** One piece of proof from the shots for a strokes-gained area. */
function evidence(c: SgCategory, f: SummaryFacts, good: boolean): string {
  if (c === 'tee' && f.tee) {
    const side = f.tee.left !== f.tee.right ? tr(`, misses mostly ${f.tee.left > f.tee.right ? 'left' : 'right'}`, `, Fehlschläge meist ${f.tee.left > f.tee.right ? 'links' : 'rechts'}`) : '';
    return tr(` ${f.tee.fairways} of ${f.tee.of} fairways${side}${f.tee.penalties ? `, ${f.tee.penalties}× penalty off the tee` : ''}.`, ` ${f.tee.fairways} von ${f.tee.of} Fairways${side}${f.tee.penalties ? `, ${f.tee.penalties}× Strafschlag vom Abschlag` : ''}.`);
  }
  if (c === 'approach' && f.approach) {
    const a = f.approach;
    const miss = !good && shortPattern(a) ? tr(` ${a.short} of ${a.shots} approaches finished short.`, ` ${a.short} von ${a.shots} Annäherungen zu kurz.`)
      : !good && a.long >= a.short + 2 && a.long / a.shots >= 0.4 ? tr(` ${a.long} of ${a.shots} approaches went long.`, ` ${a.long} von ${a.shots} Annäherungen zu lang.`)
      : !good && sidePattern(a) ? tr(` Misses mostly ${a.left > a.right ? 'left' : 'right'} (${Math.max(a.left, a.right)} of ${a.shots}).`, ` Fehlschläge meist ${a.left > a.right ? 'links' : 'rechts'} (${Math.max(a.left, a.right)} von ${a.shots}).`)
      : '';
    const greens = tr(` ${a.greens} of ${a.shots} approaches on the green${a.avgLeaveM != null ? `, ${dec(a.avgLeaveM.toFixed(1))} m from the pin on average` : ''}.`, ` ${a.greens} von ${a.shots} Annäherungen auf dem Grün${a.avgLeaveM != null ? `, im Schnitt ${dec(a.avgLeaveM.toFixed(1))} m von der Fahne` : ''}.`);
    return greens + miss;
  }
  if (c === 'around' && f.around) return tr(` Up and down ${f.around.upAndDowns} of ${f.around.chances}.`, ` Up & Down ${f.around.upAndDowns} von ${f.around.chances}.`);
  if (c === 'putting' && f.putting) {
    const p = f.putting;
    return tr(` ${p.putts} putts${p.threePutts ? `, ${p.threePutts} three-putts` : ''}${p.shortMisses ? `, ${p.shortMisses} missed inside 2 m` : ''}.`, ` ${p.putts} Putts${p.threePutts ? `, ${p.threePutts} Dreiputts` : ''}${p.shortMisses ? `, ${p.shortMisses} unter 2 m verschoben` : ''}.`);
  }
  return '';
}

/**
 * Practice plan for the week: the two weakest areas (strokes gained, or the scorecard without shots), each with the
 * drill that fits the pattern behind it – about 45 minutes. Drills are placeholders until Chris adds his own.
 */
function planFor(f: SummaryFacts): Drill[] {
  const areas: { c: SgCategory; v: number }[] = f.sg
    ? SG_CATEGORIES.map((c) => ({ c, v: f.sg![c] })).filter((x) => x.v <= -0.3).sort((a, b) => a.v - b.v)
    : [
        ...(f.putting && f.putting.threePutts >= 2 ? [{ c: 'putting' as const, v: -f.putting.threePutts }] : []),
        ...(f.tee && f.tee.of >= 7 && f.tee.fairways / f.tee.of < 0.5 ? [{ c: 'tee' as const, v: -1 }] : []),
      ];
  const out: Drill[] = areas.slice(0, 2).map(({ c }) => drillFor(c, f));
  if (f.penaltyHoles.length >= 2 && out.length < 3) {
    out.push({
      area: 'strategy', minutes: 10,
      title: tr('Safe target', 'Sicheres Ziel'),
      how: tr('Before each range ball name the target and the miss you accept. Next round: on holes with water or out of bounds play the caddie’s safe style.', 'Benenne vor jedem Rangeball das Ziel und den Fehlschlag, den du akzeptierst. Nächste Runde: an Löchern mit Wasser oder Aus die sichere Spielweise des Caddies.'),
      why: tr(`${f.penaltyHoles.length} penalty strokes cost you more than any single area.`, `${f.penaltyHoles.length} Strafschläge kosten mehr als jeder einzelne Bereich.`),
    });
  }
  return out;
}

function drillFor(c: SgCategory, f: SummaryFacts): Drill {
  if (c === 'tee') {
    const side = f.tee && Math.abs(f.tee.left - f.tee.right) >= 2 ? (f.tee.left > f.tee.right ? 'left' : 'right') : null;
    return side
      ? { area: c, minutes: 15, title: tr('Start line gate', 'Startlinien-Tor'), how: tr('Two alignment sticks 1 m apart, 3 m in front of the ball, along your target line. 20 drivers – the ball has to start through the gate.', 'Zwei Ausrichtungsstäbe 1 m auseinander, 3 m vor dem Ball, auf deiner Ziellinie. 20 Drives – der Ball muss durchs Tor starten.'), why: tr(`Your tee shots missed mostly ${side}.`, `Deine Abschläge gingen meist ${side === 'left' ? 'links' : 'rechts'} vorbei.`) }
      : { area: c, minutes: 15, title: tr('Fairway gate', 'Fairway-Tor'), how: tr('Two targets 25 m apart on the range as your fairway. 20 drivers with your full routine – count the ones in between.', 'Zwei Ziele 25 m auseinander als Fairway. 20 Drives mit voller Routine – zähle die Treffer dazwischen.'), why: tr('Off the tee you lost the most strokes.', 'Vom Abschlag hast du die meisten Schläge verloren.') };
  }
  if (c === 'approach') {
    const a = f.approach;
    if (a && shortPattern(a))
      return { area: c, minutes: 20, title: tr('Carry check', 'Carry-Check'), how: tr('Hit 5 balls each with 9-iron, 7-iron and 5-iron and note where they land (carry, not roll). Correct the distances in “My bag”. On the course: take one club more and aim at the back half of the green.', 'Je 5 Bälle mit Eisen 9, 7 und 5 – notiere, wo sie landen (Carry, nicht Rollen). Trag die Weiten unter „Mein Bag“ ein. Auf dem Platz: einen Schläger mehr und auf die hintere Grünhälfte zielen.'), why: tr(`${a.short} of ${a.shots} approaches were short – your clubs carry less than you think.`, `${a.short} von ${a.shots} Annäherungen waren zu kurz – deine Schläger tragen weniger weit, als du denkst.`) };
    if (a && sidePattern(a))
      return { area: c, minutes: 15, title: tr('Clubface gate', 'Schlagflächen-Tor'), how: tr('Two tees just wider than the ball, 30 cm in front of it on the target line. 7-iron, 20 balls – the ball has to start through the gate.', 'Zwei Tees knapp breiter als der Ball, 30 cm davor auf der Ziellinie. Eisen 7, 20 Bälle – der Ball muss durchs Tor starten.'), why: tr(`Approaches missed mostly ${a.left > a.right ? 'left' : 'right'}.`, `Annäherungen gingen meist ${a.left > a.right ? 'links' : 'rechts'} vorbei.`) };
    return { area: c, minutes: 15, title: tr('Three distances', 'Drei Distanzen'), how: tr('5 balls each to 100, 130 and 150 m targets. Only a ball within 10 m counts.', 'Je 5 Bälle auf 100, 130 und 150 m. Nur ein Ball innerhalb von 10 m zählt.'), why: tr('Approaches cost you the most strokes.', 'Bei den Annäherungen hast du die meisten Schläge verloren.') };
  }
  if (c === 'long')
    return { area: c, minutes: 15, title: tr('Fairway wood contact', 'Holz-Kontakt vom Fairway'), how: tr('15 balls with your 3-wood or hybrid off the mat, ball slightly forward, sweep it – count the ones in a 30 m corridor. Then 5 layups to your favourite distance.', '15 Bälle mit Holz 3 oder Hybrid von der Matte, Ball etwas weiter vorn, flach „fegen“ – zähle die Bälle in einem 30-m-Korridor. Danach 5 Vorlagen auf deine Lieblingsdistanz.'), why: tr('Your second shots from far out (180 m and more) cost strokes.', 'Deine Transportschläge aus 180 m und mehr haben Schläge gekostet.') };
  if (c === 'around')
    return { area: c, minutes: 15, title: tr('Up and down', 'Up and Down'), how: tr('10 balls from 5 lies around the green, chip and putt out. Goal: 4 of 10 in two strokes.', 'Je 10 Bälle aus 5 Lagen ums Grün chippen und zu Ende putten. Ziel: 4 von 10 mit zwei Schlägen.'), why: f.around ? tr(`Up and down only ${f.around.upAndDowns} of ${f.around.chances} today.`, `Heute nur ${f.around.upAndDowns} von ${f.around.chances} Up & Downs.`) : tr('Around the green you lost strokes.', 'Rund ums Grün hast du Schläge verloren.') };
  const p = f.putting;
  if (p && p.shortMisses >= 2)
    return { area: c, minutes: 15, title: tr('Circle drill', 'Kreis-Drill'), how: tr('Four tees around the hole at 1 m, then at 1.5 m. Go round – start again after a miss. Goal: 20 in a row.', 'Vier Tees im Kreis um das Loch in 1 m, danach 1,5 m. Reihum putten – nach einem Fehlversuch von vorn. Ziel: 20 in Folge.'), why: tr(`${p.shortMisses} putts inside 2 m missed.`, `${p.shortMisses} Putts unter 2 m verschoben.`) };
  return { area: c, minutes: 15, title: tr('Lag ladder', 'Lag-Leiter'), how: tr('Putt from 6, 9 and 12 m – every ball has to stop within a putter length of the hole. Then 20 putts from 1 m.', 'Putte aus 6, 9 und 12 m – jeder Ball muss innerhalb einer Putterlänge ums Loch liegen bleiben. Danach 20 Putts aus 1 m.'), why: p && p.threePutts ? tr(`${p.threePutts} three-putts today.`, `Heute ${p.threePutts} Dreiputts.`) : tr('On the greens you lost strokes.', 'Auf den Grüns hast du Schläge verloren.') };
}

/** One plan for the next round on the course – from the biggest pattern. */
function nextRoundTip(f: SummaryFacts): string | null {
  const a = f.approach;
  if (a && shortPattern(a)) return tr('Next round: one club more on approaches and aim at the middle of the green.', 'Nächste Runde: bei Annäherungen einen Schläger mehr und auf die Grünmitte zielen.');
  if (f.tee && f.tee.penalties >= 1) return tr('Next round: where water or out of bounds is in play off the tee, take the club the caddie suggests in safe style.', 'Nächste Runde: wo vom Abschlag Wasser oder Aus im Spiel ist, den Schläger der sicheren Caddie-Spielweise nehmen.');
  if (f.putting && f.putting.threePutts >= 2) return tr('Next round: on long putts think only about the distance – the ball should stop within a putter length.', 'Nächste Runde: bei langen Putts nur an die Länge denken – der Ball soll innerhalb einer Putterlänge liegen bleiben.');
  if (f.blowUps.length >= 2) return tr('Next round: after a bad shot take the safe way back to the fairway – a bogey is fine.', 'Nächste Runde: nach einem schlechten Schlag den sicheren Weg zurück aufs Fairway – ein Bogey ist in Ordnung.');
  return null;
}

type ApproachFacts = NonNullable<SummaryFacts['approach']>;
/** Short is a pattern when at least 40 % of the approaches finished short (and clearly more than long). */
const shortPattern = (a: ApproachFacts) => a.short >= a.long + 2 && a.short / a.shots >= 0.4;
/** A side is a pattern when at least 35 % of the approaches missed that way (and clearly more than the other). */
const sidePattern = (a: ApproachFacts) => Math.abs(a.left - a.right) >= 2 && Math.max(a.left, a.right) / a.shots >= 0.35;
