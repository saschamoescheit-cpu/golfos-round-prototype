// The motion log in the screens (Sascha 19.10.2026): the switch in the setup of a training or a screening, and the
// card to share the log at its end. See motionlog.ts.
import { useState } from 'react';
import { tr } from '../lib/i18n';
import { currentLog, isLogging, setLogging, shareLog } from './motionlog';

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
            <span className="muted small">{tr('only the body points, no picture – to check the measuring; you share it at the end', 'nur die Körperpunkte, kein Bild – zum Prüfen der Messung; du teilst es am Ende')}</span>
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
  const [state, setState] = useState<'' | 'busy' | 'shared' | 'downloaded' | 'cancelled'>('');
  const l = currentLog();
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
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          setState(await shareLog(l));
        }}
      >
        {tr('Share the motion log', 'Bewegungsprotokoll teilen')}
      </button>
    </section>
  );
}
