import type { Club, LngLat, Ring } from '../types';
import type { GreenGrid } from './greenread';
import { alongLine, profileAlong, bearingDeg, distanceM, distToLine, formatDistance, type HoleMapData, type Unit } from './geo';
import { adviseClub, adviseClubMax, aimAdvice, clubName, explain, lieEffect, playsLike, scoreStrategy, type CarryBag, type ClubAdvice, type Conditions, type LieKind, type PlaysLike } from './caddie';
import { aimPoint, type AimPoint, type PlayStyle } from './aimpoint';
import { crossSlopeAt, heightAt, obAdvice, slopeAdvice, type Samples } from './terrain';
import { approachPlan, evenText, fairwayWidth, openText, teePlan } from './holeplan';
import { lineLength as lineLen } from './geo';
import { forecastNote, type Forecast } from './weather';
import { mentalTip, type CaddieFacts } from './caddietalk';
import { planSteps } from './strategy';
import type { HoleNote } from './holenotes';
import { clubCode, tr } from './i18n';
import { swingMark, swingName } from './partials';
import { ballSpot, easierClub, hcpTier, ownParLine, shortGameClub, shortGameLine, spotLine, spreadFactor, strokesOn } from './hcp';

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
  /** Woods where a ball is lost (OSM woods plus large crown areas) – for the tee strategy only. */
  woods?: Ring[];
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
  /** Single trees and small tree groups (aerial crowns, OSM trees) – aim points the player can see. */
  landmarks?: LngLat[];
  strokeIndex?: number | null;
  /** The player's round plan for this hole (strategy.ts): every shot's club, and which shot this is. */
  planned?: { clubs: Club[]; shot: number } | null;
  /** Fairway areas read from the aerial image (where OSM has none) – for where the ball lies. */
  fairwaysAuto?: Ring[];
}

type TargetKey = 'pin' | 't1' | 'spot' | 'centre' | 'short';
const targetNoun = (k: TargetKey): string =>
  ({ pin: tr('the pin', 'die Fahne'), t1: tr('target 1', 'Ziel 1'), spot: '', centre: tr('the middle of the green', 'die Grünmitte'), short: tr('the spot short of the pin', 'den Punkt vor der Fahne') })[k];
const targetTo = (k: TargetKey): string =>
  ({ pin: tr('to the pin', 'zur Fahne'), t1: tr('to target 1', 'zu Ziel 1'), spot: tr('ahead', 'nach vorn'), centre: tr('towards the middle of the green', 'Richtung Grünmitte'), short: tr('short of the pin', 'vor die Fahne') })[k];

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
  /** the course boundary near the target, metres left / right (Infinity = none within 30 m) – shown in the card */
  ob: { left: number; right: number } | null;
  /** around the green for bogey golfers and beginners: the putter or a chip and run instead of the wedge advice */
  shortGame: { club: 'Putter' | '8i' } | null;
}

/** The tee strategy weighed the clubs already (feature 017): the rule of thumb "club down" would contradict it. */
function keepClub(plan: string, weighed: boolean): string {
  if (!weighed) return plan;
  return plan.replace(/ – club down for the fairway\./, ' – accuracy before length.').replace(/ – einen Schläger kürzer fürs Fairway\./, ' – Genauigkeit vor Länge.');
}

/** The tee plan unless it sends the ball to the other side than the caddie's fairway side (that one knows the dogleg). */
function sameSide(plan: string, fairwaySide: number | undefined): string {
  if (!fairwaySide) return plan;
  const left = /Favour the left|eher links/.test(plan);
  const right = /Favour the right|eher rechts/.test(plan);
  return (fairwaySide > 0 && left) || (fairwaySide < 0 && right) ? '' : plan;
}

export function teeAimFor(o: Pick<CaddieInput, 'data' | 'par' | 'pin' | 'bag' | 'conditions' | 'tendency' | 'slopes' | 'boundary' | 'trees' | 'woods' | 'note' | 'style' | 'favourite' | 'playing'>): AimPoint | null {
  if (o.par < 4) return null;
  return aimPoint({ data: o.data, from: o.data.tee, pin: o.pin, par: o.par, teeShot: true, bag: o.bag, conditions: o.conditions, tendency: o.tendency, slopes: o.slopes, boundary: o.boundary, trees: o.trees, woods: o.woods, note: o.note, style: o.style, favourite: o.favourite, playing: o.playing });
}

export function caddieAdvice(o: CaddieInput): CaddieOutput {
  const { data, from, pin, note, unit } = o;
  const fmt = (m: number) => formatDistance(m, unit);
  const ap = aimPoint({ data, from, pin, par: o.par, teeShot: o.teeShot, bag: o.bag, conditions: o.conditions, tendency: o.tendency, slopes: o.slopes, boundary: o.boundary, trees: o.trees, woods: o.woods, note, style: o.style, favourite: o.favourite, playing: o.playing, grid: o.grid });
  // Own planned target still ahead (dragged or added by the player) wins over the caddie's point.
  const ownTarget = o.targets.find((t) => distanceM(t, pin) < distanceM(from, pin) - 15 && !(o.teeAim && distanceM(t, o.teeAim.pos) < 3)) ?? null;
  const target = ownTarget ?? ap.pos;
  // The caddie's point is target 1 when that sits on it (tee); otherwise there is no marker – it is said as a distance.
  const apKey: TargetKey = o.targets.some((t) => distanceM(t, ap.pos) < 15) ? 't1' : 'spot';
  const apName = apKey === 'spot' ? `${formatDistance(ap.distance, o.unit)} ${o.unit}` : targetNoun(apKey);
  // Heights: terrain model along the hole; else the coarse elevation service.
  const tH = (p: LngLat) => (distToLine(p, data.line) <= 40 ? heightAt(o.slopes, profileAlong(data, p)) : null);
  const fromH = tH(from) ?? o.coarseHeight?.(from) ?? null;
  const greenH = tH(data.greenCenter) ?? o.coarseHeight?.(data.greenCenter) ?? null;
  const targetH = ap.kind === 'approach' && !ownTarget ? greenH : tH(target);
  const pl0 = ownTarget ? playsLike(distanceM(from, target), bearingDeg(from, target), o.conditions, fromH != null && targetH != null ? targetH - fromH : null) : ap.pl;

  // Where the ball lies (Sascha 16.10.2026): fairway, rough left/right, bunker, trees, fringe, a slope – from the map;
  // the player can still set the lie himself.
  const spot = o.teeShot ? null : ballSpot(from, data, { fairways: o.fairwaysAuto, trees: o.trees, slopes: o.slopes });
  const lieFromMap = !o.teeShot && o.lieChoice == null && spot?.lie != null;
  const lie: LieKind = o.teeShot ? 'normal' : (o.lieChoice ?? spot?.lie ?? 'normal');
  const lieFx = lieEffect(lie);
  const pl = lieFx ? { ...pl0, playsLike: pl0.playsLike * lieFx.factor, aimM: pl0.aimM + lieFx.aimM } : pl0;
  const tier = hcpTier(o.playing);
  const advice0 = adviseClubMax(pl.playsLike, o.bag, o.teeShot && o.par >= 4 && (ap.kind === 'drive' || !!ownTarget), lieFx?.maxClub ?? null);
  // bogey golfers and beginners: a hybrid or a lofted wood instead of a long iron of the same carry
  const easier = easierClub(advice0.club, o.bag, tier, { teeShot: o.teeShot, rough: lie === 'lightRough' || lie === 'heavyRough' });
  const advice: ClubAdvice = easier ? { ...advice0, club: easier.club, carry: easier.carry } : advice0;
  const reasons = explain(pl0, o.conditions);
  if (lieFx && lieFx.factor !== 1) reasons.push(`${tr('lie', 'Lage')} ${lieFx.factor > 1 ? '+' : '−'}${fmt(Math.abs(pl.playsLike - pl0.playsLike))} ${unit}`);

  const hang = ownTarget ? slopeAdvice(crossSlopeAt(o.slopes, profileAlong(data, target))) : null;
  const ob = obAdvice(o.boundary, from, target);
  let aim = ownTarget
    ? aimAdvice(pl.aimM, o.tendency.get(advice.club) ?? null, advice.club, hang?.aimM ?? 0)
    : ap.kind !== 'approach'
      ? (ap.kind === 'layup' && apKey === 'spot' ? tr(`Lay up to ${apName}`, `Leg vor auf ${apName}`) : tr(`Aim at ${apName}`, `Spiel auf ${apName}`)) + (ap.reasons.length ? ' (' + ap.reasons.join(', ') + ')' : '')
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
      ? (ap.teePlan && ap.teeClub === advice.club ? ap.teePlan : '') || keepClub(sameSide(teePlan(data, driver, { woods: o.woods, note }) || '', ap.fairwaySide), ap.teeClub != null)
      : ap.kind !== 'approach'
        ? ap.kind === 'recovery'
          ? ''
          : tr(`Lay up to ${apName} – a full shot into the green next.`, `Leg vor auf ${apName} – danach ein voller Schlag aufs Grün.`)
        : approachPlan(data, from, pin, { woods: o.woods, note, grid: o.grid, teeShot: o.teeShot && o.par === 3 }).text;

  // Out of bounds near the target: only when a miss can reach it (2.5 × the sideways spread for this length,
  // + 5 m – as in aimPoint); a 40 m pitch does not hear about a boundary 27 m away.
  const shotLen = distanceM(from, target);
  const reach = 2.5 * (0.065 * shotLen + 2) * spreadFactor(o.playing) + 5;
  const obInPlay = ob && Math.min(ob.left, ob.right) <= reach ? ob.text : null;
  const warning = ap.note ?? obInPlay ?? null;
  // Where the flag stands on the green, seen from the player (a flag the player set; the middle says nothing).
  let pinSpot: string | null = null;
  if (ap.kind === 'approach' && data.green && distanceM(pin, data.greenCenter) >= 4) {
    const b = bearingDeg(from, data.greenCenter);
    const pb = bearingDeg(data.greenCenter, pin);
    const dPin = distanceM(data.greenCenter, pin);
    const rel = ((pb - b) * Math.PI) / 180;
    const along = dPin * Math.cos(rel);
    const across = dPin * Math.sin(rel);
    const fb = along > 4 ? tr('back', 'hinten') : along < -4 ? tr('front', 'vorne') : '';
    const lr = across > 4 ? tr('right', 'rechts') : across < -4 ? tr('left', 'links') : '';
    pinSpot = [fb, lr].filter(Boolean).join(' ') || null;
  }
  const lines: CaddieLine[] = [];
  if (warning) lines.push({ text: warning, tone: 'warn' });
  if (note.text) lines.push({ text: note.text, tone: 'warn' });
  if (o.teeShot && note.lostLeft && note.lostRight)
    lines.push({ text: tr('Woods left and right – balls are mostly lost there: long and straight.', 'Wald links und rechts – Bälle sind dort meist weg: lang und gerade.'), tone: 'warn' });
  else if (o.teeShot && (note.lostLeft || note.lostRight))
    lines.push({
      text: tr(
        `Woods ${note.lostLeft ? 'left' : 'right'} – balls are mostly lost there; if you miss, miss ${note.lostLeft ? 'right' : 'left'}.`,
        `Wald ${note.lostLeft ? 'links' : 'rechts'} – Bälle sind dort meist weg; wenn verfehlen, dann ${note.lostLeft ? 'rechts' : 'links'}.`,
      ),
      tone: 'warn',
    });
  // The instruction first, the reasons (plan, hanging fairway) after it.
  if (aim) lines.push({ text: aim, tone: 'plan' });
  if (pinSpot) lines.push({ text: tr(`The flag is ${pinSpot} (${fmt(distanceM(from, pin))} ${unit}).`, `Die Fahne steht ${pinSpot} (${fmt(distanceM(from, pin))} ${unit}).`), tone: 'plan' });
  // Pin strategy first; the "best leave" only when the plan is the flag itself (else the two would argue).
  if (ap.strategy?.text && ap.kind === 'approach' && !ownTarget) lines.push({ text: ap.strategy.text, tone: 'plan', lead: ap.strategy.kind !== 'pin' });
  if (o.leave && ap.kind === 'approach' && !ownTarget && (!ap.strategy || ap.strategy.kind === 'pin')) lines.push({ text: o.leave, tone: 'plan' });
  // "Lay up to 150 m" says the same as the aim line – only in the spoken summary.
  const layupLine = ap.kind === 'layup' && !ownTarget && aim != null;
  // The tee strategy's sentence ("3-wood instead of driver: …") is the golf reason for the club – shown folded too.
  const teeReason = o.teeShot && ap.teePlan != null && holePlan === ap.teePlan;
  const quiet = (warning || note.lostLeft || note.lostRight) && holePlan === openText();
  const sameAsAim = holePlan === evenText() && (warning != null || (aim != null && /Mitte|middle|centre/.test(aim)));
  const planSaid = !!holePlan && !layupLine && !quiet && !sameAsAim;
  if (planSaid) lines.push({ text: holePlan, tone: 'plan', ...(teeReason ? { lead: true } : {}) });
  if (hang) lines.push({ text: hang.text, tone: 'plan' });
  else if (!ownTarget && ap.kind !== 'approach') {
    const h = slopeAdvice(crossSlopeAt(o.slopes, profileAlong(data, ap.pos)));
    if (h) lines.push({ text: h.text, tone: 'plan' });
  }
  if (lieFx) {
    const short =
      lieFx.maxClub && advice.carry < pl.playsLike - 5
        ? tr(`. ${clubName(advice.club)} goes about ${fmt(advice.carry)} ${unit} – short is fine`, `. ${clubName(advice.club)} kommt etwa ${fmt(advice.carry)} ${unit} – kurz ist okay`)
        : '';
    lines.unshift({ text: (lieFromMap ? tr('From the map – ', 'Laut Karte – ') : '') + lieFx.text + short, tone: 'plan' });
  }
  // the ball's place first: "You are in the rough right – 152 m to the pin."
  const where = spot ? spotLine(spot, `${fmt(distanceM(from, pin))} ${unit}`) : null;
  if (where) lines.unshift({ text: where, tone: 'plan' });
  if (easier)
    lines.push({
      text:
        advice0.club === '3W' || advice0.club === '4W'
          ? tr(`${clubName(easier.club)} instead of the ${clubName(advice0.club)} – off the grass far easier to get up, a little shorter.`, `${clubName(easier.club)} statt ${clubName(advice0.club)} – vom Gras viel leichter in die Luft, etwas kürzer.`)
          : tr(`${clubName(easier.club)} instead of the ${clubName(advice0.club)} – same length, far more forgiving.`, `${clubName(easier.club)} statt ${clubName(advice0.club)} – ähnliche Länge, verzeiht viel mehr.`),
      tone: 'plan',
    });
  // around the green: how to play it for this handicap
  const sg = spot && spot.where !== 'green' && spot.where !== 'bunker' ? shortGameLine(distanceM(from, pin), spot.where === 'fringe', tier) : null;
  if (sg) lines.push({ text: sg, tone: 'plan' });
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
  // Bogey golfers and beginners: their own par on the tee (it says the strokes received too)
  const received = o.stableford?.received ?? strokesOn(o.playing, o.strokeIndex);
  const ownPar = o.teeShot ? ownParLine(o.par, received, tier) : null;
  if (ownPar) lines.push({ text: ownPar, tone: 'mental' });
  if (o.stableford) {
    const st = scoreStrategy({ par: o.par, received: o.stableford.received, shotsSoFar: o.stableford.shotsSoFar });
    if (st && !(ownPar && o.stableford.shotsSoFar === 0)) lines.push({ text: st, tone: o.stableford.shotsSoFar ? 'warn' : 'mental' });
  }
  // Aim help (Sascha's notes: "the row of three trees behind the bunker", "the big tree behind the green"): a tree
  // the player can see in line with the aim, a little beyond it.
  const help = !ownTarget ? aimHelp(from, ap.kind === 'approach' ? (o.data.green ? o.data.greenCenter : pin) : ap.pos, o.landmarks, ap.kind === 'approach') : null;
  if (help) lines.push({ text: help, tone: 'plan' });
  // The hardest holes: bogey is a good score; short holes: a birdie chance (Sascha, 5A / 7B / 9B / 2B)
  // the hardest holes (Hcp 1–4, Sascha: 5A, 5B, 7B, 5C, 9C) – for players who receive a stroke there
  if (o.teeShot && o.strokeIndex != null && o.strokeIndex > 0 && o.strokeIndex <= 4 && o.par >= 4 && (o.playing == null || o.playing >= o.strokeIndex))
    lines.push({ text: tr('One of the hardest holes – a bogey is a good score here. Play it safe.', 'Eines der schwersten Löcher – ein Bogey ist hier ein gutes Ergebnis. Spiel sicher.'), tone: 'mental' });
  else if (o.teeShot && ((o.par === 5 && lineLen(data.line) <= 470) || (o.par === 4 && lineLen(data.line) <= 300)))
    lines.push({ text: tr('A short hole – a birdie chance. Keep the ball in play, then attack.', 'Ein kurzes Loch – eine Birdie-Chance. Den Ball ins Spiel bringen, dann angreifen.'), tone: 'mental' });
  const coming = o.teeShot ? forecastNote(o.forecast ?? null, o.wind?.gustKmh ?? 0) : null;
  if (coming) lines.push({ text: coming, tone: 'mental' });
  // around the green for bogey golfers and beginners: the putter or a chip and run, not a lob wedge
  const sgClub = spot ? shortGameClub(distanceM(from, pin), spot.where, tier) : null;
  lines.push({
    text: sgClub
      ? sgClub.text
      : `${clubName(advice.club)}${advice.swing && advice.swing !== 'full' ? ` · ${swingName(advice.swing)}` : ''} (${tr('carry', 'Carry')} ${fmt(advice.carry)} ${unit})${reasons.length ? ' · ' + reasons.join(' · ') : tr(' · calm, flat', ' · windstill, eben')}`,
  });
  const mental = o.teeShot
    ? mentalTip({ hole: o.holeIndex, holes: o.holeCount, lastToPar: o.prev?.toPar ?? null, lastPickedUp: !!o.prev?.pickedUp, tempC: o.conditions?.tempC ?? null })
    : null;
  if (mental) lines.push({ text: mental, tone: 'mental' });
  const alt =
    [
      advice.shorter && `${tr('Less', 'Weniger')}: ${clubCode(advice.shorter.club)}${swingMark(advice.shorter.swing)} ${fmt(advice.shorter.carry)}`,
      advice.longer && `${tr('More', 'Mehr')}: ${clubCode(advice.longer.club)}${swingMark(advice.longer.swing)} ${fmt(advice.longer.carry)}`,
      !o.conditions && tr('no weather data', 'keine Wetterdaten'),
    ]
      .filter(Boolean)
      .join(' · ') || null;
  // With the pin strategy the distances are to the new aim – the words say which.
  const targetKey: TargetKey = ownTarget ? 't1' : ap.kind !== 'approach' ? apKey : ap.strategy && ap.strategy.kind !== 'pin' ? (ap.strategy.kind === 'below' ? 'short' : 'centre') : 'pin';
  // Like a caddie: "normally your 7-iron – with the wind into you today the 6-iron" (Sascha 15.10.2026). The club for
  // the bare distance against the club for the plays-like distance; said when they differ.
  const still = adviseClub(Math.round(pl0.distance), o.bag, o.teeShot && o.par >= 4).club;
  let clubTalk: string | null = null;
  const why: string[] = [];
  {
    if (Math.abs(pl0.wind) >= 3)
      why.push(
        pl0.headKmh >= 0
          ? tr(`${Math.abs(pl0.headKmh)} km/h into you (+${Math.round(pl0.wind)} m)`, `${Math.abs(pl0.headKmh)} km/h Gegenwind (+${Math.round(pl0.wind)} m)`)
          : tr(`${Math.abs(pl0.headKmh)} km/h behind you (−${Math.round(-pl0.wind)} m)`, `${Math.abs(pl0.headKmh)} km/h Rückenwind (−${Math.round(-pl0.wind)} m)`),
      );
    if (Math.abs(pl0.height) >= 3) why.push(pl0.height > 0 ? tr(`uphill (+${Math.round(pl0.height)} m)`, `bergauf (+${Math.round(pl0.height)} m)`) : tr(`downhill (−${Math.round(-pl0.height)} m)`, `bergab (−${Math.round(-pl0.height)} m)`));
    if (Math.abs(pl0.temp) >= 3) why.push(pl0.temp > 0 ? tr(`the cold air (+${Math.round(pl0.temp)} m)`, `die kalte Luft (+${Math.round(pl0.temp)} m)`) : tr(`the warm air (−${Math.round(-pl0.temp)} m)`, `die warme Luft (−${Math.round(-pl0.temp)} m)`));
  }
  // the player's own plan (Sascha 16.10.2026): said first; another club today – the reasons
  const planned = o.planned && o.planned.clubs[o.planned.shot] ? o.planned : null;
  let plannedLine: string | null = null;
  if (planned) {
    const pc = planned.clubs[planned.shot];
    plannedLine = `${tr('Your plan', 'Dein Plan')}: ${planSteps(planned.clubs, planned.shot)}`;
    if (pc !== advice.club && !lieFx) {
      // the planned club fits the bare distance – the weather or the slope changes it today; else it does not fit
      const carry = o.bag.find((b) => b.club === pc && (!b.swing || b.swing === 'full'))?.carry;
      if (still === pc && why.length)
        plannedLine += tr(`. Today the ${clubName(advice.club)} – ${why.join(' and ')}`, `. Heute ${clubArticle(advice.club)} ${clubName(advice.club)} – ${why.join(' und ')}`);
      else
        plannedLine += tr(
          `. ${carry ? `Your ${clubName(pc)} carries ${fmt(carry)} ${unit} – ` : ''}for ${fmt(pl0.distance)} ${unit} (plays like ${fmt(pl.playsLike)}) the caddie takes the ${clubName(advice.club)}`,
          `. ${carry ? `Dein ${clubName(pc)} fliegt ${fmt(carry)} ${unit} – ` : ''}für ${fmt(pl0.distance)} ${unit} (spielt wie ${fmt(pl.playsLike)}) nimmt der Caddie ${clubArticle(advice.club)} ${clubName(advice.club)}`,
        );
    }
  }
  if (!planned && still !== advice.club && !lieFx && !(o.teeShot && o.par >= 4) && (ap.kind === 'approach' || ownTarget != null)) {
    if (why.length)
      clubTalk = tr(
        `Normally your ${clubName(still)} – with ${why.join(' and ')} today the ${clubName(advice.club)}`,
        `Normal wäre das dein ${clubName(still)} – mit ${why.join(' und ')} heute ${clubArticle(advice.club)} ${clubName(advice.club)}`,
      );
  }
  if (clubTalk) lines.splice(Math.min(lines.length, warning ? 1 : 0), 0, { text: clubTalk + '.', tone: 'plan', lead: true });
  if (plannedLine) lines.splice(Math.min(lines.length, warning ? 1 : 0), 0, { text: plannedLine + '.', tone: 'plan', lead: true });
  const facts: CaddieFacts = {
    club: sgClub ? (sgClub.club === 'Putter' ? 'Putter' : clubName('8i') + ', Chip & Run') : clubName(advice.club) + (advice.swing && advice.swing !== 'full' ? `, ${swingName(advice.swing)}` : ''),
    distance: Number(fmt(pl.distance)),
    playsLike: Number(fmt(pl.playsLike)),
    target: targetKey === 'spot' ? apName : targetNoun(targetKey),
    targetTo: targetTo(targetKey),
    aim,
    plan: planSaid ? holePlan : null, // the card and the voice say the same
    wind: o.wind ? (Math.round(o.wind.windKmh) < 5 ? tr('hardly any wind', 'kaum Wind') : `${Math.round(o.wind.windKmh)} km/h, ${o.wind.label.toLowerCase()}`) : null,
    calm: o.wind != null && Math.round(o.wind.windKmh) < 5,
    green: o.greenText ?? null,
    warning,
    unit,
    clubTalk: plannedLine ?? clubTalk,
    pinSpot,
    tip: note.tip ?? null,
    teeShot: o.teeShot,
  };
  return { ap, ownTarget, target, apName, pl, advice, lie, warning, aim, holePlan, lines, alt, facts, heights: { from: fromH, green: greenH }, ob: ob ? { left: ob.left, right: ob.right } : null, shortGame: sgClub ? { club: sgClub.club } : null };
}

/** A tree in line with the aim, 25–120 m beyond it (behind the green: 10–80 m) – within ±2.5°. */
export function aimHelp(from: LngLat, aim: LngLat, landmarks: LngLat[] | undefined, toGreen: boolean): string | null {
  if (!landmarks?.length) return null;
  const b = bearingDeg(from, aim);
  const d0 = distanceM(from, aim);
  const near = toGreen ? [10, 80] : [25, 120];
  const cands = landmarks
    .map((p) => ({ p, d: distanceM(from, p), off: Math.abs(((bearingDeg(from, p) - b + 540) % 360) - 180) }))
    .filter((x) => x.d >= d0 + near[0] && x.d <= d0 + near[1] && x.off <= 2.5)
    .sort((x, y) => x.d - y.d);
  if (!cands.length) return null;
  const first = cands[0];
  const group = landmarks.filter((p) => distanceM(p, first.p) <= 15).length;
  const what = group >= 3 ? tr('the group of trees', 'die Baumgruppe') : group === 2 ? tr('the two trees', 'die zwei Bäume') : tr('the tree', 'den Baum');
  const beyond = Math.round((first.d - d0) / 5) * 5;
  return toGreen
    ? tr(`Aim help: ${what} about ${beyond} m behind the green, in line.`, `Zielhilfe: ${what} etwa ${beyond} m hinter dem Grün, genau in Linie.`)
    : tr(`Aim help: ${what} about ${beyond} m beyond the target, in line.`, `Zielhilfe: ${what} etwa ${beyond} m hinter dem Ziel, genau in Linie.`);
}

/** "das" Eisen 7 / "den" Driver / "das" Holz 3 – the article before the club's German name. */
function clubArticle(club: string): string {
  return club === 'Dr' ? 'den' : 'das';
}
