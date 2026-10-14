import { useState } from 'react';
import type { Round } from '../types';
import { getLang, tr } from '../lib/i18n';
import { loopsText } from '../lib/loops';
import { isSun, setSun } from '../lib/theme';
import { uncheckedRounds } from './Rounds';

// Tab "Play" (Sascha 14.10.2026): start a round, or carry on with, finish or cancel the one in progress.
// "Continue round" only shows while a started round was neither finished nor cancelled.

const INTRO_KEY = 'golfos.intro.v1';

export function PlayTab(props: {
  rounds: Round[];
  onNewRound: () => void;
  onContinue: (r: Round) => void;
  onEnd: (r: Round) => void;
  onAbort: (r: Round) => void;
  onCheck: () => void;
}) {
  const open = props.rounds.filter((r) => !r.finishedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const unchecked = uncheckedRounds(props.rounds).length;
  const [sun, setSunState] = useState(isSun);
  const [confirm, setConfirm] = useState<'end' | 'abort' | null>(null);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  // First start: the steps that say what the app does (closed once, then gone).
  const [intro, setIntro] = useState(() => {
    try {
      return localStorage.getItem(INTRO_KEY) == null && props.rounds.length === 0;
    } catch {
      return false;
    }
  });
  const closeIntro = () => {
    setIntro(false);
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {
      // storage blocked – the intro shows again next time
    }
  };
  const played = open ? open.entries[open.players.find((p) => p.isMe)!.id].filter((e) => e.strokes != null || e.pickedUp).length : 0;

  return (
    <>
      <div className="topbar">
        <div className="brand">
          GOLF<span>OS</span>
        </div>
        <span className="spacer" />
        <button
          type="button"
          className="lang-btn"
          aria-pressed={sun}
          aria-label={sun ? tr('Sun mode off', 'Sonnenmodus aus') : tr('Sun mode on – light screen for bright sunshine', 'Sonnenmodus an – heller Bildschirm für grelles Sonnenlicht')}
          onClick={() => {
            setSun(!sun);
            setSunState(!sun);
          }}
        >
          ☀
        </button>
      </div>
      <h1 className="tab-title">{tr('Play golf', 'Golf spielen')}</h1>

      {intro && (
        <section className="card intro" aria-label={tr('How GolfOS works', 'So funktioniert GolfOS')}>
          <span className="eyebrow">{tr('How GolfOS works', 'So funktioniert GolfOS')}</span>
          <ol>
            <li>
              <span>
                <strong>{tr('Pick your course', 'Platz wählen')}</strong>
                <span className="muted small">{tr('Nearby or by name, then your tee and playing handicap.', 'In der Nähe oder nach Namen, dann Abschlag und Spielvorgabe.')}</span>
              </span>
            </li>
            <li>
              <span>
                <strong>{tr('Play with the hole map', 'Mit der Lochkarte spielen')}</strong>
                <span className="muted small">
                  {tr(
                    'Distances to the green come from GPS. Numbers at bunkers and water: to reach / to carry it.',
                    'Die Distanzen zum Grün kommen per GPS. Zahlen an Bunkern und Wasser: bis dorthin / drüber.',
                  )}
                </span>
              </span>
            </li>
            <li>
              <span>
                <strong>{tr('Listen to your caddie', 'Auf den Caddie hören')}</strong>
                <span className="muted small">
                  {tr(
                    'Tap the caddie button for the club and where to aim, with wind and slope – a dot on it means he has something new. The round icons switch caddie, pin and green slope on and off.',
                    'Tippe auf den Caddie-Knopf für Schläger und Ziel, mit Wind und Hang – ein Punkt daran heißt: er hat etwas Neues. Die runden Symbole schalten Caddie, Fahne und Grün-Neigung ein und aus.',
                  )}
                </span>
              </span>
            </li>
            <li>
              <span>
                <strong>{tr('After the round: check your shots', 'Nach der Runde: Schläge prüfen')}</strong>
                <span className="muted small">
                  {tr(
                    'On the course you only enter score and putts. Afterwards the app finds your shots in the GPS track – most accurately when you take the phone out at your ball. Tap the map to correct, and tell the caddie where you would have played differently.',
                    'Auf dem Platz trägst du nur Score und Putts ein. Danach findet die App deine Schläge in der GPS-Spur – am genauesten, wenn du das Handy an deinem Ball kurz herausnimmst. Antippen der Karte korrigiert, und dem Caddie sagst du, wo du anders gespielt hättest.',
                  )}
                </span>
              </span>
            </li>
          </ol>
          <button type="button" className="btn-secondary" onClick={closeIntro}>
            {tr('Got it', 'Verstanden')}
          </button>
        </section>
      )}

      {open && (
        <section className="card play-card" aria-label={tr('Round in progress', 'Laufende Runde')}>
          <span className="eyebrow">{tr('Round in progress', 'Laufende Runde')}</span>
          <div className="play-course">{open.courseName}</div>
          <span className="muted small">
            {[
              loopsText(open.loopOrder),
              tr(`hole ${open.currentHole + 1} of ${open.holes.length}`, `Loch ${open.currentHole + 1} von ${open.holes.length}`),
              tr(`started ${new Date(open.createdAt).toLocaleString(locale, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`, `begonnen ${new Date(open.createdAt).toLocaleString(locale, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {confirm === null && (
            <>
              <button type="button" className="btn-primary" onClick={() => props.onContinue(open)}>
                {tr('Continue round', 'Runde fortsetzen')}
              </button>
              <div className="play-actions">
                <button type="button" className="btn-secondary" onClick={() => setConfirm('end')}>
                  {tr('Finish round', 'Runde beenden')}
                </button>
                <button type="button" className="btn-secondary btn-danger" onClick={() => setConfirm('abort')}>
                  {tr('Cancel round', 'Runde abbrechen')}
                </button>
              </div>
            </>
          )}
          {confirm === 'end' && (
            <div className="play-confirm">
              <span>
                {played < open.holes.length
                  ? tr(
                      `Finish now? ${played} of ${open.holes.length} holes have a score – they are saved, the others stay empty.`,
                      `Jetzt beenden? ${played} von ${open.holes.length} Löchern haben einen Score – sie werden gespeichert, die anderen bleiben leer.`,
                    )
                  : tr('Finish and save the round?', 'Runde beenden und speichern?')}
              </span>
              <div className="play-actions">
                <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>
                  {tr('Back', 'Zurück')}
                </button>
                <button type="button" className="btn-primary" onClick={() => props.onEnd(open)}>
                  {tr('Save & finish', 'Speichern & beenden')}
                </button>
              </div>
              <button type="button" className="btn-secondary btn-danger" onClick={() => setConfirm('abort')}>
                {tr('Delete round instead', 'Runde stattdessen löschen')}
              </button>
            </div>
          )}
          {confirm === 'abort' && (
            <div className="play-confirm">
              <span>{tr('Cancel and delete the round? Everything entered for it is lost.', 'Runde abbrechen und löschen? Alle Eingaben dieser Runde gehen verloren.')}</span>
              <div className="play-actions">
                <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>
                  {tr('Back', 'Zurück')}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-danger"
                  onClick={() => {
                    setConfirm(null);
                    props.onAbort(open);
                  }}
                >
                  {tr('Delete round', 'Runde löschen')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card play-card">
        <strong className="play-course">{tr('Start a new round', 'Neue Runde starten')}</strong>
        <span className="muted small">
          {tr('Score on the course – your shots come afterwards from the GPS track.', 'Score auf dem Platz – deine Schläge kommen danach aus der GPS-Spur.')}
        </span>
        <button type="button" className={open ? 'btn-secondary' : 'btn-primary'} onClick={props.onNewRound}>
          {tr('New round', 'Neue Runde')}
        </button>
      </section>

      {unchecked > 0 && (
        <button type="button" className="list-item" onClick={props.onCheck}>
          <span className="grow">
            <span className="title">{tr('Check your shots', 'Schläge prüfen')}</span>
            <span className="muted small">
              {unchecked === 1 ? tr('1 round has shots to check', '1 Runde hat offene Schläge') : tr(`${unchecked} rounds have shots to check`, `${unchecked} Runden haben offene Schläge`)}
            </span>
          </span>
          <span className="count-badge">{unchecked}</span>
          <span aria-hidden="true">›</span>
        </button>
      )}
    </>
  );
}
