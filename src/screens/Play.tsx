import { useState } from 'react';
import type { Round } from '../types';
import { getLang, tr } from '../lib/i18n';
import { loopsText } from '../lib/loops';
import { TopTools } from '../components/TopTools';
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
  onModules: () => void;
  /** A paused course preview: continue or end it. */
  preview?: Round | null;
  onPreview?: (r: Round) => void;
  onEndPreview?: () => void;
}) {
  const open = props.rounds.filter((r) => !r.finishedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const unchecked = uncheckedRounds(props.rounds).length;
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
      <RoundsTopBar onModules={props.onModules} />
      <h1 className="tab-title">{tr('Play golf', 'Golf spielen')}</h1>

      {/* first start: a window of its own over the start page – gone after "Got it" (Sascha 15.10.2026) */}
      {intro && (
        <div className="intro-backdrop">
          <section className="card intro intro-modal" role="dialog" aria-modal="true" aria-label={tr('How GolfOS works', 'So funktioniert GolfOS')}>
            <span className="eyebrow">{tr('How GolfOS works', 'So funktioniert GolfOS')}</span>
            <ol>
              <li>
                <span>
                  <strong>{tr('Pick your course', 'Platz wählen')}</strong>
                  <span className="muted small">{tr('Nearby or by name, then your tee and game mode.', 'In der Nähe oder nach Namen, dann Abschlag und Spielmodus.')}</span>
                </span>
              </li>
              <li>
                <span>
                  <strong>{tr('Play with the hole map', 'Mit der Lochkarte spielen')}</strong>
                  <span className="muted small">
                    {tr(
                      'Back, middle and front of the green by GPS. On the right: the caddie, green slope, hazards (to and over) and the 2D view.',
                      'Hinten, Mitte und Vorne des Grüns per GPS. Rechts: Caddie, Grün-Neigung, Hindernisse (bis / über) und die 2D-Ansicht.',
                    )}
                  </span>
                </span>
              </li>
              <li>
                <span>
                  <strong>{tr('Score after each hole', 'Score nach jedem Loch')}</strong>
                  <span className="muted small">
                    {tr('Tap the hole bar at the bottom: strokes, putts, sand shots, fairway. ‹ › change the hole.', 'Tippe unten auf die Lochleiste: Schläge, Putts, Sand Shots, Fairway. ‹ › wechseln das Loch.')}
                  </span>
                </span>
              </li>
              <li>
                <span>
                  <strong>{tr('After the round: check your shots', 'Nach der Runde: Schläge prüfen')}</strong>
                  <span className="muted small">
                    {tr(
                      'The app finds your shots in the GPS track – most accurately when you glance at the phone at your ball. Check them, or keep the round as a scorecard only.',
                      'Die App findet deine Schläge in der GPS-Spur – am genauesten, wenn du am Ball kurz aufs Handy schaust. Prüfe sie, oder behalte die Runde nur als Scorekarte.',
                    )}
                  </span>
                </span>
              </li>
            </ol>
            <button type="button" className="btn-primary" onClick={closeIntro}>
              {tr('Got it', 'Verstanden')}
            </button>
          </section>
        </div>
      )}

      {props.preview && (
        <section className="card play-card" aria-label={tr('Paused course preview', 'Pausierte Platzvorschau')}>
          <span className="eyebrow">{tr('Course preview', 'Platzvorschau')}</span>
          <div className="play-course">{props.preview.courseName}</div>
          <span className="muted small">{tr(`hole ${props.preview.holes[props.preview.currentHole]?.label ?? ''}`, `Loch ${props.preview.holes[props.preview.currentHole]?.label ?? ''}`)}</span>
          <div className="play-actions">
            <button type="button" className="btn-primary" onClick={() => props.onPreview?.(props.preview!)}>
              {tr('Continue preview', 'Vorschau fortsetzen')}
            </button>
            <button type="button" className="btn-secondary" onClick={props.onEndPreview}>
              {tr('Finish', 'Beenden')}
            </button>
          </div>
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
                <button type="button" className="btn-secondary btn-danger" onClick={() => props.onAbort(open)}>
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
              <button type="button" className="btn-secondary btn-danger" onClick={() => props.onAbort(open)}>
                {tr('Delete round instead', 'Runde stattdessen löschen')}
              </button>
            </div>
          )}
          {confirm === 'abort' && (
            <div className="play-confirm">
              <span>{tr('Cancel and delete the round? You can restore it under "Deleted rounds".', 'Runde abbrechen und löschen? Unter „Gelöschte Runden“ kannst du sie wiederherstellen.')}</span>
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

/** The Rounds header – logo with the module, version, language, sun mode – on every tab but the profile, as in Games
 *  and Training (Sascha 15.10.2026: "the same in every module"). */
export function RoundsTopBar(props: { onModules: () => void }) {
  return (
    <div className="topbar">
      <button type="button" className="module-switch" onClick={props.onModules} aria-label={tr('Switch module', 'Modul wechseln')}>
        <span className="brand">
          GOLF<span>OS</span>
        </span>
        <span className="module-tag">Rounds</span>
        <span aria-hidden="true">⇄</span>
      </button>
      <TopTools />
    </div>
  );
}
