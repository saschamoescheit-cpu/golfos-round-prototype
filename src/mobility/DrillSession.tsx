import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { cameraOn, speak } from '../lib/caddietalk';
import { TopBar } from '../components/ui';
import { PausedIcon } from '../components/PausedIcon';
import { MobActionBar, PainIcon, TickIcon } from './MobActions';
import { drillById } from '../training/content';
import { SketchThumb } from '../training/Sketch';
import type { Drill } from '../training/types';
import { DRILL_CLIPS } from './anim3d/drills';
import { isFakeCamera, unlockAudio } from './CameraTest';
import { cameraWish } from './livecam';
import { coachOf, gainSpeech, progressed, SELF_NAMED, SIGNALS, signalValueText, WATCH_FOCUS } from './drillcoach';
import { withSets } from './dayplan';
import { DrillPlayer, cap, cueText } from './DrillPlayer';
import type { FormCue } from './drillcoach';
import { LogShare, LogSwitch } from './LogUi';
import { currentLog, startLog } from './motionlog';
import { PhoneSetup } from './pictures';
import { loadPose } from './pose';
import { bestOf, cleanStreak, daysThisWeek, deleteSession, drillHistory, gains, saveSession, type DrillDone, type TrainSession } from './sessions';

const t = (x: { en: string; de: string }) => tr(x.en, x.de);

/** the drill's picture as a thumbnail (its sketch, or the first frame of its 3D video is too heavy for a list) */
function DrillThumb(props: { d: Drill }) {
  return props.d.sketch ? <SketchThumb sketch={props.d.sketch} /> : <span className="tr-thumb" />;
}

/** what a drill did, in a line: reps or holds per side */
export function doneText(d: DrillDone): string {
  if (d.skipped) return tr('skipped', 'übersprungen');
  if (d.pain && !d.sets.length) return tr('stopped – it hurt', 'abgebrochen – hat wehgetan');
  const holds = d.sets.filter((s) => s.held != null);
  if (holds.length) return tr(`${holds.length} × held, up to ${Math.max(...holds.map((s) => s.held ?? 0))} s`, `${holds.length} × gehalten, bis ${String(Math.max(...holds.map((s) => s.held ?? 0))).replace('.', ',')} s`);
  const reps = d.sets.reduce((n, s) => n + s.reps, 0);
  const target = d.sets.reduce((n, s) => n + s.target, 0);
  return tr(`${reps} of ${target} reps`, `${reps} von ${target} Wiederholungen`);
}

/** What the coach says at the end: done, how many drills, what went further than the last time (two at most), the days. */
export function doneSpeech(s: TrainSession, previous: Record<string, number | null>, days: number): string {
  const n = s.done.filter((x) => !x.skipped && !x.pain).length;
  const parts = [tr('Training done.', 'Training fertig.'), tr(`${n} ${n === 1 ? 'drill' : 'drills'}.`, `${n} ${n === 1 ? 'Übung' : 'Übungen'}.`)];
  for (const g of gains(s, previous).slice(0, 2)) {
    const name = t(drillById(g.drill)?.name ?? { en: g.drill, de: g.drill });
    const said = gainSpeech(g.signal, g.by, tr);
    if (said) parts.push(`${name}: ${said}.`);
  }
  if (days > 1) parts.push(tr(`${days} days of training in the last 7.`, `${days} Trainingstage in den letzten 7.`));
  return parts.join(' ');
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

  // how often each drill went cleanly in a row before this session – the plan a little harder where it sits
  const [streaks] = useState(() => Object.fromEntries(s.drills.map((id) => [id, cleanStreak(id)])));
  // (a long day: more sets of the focus drills – dayplan.ts)
  const planOf = (id: string) => withSets(progressed(coachOf(id), streaks[id] ?? 0), s.extraSets?.[id]);

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
    speak(doneSpeech(done, previous, daysThisWeek()));
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
    // the motion log of this session (when switched on in the setup) starts empty
    if (!s.done.length || !currentLog()) startLog();
    if (streamRef.current?.active) return setStage('drill');
    if (!isFakeCamera() && navigator.mediaDevices?.getUserMedia)
      navigator.mediaDevices
        .getUserMedia(cameraWish())
        .then((st) => {
          streamRef.current = st;
          cameraOn(st);
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
  /** paused for later: kept when something is done, the drills tab offers it */
  const pauseLater = () => {
    stopStream();
    if (s.done.length) saveSession(s);
    props.onPause();
  };

  const d = drills[Math.min(k, drills.length - 1)];
  const intro = drills.length > 1 ? tr(`Drill ${k + 1} of ${drills.length}: ${t(d.name)}`, `Übung ${k + 1} von ${drills.length}: ${t(d.name)}`) : t(d.name);

  if (stage === 'drill' && d)
    return (
      <main className="screen mobility mob-run-camera">
        <DrillPlayer key={d.id} drill={d} plan={planOf(d.id)} base={coachOf(d.id)} streak={streaks[d.id] ?? 0} clip={DRILL_CLIPS[d.id]} stream={streamRef.current} intro={intro} previous={previous[d.id]} onDone={record} onSkip={drills.length > 1 ? skip : undefined}
          onMenu={() => setStage('hold')}
          onEnd={() => {
            setStage('hold');
            setExit(true);
          }}
        />
      </main>
    );

  const doneCount = s.done.filter((x) => !x.skipped).length;
  return (
    <main className="screen game-play training mobility tr-session mob-train">
      <TopBar title={tr('Training', 'Training')} onBack={() => (stage === 'summary' ? props.onFinished() : setExit(true))} backLabel={tr('Leave', 'Verlassen')} />
      {stage === 'setup' && <TrainSetup drills={drills} minutes={s.minutes} warm={s.warm ?? []} resumed={s.done.length > 0} onStart={start} planOf={planOf} />}
      {stage === 'hold' && (
        // the pause (Facelift 11.11.2026, a5): its status, one bar of icons – Pausieren, Es tut weh, Beenden red and last –
        // then the green "Weiter"
        <section className="tr-block mob-hold-screen">
          <section className="card mob-screening-status">
            <strong>
              {tr('Paused', 'Pausiert')}{' '}
              <span className="paused-mark" role="img" aria-label={tr('paused', 'pausiert')}>
                <PausedIcon />
              </span>
            </strong>
            <span className="muted small">{tr(`${doneCount} of ${drills.length} drills done – Continue starts the drill again.`, `${doneCount} von ${drills.length} Übungen erledigt – Weiter startet die Übung neu.`)}</span>
          </section>
          <MobActionBar
            label={tr('The paused training', 'Das pausierte Training')}
            actions={[
              {
                label: tr('Pause', 'Pausieren'),
                aria: tr('Pause – continue later', 'Pausieren – später fortsetzen'),
                icon: 'pause',
                onClick: pauseLater,
              },
              // pain in the middle of a set: stop this drill at once (stop sign) – it stays out of the plan for 4 weeks
              { label: tr('It hurts', 'Es tut weh'), aria: tr('It hurts – stop this drill', 'Es tut weh – Übung abbrechen'), icon: 'hurt', className: 'mob-pain-stop', onClick: () => record({ drill: d.id, sets: [], pain: true, at: new Date().toISOString() }) },
              { label: tr('Finish', 'Beenden'), aria: tr('Finish training', 'Training beenden'), icon: 'finish', danger: true, onClick: () => finish(s) },
            ]}
          />
          <button type="button" className="btn-primary" onClick={() => setStage('drill')}>
            {tr('Continue', 'Weiter')}
          </button>
        </section>
      )}
      {stage === 'summary' && <TrainSummary session={s} drills={drills} previous={previous} onDeleted={props.onFinished} />}
      {exit && (
        // exactly the round's leave sheet (Facelift 11.11.2026, a6): head with ✕, the bar – Pausieren, Löschen red and
        // last – then the one main button
        <div className="sheet-backdrop" onClick={() => setExit(false)}>
          <section className="sheet" role="dialog" aria-label={tr('Leave the training', 'Training verlassen')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('Leave the training?', 'Training verlassen?')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setExit(false)}>
                ✕
              </button>
            </div>
            <div className="sheet-actions">
              <MobActionBar
                label={tr('This training', 'Dieses Training')}
                actions={[
                  { label: tr('Pause', 'Pausieren'), aria: tr('Pause – continue later', 'Pausieren – später fortsetzen'), icon: 'pause', onClick: pauseLater },
                  {
                    label: tr('Delete', 'Löschen'),
                    aria: tr('Delete the training', 'Training löschen'),
                    icon: 'delete',
                    danger: true,
                    onClick: () => {
                      stopStream();
                      deleteSession(s.id, tr('Training', 'Training'));
                      props.onFinished();
                    },
                  },
                ]}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setExit(false);
                  finish(s);
                }}
              >
                {tr('Save & finish', 'Speichern & beenden')}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

/** Set the phone up once – like the screening: where it stands, what is needed, the drills of the day, Start. */
function TrainSetup(props: { drills: Drill[]; minutes: number; warm: string[]; resumed: boolean; onStart: () => void; planOf: (id: string) => ReturnType<typeof coachOf> }) {
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
      {/* the camera setup: a picture and one line, then the drills and Start – no intro with steps (Facelift 11.11.2026, a9) */}
      <PhoneSetup view="front" height="hip" />
      <p className="muted small mob-setup-line">
        {tr('Phone upright at hip height, 2.5–3 m away, sound on – the app shows each drill, counts, measures and goes on by itself.', 'Handy hochkant auf Hüfthöhe, 2,5–3 m entfernt, Ton an – die App macht jede Übung vor, zählt, misst und macht von selbst weiter.')}
      </p>
      {needs.length > 0 && (
        <p className="muted small">
          {tr('You need', 'Du brauchst')}: {needs.join(', ')}
        </p>
      )}
      <span className="eyebrow">{tr(`The drills · about ${props.minutes} min`, `Die Übungen · etwa ${props.minutes} Min.`)}</span>
      <div className="list mob-train-list" aria-label={tr('The drills', 'Die Übungen')}>
        {props.drills.map((d, i) => {
          const c = props.planOf(d.id);
          const up = (c.reps ?? 0) > (coachOf(d.id).reps ?? 0) || (c.hold ?? 0) > (coachOf(d.id).hold ?? 0);
          return (
            <div key={d.id} className="list-item mob-test-row">
              <DrillThumb d={d} />
              <span className="grow">
                <span className="title">
                  {i + 1}. {t(d.name)}
                  {props.warm.includes(d.id) && <span className="muted small mob-warm-tag"> · {tr('to move through', 'zum Durchbewegen')}</span>}
                </span>
                <span className="muted small">
                  {c.hold ? tr(`hold ${c.hold} s`, `${c.hold} s halten`) : tr(`${c.reps} reps`, `${c.reps} Wiederholungen`)}
                  {c.sides ? tr(' per side', ' pro Seite') : ''}
                  {(c.sets ?? 1) > 1 ? ` · ${c.sets} ${tr('sets', 'Sätze')}` : ''}
                  {c.signal
                    ? SIGNALS[c.signal].countOnly
                      ? ` · ${tr('counted by the camera', 'von der Kamera gezählt')}`
                      : ` · ${tr('measured', 'gemessen')}: ${t(SIGNALS[c.signal].name)}`
                    : c.watch
                      ? ` · ${tr('the camera watches', 'die Kamera achtet auf')} ${t(WATCH_FOCUS[c.watch])}`
                      : ''}
                  {up ? tr(' · a little more – it sat last time', ' · etwas mehr – es saß zuletzt') : ''}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {/* the motion log for checking the measuring on a real body: only the body points, never a picture */}
      <LogSwitch />
      <p className={`small mob-model ${model}`} role="status">
        {model === 'ready' && <TickIcon size={14} />}
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
function TrainSummary(props: { session: TrainSession; drills: Drill[]; previous: Record<string, number | null>; onDeleted: () => void }) {
  const s = props.session;
  const days = daysThisWeek();
  const pain = s.done.filter((x) => x.pain);
  const [shared, setShared] = useState('');
  // Teilen: what was done, in words – the share sheet, else the clipboard
  const share = async () => {
    const text = [
      tr(`Agility training, ${new Date(s.startedAt).toLocaleDateString('en-GB')}`, `Agility-Training, ${new Date(s.startedAt).toLocaleDateString('de-DE')}`),
      ...props.drills.map((d) => {
        const x = s.done.find((y) => y.drill === d.id);
        return `– ${t(d.name)}: ${x ? doneText(x) : tr('not done', 'nicht gemacht')}`;
      }),
    ].join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: tr('Agility training', 'Agility-Training'), text });
        return setShared(tr('Shared.', 'Geteilt.'));
      }
    } catch {
      /* cancelled – the clipboard instead */
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared(tr('Copied – paste it into a message.', 'Kopiert – in eine Nachricht einfügen.'));
    } catch {
      setShared('');
    }
  };
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
          <span className="mob-grade fail pain" aria-hidden="true">
            <PainIcon />
          </span>
          <span className="grow">
            <strong>{tr('It hurt', 'Hat wehgetan')}</strong>
            <span className="small">{tr(`${pain.map((x) => t(drillById(x.drill)?.name ?? { en: x.drill, de: x.drill })).join(', ')}: pain is a stop sign – leave it out and let a physio look at it.`, `${pain.map((x) => t(drillById(x.drill)?.name ?? { en: x.drill, de: x.drill })).join(', ')}: Schmerz ist ein Stoppsignal – lass die Übung weg und lass es von einem Physio anschauen.`)}</span>
          </span>
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
                    {SELF_NAMED.includes(sig) ? null : `${cap(t(SIGNALS[sig].name))}: `}<strong>{signalValueText(sig, best, tr)}</strong>
                    {change != null && Math.abs(change) >= (SIGNALS[sig].unit === '°' ? 3 : 1) && <span className={up ? ' good-text' : ' muted'}> · {change > 0 ? '+' : '−'}{String(SIGNALS[sig].unit === '°' ? Math.round(Math.abs(change)) : Math.abs(change)).replace('.', tr('.', ','))}{SIGNALS[sig].unit === '°' ? '°' : ` ${SIGNALS[sig].unit}`}</span>}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <LogShare />
      {/* no 'Fertig' – back with ‹ in the TopBar; the summary's actions as one bar, Löschen red and last (Facelift
          11.11.2026, a10) */}
      <MobActionBar
        label={tr('This training', 'Dieses Training')}
        className="mob-train-acts"
        actions={[
          { label: tr('Share', 'Teilen'), aria: tr('Share the training', 'Training teilen'), icon: 'share', onClick: () => void share() },
          {
            label: tr('Delete', 'Löschen'),
            aria: tr('Delete the training', 'Training löschen'),
            icon: 'delete',
            danger: true,
            onClick: () => {
              deleteSession(s.id, tr('Training', 'Training'));
              props.onDeleted();
            },
          },
        ]}
      />
      {shared && (
        <span className="muted small" role="status">
          {shared}
        </span>
      )}
    </section>
  );
}
