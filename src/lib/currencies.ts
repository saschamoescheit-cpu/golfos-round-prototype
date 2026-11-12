// The currency catalogue of the profile's "Währung" (Sascha 12.11.2026: the whole ISO list with names, searchable; EUR,
// USD, GBP, CHF first). The names come from the phone (Intl.DisplayNames), the codes from the ISO 4217 list below.
// The Bilanz converts at the European Central Bank's rate of the day
// (lib/fx.ts – frankfurter.app): a currency the ECB has no rate for is listed too, its amounts then stay as they are.
import { getLang } from './i18n';

/** the ISO 4217 codes in use (2026) */
const ISO =
  'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWL'.split(' ');

/** the currencies the European Central Bank publishes a daily rate for – the Bilanz converts only these */
export const ECB = new Set('AUD BGN BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR'.split(' '));

/** first in the list, the rest by name */
export const FIRST = ['EUR', 'USD', 'GBP', 'CHF'];

/** "Euro", "US-Dollar", "Britisches Pfund" … in the app's language, else the code */
export function currencyName(code: string): string {
  try {
    const n = new Intl.DisplayNames([getLang() === 'de' ? 'de-DE' : 'en-GB'], { type: 'currency' }).of(code);
    return n && n !== code ? n : code;
  } catch {
    return code;
  }
}

/** every currency: the four first, then all others by their name */
export function currencyCatalogue(): { code: string; name: string }[] {
  const all = [...new Set([...FIRST, ...ISO])].map((code) => ({ code, name: currencyName(code) }));
  const first = FIRST.map((c) => all.find((x) => x.code === c)!);
  const rest = all.filter((x) => !FIRST.includes(x.code)).sort((a, b) => a.name.localeCompare(b.name, getLang() === 'de' ? 'de' : 'en'));
  return [...first, ...rest];
}

/** a search over code and name ("pfund", "gbp", "franken") */
export function matchCurrency(c: { code: string; name: string }, q: string): boolean {
  const s = q.trim().toLowerCase();
  return !s || c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s);
}
