import { tr } from './i18n';
import { currencySymbol, money } from './gameforms';

// What is played for (Sascha 03.11.2026: "games and bets are always about money – we also like to play for drinks after
// the round, a meal or cleaning the clubs; a fixed choice and the user's own stake"; then: "no value by default, money
// with its currency in a second step, for drinks or a meal who pays for whom, and 'without a stake' – for the honour").
// Money in euro or dollar; a thing, counted ("2× Getränk") or the loser buying for all or for the winner; or nothing.
// One look for Games and bets.

/** For a thing: each lost bet (or point) counted, the loser for all the others, or the loser for the winner. */
export type PrizeWho = 'each' | 'loserAll' | 'loserWinner';
export type Thing = 'drinks' | 'meal' | 'clubs';
export type Prize =
  | { kind: 'money'; currency: 'EUR' | 'USD' }
  | { kind: Thing; who?: PrizeWho }
  | { kind: 'custom'; label: string; who?: PrizeWho }
  | { kind: 'none' };
export type PrizeKind = Prize['kind'];

export const MONEY_EUR: Prize = { kind: 'money', currency: 'EUR' };

/** A pool's or a game's prize – from before (only the currency): money in it. */
export function prizeOf(o: { prize?: Prize | null; currency?: 'EUR' | 'USD' | string } | null | undefined): Prize {
  if (o?.prize && (o.prize.kind !== 'custom' || o.prize.label.trim())) return o.prize;
  return { kind: 'money', currency: o?.currency === 'USD' ? 'USD' : 'EUR' };
}

export const isMoney = (p: Prize): p is { kind: 'money'; currency: 'EUR' | 'USD' } => p.kind === 'money';
/** "Ohne Einsatz – um die Ehre": nothing to pay, only who won. */
export const isNone = (p: Prize): boolean => p.kind === 'none';
/** Who buys for whom – a thing only; money and "each" are counted pair by pair. */
export const whoOf = (p: Prize): PrizeWho => (p.kind === 'money' || p.kind === 'none' ? 'each' : (p.who ?? 'each'));

/** The thing one counts, singular: "Getränk", "Essen", "Schläger putzen", the own one. */
export function prizeUnit(p: Prize): string {
  switch (p.kind) {
    case 'money':
      return currencySymbol(p.currency);
    case 'drinks':
      return tr('drink', 'Getränk');
    case 'meal':
      return tr('meal', 'Essen');
    case 'clubs':
      return tr('club cleaning', 'Schläger putzen');
    case 'custom':
      return p.label.trim();
    case 'none':
      return tr('pts', 'Pkt.');
  }
}

/** What follows the number: "€", "$" – "× Getränk" (money(2, sym) → "2 × Getränk") – without a stake "Pkt.". */
export const prizeSym = (p: Prize): string => (isMoney(p) || isNone(p) ? prizeUnit(p) : `× ${prizeUnit(p)}`);

/** An amount of it: "5 €", "2 × Getränk". */
export const prizeAmount = (v: number, p: Prize): string => money(v, prizeSym(p));

const WHO = (): Record<PrizeWho, { name: string; text: string }> => ({
  each: { name: tr('Counted per bet', 'Je verlorene Wette'), text: tr('Each bet lost: the stake, e.g. "2 × drink" – settled pair by pair', 'Jede verlorene Wette zählt ihren Einsatz, z. B. „2 × Getränk“ – zwischen je zwei Spielern') },
  loserAll: { name: tr('The loser for all', 'Der Verlierer für alle'), text: tr('Whoever ends last buys for everyone else', 'Wer am Ende hinten liegt, gibt allen anderen aus') },
  loserWinner: { name: tr('The loser for the winner', 'Der Verlierer für den Sieger'), text: tr('Whoever ends last buys for the one in front', 'Wer am Ende hinten liegt, gibt dem Ersten aus') },
});
export const WHO_CHOICES = (): { value: PrizeWho; name: string; text: string }[] => (['each', 'loserAll', 'loserWinner'] as PrizeWho[]).map((v) => ({ value: v, ...WHO()[v] }));

/** The name of the choice: "Geld · Euro (€)", "Getränke · Der Verlierer für alle", "Ohne Einsatz" … */
export function prizeName(p: Prize): string {
  const who = (x: PrizeWho | undefined) => (x && x !== 'each' ? ` · ${WHO()[x].name}` : '');
  switch (p.kind) {
    case 'money':
      return p.currency === 'USD' ? tr('Money · dollar ($)', 'Geld · Dollar ($)') : tr('Money · euro (€)', 'Geld · Euro (€)');
    case 'drinks':
      return tr('Drinks', 'Getränke') + who(p.who);
    case 'meal':
      return tr('A meal', 'Essen') + who(p.who);
    case 'clubs':
      return tr('Cleaning the clubs', 'Schläger putzen') + who(p.who);
    case 'custom':
      return p.label.trim() + who(p.who);
    case 'none':
      return tr('No stake – for the honour', 'Ohne Einsatz – um die Ehre');
  }
}

/** "Cedric zahlt an Sascha" – a thing: "Cedric schuldet Sascha" (the amount beside it). */
export const oweText = (from: string, to: string, p: Prize): string =>
  isMoney(p) ? tr(`${from} pays ${to}`, `${from} zahlt an ${to}`) : whoOf(p) === 'each' ? tr(`${from} owes ${to}`, `${from} schuldet ${to}`) : tr(`${from} buys for ${to}`, `${from} gibt ${to} aus`);

/** The payer's word: money "Bezahlt", a thing "Eingelöst". */
export const paidWord = (p: Prize): string => (isMoney(p) ? tr('Paid', 'Bezahlt') : tr('Redeemed', 'Eingelöst'));

/** The first step's choices: money, the things, one's own, none. */
export const PRIZE_CHOICES = (): { kind: PrizeKind; name: string; text?: string }[] => [
  { kind: 'money', name: tr('Money', 'Geld'), text: tr('Euro or dollar – next step', 'Euro oder Dollar – im nächsten Schritt') },
  { kind: 'drinks', name: tr('Drinks', 'Getränke'), text: tr('After the round – who buys for whom, next step', 'Nach der Runde – wer wem ausgibt, im nächsten Schritt') },
  { kind: 'meal', name: tr('A meal', 'Essen'), text: tr('Who buys for whom, next step', 'Wer wem ausgibt, im nächsten Schritt') },
  { kind: 'clubs', name: tr('Cleaning the clubs', 'Schläger putzen'), text: tr("The loser cleans the clubs", 'Der Verlierer putzt die Schläger') },
  { kind: 'custom', name: tr('Own stake …', 'Eigener Einsatz …'), text: tr('Typed by you – e.g. a round of beer, caddying', 'Frei eingegeben – z. B. Bier-Runde, Caddie spielen') },
  { kind: 'none', name: tr('No stake', 'Ohne Einsatz'), text: tr('For the honour – only who wins counts', 'Um die Ehre – es zählt nur, wer gewinnt') },
];

/** The stakes offered: money as ever; a thing counted 1 to 5; without a stake none (one point a bet). */
export const prizeStakes = (p: Prize, money: number[]): number[] => (isMoney(p) ? money : [1, 2, 3, 4, 5]);
