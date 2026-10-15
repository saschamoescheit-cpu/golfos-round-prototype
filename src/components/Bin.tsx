import { useState } from 'react';
import { getLang, tr } from '../lib/i18n';

// The bin of deleted rounds and games (Sascha 15.10.2026) – the same in both modules: folded under the list,
// "Restore" with one tap, "Delete for good" only after a second tap.

export interface BinItem {
  id: string;
  date: string; // when it was played
  title: string;
  meta: string;
  deletedAt: string;
}

export function Bin(props: { title: string; items: BinItem[]; onRestore: (id: string) => void; onPurge: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [purging, setPurging] = useState<string | null>(null);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  if (!props.items.length) return null;
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  return (
    <>
      <button type="button" className="toggle bin-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {props.title} ({props.items.length})
      </button>
      {open && (
        <ul className="list">
          {props.items.map((t) => (
            <li key={t.id} className="list-item bin-item">
              <span className="round-date">
                <strong>{day(t.date)}</strong>
                <span className="muted small">{new Date(t.date).getFullYear()}</span>
              </span>
              <span className="grow">
                <span className="title">{t.title}</span>
                <span className="muted small">{`${t.meta} · ${tr('deleted', 'gelöscht')} ${day(t.deletedAt)}`}</span>
              </span>
              {purging === t.id ? (
                <span className="bin-actions">
                  <button type="button" className="btn-secondary" onClick={() => setPurging(null)}>
                    {tr('Keep', 'Behalten')}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-danger"
                    onClick={() => {
                      props.onPurge(t.id);
                      setPurging(null);
                    }}
                  >
                    {tr('Delete for good', 'Endgültig löschen')}
                  </button>
                </span>
              ) : (
                <span className="bin-actions">
                  <button type="button" className="btn-secondary" onClick={() => props.onRestore(t.id)}>
                    {tr('Restore', 'Wiederherstellen')}
                  </button>
                  <button type="button" className="btn-secondary bin-x" aria-label={tr('Delete for good', 'Endgültig löschen')} onClick={() => setPurging(t.id)}>
                    ✕
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
