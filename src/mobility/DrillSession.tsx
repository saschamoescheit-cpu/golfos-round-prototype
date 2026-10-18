import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { speak } from '../lib/caddietalk';
import { TopBar } from '../components/ui';
import { drillById } from '../training/content';
import { SketchThumb } from '../training/Sketch';
import type { Drill } from '../training/types';
import { DRILL_CLIPS } from './anim3d/drills';
import { isFakeCamera, unlockAudio } from './CameraTest';
import { coachOf, SELF_NAMED, SIGNALS, signalValueText } from './drillcoach';
import { DrillPlayer, cueText } from './DrillPlayer';
import type { FormCue } from './drillcoach';
import { PhoneSetup } from './pictures';
import { loadPose } from './pose';
import { bestOf, daysThisWeek, drillHistory, saveSession, type DrillDone, type TrainSession } from './sessions';

const t = (x: { en: string; de: string }) => tr(x.en, x.de);

/** the drill's picture as a thumbnail (its sketch, or the first frame of its 3D video is too heavy for a list) */
function DrillThumb(props: { d: Drill }) {
  return props.d.sketch ? <SketchThumb sketch={props.d.sketch} /> : <span className="tr-thumb" />;
}

/** what a drill did, in a line: reps or holds per side */
export function doneText(d: DrillDone): string {
  if (d.skipped) return tr('skipped', 'übersprungen');
  const holds = d.sets.filter((s) => s.held != null);
  if (holds.length) return tr(`${holds.length} × held, up to ${Math.max(...holds.map((s) => s.held ?? 0))} s`, `${holds.length} × gehalten, bis ${String(Math.max(...holds.map((s) => s.held ?? 0))).replace('.', ',')} s`);
  const reps = d.sets.reduce((n, s) => n + s.reps, 0);
  const target = d.sets.reduce((n, s) => n + s.target, 0);
  return tr(`${reps} of ${target} reps`, `${reps} von ${target} Wiederholungen`);
}

/**
 * The guided home session of the mobility pillar (Sascha 18.10.2026): set the phone up once, tap Start once – the app
 * leads through the drills of the day, counts and measures, and goes on by itself; at the end what was done and how
 * far each measured movement went, against the last time.
 */
export function DrillSession(props: { session: TrainSession; onPause: () => void; onFinished: () => void }) {
  const [s, setS] = useState<TrainSession>(props.session);
  const drills = s.drills.map(drillById).filter((d): d is Drill => !!d);
  const firstOpen = () => Math.max(0, drills.findIndex((d) => !s.done.some((x) => x.drill === d.id)));
  const [k, setK] = useState(firstOpen);
  const [stage, setStage] = useState<'setup' | 'drill' | 'hold' | 'summary'>(s.finishedAt ? 'summary' : 'setup');
  const [exit, setExit] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const stopStream = () => {
    streamRef.current?.getTracks().forEach((x) => x.stop());
    streamRef.current = null;
  };
  useEffect(() => stopStream, []);
  // the values of the last time, read once when the session starts (before this session adds its own)
  const [previous] = useState(() => Object.fromEntries(s.drills.map((id) => [id, drillHistory(id, coachOf(id).signal ? SIGNALS[coachOf(id).signal!].better : 'up').filter((x) => !s.done.some((d) => d.at === x.at)).at(-1)?.value ?? null])));

  const store = (next: TrainSession) => {
    setS(next);
    saveSession(next);
  };
  const finish = (cur: TrainSession) => {
    stopStream();
    // nothing done yet: nothing to keep (no empty session in the history)
    if (!cur.done.length) return props.onFinished();
    const done = { ...cur, finishedAt: new Date().toISOString() };
    store(done);
    speak(tr('Training done.', 'Training fertig.'));
    setStage('summary');
    window.scrollTo(0, 0);
  };
  const next = (cur: TrainSession) => {
    const i = drills.findIndex((d, j) => j > k && !cur.done.some((x) => x.drill === d.id));
    if (i >= 0) {
      setK(i);
      setStage('drill');
    } else finish(cur);
  };
  const start = () => {
    unlockAudio();
    if (streamRef.current?.active) return setStage('drill');
    if (!isFakeCamera() && navigator.mediaDevices?.getUserMedia)
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false })
        .then((st) => {
          streamRef.current = st;
          setStage('drill');
        })
        .catch(() => setStage('drill'));
    else setStage('drill');
  };
  const record = (d: DrillDone) => {
    const cur = { ...s, done: [...s.done.filter((x) => x.drill !== d.drill), d] };
    store(cur);
    next(cur);
  };
  const skip = () => record({ drill: drills[k].id, sets: [], skipped: true, at: new Date().toISOString() });

  const d = drills[Math.min(k, drills.length - 1)];
  const intro = drills.length > 1 ? tr(`Drill ${k + 1} of ${drills.length}: ${t(d.name)}`, `Übung ${k + 1} von ${drills.length}: ${t(d.name)}`) : t(d.name);

  if (stage === 'drill' && d)
    return (
      <main className="screen mobility mob-run-camera">
        <DrillPlayer key={d.id} drill={d} plan={coachOf(d.id)} clip={DRILL_CLIPS[d.id]} stream={streamRef.current} intro={intro} previous={previous[d.id]} onDone={record} onSkip={skip} onMenu={() => setStage('hold')} />
      </main>
    );

  const doneCount = s.done.filter((x) => !x.skipped).length;
  return (
    <main className="screen game-play training mobility tr-session mob-train">
      <TopBar title={tr('Training', 'Training')} onBack={() => (stage === 'summary' ? props.onFinished() : setExit(true))} backLabel={tr('Leave', 'Verlassen')} />
      {stage === 'setup' && <TrainSetup drills={drills} minutes={s.minutes} resumed={s.done.length > 0} onStart={start} />}
      {stage === 'hold' && (
        <section className="tr-block mob-hold-screen">
          <h2>{tr('Paused', 'Pausiert')}</h2>
          <p className="muted">{tr(`${doneCount} of ${drills.length} drills done. Continue starts the drill again.`, `${doneCount} von ${drills.length} Übungen erledigt. Weiter startet die Übung neu.`)}</p>
          <button type="button" className="btn-primary" onClick={() => setStage('drill')}>
            {tr('Continue', 'Weiter')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              stopStream();
              if (s.done.length) saveSession(s);
              props.onPause();
            }}
          >
            {tr('Pause – continue later', 'Pausieren – später fortsetzen')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => finish(s)}>
            {tr('Finish training', 'Training beenden')}
          </button>
        </section>
      )}
      {stage === 'summary' && <TrainSummary session={s} drills={drills} previous={previous} onDone={props.onFinished} />}
      {exit && (
        <div className="sheet-backdrop" onClick={() => setExit(false)}>
          <section className="sheet" role="dialog" aria-label={tr('Leave the training', 'Training verlassen')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>{tr('Leave the training', 'Training verlassen')}</h2>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setExit(false)}>
                ×
              </button>
            </div>
            <div className="sheet-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  stopStream();
                  if (s.done.length) saveSession(s);
                  props.onPause();
                }}
              >
                {tr('Pause – continue later', 'Pausieren – später fortsetzen')}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setExit(false);
                  finish(s);
                }}
              >
                {tr('Finish training', 'Training beenden')}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

/** Set the phone up once – like the screening: where it stands, what is needed, the drills of the day, Start. */
function TrainSetup(props: { drills: Drill[]; minutes: number; resumed: boolean; onStart: () => void }) {
  const needs = [...new Set(props.drills.flatMap((d) => (d.needs ?? []).map((n) => (typeof n === 'string' ? '' : t(n)))).filter(Boolean))];
  const [model, setModel] = useState<'loading' | 'ready' | 'failed'>(() => (isFakeCamera() ? 'ready' : 'loading'));
  useEffect(() => {
    if (isFakeCamera()) return;
    let on = true;
    loadPose().then(
      () => on && setModel('ready'),
      () => on && setModel('failed'),
    );
    return () => {
      on = false;
    };
  }, []);
  return (
    <section className="tr-block mob-setup">
      <h2>{tr('Set up the phone – once', 'Handy aufstellen – einmal')}</h2>
      <PhoneSetup view="front" height="hip" />
      <ol className="card tr-section tr-steps">
        <li>{tr('Phone upright on a stand or against a bottle, at hip height, the screen towards you.', 'Handy hochkant auf ein Stativ oder an eine Flasche lehnen, auf Hüfthöhe, Bildschirm zu dir.')}</li>
        <li>{tr('Step back 2.5–3 m, sound on. The app shows each drill, then you do it.', '2,5–3 m zurückgehen, Ton an. Die App macht jede Übung vor, dann machst du sie.')}</li>
        <li>{tr('It counts, times the holds, measures how far you get and goes on by itself.', 'Sie zählt mit, stoppt die Haltezeiten, misst, wie weit du kommst, und macht von selbst weiter.')}</li>
      </ol>
      {needs.length > 0 && (
        <p className="muted small">
          {tr('You need', 'Du brauchst')}: {needs.join(', ')}
        </p>
      )}
      <div className="list mob-train-list" aria-label={tr('The drills', 'Die Übungen')}>
        {props.drills.map((d, i) => {
          const c = coachOf(d.id);
          return (
            <div key={d.id} className="list-item mob-test-row">
              <DrillThumb d={d} />
              <span className="grow">
                <span className="title">
                  {i + 1}. {t(d.name)}
                </span>
                <span className="muted small">
                  {c.hold ? tr(`hold ${c.hold} s`, `${c.hold} s halten`) : tr(`${c.reps} reps`, `${c.reps} Wiederholungen`)}
                  {c.sides ? tr(' per side', ' pro Seite') : ''}
                  {(c.sets ?? 1) > 1 ? ` · ${c.sets} ${tr('sets', 'Sätze')}` : ''}
                  {c.signal ? ` · ${tr('measured', 'gemessen')}: ${t(SIGNALS[c.signal].name)}` : ''}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted small">{tr(`About ${props.minutes} min.`, `Etwa ${props.minutes} Min.`)}</p>
      <p className="muted small mob-private">{tr('The picture stays on your phone – nothing is recorded or sent.', 'Das Bild bleibt auf deinem Handy – nichts wird aufgenommen oder gesendet.')}</p>
      <p className={`small mob-model ${model}`} role="status">
        {model === 'ready'
          ? tr('Body tracking ready', 'Körpererkennung bereit')
          : model === 'loading'
            ? tr('The body tracking is loading (once, about 22 MB) …', 'Die Körpererkennung lädt (einmalig, etwa 22 MB) …')
            : tr('The body tracking could not load – Start tries again.', 'Die Körpererkennung konnte nicht laden – Start versucht es nochmal.')}
      </p>
      <button type="button" className="btn-primary mob-start-train" onClick={props.onStart}>
        {props.resumed ? tr('Continue', 'Fortsetzen') : tr('Start', 'Start')}
      </button>
    </section>
  );
}

/** The end of a session: what was done and how far each measured movement went – against the last time. */
function TrainSummary(props: { session: TrainSession; drills: Drill[]; previous: Record<string, number | null>; onDone: () => void }) {
  const s = props.session;
  const days = daysThisWeek();
  const pain = s.done.filter((x) => x.pain);
  return (
    <section className="tr-block mob-train-summary">
      <section className="card">
        <strong>{tr('Training done', 'Training fertig')}</strong>
        <span className="muted small">
          {tr(`${s.done.filter((x) => !x.skipped).length} of ${props.drills.length} drills`, `${s.done.filter((x) => !x.skipped).length} von ${props.drills.length} Übungen`)} · {tr(`${days} ${days === 1 ? 'day' : 'days'} in the last 7`, `${days} ${days === 1 ? 'Tag' : 'Tage'} in den letzten 7`)}
        </span>
      </section>
      {pain.length > 0 && (
        <section className="card mob-pain-note">
          <strong>{tr('It hurt', 'Hat wehgetan')}</strong>
          <span className="small">{tr(`${pain.map((x) => t(drillById(x.drill)?.name ?? { en: x.drill, de: x.drill })).join(', ')}: pain is a stop sign – leave it out and let a physio look at it.`, `${pain.map((x) => t(drillById(x.drill)?.name ?? { en: x.drill, de: x.drill })).join(', ')}: Schmerz ist ein Stoppsignal – lass die Übung weg und lass es von einem Physio anschauen.`)}</span>
        </section>
      )}
      <div className="list">
        {props.drills.map((d) => {
          const x = s.done.find((y) => y.drill === d.id);
          const sig = coachOf(d.id).signal;
          const better = sig ? SIGNALS[sig].better : 'up';
          const best = x && !x.skipped ? bestOf(x, better) : null;
          const prev = props.previous[d.id];
          const change = best != null && prev != null ? Math.round((best - prev) * 10) / 10 : null;
          const up = change != null && (better === 'up' ? change > 0 : change < 0);
          return (
            <div key={d.id} className="list-item mob-test-row mob-train-row">
              <DrillThumb d={d} />
              <span className="grow">
                <span className="title">{t(d.name)}</span>
                <span className="muted small">{x ? doneText(x) : tr('not done', 'nicht gemacht')}</span>
                {x && (() => {
                  const all: Partial<Record<FormCue, number>> = {};
                  for (const st of x.sets) for (const [c, n] of Object.entries(st.cues ?? {}) as [FormCue, number][]) all[c] = (all[c] ?? 0) + n;
                  const text = cueText(all);
                  return text ? <span className="small mob-cue-note">{text}</span> : null;
                })()}
                {best != null && sig && sig !== 'oneLeg' && (
                  <span className="small">
                    {SELF_NAMED.includes(sig) ? null : `${t(SIGNALS[sig].name)}: `}<strong>{signalValueText(sig, best, tr)}</strong>
                    {change != null && Math.abs(change) >= (SIGNALS[sig].unit === '°' ? 3 : 1) && <span className={up ? ' good-text' : ' muted'}> · {change > 0 ? '+' : '−'}{String(Math.abs(change)).replace('.', tr('.', ','))}{SIGNALS[sig].unit === '°' ? '°' : ` ${SIGNALS[sig].unit}`}</span>}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <button type="button" className="btn-primary mob-train-done" onClick={props.onDone}>
        {tr('Done', 'Fertig')}
      </button>
    </section>
  );
}
