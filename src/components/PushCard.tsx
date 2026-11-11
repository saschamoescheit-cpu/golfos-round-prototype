import { useState } from 'react';
import { tr } from '../lib/i18n';
import { OnOffRow } from './Settings';
import { disablePush, enablePush, loadPush, pushAvailability, PushError, setPushKind, type PushKind } from '../lib/push';

// Notifications in the profile (final list, Sascha 23.10.2026): a slider right of the heading turns them on for this
// phone, then one slider per kind – the switches of the caddie settings. Where it cannot work, one line says why.

const KINDS: { kind: PushKind; label: () => string; hint: () => string }[] = [
  { kind: 'rounds', label: () => tr('Check & sign', 'Prüfen & signieren'), hint: () => tr('A round not checked yet (two hours after it), a tournament card to countersign or countersigned', 'Runde noch nicht geprüft (zwei Stunden danach), Turnierkarte gegenzeichnen oder gegengezeichnet') },
  { kind: 'games', label: () => tr('Games, bets & tournaments', 'Spiele, Wetten & Turniere'), hint: () => tr('A player joins, the game ends, a new bet with you, a bet made, the settlement, your tee time, a tournament changed, its result', 'Ein Mitspieler kommt dazu, das Spiel endet, neue Wette mit dir, Wette geschafft, Abrechnung, deine Startzeit, Turnier geändert, Endstand') },
  // their own switch (Sascha 07.11.2026: fun on the trip – some find it too much)
  { kind: 'specials', label: () => tr('Special prizes live', 'Sonderpreise live'), hint: () => tr('A new best at Nearest to the Pin or Long Drive', 'Neuer Bester bei Nearest to the Pin oder Long Drive') },
  { kind: 'weather', label: () => tr('Thunderstorm on the course', 'Gewitter auf dem Platz'), hint: () => tr('While you play a round', 'Während du eine Runde spielst') },
  { kind: 'agility', label: () => tr('Training day (Agility)', 'Trainingstag (Agility)'), hint: () => tr('At the time set in your physio plan', 'Zur Uhrzeit aus deinem Physio-Plan') },
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
      {/* rows with An/Aus, no sliders (Sascha 11.11.2026: "ohne Schieberegler – in der gesamten App"; before: the main
          slider right of the heading, 23.10.2026) */}
      <h2>{tr('Notifications', 'Mitteilungen')}</h2>
      {can && (
        <div className="settings-list onoff-card-row">
          <OnOffRow label={tr('Notifications on this phone', 'Mitteilungen auf diesem Handy')} on={state.on} disabled={busy} onChange={(v) => void (v ? turnOn() : turnOff())} />
        </div>
      )}
      {why === 'homescreen' && (
        <span className="muted small">
          {tr(
            'On the iPhone notifications come only to GolfOS on the home screen: Share → Add to Home Screen, then open GolfOS from there.',
            'Auf dem iPhone kommen Mitteilungen nur zu GolfOS auf dem Home-Bildschirm: Teilen → Zum Home-Bildschirm, dann GolfOS von dort öffnen.',
          )}
        </span>
      )}
      {why === 'unsupported' &&<span className="muted small">{tr('This browser cannot receive notifications.', 'Dieser Browser kann keine Mitteilungen empfangen.')}</span>}
      {why === 'signin' && <span className="muted small">{tr('Notifications come with an account – sign in above.', 'Mitteilungen gehen mit einem Konto – oben anmelden.')}</span>}
      {can && !state.on && (
        <span className="muted small">{tr('A round not checked yet, games, bets, the settlement, tournaments and your tee time, special prizes, a thunderstorm on the course.', 'Runde noch nicht geprüft, Spiele, Wetten, Abrechnung, Turniere und deine Startzeit, Sonderpreise, Gewitter auf dem Platz.')}</span>
      )}
      {can && state.on && (
        <div className="drawer-list settings-switches">
          {KINDS.map((k) => (
            <OnOffRow key={k.kind} label={k.label()} text={k.hint()} on={state.kinds[k.kind]} onChange={async (v) => setState(await setPushKind(k.kind, v))} />
          ))}
        </div>
      )}
      {msg && <span className="muted small" role="status">{msg}</span>}
    </section>
  );
}
