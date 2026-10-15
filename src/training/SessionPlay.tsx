import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { TopBar } from '../components/ui';
import { drillById } from './content';
import { SketchView } from './Sketch';
import { addLog, saveSession, type Session } from './store';
import { CAT_ICON, ResultInput, placeName, scoreText, t } from './ui';

// A practice session in play – built like a round and a game (Sascha 15.10.2026: the same usability in every
// module): the drill bar at the bottom with ‹ ›, the overview pulled up from it, and leaving = pause, finish or
// cancel. The timer counts while the screen is open and not paused; the time per drill is kept.

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function beep(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
    navigator.vibrate?.(200);
  } catch {
    /* no audio – the screen still shows it */
  }
}

export function SessionPlay(props: { session: Session; onPause: () => void; onFinish: (s: Session) => void; onDelete: () => void; onDrill: (id: string) => void }) {
  const [s, setS] = useState<Session>(props.session);
  const [running, setRunning] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [exit, setExit] = useState<null | 'menu' | 'end'>(null);
  const [showSteps, setShowSteps] = useState(true);
  const barTouch = useRef<number | null>(null);
  const beeped = useRef<Set<number>>(new Set());
  const i = s.current;
  const item = s.items[i];
  const d = drillById(item.drill);
  const last = i === s.items.length - 1;

  const store = (next: Session) => {
    setS(next);
    saveSession(next);
  };

  // the timer: one second at a time for the current drill, saved every 5 seconds
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setS((cur) => {
        // while hidden the time away is added at once when the page comes back (no double counting)
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return cur;
        const spent = cur.spent.map((v, k) => (k === cur.current ? v + 1 : v));
        const next = { ...cur, spent };
        if (spent[cur.current] % 5 === 0) saveSession(next);
        if (spent[cur.current] === cur.items[cur.current].minutes * 60 && !beeped.current.has(cur.current)) {
          beeped.current.add(cur.current);
          beep();
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);
  // keep the time when the app goes to the background – and count the time the phone was locked or in the pocket
  // while the drill ran (at most 30 minutes; on the green the phone is usually in the pocket)
  const hiddenAt = useRef<number | null>(null);
  const runningRef = useRef(running);
  runningRef.current = running;
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = runningRef.current ? Date.now() : null;
        setS((cur) => (saveSession(cur), cur));
      } else if (hiddenAt.current != null) {
        const away = Math.min(1800, Math.round((Date.now() - hiddenAt.current) / 1000));
        hiddenAt.current = null;
        if (away > 1) setS((cur) => {
          const next = { ...cur, spent: cur.spent.map((v, k) => (k === cur.current ? v + away : v)) };
          saveSession(next);
          return next;
        });
      }
    };
    const save = () => setS((cur) => (saveSession(cur), cur));
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', save);
    };
  }, []);
  // keep the screen on while the timer runs (the phone lies on the bag at the range)
  useEffect(() => {
    if (!running) return;
    type Sentinel = { release: () => Promise<void> };
    const api = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
    let lock: Sentinel | null = null;
    let alive = true;
    const take = async () => {
      try {
        const l = await api?.request('screen');
        if (!l) return;
        if (!alive) return void l.release();
        lock = l;
      } catch {
        /* not supported or not allowed – the timer still counts the time away */
      }
    };
    void take();
    const onVisible = () => document.visibilityState === 'visible' && void take();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, [running]);

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
  const goal = item.minutes * 60;
  const spent = s.spent[i] ?? 0;
  const over = spent >= goal;
  const total = s.spent.reduce((a, b) => a + b, 0);
  const scored = d.scoring && d.scoring.kind !== 'none';

  return (
    <main className="screen game-play training tr-session">
      <TopBar
        title={
          <>
            {s.name}
            <span className="muted small game-hole-meta"> · {mmss(total)}</span>
          </>
        }
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
        <div className={`tr-timer${over ? ' over' : ''}`} aria-live="off">
          <span className="tr-timer-time">{mmss(spent)}</span>
          <span className="muted small">/ {item.minutes}:00</span>
          <button type="button" className="chip" onClick={() => setRunning(!running)} aria-pressed={!running}>
            {running ? tr('⏸ Hold', '⏸ Anhalten') : tr('▶ Go on', '▶ Weiter')}
          </button>
        </div>
        <div className="progress" aria-hidden="true">
          <div style={{ width: `${Math.min(100, (spent / goal) * 100)}%`, background: over ? 'var(--warn)' : undefined }} />
        </div>
        {over && <span className="warn-text small">{tr('Time is up – finish the drill or carry on.', 'Zeit ist um – Übung abschließen oder weitermachen.')}</span>}
        <p className="tr-goal">{t(d.goal)}</p>
      </section>
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
        <button type="button" className="btn-ghost" onClick={() => props.onDrill(d.id)}>
          {tr('Everything about this drill ›', 'Alles zu dieser Übung ›')}
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
          <button type="button" className="hole-bar-arrow" aria-label={last ? tr('Finish session', 'Einheit beenden') : tr('Next drill', 'Nächste Übung')} onClick={() => (last ? setExit('end') : go(i + 1))}>
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
                        {' '}
                        · {mmss(s.spent[k] ?? 0)} / {x.minutes}:00
                        {x.done && dk ? ` · ${scoreText(dk.scoring, x.value ?? null)}` : ''}
                      </span>
                    </span>
                    <span aria-hidden="true">{x.done ? '✓' : k === i ? '●' : '›'}</span>
                  </button>
                );
              })}
            </div>
            <div className="drawer-actions">
              <button type="button" className="drawer-action" onClick={() => setRunning(!running)}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l3 2" />
                </svg>
                <span>{running ? tr('Hold timer', 'Timer anhalten') : tr('Timer on', 'Timer weiter')}</span>
              </button>
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
      {exit && (
        <div className="sheet-backdrop" onClick={() => setExit(null)}>
          <section className="sheet" role="dialog" aria-label={tr('Leave the session', 'Einheit verlassen')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{exit === 'end' ? tr('Finish session?', 'Einheit beenden?') : s.name}</strong>
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
                <span className="muted">
                  {tr(`${s.items.filter((x) => x.done).length} of ${s.items.length} drills done, ${mmss(total)} practised.`, `${s.items.filter((x) => x.done).length} von ${s.items.length} Übungen erledigt, ${mmss(total)} geübt.`)}
                </span>
                <div className="sheet-actions">
                  <button type="button" className="btn-primary" onClick={finish}>
                    {tr('Finish & see results', 'Beenden & Ergebnis ansehen')}
                  </button>
                  <button type="button" className="btn-secondary btn-danger" onClick={props.onDelete}>
                    {tr('Delete session', 'Einheit löschen')}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setExit(null)}>
                    {tr('Back to the session', 'Zurück zur Einheit')}
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
