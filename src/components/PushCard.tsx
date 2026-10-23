import { useState } from 'react';
import { tr } from '../lib/i18n';
import { disablePush, enablePush, loadPush, pushAvailability, PushError, setPushKind, type PushKind } from '../lib/push';

// Notifications in the profile (final list, Sascha 23.10.2026): a slider right of the heading turns them on for this
// phone, then one slider per kind – the switches of the caddie settings. Where it cannot work, one line says why.

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
  const can = why === 'ok' && props.signedIn;

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
  const turnOff = async () => {
    setBusy(true);
    setMsg(null);
    setState(await disablePush());
    setBusy(false);
  };

  return (
    <section className="card stats-card push-card">
      {/* sliders, the main one right of the heading (Sascha 23.10.2026) – as the caddie's switches */}
      <div className="card-head">
        <h2>{tr('Notifications', 'Mitteilungen')}</h2>
        {can && (
          <button
            type="button"
            className="switch-btn"
            role="switch"
            aria-checked={state.on}
            aria-label={tr('Notifications on this phone', 'Mitteilungen auf diesem Handy')}
            disabled={busy}
            onClick={() => (state.on ? turnOff() : turnOn())}
          >
            <span className={`drawer-switch${state.on ? ' on' : ''}`} aria-hidden="true" />
          </button>
        )}
      </div>
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
      {can && !state.on && (
        <span className="muted small">{tr('A round not checked yet, games on several phones, a thunderstorm on the course.', 'Runde noch nicht geprüft, Spiele auf mehreren Handys, Gewitter auf dem Platz.')}</span>
      )}
      {can && state.on && (
        <div className="drawer-list settings-switches">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className="drawer-row"
              role="switch"
              aria-checked={state.kinds[k.kind]}
              onClick={async () => setState(await setPushKind(k.kind, !state.kinds[k.kind]))}
            >
              <span className="switch-label">
                <span>{k.label()}</span>
                <span className="muted small">{k.hint()}</span>
              </span>
              <span className={`drawer-switch${state.kinds[k.kind] ? ' on' : ''}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {msg && <span className="muted small" role="status">{msg}</span>}
    </section>
  );
}
