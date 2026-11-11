// Euro and dollar (Sascha 12.11.2026: "a setting in the profile for the standard currency – with euro chosen and a
// bet running in dollars, the bet is converted to euro at the cut-off day with the dollar rate"): the rates of the
// European Central Bank, free and without a key (frankfurter.app). A day already past: that day's rate, kept for good;
// a day to come: today's rate – "≈", it changes until the day. Offline: the last rate known; none: not converted.
import { loadProfile } from './profile';

export type Money = 'EUR' | 'USD';
const KEY = 'golfos.fx.v1';
const SYM: Record<Money, string> = { EUR: '€', USD: '$' };
export const symOf = (c: Money): string => SYM[c];
export const moneyOfSym = (sym: string): Money | null => (sym === '€' ? 'EUR' : sym === '$' ? 'USD' : null);

/** the player's standard currency (profile) – none chosen: nothing converted, each in its own currency (a trip in
 *  dollars does not turn into euros by itself) */
export const homeMoney = (): Money | null => loadProfile().currency ?? null;

type Store = Record<string, number>; // "2026-11-17|USD>EUR" → 0.86; "latest|USD>EUR" → today's
const load = (): Store => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Store;
  } catch {
    return {};
  }
};
const keep = (s: Store) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked – the rate is fetched again next time
  }
};
const today = () => new Date().toISOString().slice(0, 10);

/** The rate from → to on a day (a day to come: today's), as kept – null when not known yet. */
export function rateKept(from: Money, to: Money, day: string): number | null {
  if (from === to) return 1;
  const s = load();
  const past = day <= today();
  const k = (d: string) => `${d}|${from}>${to}`;
  if (past && s[k(day)] != null) return s[k(day)];
  // a day to come, or one not fetched yet: the latest known rate
  return s[k('latest')] ?? null;
}

/** Is the rate of that day final (the day is past and its rate kept)? */
export const rateFinal = (from: Money, to: Money, day: string): boolean => from === to || (day < today() && load()[`${day}|${from}>${to}`] != null);

const asking = new Map<string, Promise<boolean>>();
/** Fetches the rate of a day (a day to come: today's) – true when something new was kept. Never throws. */
export function fetchRate(from: Money, to: Money, day: string): Promise<boolean> {
  if (from === to) return Promise.resolve(false);
  const past = day < today();
  const s = load();
  const key = past ? `${day}|${from}>${to}` : `latest|${from}>${to}`;
  // a past day's rate never changes; today's is fetched again at most every 6 hours
  if (past && s[key] != null) return Promise.resolve(false);
  const stampKey = `at:${key}`;
  if (!past && s[key] != null && Date.now() - (s[stampKey] ?? 0) < 6 * 3600e3) return Promise.resolve(false);
  const id = `${key}`;
  if (asking.has(id)) return asking.get(id)!;
  const p = (async () => {
    try {
      const r = await fetch(`https://api.frankfurter.app/${past ? day : 'latest'}?from=${from}&to=${to}`);
      if (!r.ok) return false;
      const j = (await r.json()) as { rates?: Record<string, number> };
      const v = j.rates?.[to];
      if (typeof v !== 'number' || !(v > 0)) return false;
      const n = load();
      n[key] = v;
      if (!past) n[stampKey] = Date.now();
      keep(n);
      return true;
    } catch {
      return false;
    } finally {
      asking.delete(id);
    }
  })();
  asking.set(id, p);
  return p;
}

/** An amount in a currency, converted to another at a day's rate – null when the rate is not known. */
export function convert(amount: number, from: Money, to: Money, day: string): number | null {
  const r = rateKept(from, to, day);
  return r == null ? null : Math.round(amount * r * 100) / 100;
}
