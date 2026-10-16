import { useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { TopBar } from '../components/ui';
import { drillById } from './content';
import { SketchView } from './Sketch';
import { Metronome } from './Metronome';
import { addLog, saveSession, type Session } from './store';
import { CAT_ICON, ResultInput, placeName, scoreText, t } from './ui';

// A practice session in play – built like a round and a game (Sascha 15.10.2026: the same usability in every
// module): the drill bar at the bottom with ‹ ›, the overview pulled up from it, and leaving = pause, finish or
// cancel. No timer (Sascha 16.10.2026: not needed) – the minutes of a plan are only a guide.

export function SessionPlay(props: { session: Session; onPause: () => void; onFinish: (s: Session) => void; onDelete: () => void; onDrill: (id: string) => void }) {
  const [s, setS] = useState<Session>(props.session);
  const [drawer, setDrawer] = useState(false);
  const [exit, setExit] = useState<null | 'menu' | 'end'>(null);
  // like "→" without a score on a hole: the result sheet first (Rounds is the base – night run 16./17.10.2026)
  const [resultSheet, setResultSheet] = useState(false);
  const [showSteps, setShowSteps] = useState(true);
  const barTouch = useRef<number | null>(null);
  const i = s.current;
  const item = s.items[i];
  const d = drillById(item.drill);
  const last = i === s.items.length - 1;

  const store = (next: Session) => {
    setS(next);
    saveSession(next);
  };

  const go = (k: number) => {
    if (k < 0 || k >= s.items.length) return;
    store({ ...s, current: k });
    setShowSteps(true);
    window.scrollTo(0, 0);
  };
  const setValue = (v: number | null) => store({ ...s, items: s.items.map((x, k) => (k === i ? { ...x, value: v } : x)) });
  const complete = () => {
    const items = s.items.map((x, k) => (k === i ? { ...x, done: true } : x));
    const next = { ...s, items };
    if (d && !item.done) addLog({ drill: d.id, value: d.scoring && d.scoring.kind !== 'none' ? (item.value ?? null) : null, session: s.id });
    if (last) {
      store(next);
      setExit('end');
    } else {
      store({ ...next, current: i + 1 });
      setShowSteps(true);
      window.scrollTo(0, 0);
    }
  };
  const finish = () => {
    const done = { ...s, finishedAt: new Date().toISOString() };
    saveSession(done);
    props.onFinish(done);
  };

  if (!d) return null;
  const scored = d.scoring && d.scoring.kind !== 'none';
  const doneCount = s.items.filter((x) => x.done).length;

  return (
    <main className="screen game-play training tr-session">
      <TopBar
        title={s.name}
        onBack={() => setExit('menu')}
        backLabel={tr('Leave', 'Verlassen')}
      />
      <section className="card tr-now">
        <div className="tr-now-head">
          <span className="tr-cat-icon">{CAT_ICON[d.cat]}</span>
          <span className="grow">
            <span className="eyebrow">
              {tr(`Drill ${i + 1} of ${s.items.length}`, `Übung ${i + 1} von ${s.items.length}`)} · {placeName(d.place)}
            </span>
            <strong className="tr-now-name">{t(d.name)}</strong>
          </span>
        </div>
        <p className="tr-goal">{t(d.goal)}</p>
      </section>
      {d.metronome && <Metronome key={d.id} compact mode={d.metronome} />}
      {d.sketch && <SketchView sketch={d.sketch} label={t(d.name)} />}
      <section className="card tr-section">
        <button type="button" className="tr-coll-head" aria-expanded={showSteps} onClick={() => setShowSteps(!showSteps)}>
          <strong className="grow">{tr('Set-up and steps', 'Aufbau und Ablauf')}</strong>
          <span aria-hidden="true">{showSteps ? '▾' : '▸'}</span>
        </button>
        {showSteps && (
          <>
            <p>{t(d.setup)}</p>
            <ol className="tr-steps">
              {d.steps.map((st, k) => (
                <li key={k}>{t(st)}</li>
              ))}
            </ol>
          </>
        )}
        <button type="button" className="btn-secondary" onClick={() => props.onDrill(d.id)}>
          {tr('Everything about this drill', 'Alles zu dieser Übung')}
        </button>
      </section>
      <section className="card tr-section tr-log">
        <h2>{scored ? tr('Your result', 'Dein Ergebnis') : tr('Done?', 'Erledigt?')}</h2>
        <ResultInput drill={d} value={item.value ?? null} onChange={setValue} />
        <button type="button" className="btn-primary" onClick={complete}>
          {last ? tr('Done – finish session', 'Fertig – Einheit beenden') : tr('Done – next drill', 'Fertig – nächste Übung')}
        </button>
      </section>

      <span className="spacer" />
      <div
        className="game-dock"
        onTouchStart={(e) => (barTouch.current = e.touches[0].clientY)}
        onTouchEnd={(e) => {
          if (barTouch.current != null && barTouch.current - e.changedTouches[0].clientY > 40) setDrawer(true);
          barTouch.current = null;
        }}
      >
        <div className="hole-bar">
          <button type="button" className="hole-bar-handle" aria-label={tr('Open the overview', 'Übersicht öffnen')} onClick={() => setDrawer(true)}>
            <span />
          </button>
          <button type="button" className="hole-bar-arrow" aria-label={tr('Previous drill', 'Vorige Übung')} onClick={() => go(i - 1)} disabled={i === 0}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button type="button" className="map-score" aria-label={tr('Open the overview', 'Übersicht öffnen')} onClick={() => setDrawer(true)}>
            <span className="map-hole-no">{i + 1}</span>
            <span className="hole-bar-par tr-bar-name">
              <span>{t(d.name)}</span>
              <span>
                {s.items.filter((x) => x.done).length}/{s.items.length} {tr('done', 'erledigt')}
              </span>
            </span>
          </button>
          <button type="button" className="hole-bar-arrow" aria-label={last ? tr('Finish session', 'Einheit beenden') : tr('Next drill', 'Nächste Übung')} onClick={() => (!item.done ? setResultSheet(true) : last ? setExit('end') : go(i + 1))}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {drawer && (
        <div className="sheet-backdrop" onClick={() => setDrawer(false)}>
          <section className="sheet hole-drawer" role="dialog" aria-label={tr('Session overview', 'Übersicht der Einheit')} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="drawer-handle" aria-label={tr('Close the overview', 'Übersicht schließen')} onClick={() => setDrawer(false)}>
              <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden="true">
                <path d="M6 3l16 8 16-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="drawer-list">
              {s.items.map((x, k) => {
                const dk = drillById(x.drill);
                return (
                  <button
                    key={k}
                    type="button"
                    className="drawer-row"
                    aria-current={k === i ? 'true' : undefined}
                    onClick={() => {
                      go(k);
                      setDrawer(false);
                    }}
                  >
                    <span>
                      {k + 1}. {dk ? t(dk.name) : x.drill}
                      <span className="muted small">
                        {x.done && dk ? ` · ${scoreText(dk.scoring, x.value ?? null)}` : ''}
                      </span>
                    </span>
                    <span aria-hidden="true">{x.done ? '✓' : k === i ? '●' : '›'}</span>
                  </button>
                );
              })}
            </div>
            <div className="drawer-actions">
              <button
                type="button"
                className="drawer-action"
                onClick={() => {
                  saveSession(s);
                  props.onPause();
                }}
                aria-label={tr('Pause session – continue later', 'Einheit pausieren – später fortsetzen')}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16" rx="1.2" />
                  <rect x="14" y="4" width="4" height="16" rx="1.2" />
                </svg>
                <span>{tr('Pause', 'Pausieren')}</span>
              </button>
              <button
                type="button"
                className="drawer-action end"
                onClick={() => {
                  setDrawer(false);
                  setExit('end');
                }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
                <span>{tr('Finish', 'Beenden')}</span>
              </button>
            </div>
          </section>
        </div>
      )}
      {resultSheet && (
        <div className="sheet-backdrop" onClick={() => setResultSheet(false)}>
          <section className="sheet" role="dialog" aria-label={tr('Your result', 'Dein Ergebnis')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{t(d.name)}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setResultSheet(false)}>
                ✕
              </button>
            </div>
            {scored && <ResultInput drill={d} value={item.value ?? null} onChange={setValue} />}
            <div className="sheet-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setResultSheet(false);
                  complete();
                }}
              >
                {last ? tr('Done – finish session', 'Fertig – Einheit beenden') : tr('Done – next drill', 'Fertig – nächste Übung')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setResultSheet(false);
                  if (last) setExit('end');
                  else go(i + 1);
                }}
              >
                {last ? tr('Finish without it', 'Ohne Ergebnis beenden') : tr('Skip – next drill', 'Überspringen – nächste Übung')}
              </button>
            </div>
          </section>
        </div>
      )}
      {exit && (
        <div className="sheet-backdrop" onClick={() => setExit(null)}>
          <section className="sheet" role="dialog" aria-label={tr('Leave the session', 'Einheit verlassen')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{s.name}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setExit(null)}>
                ✕
              </button>
            </div>
            {exit === 'menu' ? (
              <div className="sheet-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    saveSession(s);
                    props.onPause();
                  }}
                >
                  {tr('Pause – continue later', 'Pausieren – später fortsetzen')}
                </button>
                <button type="button" className="btn-primary" onClick={() => setExit('end')}>
                  {tr('Finish session', 'Einheit beenden')}
                </button>
                <button type="button" className="btn-secondary btn-danger" onClick={props.onDelete}>
                  {tr('Cancel session', 'Einheit abbrechen')}
                </button>
              </div>
            ) : (
              <>
                <span>
                  {doneCount < s.items.length
                    ? tr(
                        `Finish now? ${doneCount} of ${s.items.length} drills are done – they are saved, the others stay open.`,
                        `Jetzt beenden? ${doneCount} von ${s.items.length} Übungen sind erledigt – sie werden gespeichert, die anderen bleiben offen.`,
                      )
                    : tr('Finish and save the session?', 'Einheit beenden und speichern?')}
                </span>
                <div className="sheet-actions">
                  <button type="button" className="btn-primary" onClick={finish}>
                    {tr('Save & finish', 'Speichern & beenden')}
                  </button>
                  <button type="button" className="btn-secondary btn-danger" onClick={props.onDelete}>
                    {tr('Delete session', 'Einheit löschen')}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setExit(null)}>
                    {tr('Back', 'Zurück')}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
