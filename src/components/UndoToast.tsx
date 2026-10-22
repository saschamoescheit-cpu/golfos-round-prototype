import { useEffect, useState } from 'react';
import { restoreRound } from '../lib/storage';
import { restoreGame } from '../lib/gamestore';
import { restoreSession } from '../training/store';
import { restoreScreening } from '../mobility/store';
import { tr } from '../lib/i18n';

// "Round deleted · Undo" for 8 seconds after the player deleted a round or a game (Sascha 15.10.2026: one tap to
// delete, no second question – a slip can still be undone; later from the bin).
type Deleted = { kind: 'round' | 'game' | 'training' | 'mobility'; id: string; label: string };

export function UndoToast() {
  const [shown, setShown] = useState<Deleted | null>(null);
  useEffect(() => {
    let t = 0;
    const on = (e: Event) => {
      setShown((e as CustomEvent<Deleted>).detail);
      window.clearTimeout(t);
      t = window.setTimeout(() => setShown(null), 8000);
    };
    window.addEventListener('golfos:deleted', on);
    return () => {
      window.removeEventListener('golfos:deleted', on);
      window.clearTimeout(t);
    };
  }, []);
  if (shown == null) return null;
  return (
    <div className="undo-toast" role="status">
      <span>
        {shown.kind === 'game' ? tr('Game deleted', 'Spiel gelöscht') : shown.kind === 'training' ? tr('Session deleted', 'Einheit gelöscht') : shown.kind === 'mobility' ? tr('Screening deleted', 'Screening gelöscht') : tr('Round deleted', 'Runde gelöscht')}
        {shown.label ? <span className="muted"> · {shown.label}</span> : null}
      </span>
      <button
        type="button"
        onClick={() => {
          if (shown.kind === 'game') restoreGame(shown.id);
          else if (shown.kind === 'training') restoreSession(shown.id);
          else if (shown.kind === 'mobility') restoreScreening(shown.id);
          else restoreRound(shown.id);
          setShown(null);
        }}
      >
        {tr('Undo', 'Rückgängig')}
      </button>
    </div>
  );
}

/** The device storage is full and nothing that may go is left (storageguard): say so, once per session, instead of
 *  losing what was just entered without a word. */
export function StorageFullToast() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let once = false;
    const on = () => {
      if (once) return;
      once = true;
      setShown(true);
    };
    window.addEventListener('golfos:storagefull', on);
    return () => window.removeEventListener('golfos:storagefull', on);
  }, []);
  if (!shown) return null;
  return (
    <div className="undo-toast" role="alert">
      <span>
        {tr(
          'Storage on this phone is full – the latest entries are kept only while the app stays open. Deleting rounds from the bin for good makes room.',
          'Speicher auf dem Handy voll – das Neueste bleibt nur, solange die App offen ist. Runden im Papierkorb endgültig löschen schafft Platz.',
        )}
      </span>
      <button type="button" onClick={() => setShown(false)}>
        OK
      </button>
    </div>
  );
}
