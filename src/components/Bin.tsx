import { useState } from 'react';
import { getLang, tr } from '../lib/i18n';
import { DeletedIcon } from './RoundIcons';
import { SwipeRow } from './SwipeRow';
import { DateBlock } from './DateBlock';

// The bin of deleted rounds and games (Sascha 15.10.2026) – the same in every module: folded under the list,
// "Restore" with one tap, "Delete for good" only after a second tap. Since 03.11.2026 (Sascha: "the deleted rounds look
// just like played or signed ones – no two buttons under each round") a row as in the list, with the bin mark; a tap
// opens its sheet (Restore · Delete for good). Deleting for good – swiped away or from the sheet – asks nothing; "Undo" in
// the toast below brings it back for a few seconds, only then it is gone (Sascha 03.11.2026).

export interface BinItem {
  id: string;
  date: string; // when it was played
  title: string;
  meta: string;
  deletedAt: string;
  /** the score on the right, as in the list (e.g. 84 / +12) */
  score?: { big: string; small?: string };
}

const UNDO_MS = 8000; // as long as the toast shows "Undo"

export function Bin(props: { title: string; items: BinItem[]; onRestore: (id: string) => void; onPurge: (id: string) => void; open?: boolean }) {
  // `open` given: the list is opened from outside (the tile on the rounds page) – no own toggle
  const [ownOpen, setOpen] = useState(false);
  const open = props.open ?? ownOpen;
  // the sheet of one deleted row: restore or delete for good
  const [sheet, setSheet] = useState<{ id: string } | null>(null);
  // deleted for good a moment ago: hidden, gone for real after the toast (UNDO_MS) – "Undo" shows it again
  const [going, setGoing] = useState<Set<string>>(new Set());
  const purgeLater = (t: BinItem) => {
    setGoing((g) => new Set(g).add(t.id));
    const timer = window.setTimeout(() => props.onPurge(t.id), UNDO_MS);
    window.dispatchEvent(
      new CustomEvent('golfos:deleted', {
        detail: {
          kind: 'purged',
          id: t.id,
          label: t.title,
          undo: () => {
            window.clearTimeout(timer);
            setGoing((g) => {
              const n = new Set(g);
              n.delete(t.id);
              return n;
            });
          },
        },
      }),
    );
  };
  const items = props.items.filter((t) => !going.has(t.id));
  // several or all at once (Sascha 01.11.2026): "Select", tick them, delete for good – again only after a second tap
  const [pickingOn, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmMany, setConfirmMany] = useState(false);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  if (!items.length) return null;
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  const picking = pickingOn && items.length > 1; // one left: its own ✕ is enough
  const chosen = items.filter((t) => picked.has(t.id)).map((t) => t.id);
  const all = chosen.length === items.length;
  const endPicking = () => {
    setPicking(false);
    setPicked(new Set());
    setConfirmMany(false);
  };
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
    setConfirmMany(false);
  };
  return (
    <>
      {props.open == null ? (
        <button type="button" className="toggle bin-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} {props.title} ({items.length})
        </button>
      ) : (
        open && <h2 className="bin-title">{props.title}</h2>
      )}
      {open && items.length > 1 && (
        <div className="bin-bar">
          {!picking ? (
            <button type="button" className="btn-secondary" onClick={() => setPicking(true)}>
              {tr('Select', 'Auswählen')}
            </button>
          ) : confirmMany ? (
            <>
              <span className="muted small grow">{tr(`Delete ${chosen.length} for good? This cannot be undone.`, `${chosen.length} endgültig löschen? Das lässt sich nicht rückgängig machen.`)}</span>
              <button type="button" className="btn-secondary" onClick={() => setConfirmMany(false)}>
                {tr('Keep', 'Behalten')}
              </button>
              <button
                type="button"
                className="btn-secondary btn-danger"
                onClick={() => {
                  chosen.forEach((id) => props.onPurge(id));
                  endPicking();
                }}
              >
                {tr('Delete for good', 'Endgültig löschen')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                aria-label={all ? tr('Select none', 'Keine auswählen') : tr('Select all', 'Alle auswählen')}
                onClick={() => setPicked(all ? new Set() : new Set(items.map((t) => t.id)))}
              >
                {all ? tr('None', 'Keine') : tr('All', 'Alle')}
              </button>
              <button type="button" className="btn-secondary" onClick={endPicking}>
                {tr('Cancel', 'Abbrechen')}
              </button>
              <button type="button" className="btn-secondary btn-danger" disabled={!chosen.length} onClick={() => setConfirmMany(true)}>
                {tr(`Delete ${chosen.length}`, `${chosen.length} löschen`)}
              </button>
            </>
          )}
        </div>
      )}
      {open && (
        <ul className="list">
          {items.map((t) => {
            // while picking the whole row ticks it – a big target with gloves on the course
            const row = (
              <button type="button" className={picking ? 'list-item bin-item bin-pick' : 'list-item bin-item'} onClick={() => (picking ? toggle(t.id) : setSheet({ id: t.id }))}>
                {picking && (
                  <input
                    type="checkbox"
                    className="bin-check"
                    checked={picked.has(t.id)}
                    aria-label={`${t.title}, ${day(t.date)}`}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggle(t.id)}
                  />
                )}
                <DateBlock iso={t.date} />
                {/* the mark of the tile "deleted", as a played or signed round carries its own – in its own column between
                    date and name (Sascha 11.11.2026, status mockups: variant A) */}
                <span className="list-mark">
                  <span className="signed-mark" role="img" aria-label={tr('deleted', 'gelöscht')} title={tr('deleted', 'gelöscht')}>
                    <DeletedIcon size={16} />
                  </span>
                </span>
                <span className="grow">
                  <span className="title">{t.title}</span>
                  <span className="muted small">{`${t.meta} · ${tr('deleted', 'gelöscht')} ${day(t.deletedAt)}`}</span>
                </span>
                {t.score && (
                  <span className="bin-score">
                    <strong>{t.score.big}</strong>
                    {t.score.small && <span className="muted small">{t.score.small}</span>}
                  </span>
                )}
              </button>
            );
            // back with one tap (Sascha 11.11.2026, design round 2: "Wiederherstellen nimmt viel Platz weg") – a round green
            // button at the row's right end; the row itself still opens its sheet (Restore · Delete for good)
            const restore = !picking && (
              <button type="button" className="icon-btn bin-restore" aria-label={tr(`Restore ${t.title}`, `${t.title} wiederherstellen`)} title={tr('Restore', 'Wiederherstellen')} onClick={() => props.onRestore(t.id)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 14L4 9l5-5" />
                  <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
                </svg>
              </button>
            );
            // swiped as everywhere else (Sascha 02.11.2026: "in the tile 'deleted' it does not work yet") – here for good,
            // so it asks first, as the ✕ does
            return (
              <li key={t.id}>
                {picking ? row : (
                  <SwipeRow className="bin-row" label={t.title} onDelete={() => purgeLater(t)}>
                    {row}
                    {restore}
                  </SwipeRow>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {open && sheet && items.some((t) => t.id === sheet.id) && (() => {
        const t = items.find((x) => x.id === sheet.id)!;
        return (
          <div className="sheet-backdrop" onClick={() => setSheet(null)}>
            <section className="sheet" role="dialog" aria-label={t.title} onClick={(e) => e.stopPropagation()}>
              <strong>{t.title}</strong>
              <span className="muted small">{`${day(t.date)} · ${t.meta} · ${tr('deleted', 'gelöscht')} ${day(t.deletedAt)}`}</span>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  props.onRestore(t.id);
                  setSheet(null);
                }}
              >
                {tr('Restore', 'Wiederherstellen')}
              </button>
              <button
                type="button"
                className="btn-secondary btn-danger"
                onClick={() => {
                  setSheet(null);
                  purgeLater(t);
                }}
              >
                {tr('Delete for good', 'Endgültig löschen')}
              </button>
            </section>
          </div>
        );
      })()}
    </>
  );
}
