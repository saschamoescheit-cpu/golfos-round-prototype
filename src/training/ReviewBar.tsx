import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { fullName, loadProfile } from '../lib/profile';
import { loadReview, reviewOn, setMark, type Verdict } from './review';

// The review bar under a drill, section, fault, plan or video – only while the review mode is on.
// ✓ keep · ✎ change · ✕ cut; a note for ✎ and ✕. Tapping the chosen verdict again removes the mark.

export function ReviewBar(props: { itemKey: string; onMarked?: (v: Verdict) => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const on = () => tick((n) => n + 1);
    window.addEventListener('golfos:training-changed', on);
    return () => window.removeEventListener('golfos:training-changed', on);
  }, []);
  const mark = loadReview()[props.itemKey];
  const [note, setNote] = useState(mark?.note ?? '');
  useEffect(() => setNote(loadReview()[props.itemKey]?.note ?? ''), [props.itemKey]);
  if (!reviewOn()) return null;

  const pick = (v: Verdict) => {
    if (mark?.verdict === v) return setMark(props.itemKey, null);
    setMark(props.itemKey, { verdict: v, note: v === 'ok' ? undefined : note.trim() || undefined, at: new Date().toISOString(), by: fullName(loadProfile()) || undefined });
    props.onMarked?.(v);
  };
  const saveNote = () => mark && setMark(props.itemKey, { ...mark, note: note.trim() || undefined, at: new Date().toISOString() });
  const opts: { v: Verdict; label: string }[] = [
    { v: 'ok', label: tr('✓ Keep', '✓ Passt') },
    { v: 'edit', label: tr('✎ Change', '✎ Ändern') },
    { v: 'cut', label: tr('✕ Cut', '✕ Streichen') },
  ];
  return (
    <div className={`tr-reviewbar${mark ? ` ${mark.verdict}` : ''}`} role="group" aria-label={tr('Review', 'Prüfung')}>
      <span className="eyebrow">{tr('Review', 'Prüfung')}</span>
      <div className="chip-set">
        {opts.map((o) => (
          <button key={o.v} type="button" className={`chip${mark?.verdict === o.v ? ' on' : ''}`} aria-pressed={mark?.verdict === o.v} onClick={() => pick(o.v)}>
            {o.label}
          </button>
        ))}
      </div>
      {mark && mark.verdict !== 'ok' && (
        <textarea
          className="input"
          rows={2}
          value={note}
          placeholder={mark.verdict === 'edit' ? tr('What should change?', 'Was soll sich ändern?') : tr('Why cut? (optional)', 'Warum streichen? (optional)')}
          aria-label={tr('Note', 'Notiz')}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
        />
      )}
    </div>
  );
}
