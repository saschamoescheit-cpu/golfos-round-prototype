import { useEffect, useState } from 'react';
import { restoreRound } from '../lib/storage';
import { restoreGame } from '../lib/gamestore';
import { restoreSession } from '../training/store';
import { restoreScreening } from '../mobility/store';
import { tr } from '../lib/i18n';

// "Round deleted · Undo" for 8 seconds after the player deleted a round or a game (Sascha 15.10.2026: one tap to
// delete, no second question – a slip can still be undone; later from the bin).
// A pool or a tournament (marked deleted on the server) brings its own way back.
type Deleted = { kind: 'round' | 'game' | 'training' | 'mobility' | 'pool' | 'tour' | 'purged' | 'friend'; id: string; label: string; undo?: () => void; /** its own words ("Schläger entfernt", "Ausgeblendet") instead of the kind's */ text?: string };

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
        {shown.text ? shown.text : shown.kind === 'purged' ? tr('Deleted for good', 'Endgültig gelöscht') : shown.kind === 'friend' ? tr('Friend removed', 'Freund entfernt') : shown.kind === 'pool' ? tr('Bet deleted', 'Wette gelöscht') : shown.kind === 'tour' ? tr('Tournament deleted', 'Turnier gelöscht') : shown.kind === 'game' ? tr('Game deleted', 'Spiel gelöscht') : shown.kind === 'training' ? tr('Session deleted', 'Einheit gelöscht') : shown.kind === 'mobility' ? tr('Screening deleted', 'Screening gelöscht') : tr('Round deleted', 'Runde gelöscht')}
        {shown.label ? <span className="muted"> · {shown.label}</span> : null}
      </span>
      <button
        type="button"
        onClick={() => {
          if (shown.undo) shown.undo();
          else if (shown.kind === 'game') restoreGame(shown.id);
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
  // what was refused went to the server (sync rescueRefused): it is safe, also when the app is closed
  const [rescued, setRescued] = useState(false);
  useEffect(() => {
    let once = false;
    const on = () => {
      if (once) return;
      once = true;
      setShown(true);
    };
    const safe = () => setRescued(true);
    window.addEventListener('golfos:storagefull', on);
    window.addEventListener('golfos:rescued', safe);
    return () => {
      window.removeEventListener('golfos:storagefull', on);
      window.removeEventListener('golfos:rescued', safe);
    };
  }, []);
  if (!shown) return null;
  // the bin only when there is something in it (Sascha 08.11.2026: Eric had not one round – "I don't understand it")
  let binUsed = false;
  try {
    binUsed = ((JSON.parse(localStorage.getItem('golfos.trash.v1') ?? '[]') as unknown[]) ?? []).length > 0;
  } catch {
    binUsed = false;
  }
  return (
    <div className="undo-toast" role="alert">
      <span>
        {rescued
          ? tr("The app's storage on this phone is full – what you entered is saved in your account and comes back by itself.", 'Der Speicher der App ist voll – deine Eingaben sind in deinem Konto gesichert und kommen von selbst zurück.')
          : tr(
              "The app's storage on this phone is full – what you just entered is still there, but only while the app stays open. Please don't close the app.",
              'Der Speicher der App ist voll – deine letzten Eingaben sind noch da, aber nur, solange die App offen bleibt. Bitte die App jetzt nicht schließen.',
            )}
        {binUsed ? ' ' + tr('Deleting rounds from the bin for good makes room.', 'Runden im Papierkorb endgültig löschen schafft Platz.') : ''}
      </span>
      <button type="button" onClick={() => setShown(false)}>
        OK
      </button>
    </div>
  );
}
