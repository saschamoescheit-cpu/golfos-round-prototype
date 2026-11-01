// The motion log in the screens (Sascha 19.10.2026): the switch in the setup of a training or a screening, and the
// card to share the log at its end. See motionlog.ts.
import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { clearKept, currentLog, isLogging, keptLog, logFile, setLogging, shareFile, type MotionLog } from './motionlog';

/** The switch in a setup – keep a motion log (only the body points) – and the privacy line that goes with it. */
export function LogSwitch() {
  const [on, setOn] = useState(isLogging);
  const flip = () => {
    setLogging(!on);
    setOn(!on);
  };
  return (
    <>
      <div className="drawer-list settings-switches mob-log-switch">
        <button type="button" className="drawer-row" role="switch" aria-checked={on} onClick={flip}>
          <span className="switch-label">
            <span>{tr('Keep a motion log', 'Bewegungsprotokoll mitschreiben')}</span>
            <span className="muted small">{tr('only the body points, no picture – the last 20 stay on this phone to check the measuring; you share them', 'nur die Körperpunkte, kein Bild – die letzten 20 bleiben auf diesem Handy zum Prüfen der Messung; du teilst sie')}</span>
          </span>
          <span className={`drawer-switch${on ? ' on' : ''}`} aria-hidden="true" />
        </button>
      </div>
      <p className="muted small mob-private">
        {on
          ? tr('The picture stays on your phone. Only the body points are written down – on this phone, until you share them.', 'Das Bild bleibt auf deinem Handy. Nur die Körperpunkte werden mitgeschrieben – auf diesem Handy, bis du sie teilst.')
          : tr('The picture stays on your phone – nothing is recorded or sent.', 'Das Bild bleibt auf deinem Handy – nichts wird aufgenommen oder gesendet.')}
      </p>
    </>
  );
}

/** The motion log of the training or screening just done, when one was kept: share it (the iPhone's share sheet) or
 * download it. */
export function LogShare() {
  const [state, setState] = useState<'' | 'shared' | 'downloaded' | 'cancelled'>('');
  const l = currentLog();
  // the file is made as the card shows (Safari opens the share sheet only right after the tap, not after the zip)
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    let on = true;
    if (l) logFile(l).then((f) => on && setFile(f));
    return () => {
      on = false;
    };
  }, [l]);
  if (!l) return null;
  const frames = l.items.reduce((n, d) => n + d.frames.length, 0);
  const drills = l.items.filter((x) => x.drill).length;
  const tests = l.items.filter((x) => x.test).length;
  const parts = [drills ? tr(`${drills} ${drills === 1 ? 'drill' : 'drills'}`, `${drills} ${drills === 1 ? 'Übung' : 'Übungen'}`) : '', tests ? tr(`${tests} ${tests === 1 ? 'test' : 'tests'}`, `${tests} ${tests === 1 ? 'Test' : 'Tests'}`) : ''].filter(Boolean).join(', ');
  return (
    <section className="card mob-log-share">
      <strong>{tr('Motion log', 'Bewegungsprotokoll')}</strong>
      <span className="muted small">
        {parts} · {tr(`body points from ${frames} camera frames – no photo, no video`, `Körperpunkte aus ${frames} Kamerabildern – kein Foto, kein Video`)}
      </span>
      {state === 'shared' || state === 'downloaded' ? (
        <span className="small good-text">{state === 'shared' ? tr('Shared – thank you.', 'Geteilt – danke.') : tr('Saved in your downloads.', 'In deinen Downloads gespeichert.')}</span>
      ) : null}
      <button
        type="button"
        className="btn-secondary mob-log-share-btn"
        disabled={!file}
        onClick={async () => {
          if (file) setState(await shareFile(file));
        }}
      >
        {tr('Share the motion log', 'Bewegungsprotokoll teilen')}
      </button>
    </section>
  );
}

/** The motion logs kept on this phone (the last 20 camera parts): share them as one file, or delete them. */
export function KeptLogs() {
  const [log, setLog] = useState<MotionLog | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<'' | 'shared' | 'downloaded' | 'cancelled' | 'deleted'>('');
  useEffect(() => {
    let on = true;
    const load = () =>
      void keptLog().then(async (l) => {
        if (!on) return;
        setLog(l);
        setFile(l ? await logFile(l) : null);
      });
    load();
    window.addEventListener('golfos:motionlog', load);
    return () => {
      on = false;
      window.removeEventListener('golfos:motionlog', load);
    };
  }, []);
  if (!log) return null;
  const n = log.items.length;
  return (
    <section className="card mob-log-share mob-log-kept">
      <strong>{tr('Motion logs', 'Bewegungsprotokolle')}</strong>
      <span className="muted small">
        {tr(`The last ${n} camera ${n === 1 ? 'part' : 'parts'} on this phone – body points only, no picture. Share them when a measurement looked wrong.`, `Die letzten ${n} Kamera-Durchgänge auf diesem Handy – nur Körperpunkte, kein Bild. Teile sie, wenn eine Messung komisch war.`)}
      </span>
      {state === 'shared' || state === 'downloaded' ? (
        <span className="small good-text">{state === 'shared' ? tr('Shared – thank you.', 'Geteilt – danke.') : tr('Saved in your downloads.', 'In deinen Downloads gespeichert.')}</span>
      ) : null}
      <button
        type="button"
        className="btn-secondary mob-log-kept-share"
        disabled={!file}
        onClick={async () => {
          if (file) setState(await shareFile(file));
        }}
      >
        {tr('Share the motion logs', 'Bewegungsprotokolle teilen')}
      </button>
      <button
        type="button"
        className="link-btn mob-log-kept-clear"
        onClick={async () => {
          await clearKept();
          setState('deleted');
        }}
      >
        {tr('Delete them from this phone', 'Vom Handy löschen')}
      </button>
    </section>
  );
}
