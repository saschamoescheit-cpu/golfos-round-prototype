// The date block of a list row (Sascha 12.11.2026, design "Heute": "Runden-Zeilen mit Datum-Block"): the day big, the
// weekday small below – the month stands above the rows as a heading (monthHeading). Rounds and Games alike.
import { getLang } from '../lib/i18n';

const locale = () => (getLang() === 'de' ? 'de-DE' : undefined);

export function DateBlock(props: { iso: string }) {
  const d = new Date(props.iso);
  return (
    <span className="round-date date-block" aria-label={d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
      <strong aria-hidden="true">{d.getDate()}</strong>
      <span className="muted small" aria-hidden="true">
        {d.toLocaleDateString(locale(), { weekday: 'short' }).replace('.', '')}
      </span>
    </span>
  );
}

/** "November 2026" above the first row of a month (k: the row's place in the list, isos: the rows' dates) */
export function monthHeading(isos: string[], k: number): string | null {
  const m = (iso: string) => new Date(iso).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  return k === 0 || m(isos[k]) !== m(isos[k - 1]) ? m(isos[k]) : null;
}
