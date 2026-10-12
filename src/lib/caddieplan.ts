import type { Club, LngLat, Ring } from '../types';
import type { GreenGrid } from './greenread';
import { alongLine, bearingDeg, distanceM, distToLine, formatDistance, type HoleMapData, type Unit } from './geo';
import { adviseClubMax, aimAdvice, clubName, explain, lieEffect, playsLike, scoreStrategy, type CarryBag, type ClubAdvice, type Conditions, type LieKind, type PlaysLike } from './caddie';
import { aimPoint, type AimPoint, type PlayStyle } from './aimpoint';
import { crossSlopeAt, heightAt, obAdvice, slopeAdvice, type Samples } from './terrain';
import { approachPlan, fairwayWidth, openText, teePlan } from './holeplan';
import { forecastNote, type Forecast } from './weather';
import { mentalTip, type CaddieFacts } from './caddietalk';
import { lieAt } from './shots';
import type { HoleNote } from './holenotes';
import { clubCode, tr } from './i18n';

// Everything the AI caddie says for one shot, as a pure function (features 008/016/017/019).
// The hole screen shows the result; the caddie audit (scripts/audit.ts) runs it for every hole and position.

export type Tone = 'warn' | 'plan' | 'mental' | 'muted';
export interface CaddieLine {
  text: string;
  tone?: Tone;
  lead?: boolean; // the line the folded caddie card shows (after a warning)
}

export interface CaddieInput {
  data: HoleMapData;
  par: number;
  holeIndex: number;
  holeCount: number;
  from: LngLat;
  teeShot: boolean;
  pin: LngLat;
  targets: LngLat[]; // the player's planned targets (target 1 may be the caddie's tee point)
  teeAim: AimPoint | null;
  slopes?: Samples;
  boundary?: Ring[];
  trees?: Ring[];
  bag: CarryBag;
  conditions: Conditions | null;
  tendency: Map<Club, number>;
  note: HoleNote;
  style?: PlayStyle;
  favourite?: number;
  lieChoice: LieKind | null; // set by the player for this spot; null = from the map
  unit: Unit;
  coarseHeight?: (p: LngLat) => number | null; // elevation service when the terrain model has no value
  stableford?: { received: number; shotsSoFar: number | null } | null;
  prev?: { toPar: number | null; pickedUp: boolean } | null;
  forecast?: Forecast | null;
  wind?: { gustKmh: number; label: string; windKmh: number } | null;
  greenText?: string | null;
  leave?: string | null; // where the approach should finish on the green (green heights), e.g. "below the hole"
  playing?: number | null; // playing handicap – spread for the pin strategy
  grid?: GreenGrid | null; // heights of this green
}

type TargetKey = 'pin' | 't1' | 'gold';
const targetNoun = (k: TargetKey): string =>
  ({ pin: tr('the pin', 'die Fahne'), t1: tr('target 1', 'Ziel 1'), gold: tr('the gold marker', 'die goldene Markierung') })[k];
const targetTo = (k: TargetKey): string =>
  ({ pin: tr('to the pin', 'zur Fahne'), t1: tr('to target 1', 'zu Ziel 1'), gold: tr('to the gold marker', 'zur goldenen Markierung') })[k];

export interface CaddieOutput {
  ap: AimPoint;
  ownTarget: LngLat | null;
  target: LngLat;
  apName: string;
  pl: PlaysLike;
  advice: ClubAdvice;
  lie: LieKind;
  warning: string | null;
  aim: string | null;
  holePlan: string;
  lines: CaddieLine[];
  alt: string | null;
  facts: CaddieFacts;
  heights: { from: number | null; green: number | null };
}

export function teeAimFor(o: Pick<CaddieInput, 'data' | 'par' | 'pin' | 'bag' | 'conditions' | 'tendency' | 'slopes' | 'boundary' | 'trees' | 'note' | 'style' | 'favourite'>): AimPoint | null {
  if (o.par < 4) return null;
  return aimPoint({ data: o.data, from: o.data.tee, pin: o.pin, par: o.par, teeShot: true, bag: o.bag, conditions: o.conditions, tendency: o.tendency, slopes: o.slopes, boundary: o.boundary, trees: o.trees, note: o.note, style: o.style, favourite: o.favourite });
}

export function caddieAdvice(o: CaddieInput): CaddieOutput {
  const { data, from, pin, note, unit } = o;
  const fmt = (m: number) => formatDistance(m, unit);
  const ap = aimPoint({ data, from, pin, par: o.par, teeShot: o.teeShot, bag: o.bag, conditions: o.conditions, tendency: o.tendency, slopes: o.slopes, boundary: o.boundary, trees: o.trees, note, style: o.style, favourite: o.favourite, playing: o.playing, grid: o.grid });
  // Own planned target still ahead (dragged or added by the player) wins over the caddie's point.
  const ownTarget = o.targets.find((t) => distanceM(t, pin) < distanceM(from, pin) - 15 && !(o.teeAim && distanceM(t, o.teeAim.pos) < 3)) ?? null;
  const target = ownTarget ?? ap.pos;
  // The caddie's point is drawn as target 1 when that sits on it (tee), else as the gold marker.
  const apKey: TargetKey = o.targets.some((t) => distanceM(t, ap.pos) < 15) ? 't1' : 'gold';
  const apName = targetNoun(apKey);
  // Heights: terrain model along the hole; else the coarse elevation service.
  const tH = (p: LngLat) => (distToLine(p, data.line) <= 40 ? heightAt(o.slopes, alongLine(data.line, p)) : null);
  const fromH = tH(from) ?? o.coarseHeight?.(from) ?? null;
  const greenH = tH(data.greenCenter) ?? o.coarseHeight?.(data.greenCenter) ?? null;
  const targetH = ap.kind === 'approach' && !ownTarget ? greenH : tH(target);
  const pl0 = ownTarget ? playsLike(distanceM(from, target), bearingDeg(from, target), o.conditions, fromH != null && targetH != null ? targetH - fromH : null) : ap.pl;

  // Lie of the ball (not on the tee): the map knows bunkers, the player tells the rest.
  const mapLie = o.teeShot ? null : lieAt(from, data, false);
  const lie: LieKind = o.teeShot ? 'normal' : (o.lieChoice ?? (mapLie === 'bunker' && distanceM(from, data.greenCenter) > 60 ? 'fairwayBunker' : 'normal'));
  const lieFx = lieEffect(lie);
  const pl = lieFx ? { ...pl0, playsLike: pl0.playsLike * lieFx.factor, aimM: pl0.aimM + lieFx.aimM } : pl0;
  const advice = adviseClubMax(pl.playsLike, o.bag, o.teeShot && o.par >= 4 && (ap.kind === 'drive' || !!ownTarget), lieFx?.maxClub ?? null);
  const reasons = explain(pl0, o.conditions);
  if (lieFx && lieFx.factor !== 1) reasons.push(`${tr('lie', 'Lage')} ${lieFx.factor > 1 ? '+' : '−'}${fmt(Math.abs(pl.playsLike - pl0.playsLike))} ${unit}`);

  const hang = ownTarget ? slopeAdvice(crossSlopeAt(o.slopes, alongLine(data.line, target))) : null;
  const ob = obAdvice(o.boundary, from, target);
  let aim = ownTarget
    ? aimAdvice(pl.aimM, o.tendency.get(advice.club) ?? null, advice.club, hang?.aimM ?? 0)
    : ap.kind !== 'approach'
      ? tr(`Aim at ${apName}`, `Spiel auf ${apName}`) + (ap.reasons.length ? ' (' + ap.reasons.join(', ') + ')' : '')
      : ap.reasons.length
        ? `${tr('Aim', 'Ziel')}: ${ap.reasons.join(', ')}`
        : null;
  const obL = note.obLeft || (ob != null && ob.left <= 25);
  const obR = note.obRight || (ob != null && ob.right <= 25);
  if (ownTarget && aim && (((aim.includes(' left') || aim.includes(' links')) && obL) || ((aim.includes(' right') || aim.includes(' rechts')) && obR)))
    aim = tr(`Aim at the centre – out of bounds ${obL ? 'left' : 'right'}, accept the roll`, `Spiel auf die Mitte – Aus ${obL ? 'links' : 'rechts'}, nimm das Rollen in Kauf`);

  // Hole plan in one sentence: tee shot on par 4/5 → which side; otherwise → where to miss the green.
  const driver = o.bag.find((b) => b.club === 'Dr')?.carry ?? 200;
  const holePlan =
    o.teeShot && o.par >= 4
      ? teePlan(data, driver) || ''
      : ap.kind !== 'approach'
        ? ap.kind === 'recovery'
          ? ''
          : tr(`Lay up to ${apName} – a full shot into the green next.`, `Leg vor auf ${apName} – danach ein voller Schlag aufs Grün.`)
        : approachPlan(data, from, pin).text;

  const warning = ap.note ?? ob?.text ?? null;
  const lines: CaddieLine[] = [];
  if (warning) lines.push({ text: warning, tone: 'warn' });
  if (note.text) lines.push({ text: note.text, tone: 'warn' });
  // The instruction first, the reasons (plan, hanging fairway) after it.
  if (aim) lines.push({ text: aim, tone: 'plan' });
  // Pin strategy first; the "best leave" only when the plan is the flag itself (else the two would argue).
  if (ap.strategy?.text && ap.kind === 'approach' && !ownTarget) lines.push({ text: ap.strategy.text, tone: 'plan', lead: ap.strategy.kind !== 'pin' });
  if (o.leave && ap.kind === 'approach' && !ownTarget && (!ap.strategy || ap.strategy.kind === 'pin')) lines.push({ text: o.leave, tone: 'plan' });
  // "Lay up to the gold marker" says the same as the aim line – only in the spoken summary.
  const layupLine = ap.kind === 'layup' && !ownTarget && aim != null;
  if (holePlan && !layupLine && !(warning && holePlan === openText())) lines.push({ text: holePlan, tone: 'plan' });
  if (hang) lines.push({ text: hang.text, tone: 'plan' });
  else if (!ownTarget && ap.kind !== 'approach') {
    const h = slopeAdvice(crossSlopeAt(o.slopes, alongLine(data.line, ap.pos)));
    if (h) lines.push({ text: h.text, tone: 'plan' });
  }
  if (lieFx) {
    const short =
      lieFx.maxClub && advice.carry < pl.playsLike - 5
        ? tr(`. ${clubName(advice.club)} goes about ${fmt(advice.carry)} ${unit} – short is fine`, `. ${clubName(advice.club)} kommt etwa ${fmt(advice.carry)} ${unit} – kurz ist okay`)
        : '';
    lines.unshift({ text: lieFx.text + short, tone: 'plan' });
  }
  // Fairway width where the drive lands (from the mapped fairway).
  if (o.teeShot && o.par >= 4 && ap.kind === 'drive') {
    const at = alongLine(data.line, ap.pos);
    const w = fairwayWidth(data, at);
    if (w != null)
      lines.push({
        text: tr(`Fairway ${fmt(w)} ${unit} wide at ${fmt(at)} ${unit}`, `Fairway ${fmt(w)} ${unit} breit bei ${fmt(at)} ${unit}`) + (w < 25 ? tr(' – narrow, accuracy before length', ' – eng, Genauigkeit vor Länge') : ''),
      });
  }
  // Stableford: strokes received on the tee, pick up when no point is left.
  if (o.stableford) {
    const st = scoreStrategy({ par: o.par, received: o.stableford.received, shotsSoFar: o.stableford.shotsSoFar });
    if (st) lines.push({ text: st, tone: o.stableford.shotsSoFar ? 'warn' : 'mental' });
  }
  const coming = o.teeShot ? forecastNote(o.forecast ?? null, o.wind?.gustKmh ?? 0) : null;
  if (coming) lines.push({ text: coming, tone: 'mental' });
  lines.push({ text: `${clubName(advice.club)} (${tr('carry', 'Carry')} ${fmt(advice.carry)} ${unit})${reasons.length ? ' · ' + reasons.join(' · ') : tr(' · calm, flat', ' · windstill, eben')}` });
  const mental = o.teeShot
    ? mentalTip({ hole: o.holeIndex, holes: o.holeCount, lastToPar: o.prev?.toPar ?? null, lastPickedUp: !!o.prev?.pickedUp, tempC: o.conditions?.tempC ?? null })
    : null;
  if (mental) lines.push({ text: mental, tone: 'mental' });
  const alt =
    [
      advice.shorter && `${tr('Less', 'Weniger')}: ${clubCode(advice.shorter.club)} ${fmt(advice.shorter.carry)}`,
      advice.longer && `${tr('More', 'Mehr')}: ${clubCode(advice.longer.club)} ${fmt(advice.longer.carry)}`,
      !o.conditions && tr('no weather data', 'keine Wetterdaten'),
    ]
      .filter(Boolean)
      .join(' · ') || null;
  const targetKey: TargetKey = ownTarget ? 't1' : ap.kind !== 'approach' ? apKey : 'pin';
  const facts: CaddieFacts = {
    club: clubName(advice.club),
    distance: Number(fmt(pl.distance)),
    playsLike: Number(fmt(pl.playsLike)),
    target: targetNoun(targetKey),
    targetTo: targetTo(targetKey),
    aim,
    plan: holePlan || null,
    wind: o.wind ? `${Math.round(o.wind.windKmh)} km/h, ${o.wind.label.toLowerCase()}` : null,
    green: o.greenText ?? null,
    warning,
    unit,
  };
  return { ap, ownTarget, target, apName, pl, advice, lie, warning, aim, holePlan, lines, alt, facts, heights: { from: fromH, green: greenH } };
}
