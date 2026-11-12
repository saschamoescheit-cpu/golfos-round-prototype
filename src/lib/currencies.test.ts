import { describe, expect, it } from 'vitest';
import { currencyCatalogue, ECB, matchCurrency } from './currencies';
import { symOf } from './fx';

// The profile's "Währung" (Sascha 12.11.2026): the whole ISO catalogue, searchable, EUR, USD, GBP, CHF first.
describe('the currency catalogue', () => {
  const all = currencyCatalogue();
  it('every ISO currency in use, the four first, each once', () => {
    expect(all.length).toBeGreaterThanOrEqual(150);
    expect(all.slice(0, 4).map((c) => c.code)).toEqual(['EUR', 'USD', 'GBP', 'CHF']);
    expect(new Set(all.map((c) => c.code)).size).toBe(all.length);
  });
  it('searched by name or code', () => {
    expect(all.filter((c) => matchCurrency(c, 'gbp')).map((c) => c.code)).toContain('GBP');
    expect(all.filter((c) => matchCurrency(c, 'chf') || matchCurrency(c, 'franken')).map((c) => c.code)).toContain('CHF');
  });
  it('the signs: € and $ as before, £ for the pound, the code where there is none', () => {
    expect(symOf('EUR')).toBe('€');
    expect(symOf('USD')).toBe('$');
    expect(symOf('GBP')).toBe('£');
    expect(symOf('XYZ')).toBe('XYZ');
  });
  it('the ECB rates: euro, dollar, pound and franc converted', () => {
    for (const c of ['EUR', 'USD', 'GBP', 'CHF']) expect(ECB.has(c)).toBe(true);
  });
});
