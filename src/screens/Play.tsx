import { useEffect, useState } from 'react';
import { goTour } from '../lib/nav';
import type { Round } from '../types';
import { getLang, tr } from '../lib/i18n';
import { loopsText } from '../lib/loops';
import { sharingAvailable, sharingMissing } from '../lib/sharedgame';
import { TopTools } from '../components/TopTools';
import { JoinRoundSheet, PENDING_JOIN } from '../components/ShareRound';
import { roundsToSign } from './Rounds';
import { canRejoin, flightOfName, isSigned, localDay, tournamentOver, tournamentsAhead, type RoundEvent } from '../lib/sharedround';
import { dayText } from '../components/ShareRound';
import { loadProfile, shownName } from '../lib/profile';

// Tab "Play" (Sascha 14.10.2026): start a round, or carry on with, finish or cancel the one in progress.
// "Continue round" only shows while a started round was neither finished nor cancelled.

export function PlayTab(props: {
  rounds: Round[];
  onNewRound: () => void;
  /** Joined a friend's round or a tournament: the phone's own round of it. */
  onJoined: (r: Round) => void;
  /** A game's code typed here: on to Games, which joins it. */
  onJoinGame?: (code: string) => void;
  onContinue: (r: Round) => void;
  onEnd: (r: Round) => void;
  onAbort: (r: Round) => void;
  onSign: () => void;
  onModules: () => void;
  /** a planned tournament joined before its day: Games → Tournaments */
  onTours?: () => void;
  /** A paused course preview: continue or end it. */
  preview?: Round | null;
  onPreview?: (r: Round) => void;
  onEndPreview?: () => void;
}) {
  const open = props.rounds.filter((r) => !r.finishedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const toSign = roundsToSign(props.rounds).length;
  // waiting more than a week: said so – they do not count in the stats until signed (Sascha 22.10.2026)
  const weekOld = roundsToSign(props.rounds).filter((r) => Date.now() - new Date(r.finishedAt ?? r.createdAt).getTime() > 7 * 24 * 3600 * 1000).length;
  const [confirm, setConfirm] = useState<'end' | 'abort' | null>(null);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const played = open ? open.entries[open.players.find((p) => p.isMe)!.id].filter((e) => e.strokes != null || e.pickedUp).length : 0;
  // join a round (code or the QR link #round=CODE)
  const [canShare, setCanShare] = useState<boolean | null>(null); // null: still asking
  const [join, setJoin] = useState<string | null>(() => {
    if (location.hash.startsWith('#round=')) return location.hash.slice(7);
    // back from signing in with Google in the middle of joining: on with that code
    try {
      const p = sessionStorage.getItem(PENDING_JOIN);
      sessionStorage.removeItem(PENDING_JOIN);
      return p;
    } catch {
      return null;
    }
  });
  // joining needs no account (Sascha 30.10.2026): the name is enough – only a server without sharing stops it
  const canJoin = canShare === true || (canShare === false && sharingMissing() === 'signin');
  // a friend's invitation answered while Rounds is open already (03.11.2026)
  useEffect(() => {
    const on = (e: Event) => {
      setJoin(String((e as CustomEvent<string>).detail));
      setTimeout(() => location.hash.startsWith('#round=') && history.replaceState(null, '', location.pathname + location.search), 0);
    };
    window.addEventListener('golfos:join-round', on);
    return () => window.removeEventListener('golfos:join-round', on);
  }, []);
  useEffect(() => {
    sharingAvailable().then(setCanShare);
    if (location.hash.startsWith('#round=')) history.replaceState(null, '', location.pathname + location.search);
  }, []);
  // the planned tournaments of the day (Sascha 01.11.2026: "planned in Games, played in Rounds – on the day from 00:01")
  const [today, setToday] = useState<{ code: string; ev: RoundEvent }[]>([]);
  useEffect(() => {
    if (!canShare) return;
    const look = () => document.visibilityState === 'visible' && void tournamentsAhead().then(setToday);
    look();
    document.addEventListener('visibilitychange', look);
    // the app left open: an expired tournament goes by itself too
    const t = window.setInterval(look, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', look);
      window.clearInterval(t);
    };
  }, [canShare]);
  // over – the own flight or all finished, or long after the last tee time – it goes again (Sascha 02.11.2026)
  // a round of it ended by mistake does not hold it back – its flight opened again by the host, it is offered again (03.11.2026)
  const tournaments = today.filter((t) => t.ev.date === localDay() && !props.rounds.some((r) => r.shared?.code === t.code && !r.finishedAt) && (!tournamentOver(t.ev, shownName(loadProfile())) || canRejoin(t.ev, shownName(loadProfile()))));
  // the ones planned for a later day (Sascha 02.11.2026: "already planned tournaments should show under Rounds")
  const ahead = today.filter((t) => t.ev.date !== localDay());

  return (
    <>
      <RoundsTopBar onModules={props.onModules} />
      <h1 className="tab-title">{tr('Play golf', 'Golf spielen')}</h1>

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
              {/* the action bar as on the scorecard (docs/DESIGN.md, Sascha 03.11.2026) – cancelling red and last – then the one
                  main button */}
              <div className="sc-actions" role="group" aria-label={tr('This round', 'Diese Runde')}>
                <button type="button" className="sc-action" aria-label={tr('Finish round', 'Runde beenden')} onClick={() => setConfirm('end')}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 21V4" />
                    <path d="M5 4h11l-2 4 2 4H5" />
                  </svg>
                  <span>{tr('Finish', 'Beenden')}</span>
                </button>
                <button type="button" className="sc-action danger" aria-label={tr('Cancel round', 'Runde abbrechen')} onClick={() => props.onAbort(open)}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                  </svg>
                  <span>{tr('Cancel', 'Abbrechen')}</span>
                </button>
              </div>
              <button type="button" className="btn-primary" onClick={() => props.onContinue(open)}>
                {tr('Continue round', 'Runde fortsetzen')}
              </button>
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

      {tournaments.map(({ code, ev }) => {
        const f = flightOfName(ev, shownName(loadProfile()));
        // his flight ended (by mistake, or another phone of it) – back in with a tap (07.11.2026)
        const again = !!f?.finishedAt;
        // handed in – every card signed (Sascha 10.11.2026: "a tournament over – does 'Wieder teilnehmen' still make
        // sense?"): its result, no taking part again
        const handedIn = again && !!f && f.players.length > 0 && f.players.every((p) => isSigned(f, p.id));
        return (
          <section key={code} className="card play-card" aria-label={tr(`Tournament ${ev.name}`, `Turnier ${ev.name}`)}>
            <span className="eyebrow">{tr('Tournament today', 'Turnier heute')}</span>
            <div className="play-course">{ev.name}</div>
            <span className="muted small">{[ev.course.name, f ? tr(`your flight${f.teeTime ? ` · ${f.teeTime}` : ''}`, `Dein Flight${f.teeTime ? ` · ${f.teeTime}` : ''}`) : null, again ? tr('ended', 'beendet') : null].filter(Boolean).join(' · ')}</span>
            {again && (
              <button type="button" className="btn-primary" onClick={() => goTour(code)}>
                {tr('See the result', 'Ergebnis ansehen')}
              </button>
            )}
            {/* ended by mistake, the cards not handed in yet: back in */}
            {!handedIn && (
              <button type="button" className={open || again ? 'btn-secondary' : 'btn-primary'} onClick={() => setJoin(code)}>
                {again ? tr('Take part again', 'Wieder teilnehmen') : tr('Take part', 'Teilnehmen')}
              </button>
            )}
          </section>
        );
      })}

      <section className="card play-card">
        <strong className="play-course">{tr('Start a new round', 'Neue Runde starten')}</strong>
        <button type="button" className={open ? 'btn-secondary' : 'btn-primary'} onClick={props.onNewRound}>
          {tr('New round', 'Neue Runde')}
        </button>
        {/* a friend's round or a tournament (Sascha 29.10.2026) – shown once signed in */}
        {canJoin && (
          <button type="button" className="btn-secondary" onClick={() => setJoin('')}>
            {tr("Join a friend's round", 'Runde beitreten')}
          </button>
        )}
      </section>

      {/* the tournaments planned for later days – each with its day, course and the own flight; on its day it is the card
          above with "Teilnehmen" */}
      {ahead.length > 0 && (
        <section className="card play-card" aria-label={tr('Planned tournaments', 'Geplante Turniere')}>
          <span className="eyebrow">{tr('Planned tournaments', 'Geplante Turniere')}</span>
          <ul className="planned-tours">
            {ahead.map(({ code, ev }) => {
              const f = flightOfName(ev, shownName(loadProfile()));
              return (
                <li key={code}>
                  <button type="button" className="planned-tour-open" aria-label={tr(`Open ${ev.name}`, `${ev.name} öffnen`)} onClick={() => goTour(code)}>
                    <span className="grow">
                      <strong>{ev.name}</strong>
                      <span className="muted small">
                        {[dayText(ev.date!), ev.course.name, f ? tr(`your flight${f.teeTime ? ` ${f.teeTime}` : ''}`, `dein Flight${f.teeTime ? ` ${f.teeTime}` : ''}`) : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="muted" aria-hidden="true">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <span className="muted small">{tr('On the day of the tournament: "Take part" here from 00:01.', 'Am Turniertag ab 00:01 hier mit „Teilnehmen“.')}</span>
        </section>
      )}
      {join != null &&
        canShare != null &&
        (canJoin ? (
          <JoinRoundSheet
            key={join}
            initial={join}
            onClose={() => setJoin(null)}
            onJoined={(r) => {
              setJoin(null);
              props.onJoined(r);
            }}
            onTours={
              props.onTours &&
              (() => {
                setJoin(null);
                props.onTours!();
              })
            }
            onGameCode={
              props.onJoinGame &&
              ((c) => {
                setJoin(null);
                props.onJoinGame!(c);
              })
            }
          />
        ) : (
          <div className="sheet-backdrop" onClick={() => setJoin(null)}>
            <section className="sheet" role="dialog" aria-label={tr('Join a round', 'Runde beitreten')} onClick={(e) => e.stopPropagation()}>
              <strong>{tr('Join a round', 'Runde beitreten')}</strong>
              <span className="muted">
                {sharingMissing() === 'server'
                  ? tr('Joining is not set up on the server yet – the host runs the SQL "golfos-shared-games" once in Supabase.', 'Beitreten ist auf dem Server noch nicht eingerichtet – der Gastgeber führt das SQL „golfos-shared-games“ einmal in Supabase aus.')
                  : sharingMissing() === 'offline'
                    ? tr('No connection – open the link again in a moment.', 'Keine Verbindung – den Link gleich noch einmal öffnen.')
                    : tr('Sign in first: Profile → "On all your devices" → "Sign in with Google". Then open the link again.', 'Melde dich zuerst an: Profil → „Auf allen Geräten“ → „Mit Google anmelden“. Dann den Link noch einmal öffnen.')}
              </span>
              <button type="button" className="btn-secondary" onClick={() => setJoin(null)}>
                OK
              </button>
            </section>
          </div>
        ))}

      {toSign > 0 && (
        <button type="button" className="list-item" onClick={props.onSign}>
          <span className="grow">
            <span className="title">{tr('Check & sign your rounds', 'Runden prüfen & signieren')}</span>
            <span className="muted small">
              {toSign === 1 ? tr('1 round to check and sign', '1 Runde zu prüfen und zu signieren') : tr(`${toSign} rounds to check and sign`, `${toSign} Runden zu prüfen und zu signieren`)}
              {weekOld > 0 ? tr(` · ${weekOld === toSign && toSign === 1 ? 'waiting' : `${weekOld} waiting`} over a week – not in your stats yet`, ` · ${weekOld === toSign && toSign === 1 ? 'wartet' : `${weekOld} ${weekOld === 1 ? 'wartet' : 'warten'}`} über eine Woche – noch nicht in deiner Statistik`) : ''}
            </span>
          </span>
          <span className="count-badge">{toSign}</span>
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
