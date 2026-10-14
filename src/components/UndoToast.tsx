import { useEffect, useState } from 'react';
import { undoDelete } from '../lib/storage';
import { tr } from '../lib/i18n';

// "Round deleted · Undo" for 8 seconds after the player deleted a round (Sascha 15.10.2026: one tap to delete,
// no second question – a slip can still be undone).
export function UndoToast() {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    let t = 0;
    const on = (e: Event) => {
      setShown((e as CustomEvent<string>).detail ?? '');
      window.clearTimeout(t);
      t = window.setTimeout(() => setShown(null), 8000);
    };
    window.addEventListener('golfos:round-deleted', on);
    return () => {
      window.removeEventListener('golfos:round-deleted', on);
      window.clearTimeout(t);
    };
  }, []);
  if (shown == null) return null;
  return (
    <div className="undo-toast" role="status">
      <span>
        {tr('Round deleted', 'Runde gelöscht')}
        {shown ? <span className="muted"> · {shown}</span> : null}
      </span>
      <button
        type="button"
        onClick={() => {
          undoDelete();
          setShown(null);
        }}
      >
        {tr('Undo', 'Rückgängig')}
      </button>
    </div>
  );
}
