import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { speak, stopSpeaking } from '../lib/caddietalk';
import { TopBar } from '../components/ui';
import { WARMUP_CLIPS } from './anim3d/warmup';
import { beep, fakeSpeed, unlockAudio } from './CameraTest';
import type { Warmup } from './rangewarmup';
import type { Area } from './types';

const Anim3D = lazy(() => import('./Anim3D'));
const Swing3D = lazy(() => import('../training/anim3d/Swing3D'));
const t = (x: { en: string; de: string }) => tr(x.en, x.de);

// The range warm-up as a guided run (31.10.2026): the figure shows each move, the app says it, the clock runs and
// goes on by itself – no camera, the phone can stay in the hand or lie on the bag. Pause bottom right, skip bottom
// left, as in the guided training.

const AREA_SHORT: Record<Area, { en: string; de: string }> = {
  hips: { en: 'hips', de: 'Hüfte' },
  spine: { en: 'trunk', de: 'Rumpf' },
  shoulders: { en: 'shoulders', de: 'Schultern' },
  stability: { en: 'balance', de: 'Stabilität' },
  legs: { en: 'legs', de: 'Beine' },
  neck: { en: 'neck', de: 'Nacken' },
  wrists: { en: 'wrists', de: 'Handgelenke' },
};

/** "for hips, trunk and shoulders" – the areas the warm-up is made for */
export function warmupFor(areas: Area[]): string {
  const names = areas.slice(0, 3).map((a) => t(AREA_SHORT[a]));
  if (!names.length) return tr('for the whole body', 'für den ganzen Körper');
  const and = tr(' and ', ' und ');
  return tr('for ', 'für ') + (names.length > 1 ? names.slice(0, -1).join(', ') + and + names[names.length - 1] : names[0]);
}

export const warmupMinutes = (w: Warmup) => Math.round(w.seconds / 60);

export function RangeWarmup(props: { warmup: Warmup; onClose: () => void }) {
  const moves = props.warmup.moves;
  const [stage, setStage] = useState<'setup' | 'run' | 'hold' | 'done'>('setup');
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(moves[0]?.seconds ?? 0);
  const tick = useRef<{ last: number; left: number; said: Set<string> }>({ last: 0, left: 0, said: new Set() });

  // the screen stays on while the warm-up runs
  useEffect(() => {
    if (stage !== 'run') return;
    let wake: { release: () => Promise<void> } | null = null;
    let off = false;
    (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request('screen')
      .then((w) => (off ? void w.release() : (wake = w)))
      .catch(() => {});
    return () => {
      off = true;
      void wake?.release();
    };
  }, [stage]);

  // the clock of the move in play
  useEffect(() => {
    if (stage !== 'run') return;
    const m = moves[i];
    tick.current.last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const cur = tick.current;
      // (the tests run the clock faster: golfos.mobility.fakeSpeed)
      cur.left = Math.max(0, cur.left - ((now - cur.last) / 1000) * fakeSpeed());
      cur.last = now;
      setLeft(cur.left);
      const once = (key: string, text: string) => {
        if (cur.said.has(key)) return;
        cur.said.add(key);
        speak(text);
      };
      if (m.sides && cur.left <= m.seconds / 2 && cur.left > m.seconds / 2 - 1) {
        beep(660);
        once('side', tr('Other side.', 'Andere Seite.'));
      }
      if (m.seconds >= 30 && cur.left <= 10 && cur.left > 9) once('ten', tr('Ten more seconds.', 'Noch zehn Sekunden.'));
      if (cur.left <= 0) {
        window.clearInterval(id);
        beep(880);
        goTo(i + 1);
      }
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, i]);

  const announce = (k: number) => {
    const m = moves[k];
    const lead = k === moves.length - 1 ? tr('Last one: ', 'Zum Schluss: ') : '';
    speak(`${lead}${t(m.name)}. ${m.steps.map((s) => t(s)).join(' ')}`);
  };
  const goTo = (k: number) => {
    if (k >= moves.length) {
      setStage('done');
      speak(tr('Warmed up. Have a good round – start with an easy club.', 'Aufgewärmt. Viel Spaß – fang mit einem leichten Schläger an.'));
      return;
    }
    tick.current = { last: performance.now(), left: moves[k].seconds, said: new Set() };
    setLeft(moves[k].seconds);
    setI(k);
    setStage('run');
    announce(k);
  };
  const start = () => {
    unlockAudio();
    goTo(0);
  };
  const close = () => {
    stopSpeaking();
    props.onClose();
  };

  const m = moves[Math.min(i, moves.length - 1)];
  const clip = WARMUP_CLIPS[m.id];
  if (stage === 'run' || stage === 'hold')
    return (
      <main className="screen mobility mob-run-camera mob-warmup-run">
        <section className="mob-camera coach mob-warmup-player">
          <div className="mob-warmup-stage">
            <Suspense fallback={<div className="mob-3d-wait" />}>{m.swing ? <Swing3D key={m.id} swing={m.swing} /> : clip ? <Anim3D key={m.id} clip={clip} compact /> : null}</Suspense>
          </div>
          <div className="mob-warmup-info">
            <span className="muted small">{tr(`Move ${i + 1} of ${moves.length}`, `Übung ${i + 1} von ${moves.length}`)}</span>
            <strong className="mob-warmup-name">{t(m.name)}</strong>
            <ol className="mob-warmup-steps small">
              {m.steps.map((s, j) => (
                <li key={j}>{t(s)}</li>
              ))}
            </ol>
            <span className="mob-live-value mob-warmup-clock" aria-live="off">
              {Math.ceil(left)} s
            </span>
            <span className="mob-hold" aria-hidden="true">
              <i style={{ width: `${Math.round((1 - left / m.seconds) * 100)}%` }} />
            </span>
            {stage === 'hold' && (
              <div className="mob-warmup-hold">
                <strong>{tr('Paused', 'Pausiert')}</strong>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    tick.current.last = performance.now();
                    setStage('run');
                  }}
                >
                  {tr('Continue', 'Weiter')}
                </button>
                <button type="button" className="btn-secondary" onClick={close}>
                  {tr('End warm-up', 'Warmup beenden')}
                </button>
              </div>
            )}
          </div>
          {stage === 'run' && (
            <div className="mob-camera-actions">
              <button type="button" className="btn-secondary" onClick={() => goTo(i + 1)}>
                {tr('Skip', 'Überspringen')}
              </button>
              <button
                type="button"
                className="btn-secondary mob-coach-pause"
                onClick={() => {
                  stopSpeaking();
                  setStage('hold');
                }}
              >
                {tr('Pause', 'Pause')}
              </button>
            </div>
          )}
        </section>
      </main>
    );

  return (
    <main className="screen game-play training mobility tr-session mob-warmup">
      <TopBar title={tr('Range warm-up', 'Range-Warmup')} onBack={close} backLabel={tr('Back', 'Zurück')} />
      {stage === 'setup' ? (
        <section className="tr-block mob-setup">
          <h2>{tr(`About ${warmupMinutes(props.warmup)} min ${warmupFor(props.warmup.areas)}`, `Etwa ${warmupMinutes(props.warmup)} Min. ${warmupFor(props.warmup.areas)}`)}</h2>
          <p className="muted small">
            {tr(
              'Before the first ball: the moves for where your screening showed the biggest gap, then swings from half to full. A club is all you need. The app says every step and goes on by itself – the phone can stay in your hand or on the bag.',
              'Vor dem ersten Ball: die Übungen für die Bereiche, in denen dein Screening den größten Abstand zeigt, dann Schwünge von halb bis voll. Du brauchst nur einen Schläger. Die App sagt jeden Schritt an und macht von selbst weiter – das Handy kann in der Hand bleiben oder auf dem Bag liegen.',
            )}
          </p>
          <div className="list mob-train-list" aria-label={tr('The moves', 'Die Übungen')}>
            {moves.map((x, k) => (
              <div key={x.id} className="list-item mob-test-row">
                <span className="mob-warmup-num" aria-hidden="true">
                  {k + 1}
                </span>
                <span className="grow">
                  <span className="title">{t(x.name)}</span>
                  <span className="muted small">
                    {x.seconds} s{x.sides ? tr(' · both sides', ' · beide Seiten') : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <button type="button" className="btn-primary mob-warmup-start" onClick={start}>
            {tr('Start', 'Start')}
          </button>
        </section>
      ) : (
        <section className="tr-block mob-warmup-done">
          <section className="card">
            <strong>{tr('Warmed up', 'Aufgewärmt')}</strong>
            <span className="muted small">{tr(`${moves.length} moves, about ${warmupMinutes(props.warmup)} min ${warmupFor(props.warmup.areas)}.`, `${moves.length} Übungen, etwa ${warmupMinutes(props.warmup)} Min. ${warmupFor(props.warmup.areas)}.`)}</span>
            <span className="small">{tr('Start with a few easy shots with a short iron.', 'Fang mit ein paar lockeren Schlägen mit einem kurzen Eisen an.')}</span>
          </section>
          <button type="button" className="btn-primary" onClick={close}>
            {tr('Done', 'Fertig')}
          </button>
        </section>
      )}
    </main>
  );
}
