import { useState } from 'react';
import { Segmented } from './ui';
import { tr } from '../lib/i18n';
import { disablePush, enablePush, loadPush, pushAvailability, PushError, setPushKind, type PushKind } from '../lib/push';

// Notifications in the profile (final list, Sascha 23.10.2026): one button turns them on for this phone, then each kind
// on or off – as the other switches of the profile, "On" left. Where it cannot work, one line says why.

const BELL = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </svg>
);

const KINDS: { kind: PushKind; label: () => string; hint: () => string }[] = [
  { kind: 'rounds', label: () => tr('Round not checked yet', 'Runde noch nicht geprüft'), hint: () => tr('Once, two hours after the round', 'Einmal, zwei Stunden nach der Runde') },
  { kind: 'games', label: () => tr('Games on several phones', 'Spiele auf mehreren Handys'), hint: () => tr('A player joins, the game ends', 'Ein Mitspieler kommt dazu, das Spiel endet') },
  { kind: 'weather', label: () => tr('Thunderstorm on the course', 'Gewitter auf dem Platz'), hint: () => tr('While you play a round', 'Während du eine Runde spielst') },
];

export function PushCard(props: { signedIn: boolean }) {
  const [state, setState] = useState(loadPush);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const why = pushAvailability();

  const turnOn = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setState(await enablePush());
      setMsg(tr('Notifications are on – a first one is on its way.', 'Mitteilungen sind an – eine erste ist unterwegs.'));
    } catch (e) {
      const reason = e instanceof PushError ? e.reason : 'failed';
      setMsg(
        reason === 'denied'
          ? tr('Notifications are blocked for GolfOS – allow them in the settings of the phone.', 'Mitteilungen sind für GolfOS gesperrt – in den Einstellungen des Handys erlauben.')
          : reason === 'setup'
            ? tr('Not set up on the server yet.', 'Auf dem Server noch nicht eingerichtet.')
            : tr('That did not work – try again with a connection.', 'Das hat nicht geklappt – mit Verbindung noch einmal versuchen.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stats-card push-card">
      <h2>{tr('Notifications', 'Mitteilungen')}</h2>
      {why === 'homescreen' && (
        <span className="muted small">
          {tr(
            'On the iPhone notifications come only to GolfOS on the home screen: Share → Add to Home Screen, then open GolfOS from there.',
            'Auf dem iPhone kommen Mitteilungen nur zu GolfOS auf dem Home-Bildschirm: Teilen → Zum Home-Bildschirm, dann GolfOS von dort öffnen.',
          )}
        </span>
      )}
      {why === 'unsupported' && <span className="muted small">{tr('This browser cannot receive notifications.', 'Dieser Browser kann keine Mitteilungen empfangen.')}</span>}
      {why === 'signin' && <span className="muted small">{tr('Notifications come with an account – sign in above.', 'Mitteilungen gehen mit einem Konto – oben anmelden.')}</span>}
      {why === 'ok' && props.signedIn && !state.on && (
        <>
          <span className="muted small">{tr('A round not checked yet, games on several phones, a thunderstorm on the course.', 'Runde noch nicht geprüft, Spiele auf mehreren Handys, Gewitter auf dem Platz.')}</span>
          <button type="button" className="btn-primary icon-text" disabled={busy} onClick={turnOn}>
            {BELL}
            {busy ? tr('Turning on …', 'Schalte ein …') : tr('Turn on notifications', 'Mitteilungen einschalten')}
          </button>
        </>
      )}
      {why === 'ok' && props.signedIn && state.on && (
        <>
          {KINDS.map((k) => (
            <div className="field" key={k.kind}>
              <label>{k.label()}</label>
              <Segmented<'on' | 'off'>
                label={k.label()}
                value={state.kinds[k.kind] ? 'on' : 'off'}
                onChange={async (v) => {
                  if (!v) return;
                  setState(await setPushKind(k.kind, v === 'on'));
                }}
                options={[
                  { value: 'on', label: tr('On', 'An') },
                  { value: 'off', label: tr('Off', 'Aus') },
                ]}
              />
              <span className="muted small">{k.hint()}</span>
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setState(await disablePush());
              setBusy(false);
              setMsg(null);
            }}
          >
            {tr('Turn off notifications on this phone', 'Mitteilungen auf diesem Handy ausschalten')}
          </button>
        </>
      )}
      {msg && <span className="muted small" role="status">{msg}</span>}
    </section>
  );
}
