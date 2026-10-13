import { useRef, useState } from 'react';
import type { Round } from '../types';
import { playerTotals } from '../lib/scoring';
import { Attribution, formatToPar } from '../components/ui';
import { restoreBackup, shareBackup } from '../lib/backup';
import { carryToReview } from '../lib/stats';
import { loadCarryBag } from '../lib/storage';
import { dec, getLang, setLang, tr } from '../lib/i18n';
import { roundPoints, sgTrends, trendChange } from '../lib/history';
import { SG_LABELS } from '../lib/sg';
import { loopsText } from '../lib/loops';
import { isSun, setSun } from '../lib/theme';

const INTRO_KEY = 'golfos.intro.v1';

export function Home(props: {
  rounds: Round[];
  onNewRound: () => void;
  onContinue: (r: Round) => void;
  onOpen: (r: Round) => void;
  onStats: () => void;
  onBag: () => void;
  onChanged: () => void;
}) {
  const open = props.rounds.find((r) => !r.finishedAt);
  const fileInput = useRef<HTMLInputElement>(null);
  const review = carryToReview(props.rounds, loadCarryBag()).length;
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [sun, setSunState] = useState(isSun);
  // newest first; the start page shows the last five
  const finished = props.rounds.filter((r) => r.finishedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [allRounds, setAllRounds] = useState(false);
  const shown = allRounds ? finished : finished.slice(0, 5);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  // First start: three steps that say what the app does (closed once, then gone).
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

  return (
    <main className="screen">
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
        <button
          type="button"
          className="lang-btn"
          aria-label={tr('Sprache: Deutsch', 'Language: English')}
          onClick={() => setLang(getLang() === 'de' ? 'en' : 'de')}
        >
          {getLang() === 'de' ? 'EN' : 'DE'}
        </button>
      </div>

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
          </ol>
          <button type="button" className="btn-secondary" onClick={closeIntro}>
            {tr('Got it', 'Verstanden')}
          </button>
        </section>
      )}

      {open && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="eyebrow">{tr('Round in progress', 'Laufende Runde')}</span>
          <div style={{ font: '600 19px var(--display)' }}>{open.courseName}</div>
          <span className="muted">
            {[loopsText(open.loopOrder), tr(`hole ${open.currentHole + 1} of ${open.holes.length}`, `Loch ${open.currentHole + 1} von ${open.holes.length}`)].filter(Boolean).join(' · ')}
          </span>
          <button type="button" className="btn-primary" onClick={() => props.onContinue(open)}>
            {tr('Continue round', 'Runde fortsetzen')}
          </button>
        </section>
      )}

      <button type="button" className={open ? 'btn-secondary' : 'btn-primary'} onClick={props.onNewRound}>
        {tr('New round', 'Neue Runde')}
      </button>

      <div className="nav-bottom" style={{ gridTemplateColumns: finished.length > 0 ? '1fr 1fr' : '1fr' }}>
        {finished.length > 0 && (
          <button type="button" className="btn-secondary" onClick={props.onStats}>
            {tr('Your stats', 'Deine Statistik')}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={props.onBag}>
          {tr('My bag & caddie', 'Mein Bag & Caddie')}
          {review > 0 && (
            <span className="badge-dot" aria-label={tr(`${review} new measured distances`, `${review} neue gemessene Weiten`)}>
              {tr(`${review} new`, `${review} neu`)}
            </span>
          )}
        </button>
      </div>

      {finished.length > 0 && (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <HomeTrend rounds={finished} onOpen={props.onStats} />
        <h2>{tr('Your rounds', 'Deine Runden')}</h2>
        <ul className="list">
          {shown.map((r) => {
            const me = r.players.find((p) => p.isMe)!;
            const t = playerTotals(r.holes, r.entries[me.id], me.playingHandicap);
            return (
              <li key={r.id}>
                <button type="button" className="list-item" onClick={() => props.onOpen(r)}>
                  <span className="grow">
                    <span className="title">{r.courseName}</span>
                    <span className="muted small">
                      {[new Date(r.createdAt).toLocaleDateString(locale), loopsText(r.loopOrder), `${r.holes.length} ${tr('holes', 'Löcher')}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{ font: '700 20px var(--display)' }}>{t.gross}</span>
                    <span className="muted small" style={{ display: 'block' }}>
                      {formatToPar(t.toPar)}
                      {t.stableford != null ? ` · ${t.stableford} ${tr('pts', 'Pkt.')}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {finished.length > 5 && (
          <button type="button" className="btn-ghost" onClick={() => setAllRounds(!allRounds)}>
            {allRounds ? tr('Show fewer', 'Weniger anzeigen') : tr(`All rounds (${finished.length})`, `Alle Runden (${finished.length})`)}
          </button>
        )}
      </section>
      )}
      {/* Backup: full block once there are rounds to keep; before that only "restore" for a new phone. */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }} hidden={finished.length === 0}>
        <h2>{tr('Backup', 'Sicherung')}</h2>
        <p className="muted small" style={{ margin: 0 }}>
          {tr(
            'Your rounds live only on this phone. Safari and the home-screen app keep separate data – use a backup to move or save it.',
            'Deine Runden liegen nur auf diesem Handy. Safari und die App auf dem Home-Bildschirm speichern getrennt – mit einer Sicherung kannst du sie übertragen oder aufbewahren.',
          )}
        </p>
        <div className="nav-bottom" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button type="button" className="btn-secondary" onClick={() => shareBackup().catch(() => setBackupMsg(tr('Backup cancelled.', 'Sicherung abgebrochen.')))}>
            {tr('Save backup', 'Sichern')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()}>
            {tr('Restore backup', 'Wiederherstellen')}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              let data: unknown;
              try {
                data = JSON.parse(await file.text());
              } catch {
                throw new Error(tr('This file is not a GolfOS backup.', 'Diese Datei ist keine GolfOS-Sicherung.'));
              }
              const { rounds } = restoreBackup(data as Parameters<typeof restoreBackup>[0]);
              setBackupMsg(
                tr(`Backup restored · ${rounds} ${rounds === 1 ? 'round' : 'rounds'} added.`, `Sicherung wiederhergestellt · ${rounds} ${rounds === 1 ? 'Runde' : 'Runden'} hinzugefügt.`),
              );
              props.onChanged();
            } catch (err) {
              setBackupMsg(err instanceof Error ? err.message : tr('This file could not be read.', 'Diese Datei konnte nicht gelesen werden.'));
            }
          }}
        />
        {backupMsg && <p className="small" style={{ margin: 0 }}>{backupMsg}</p>}
      </section>
      {finished.length === 0 && (
        <button type="button" className="btn-ghost" onClick={() => fileInput.current?.click()}>
          {tr('New phone? Restore a backup', 'Neues Handy? Sicherung wiederherstellen')}
        </button>
      )}
      {finished.length === 0 && backupMsg && <p className="small" style={{ margin: 0 }}>{backupMsg}</p>}

      <span className="spacer" />
      <div className="home-foot">
        <Attribution />
        <span className="muted small" title={__BUILD_TIME__}>
          Version {new Date(__BUILD_TIME__).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </main>
  );
}

/** One line on the start page: where the player's game is heading (from 3 finished rounds), tap for the stats. */
function HomeTrend(props: { rounds: Round[]; onOpen: () => void }) {
  const pts = roundPoints(props.rounds.slice(0, 10));
  const t = trendChange(pts.map((p) => p.toPar18));
  if (!t) return null;
  const sg = sgTrends(pts);
  const better = t.change <= -0.5;
  const worse = t.change >= 0.5;
  const amount = dec(Math.abs(t.change).toFixed(1));
  return (
    <button type="button" className="home-trend" onClick={props.onOpen}>
      <span className={better ? 'good-text' : worse ? 'bad-text' : undefined}>
        {better ? '↗ ' : worse ? '↘ ' : '→ '}
        {better
          ? tr(`${amount} strokes better per round over ${t.rounds} rounds`, `${amount} Schläge besser je Runde über ${t.rounds} Runden`)
          : worse
            ? tr(`${amount} strokes worse per round over ${t.rounds} rounds`, `${amount} Schläge schlechter je Runde über ${t.rounds} Runden`)
            : tr(`Steady over ${t.rounds} rounds`, `Gleichbleibend über ${t.rounds} Runden`)}
      </span>
      {sg.better && (
        <span className="muted small">
          {tr('Improved most: ', 'Am meisten verbessert: ')}
          {SG_LABELS[sg.better.c]} ({dec(`+${sg.better.change.toFixed(1)}`)})
        </span>
      )}
    </button>
  );
}
