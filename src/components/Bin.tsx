import { useState } from 'react';
import { getLang, tr } from '../lib/i18n';
import { DeletedIcon } from './RoundIcons';
import { SwipeRow } from './SwipeRow';

// The bin of deleted rounds and games (Sascha 15.10.2026) – the same in every module: folded under the list,
// "Restore" with one tap, "Delete for good" only after a second tap. Since 03.11.2026 (Sascha: "the deleted rounds look
// just like played or signed ones – no two buttons under each round") a row as in the list, with the bin mark; a tap
// opens its sheet (Restore · Delete for good), swiped left it asks "Delete for good?" in the same sheet.

export interface BinItem {
  id: string;
  date: string; // when it was played
  title: string;
  meta: string;
  deletedAt: string;
}

export function Bin(props: { title: string; items: BinItem[]; onRestore: (id: string) => void; onPurge: (id: string) => void; open?: boolean }) {
  // `open` given: the list is opened from outside (the tile on the rounds page) – no own toggle
  const [ownOpen, setOpen] = useState(false);
  const open = props.open ?? ownOpen;
  // the sheet of one deleted row: its choices, or (purge) the question "for good?"
  const [sheet, setSheet] = useState<{ id: string; purge: boolean } | null>(null);
  // several or all at once (Sascha 01.11.2026): "Select", tick them, delete for good – again only after a second tap
  const [pickingOn, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmMany, setConfirmMany] = useState(false);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  if (!props.items.length) return null;
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  const picking = pickingOn && props.items.length > 1; // one left: its own ✕ is enough
  const chosen = props.items.filter((t) => picked.has(t.id)).map((t) => t.id);
  const all = chosen.length === props.items.length;
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
          {open ? '▾' : '▸'} {props.title} ({props.items.length})
        </button>
      ) : (
        open && <h2 className="bin-title">{props.title}</h2>
      )}
      {open && props.items.length > 1 && (
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
                onClick={() => setPicked(all ? new Set() : new Set(props.items.map((t) => t.id)))}
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
          {props.items.map((t) => {
            // while picking the whole row ticks it – a big target with gloves on the course
            const row = (
              <button type="button" className={picking ? 'list-item bin-item bin-pick' : 'list-item bin-item'} onClick={() => (picking ? toggle(t.id) : setSheet({ id: t.id, purge: false }))}>
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
                <span className="round-date">
                  <strong>{day(t.date)}</strong>
                  <span className="muted small">{new Date(t.date).getFullYear()}</span>
                </span>
                <span className="grow">
                  <span className="title with-mark">
                    <span className="title-text">{t.title}</span>
                    {/* the mark of the tile "deleted", as a played or signed round carries its own */}
                    <span className="signed-mark" role="img" aria-label={tr('deleted', 'gelöscht')} title={tr('deleted', 'gelöscht')}>
                      <DeletedIcon size={16} />
                    </span>
                  </span>
                  <span className="muted small">{`${t.meta} · ${tr('deleted', 'gelöscht')} ${day(t.deletedAt)}`}</span>
                </span>
                {!picking && <span aria-hidden="true">›</span>}
              </button>
            );
            // swiped as everywhere else (Sascha 02.11.2026: "in the tile 'deleted' it does not work yet") – here for good,
            // so it asks first, as the ✕ does
            return (
              <li key={t.id}>
                {picking ? row : (
                  <SwipeRow asks label={t.title} onDelete={() => setSheet({ id: t.id, purge: true })}>
                    {row}
                  </SwipeRow>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {open && sheet && props.items.some((t) => t.id === sheet.id) && (() => {
        const t = props.items.find((x) => x.id === sheet.id)!;
        return (
          <div className="sheet-backdrop" onClick={() => setSheet(null)}>
            <section className="sheet" role="dialog" aria-label={t.title} onClick={(e) => e.stopPropagation()}>
              <strong>{t.title}</strong>
              <span className="muted small">{`${day(t.date)} · ${t.meta} · ${tr('deleted', 'gelöscht')} ${day(t.deletedAt)}`}</span>
              {sheet.purge ? (
                <>
                  <span className="muted">{tr('Delete for good? This cannot be undone.', 'Endgültig löschen? Das lässt sich nicht rückgängig machen.')}</span>
                  <button
                    type="button"
                    className="btn-secondary btn-danger"
                    onClick={() => {
                      props.onPurge(t.id);
                      setSheet(null);
                    }}
                  >
                    {tr('Delete for good', 'Endgültig löschen')}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setSheet(null)}>
                    {tr('Keep', 'Behalten')}
                  </button>
                </>
              ) : (
                <>
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
                  <button type="button" className="btn-secondary btn-danger" onClick={() => setSheet({ id: t.id, purge: true })}>
                    {tr('Delete for good', 'Endgültig löschen')}
                  </button>
                </>
              )}
            </section>
          </div>
        );
      })()}
    </>
  );
}
