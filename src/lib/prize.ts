import { tr } from './i18n';
import { currencySymbol, money } from './gameforms';

// What is played for (Sascha 03.11.2026: "games and bets are always about money – we also like to play for drinks after
// the round, a meal or cleaning the clubs; a fixed choice and the user's own stake"). Money in euro or dollar; or a
// thing, counted: "2× Getränk". One look for Games and bets.

export type Prize = { kind: 'money'; currency: 'EUR' | 'USD' } | { kind: 'drinks' | 'meal' | 'clubs' } | { kind: 'custom'; label: string };
export type PrizeKind = Prize['kind'] | 'EUR' | 'USD';

export const MONEY_EUR: Prize = { kind: 'money', currency: 'EUR' };

/** A pool's or a game's prize – from before (only the currency): money in it. */
export function prizeOf(o: { prize?: Prize | null; currency?: 'EUR' | 'USD' | string } | null | undefined): Prize {
  if (o?.prize && (o.prize.kind !== 'custom' || o.prize.label.trim())) return o.prize;
  return { kind: 'money', currency: o?.currency === 'USD' ? 'USD' : 'EUR' };
}

export const isMoney = (p: Prize): p is { kind: 'money'; currency: 'EUR' | 'USD' } => p.kind === 'money';

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
  }
}

/** What follows the number: "€", "$" – or "× Getränk" (money(2, sym) → "2 × Getränk"). */
export const prizeSym = (p: Prize): string => (isMoney(p) ? currencySymbol(p.currency) : `× ${prizeUnit(p)}`);

/** An amount of it: "5 €", "2 × Getränk". */
export const prizeAmount = (v: number, p: Prize): string => money(v, prizeSym(p));

/** The name of the choice: "Euro (€)", "Getränke" … */
export function prizeName(p: Prize): string {
  switch (p.kind) {
    case 'money':
      return p.currency === 'USD' ? 'Dollar ($)' : 'Euro (€)';
    case 'drinks':
      return tr('Drinks', 'Getränke');
    case 'meal':
      return tr('A meal', 'Essen');
    case 'clubs':
      return tr('Cleaning the clubs', 'Schläger putzen');
    case 'custom':
      return p.label.trim();
  }
}

/** "Cedric zahlt an Sascha" – a thing: "Cedric schuldet Sascha" (the amount beside it). */
export const oweText = (from: string, to: string, p: Prize): string =>
  isMoney(p) ? tr(`${from} pays ${to}`, `${from} zahlt an ${to}`) : tr(`${from} owes ${to}`, `${from} schuldet ${to}`);

/** The payer's word: money "Bezahlt", a thing "Eingelöst". */
export const paidWord = (p: Prize): string => (isMoney(p) ? tr('Paid', 'Bezahlt') : tr('Redeemed', 'Eingelöst'));

/** The fixed choices, in order, then "Eigener Einsatz …" (the label typed). */
export const PRIZE_CHOICES = (): { kind: PrizeKind; name: string; text?: string }[] => [
  { kind: 'EUR', name: 'Euro (€)' },
  { kind: 'USD', name: 'Dollar ($)', text: tr('For a trip to the USA', 'Für eine Reise in die USA') },
  { kind: 'drinks', name: tr('Drinks', 'Getränke'), text: tr('After the round – counted: "2× drink"', 'Nach der Runde – gezählt: „2× Getränk“') },
  { kind: 'meal', name: tr('A meal', 'Essen'), text: tr('The loser buys dinner', 'Der Verlierer gibt das Essen aus') },
  { kind: 'clubs', name: tr('Cleaning the clubs', 'Schläger putzen'), text: tr("The loser cleans the winner's clubs", 'Der Verlierer putzt die Schläger des Gewinners') },
];

export const kindOf = (p: Prize): PrizeKind => (isMoney(p) ? p.currency : p.kind);
export function fromKind(k: PrizeKind, label = ''): Prize {
  if (k === 'EUR' || k === 'USD') return { kind: 'money', currency: k };
  if (k === 'custom') return { kind: 'custom', label: label.trim() };
  if (k === 'money') return MONEY_EUR;
  return { kind: k };
}

/** The stakes offered: money as ever; a thing counted 1 to 5. */
export const prizeStakes = (p: Prize, money: number[]): number[] => (isMoney(p) ? money : [1, 2, 3, 4, 5]);
