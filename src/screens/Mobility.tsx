import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { ModulePill } from '../components/ModuleSheet';
import { tr } from '../lib/i18n';
import { isLeftHanded } from '../lib/profile';
import { MENU_ICONS, MenuBar } from '../components/TabBar';
import { TopTools } from '../components/TopTools';
import { TopBar } from '../components/ui';
import { SwipeRow } from '../components/SwipeRow';
import { PausedIcon } from '../components/PausedIcon';
import { DeletedIcon } from '../components/RoundIcons';
import { Bin } from '../components/Bin';
import { RepeatIcon } from '../mobility/icons';
import { ChoiceRow, SettingsList, StepPick } from '../components/Settings';
import { FloatActions } from '../components/FloatActions';
import { MobActionBar, PainIcon, TickIcon } from '../mobility/MobActions';
import { drillById } from '../training/content';
import { SketchThumb, SketchView } from '../training/Sketch';
import { VideoCard, VideoNote } from '../training/ui';
import { saveOwnPlan, trainingId } from '../training/store';
import { L, type Drill } from '../training/types';
import { DRILL_CLIPS, RETEST_CLIPS } from '../mobility/anim3d/drills';
import { CLIPS } from '../mobility/anim3d/clips';
import type { Clip } from '../mobility/anim3d/scene';
import type { Coach } from '../mobility/CameraTest';
import { CameraTest, isFakeCamera, sideText, unlockAudio, CheckList } from '../mobility/CameraTest';
import { cameraWish } from '../mobility/livecam';
import { NOT_TESTED, TPI_FORMS } from '../mobility/tpiform';
import { loadPose } from '../mobility/pose';
import { cameraOn, speak } from '../lib/caddietalk';
import { NOTE_HEELS, valueText } from '../mobility/measure';
import { PhoneSetup, TopTurn } from '../mobility/pictures';
import { KeptLogs, LogShare, LogSwitch } from '../mobility/LogUi';
import { startLog } from '../mobility/motionlog';
import { DrillSession, doneText } from '../mobility/DrillSession';
import { cap } from '../mobility/DrillPlayer';
import { daysThisWeek, drillHistory, loadSessions, localDay, newSession, openSession, openToday, painDrills, trainingValues, type TrainSession } from '../mobility/sessions';
import { buildDayPlan, DAY_MINUTES, drillTime, type DayPlan } from '../mobility/dayplan';
import { buildWarmup } from '../mobility/rangewarmup';
import { RangeWarmup, warmupFor, warmupMinutes } from '../mobility/WarmupPlayer';
import { coachOf, DRILL_COACH, SIGNALS, signalValueText, WATCH_FOCUS } from '../mobility/drillcoach';
import { deleteScreening, discardEmpty, loadScreeningTrash, loadScreenings, newScreening, purgeScreening, restoreScreening, saveScreening, screeningById, withResult } from '../mobility/store';
import { FOCUS_NAMES, GOAL_STEPS, loadGoal, measurePos, mobilityScore, pillar, saveGoal, targetPos, targetValue, testPos, type AreaState, type Focus, type MobilityGoal } from '../mobility/profile';
import { profileIndex } from '../lib/profile';
import { hasPain, leadSide, previousMeasurement, likelyMisses, latestResults, MISS_NAMES, PLAY_NOW, swingPatterns, type PatternResult } from '../mobility/swing';
import { FULL, QUICK, TESTS, TestPicture, testById } from '../mobility/tests';
import type { Area, Grade, Measurement, Screening, Side, SquatCause, TestDef, TestId, TestResult } from '../mobility/types';
import '../training/training.css';
import { PhysioCard, PhysioRun, PhysioView, importPlan } from '../mobility/PhysioPlan';
import { dueToday, loadPhysio, measuredLight, routineSec, weekCount } from '../mobility/physio';
import '../mobility/mobility.css';

// the 3D video of a test (three.js, loaded with the first test page)
const Anim3D = lazy(() => import('../mobility/Anim3D'));

// The module "Agility" (Sascha 17.10.2026, a mobility screen): the player copies tests shown on the
// phone, the camera measures them (the rest the player judges with pictures), and the app shows what the body allows:
// the result per body area, the swing patterns and misses it points to (the body–swing connection of TPI – the name
// is protected, hence our own) and the drills that help, which go into Training as a plan. Built like Rounds,
// Games and Training: the module header, the menu at the bottom, pause / finish / cancel, the bin with "Undo".

export type MobilityTab = 'test' | 'result' | 'drills' | 'history' | 'profile';

type View =
  | { name: 'tab'; tab: MobilityTab }
  | { name: 'test'; id: TestId; tab?: 'how' | 'result' | 'drills' }
  | { name: 'run'; id: string }
  | { name: 'screening'; id: string }
  | { name: 'drill'; id: string }
  | { name: 'pattern'; id: string }
  | { name: 'train'; session: TrainSession }
  | { name: 'warmup' }
  | { name: 'physio' }
  | { name: 'physio-run' };

const t = (l: L): string => tr(l.en, l.de);

const ICONS = {
  test: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 7v6M12 13l-4 7M12 13l4 7M6 9l6 1 6-3" />
    </svg>
  ),
  result: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  drills: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" />
    </svg>
  ),
};

const AREA_NAMES: Record<Area, L> = {
  hips: { en: 'Hips and pelvis', de: 'Hüfte und Becken' },
  spine: { en: 'Back and trunk', de: 'Rücken und Rumpf' },
  shoulders: { en: 'Shoulders', de: 'Schultern' },
  stability: { en: 'Stability and balance', de: 'Stabilität und Gleichgewicht' },
  legs: { en: 'Legs and ankles', de: 'Beine und Sprunggelenke' },
  neck: { en: 'Neck', de: 'Nacken' },
  wrists: { en: 'Forearms and wrists', de: 'Unterarme und Handgelenke' },
};
const AREAS: Area[] = ['hips', 'spine', 'shoulders', 'stability', 'legs', 'neck', 'wrists'];

const playerHand = (): 'right' | 'left' => (isLeftHanded() ? 'left' : 'right');
const sideName = (s: Side) => (s === 'left' ? tr('left', 'links') : tr('right', 'rechts'));
const dateText = (iso: string) => new Date(iso).toLocaleDateString(tr('en-GB', 'de-DE'), { day: 'numeric', month: 'short', year: 'numeric' });
const screeningName = (s: Screening) => s.from ?? kindName(s.kind);
const kindName = (k: Screening['kind']) => (k === 'quick' ? tr('Quick check', 'Kurz-Check') : k === 'full' ? tr('Full screen', 'Komplettes Screening') : tr('Single test', 'Einzeltest'));

function useMobilityTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => setN((x) => x + 1);
    window.addEventListener('golfos:mobility-changed', on);
    window.addEventListener('golfos:synced', on);
    return () => {
      window.removeEventListener('golfos:mobility-changed', on);
      window.removeEventListener('golfos:synced', on);
    };
  }, []);
  return n;
}

const CAUSE_SHORT: Record<SquatCause, L> = {
  upper: { en: 'cause: shoulders, upper back', de: 'Ursache: Schultern, oberer Rücken' },
  ankle: { en: 'cause: ankles', de: 'Ursache: Sprunggelenke' },
  hips: { en: 'cause: hips, trunk', de: 'Ursache: Hüfte, Rumpf' },
};

/** The value of a result in words – both sides for sided tests ("left 48° · right 39°"). */
function resultText(test: TestDef, r: TestResult | undefined): string {
  if (!r) return tr('not tested yet', 'noch nicht getestet');
  const one = (m: Measurement) => (m.pain ? tr('pain', 'Schmerz') : m.source === 'self' ? tr('self-judged', 'selbst eingeschätzt') : m.source === 'physio' ? tr('physio', 'Physio') : test.metric ? valueText(test.metric, m.value, tr) + (m.cause ? ` · ${t(CAUSE_SHORT[m.cause])}` : '') : '');
  if (r.both) return `${one(r.both)}`;
  const text = (['left', 'right'] as Side[])
    .filter((s) => r[s])
    .map((s) => `${sideName(s)} ${one(r[s]!)}`)
    .join(' · ');
  const gap = sideGap(test, r);
  return gap ? `${text} · ${gap}` : text;
}

/** A clear difference between the sides, in words ("14° difference") – TPI coaches name it: a body often turns better
 * into the backswing than through. From 10° or 5 s on; none for self checks. */
function sideGap(test: TestDef, r: TestResult): string | null {
  const a = r.left?.source === 'camera' ? r.left.value : null;
  const b = r.right?.source === 'camera' ? r.right.value : null;
  if (a == null || b == null || !test.metric) return null;
  const secs = test.metric === 'balance' || test.metric === 'bridge';
  const d = Math.abs(a - b);
  if (d < (secs ? 5 : 10)) return null;
  const n = secs ? `${Math.round(d)} s` : `${Math.round(d)}°`;
  return tr(`${n} difference`, `${n} Unterschied`);
}

/**
 * The mark of a test result (Sascha 18.10.2026: measuring, not grading): where the value sits on the scale from little
 * to a lot of movement, the line where the goal asks for – "!" when it hurt, a dashed circle when not tested.
 */
function ResultMark(props: { r: TestResult | undefined; test: TestDef; small?: boolean }) {
  if (hasPain(props.r))
    return (
      <span className={`mob-grade fail pain${props.small ? ' small' : ''}`} role="img" aria-label={tr('pain', 'Schmerz')}>
        <PainIcon size={props.small ? 15 : 18} />
      </span>
    );
  const pos = testPos(props.test, props.r);
  if (pos == null) return <span className={`mob-grade none${props.small ? ' small' : ''}`} aria-label={tr('not tested', 'nicht getestet')} />;
  return <LevelBar pos={pos} target={targetPos(props.test, loadGoal())} small={props.small} />;
}

/** A value on its scale: the bar fills from little to a lot of movement; the tick is where the goal asks for. */
function LevelBar(props: { pos: number; target?: number; small?: boolean; label?: string }) {
  return (
    <span className={`mob-levelbar${props.small ? ' small' : ''}`} role="img" aria-label={props.label ?? tr(`${Math.round(props.pos * 100)} % of the scale`, `${Math.round(props.pos * 100)} % der Skala`)}>
      <i style={{ width: `${Math.max(4, props.pos * 100)}%` }} />
      {props.target != null && <b style={{ left: `${props.target * 100}%` }} />}
    </span>
  );
}


/** the picture of a test as a thumbnail in lists */
function TestThumb(props: { test: TestDef }) {
  const s = props.test.sketch;
  if (s.view === 'side' && s.items.length) return <SketchThumb sketch={s} />;
  const o = props.test.options?.[0];
  return <span className="tr-thumb mob-thumb">{o ? o.picture() : null}</span>;
}

export function MobilityApp(props: { onModules: () => void; profile: ReactNode; profileDot?: boolean; tab?: MobilityTab; onTabChange?: (t: MobilityTab) => void; onOpenTraining?: () => void }) {
  useMobilityTick();
  const [stack, setStack] = useState<View[]>(() => [{ name: 'tab', tab: props.tab ?? 'test' }]);
  const view = stack[stack.length - 1];
  const push = (v: View) => {
    setStack([...stack, v]);
    window.scrollTo(0, 0);
  };
  const back = () => {
    setStack(stack.length > 1 ? stack.slice(0, -1) : stack);
    window.scrollTo(0, 0);
  };
  const toTab = (tab: MobilityTab) => {
    setStack([{ name: 'tab', tab }]);
    props.onTabChange?.(tab);
    window.scrollTo(0, 0);
  };
  const nav: Nav = { push, back, toTab, run: (s) => setStack([{ name: 'tab', tab: 'test' }, { name: 'run', id: s.id }]), train: (s) => setStack([...stack, { name: 'train', session: s }]), replace: (v) => setStack([...stack.slice(0, -1), v]), openTraining: props.onOpenTraining };

  if (view.name === 'train')
    return <DrillSession session={view.session} onPause={back} onFinished={back} />;
  if (view.name === 'warmup') return <RangeWarmup warmup={buildWarmup(pillarPlan(loadMinutes()).areas)} onClose={back} />;
  if (view.name === 'physio-run' || view.name === 'physio') {
    const plan = loadPhysio();
    // (removed on another device meanwhile)
    if (!plan)
      return (
        <main className="screen training mobility">
          <TopBar title={tr('My physio plan', 'Mein Physio-Plan')} onBack={back} />
        </main>
      );
    if (view.name === 'physio-run') return <PhysioRun plan={plan} onClose={back} />;
    return <PhysioView plan={plan} onBack={back} onRun={() => push({ name: 'physio-run' })} onRetest={() => toTab('test')} />;
  }

  if (view.name === 'run') {
    const s = screeningById(view.id);
    if (s)
      return (
        <ScreeningPlay
          screening={s}
          onPause={() => toTab('test')}
          onFinished={(done) => (done.kind === 'single' ? setStack([{ name: 'tab', tab: 'test' }, { name: 'test', id: done.tests[0], tab: Object.keys(done.results).length ? 'result' : 'how' }]) : setStack([{ name: 'tab', tab: 'result' }]))}
          onDelete={() => {
            deleteScreening(s.id, kindName(s.kind));
            toTab('test');
          }}
        />
      );
  }
  if (view.name === 'tab')
    return (
      <main className="screen with-tabs training mobility">
        <div className="topbar">
          <ModulePill name={'Agility'} onClick={props.onModules} />
          <TopTools />
        </div>
        {view.tab !== 'profile' && <h1 className="tab-title">{TAB_TITLES[view.tab]()}</h1>}
        {view.tab === 'test' && <TestTab nav={nav} />}
        {view.tab === 'result' && <ResultTab nav={nav} />}
        {view.tab === 'drills' && <DrillsTab nav={nav} />}
        {view.tab === 'history' && <HistoryTab nav={nav} />}
        {view.tab === 'profile' && props.profile}
        <MobilityMenu current={view.tab} onPick={toTab} profileDot={props.profileDot} />
      </main>
    );
  const root = stack[0].name === 'tab' ? stack[0].tab : 'test';
  return (
    <div className="tr-with-menu">
      {view.name === 'test' && <TestView key={`${view.id}-${view.tab ?? ''}`} id={view.id} tab={view.tab} nav={nav} />}
      {view.name === 'screening' && <ScreeningView id={view.id} nav={nav} />}
      {view.name === 'drill' && <DrillView id={view.id} nav={nav} />}
      {view.name === 'pattern' && <PatternView id={view.id} nav={nav} />}
      <MobilityMenu current={root} onPick={toTab} profileDot={props.profileDot} />
    </div>
  );
}

const TAB_TITLES: Record<Exclude<MobilityTab, 'profile'>, () => string> = {
  test: () => 'Screening',
  result: () => tr('Result', 'Ergebnis'),
  drills: () => tr('Drills', 'Übungen'),
  history: () => tr('History', 'Verlauf'),
};

interface Nav {
  push: (v: View) => void;
  back: () => void;
  toTab: (t: MobilityTab) => void;
  run: (s: Screening) => void;
  /** a guided drill session (Sascha 18.10.2026: lead through the drills and measure meanwhile) */
  train: (s: TrainSession) => void;
  replace: (v: View) => void;
  openTraining?: () => void;
}

function MobilityMenu(props: { current: MobilityTab; onPick: (t: MobilityTab) => void; profileDot?: boolean }) {
  const open = loadScreenings().some((s) => !s.finishedAt && s.kind !== 'single');
  return (
    <MenuBar
      items={[
        { id: 'test' as MobilityTab, label: 'Screening', icon: ICONS.test, dot: open },
        { id: 'result' as MobilityTab, label: tr('Result', 'Ergebnis'), icon: ICONS.result },
        { id: 'drills' as MobilityTab, label: tr('Drills', 'Übungen'), icon: ICONS.drills },
        { id: 'history' as MobilityTab, label: tr('History', 'Verlauf'), icon: MENU_ICONS.list },
        { id: 'profile' as MobilityTab, label: tr('Profile', 'Profil'), icon: MENU_ICONS.profile, dot: props.profileDot },
      ]}
      current={props.current}
      onPick={props.onPick}
    />
  );
}

// ---------- Screening: start, continue, single tests ----------

/** the pause mark of a paused screening – the shared green circle with two bars, as in the rounds list */
function PausedMark() {
  return (
    <span className="paused-mark" role="img" aria-label={tr('paused', 'pausiert')}>
      <PausedIcon />
    </span>
  );
}

const minutesOf = (ids: TestId[]) => Math.round(ids.reduce((m, id) => m + (testById(id).mode === 'self' ? 0.7 : testById(id).sides ? 2 : 1.2), 0));

/**
 * The training of the day on the start tab (Sascha 18.10.2026: the app leads through the drills – not a list to read):
 * the drills of the pillar for the minutes a day, one tap to start; a paused session comes first.
 */
function TodayCard(props: { nav: Nav }) {
  const paused = openToday();
  const minutes = loadMinutes();
  const { planDrills, planMinutes, planSession } = pillarPlan(minutes);
  const days = daysThisWeek();
  const today = localDay();
  const doneToday = loadSessions().some((x) => x.finishedAt && localDay(x.startedAt) === today);
  // a training day of the physio's routine (Sascha 1.11.2026): the routine is today's training, Agility's plan stays a tap away
  const physio = loadPhysio();
  if (physio && !paused && dueToday(physio)) {
    const goal = physio.schedule?.perWeek;
    return (
      <section className="card mob-today mob-today-physio">
        <span className="eyebrow">{tr('Your training today', 'Dein Training heute')}</span>
        <strong>
          {physio.routine.name} · {tr(`about ${Math.round(routineSec(physio) / 60)} min`, `etwa ${Math.round(routineSec(physio) / 60)} Min.`)}
        </strong>
        <span className="muted small">
          {[tr('Your physio plan', 'Dein Physio-Plan'), tr(`${physio.routine.exercises.length} exercises`, `${physio.routine.exercises.length} Übungen`), goal ? tr(`this week ${weekCount(physio.log)} of ${goal}`, `diese Woche ${weekCount(physio.log)} von ${goal}`) : ''].filter(Boolean).join(' · ')}
        </span>
        <button type="button" className="btn-primary mob-today-start" onClick={() => props.nav.push({ name: 'physio-run' })}>
          {tr('Start the routine', 'Routine starten')}
        </button>
        {planDrills.length > 0 && (
          <button type="button" className="link-btn mob-today-alt" onClick={() => props.nav.train(planSession())}>
            {tr(`Agility's plan instead (${planMinutes} min)`, `Stattdessen Agility-Plan (${planMinutes} Min.)`)}
          </button>
        )}
      </section>
    );
  }
  if (!planDrills.length) return null;
  return (
    <section className="card mob-today">
      <span className="eyebrow">{tr('Your training today', 'Dein Training heute')}</span>
      <strong>{paused ? tr('Training paused', 'Training pausiert') : tr(`${planDrills.length} drills · about ${planMinutes} min`, `${planDrills.length} Übungen · etwa ${planMinutes} Min.`)}</strong>
      <div className="mob-today-pics" aria-hidden="true">
        {(paused ? paused.drills.map(drillById).filter((d): d is Drill => !!d) : planDrills).slice(0, 5).map((d) => (
          <SketchThumb key={d.id} sketch={d.sketch} />
        ))}
      </div>
      <WeekDots />
      <span className="muted small">
        {paused
          ? tr(`${paused.done.length} of ${paused.drills.length} drills done`, `${paused.done.length} von ${paused.drills.length} Übungen erledigt`)
          : [
              tr('With the camera: the app shows, counts and measures', 'Mit Kamera: die App macht vor, zählt und misst'),
              days > 0 ? tr(`${days} ${days === 1 ? 'day' : 'days'} in the last 7`, `${days} ${days === 1 ? 'Tag' : 'Tage'} in den letzten 7`) : '',
              doneToday ? tr('done today', 'heute erledigt') : '',
            ]
              .filter(Boolean)
              .join(' · ')}
      </span>
      <button type="button" className="btn-primary mob-today-start" onClick={() => props.nav.train(paused ?? planSession())}>
        {paused ? tr('Continue', 'Fortsetzen') : doneToday ? tr('Train again', 'Nochmal trainieren') : tr('Train now', 'Jetzt trainieren')}
      </button>
    </section>
  );
}

/** The last 7 days, today last: a filled dot on each day with a finished training – how regular, not how good. */
function WeekDots() {
  const trained = new Set(loadSessions().filter((x) => x.finishedAt).map((x) => localDay(x.startedAt)));
  const days = [...Array(7)].map((_, i) => new Date(Date.now() - (6 - i) * 864e5));
  return (
    <div className="mob-week" aria-label={tr(`${days.filter((d) => trained.has(localDay(d))).length} of the last 7 days trained`, `An ${days.filter((d) => trained.has(localDay(d))).length} der letzten 7 Tage trainiert`)}>
      {days.map((d, i) => {
        const on = trained.has(localDay(d));
        return (
          <span key={i} className={`mob-week-day${on ? ' on' : ''}${i === 6 ? ' today' : ''}`} aria-hidden="true">
            <i />
            <span>{d.toLocaleDateString(tr('en-GB', 'de-DE'), { weekday: 'narrow' })}</span>
          </span>
        );
      })}
    </div>
  );
}

function TestTab(props: { nav: Nav }) {
  const all = loadScreenings();
  const open = all.filter((s) => !s.finishedAt && s.kind !== 'single');
  const { results } = latestResults(all);
  // repeat every four weeks (GOWOD 30 days, Amazon Halo 2–4 weeks, TPI coaches 4 weeks) – a hint, no lock
  const lastDone = all.filter((s) => s.finishedAt && s.kind !== 'single' && Object.keys(s.results).length).map((s) => s.finishedAt!).sort().at(-1);
  const next = lastDone ? { last: lastDone, from: new Date(new Date(lastDone).getTime() + 28 * 86400000).toISOString() } : null;
  // the overall value of the latest results (the same as at the top of the result)
  const score = next ? mobilityScore(TESTS, results, loadGoal()) : null;
  const start = (kind: 'quick' | 'full') => {
    const s = newScreening(kind, kind === 'quick' ? QUICK : FULL);
    saveScreening(s);
    props.nav.run(s);
  };
  const due = next && Date.now() >= new Date(next.from).getTime() && !open.length;
  // the days trained since the last screening (what the repeat will show)
  const trainedSince = next ? new Set(loadSessions().filter((x) => x.finishedAt && x.startedAt > next.last).map((x) => localDay(x.startedAt))).size : 0;
  return (
    <>
      {due && (
        <section className="card mob-due">
          <span className="eyebrow">{tr('Time to repeat', 'Zeit zum Wiederholen')}</span>
          <strong>{tr('Your next screening', 'Dein nächstes Screening')}</strong>
          <span className="muted small">
            {tr(`The last one was on ${dateText(next!.last)}`, `Das letzte war am ${dateText(next!.last)}`)}
            {trainedSince > 0 ? tr(` – since then ${trainedSince} ${trainedSince === 1 ? 'day' : 'days'} of training. See what changed.`, ` – seitdem ${trainedSince} ${trainedSince === 1 ? 'Trainingstag' : 'Trainingstage'}. Sieh, was sich verändert hat.`) : tr('. See what changed.', '. Sieh, was sich verändert hat.')}
          </span>
          <button type="button" className="btn-primary mob-due-start" onClick={() => start('quick')}>
            {tr('Start the quick check', 'Kurz-Check starten')}
          </button>
        </section>
      )}
      {Object.keys(results).length > 0 && <TodayCard nav={props.nav} />}
      {open.map((s) => (
        <button key={s.id} type="button" className="list-item mob-open" onClick={() => props.nav.run(s)}>
          {/* the status in its own column before the name, as in every list (Sascha 11.11.2026, status mockups: variant A) */}
          <span className="list-mark">
            <PausedMark />
          </span>
          <span className="grow">
            <span className="title">{kindName(s.kind)}</span>
            <span className="muted small">
              {tr(`Paused · ${Object.keys(s.results).length} of ${s.tests.length} tests done`, `Pausiert · ${Object.keys(s.results).length} von ${s.tests.length} Tests erledigt`)}
            </span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      ))}
      <section className="mob-starts">
        <button type="button" className="mob-start" onClick={() => start('quick')}>
          <span className="mob-start-pics" aria-hidden="true">
            {QUICK.slice(0, 3).map((id) => (
              <TestThumb key={id} test={testById(id)} />
            ))}
          </span>
          <strong>{tr('Quick check', 'Kurz-Check')}</strong>
          <span className="muted small">{tr(`${QUICK.length} camera tests · about ${minutesOf(QUICK)} min`, `${QUICK.length} Kameratests · etwa ${minutesOf(QUICK)} Min.`)}</span>
        </button>
        <button type="button" className="mob-start" onClick={() => start('full')}>
          <span className="mob-start-pics" aria-hidden="true">
            {['seated-rotation', 'lat', 'wrist-hinge'].map((id) => (
              <TestThumb key={id} test={testById(id as TestId)} />
            ))}
          </span>
          <strong>{tr('Full screen', 'Komplettes Screening')}</strong>
          <span className="muted small">{tr(`${FULL.length} tests · about ${minutesOf(FULL)} min`, `${FULL.length} Tests · etwa ${minutesOf(FULL)} Min.`)}</span>
        </button>
      </section>
      <p className="muted small mob-when">
        {next ? tr(`Last screening ${dateText(next.last)}${score ? ` · mobility ${score.score} / 100` : ''} · the next one from ${dateText(next.from)}. `, `Letztes Screening ${dateText(next.last)}${score ? ` · Beweglichkeit ${score.score} / 100` : ''} · das nächste ab ${dateText(next.from)}. `) : ''}
        {tr('For values you can compare: not warmed up, about the same time of day.', 'Für vergleichbare Werte: nicht aufgewärmt, etwa zur gleichen Tageszeit.')}
      </p>
      <section className="tr-block">
        <span className="eyebrow">{tr('Single tests', 'Einzelne Tests')}</span>
        <div className="list">
          {FULL.map((id) => {
            const test = testById(id);
            return (
              <button key={id} type="button" className="list-item mob-test-row" onClick={() => props.nav.push({ name: 'test', id })}>
                <TestThumb test={test} />
                <span className="grow">
                  <span className="title">{t(test.name)}</span>
                  <span className="muted small">
                    {test.mode === 'camera' ? tr('Camera', 'Kamera') : tr('Self check', 'Selbsttest')} · {resultText(test, results[id])}
                  </span>
                </span>
                <ResultMark r={results[id]} test={test} small />
              </button>
            );
          })}
        </div>
      </section>
      <p className="muted small mob-disclaimer">{tr('Not a medical examination. Pain is a stop sign – stop the test and ask a doctor or physio.', 'Keine ärztliche Untersuchung. Schmerz ist ein Stoppsignal – Test abbrechen und Arzt oder Physio fragen.')}</p>
    </>
  );
}

/** One test: how it works, the results so far and the drills – in tabs, not one long page. */
function TestView(props: { id: TestId; nav: Nav; tab?: 'how' | 'result' | 'drills' }) {
  const test = testById(props.id);
  const [tab, setTab] = useState<'how' | 'result' | 'drills'>(props.tab ?? 'how');
  const all = loadScreenings();
  const history = all
    .map((s) => ({ s, r: s.results[props.id] }))
    .filter((x): x is { s: Screening; r: TestResult } => !!x.r)
    .sort((a, b) => b.s.createdAt.localeCompare(a.s.createdAt));
  const drills = drillsOf(test, latestResults(loadScreenings()).results[test.id]).map(drillById).filter((d): d is Drill => !!d);
  // between two screenings: what the guided training measured for this test
  const trained = trainingValues(test.id);
  return (
    <main className="screen training mobility">
      <TopBar title={t(test.name)} onBack={props.nav.back} />
      {/* the views as the app's switch "‹ Ablauf ›" – no tab block (Facelift 11.11.2026, a1) */}
      <StepPick<'how' | 'result' | 'drills'>
        label={tr('View', 'Ansicht')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'how', name: tr('How it works', 'Ablauf') },
          { value: 'result', name: tr('Results', 'Ergebnisse') },
          { value: 'drills', name: tr('Drills', 'Übungen') },
        ]}
      />
      {tab === 'how' && <TestBrief test={test} side={null} />}
      {tab === 'result' && (
        <section className="tr-block">
          <TestRating test={test} r={history[0]?.r} at={history[0]?.s} />
          {history.length === 0 ? (
            !trained.length && <p className="muted">{tr('Not tested yet.', 'Noch nicht getestet.')}</p>
          ) : (
            <>
              <LatestChecks r={history[0].r} />
              {test.metric && <HistoryChart test={test} history={history} />}
              <div className="list">
                {history.map(({ s, r }) => (
                  <button key={s.id} type="button" className="list-item" onClick={() => props.nav.push({ name: 'screening', id: s.id })}>
                    <span className="grow">
                      <span className="title">{resultText(test, r)}</span>
                      <span className="muted small">
                        {dateText(s.createdAt)} · {screeningName(s)}
                      </span>
                    </span>
                    <ResultMark r={r} test={test} small />
                  </button>
                ))}
              </div>
            </>
          )}
          {trained.length > 0 && test.metric && <TrainedValues test={test} values={trained} />}
        </section>
      )}
      {tab === 'drills' && <DrillList drills={drills} nav={props.nav} />}
      <div className="sticky-cta">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            const s = newScreening('single', [props.id]);
            saveScreening(s);
            props.nav.run(s);
          }}
        >
          {tr('Start the test', 'Test starten')}
        </button>
      </div>
    </main>
  );
}

/** The rating of the last time as the TPI app shows a test (Sascha 1.11.2026): what it tells, the light per side
 *  with the value, the pro's benchmark and the golf goal. */
function TestRating(props: { test: TestDef; r: TestResult | undefined; at?: Screening }) {
  const ls = lightsOf(props.test, props.r);
  const word = (l: Light) => (l === 'green' ? tr('good', 'gut') : l === 'yellow' ? tr('limited', 'eingeschränkt') : l === 'red' ? tr('poor', 'schlecht') : tr('not tested', 'nicht getestet'));
  const m = (side: Side | null) => (side ? props.r?.[side] : props.r?.both ?? props.r?.left ?? props.r?.right);
  return (
    <section className="card mob-rating">
      <p className="small">{t(props.test.why)}</p>
      {props.r && (
        <div className="mob-rating-sides">
          {ls.map((x) => (
            <span key={x.side ?? 'both'} className={`mob-rating-side ${x.light}`}>
              <i className={`mob-dot ${x.light}`} />
              <span>
                <b>{x.side ? sideName(x.side).replace(/^./, (c) => c.toUpperCase()) : tr('Result', 'Ergebnis')}</b> · {word(x.light)}
                {m(x.side)?.value != null && props.test.metric ? ` · ${valueText(props.test.metric, m(x.side)!.value, tr)}` : ''}
                {m(x.side)?.source === 'physio' ? tr(' · physio', ' · Physio') : m(x.side)?.source === 'self' ? tr(' · self-judged', ' · selbst eingeschätzt') : ''}
              </span>
            </span>
          ))}
        </div>
      )}
      <span className="small">
        <b>{tr('Pro benchmark: ', 'Profi-Richtwert: ')}</b>
        {t(props.test.pro)}
      </span>
      <span className="small muted">
        <b>{tr('Golf goal: ', 'Golf-Ziel: ')}</b>
        {t(props.test.target)}
      </span>
      {props.r && <TpiForm test={props.test} r={props.r} />}
    </section>
  );
}

/** The TPI form of the test – every question with all its answers, the one for this result marked; nothing to change
 *  (Sascha 1.11.2026: "not editable, but all theoretical choices visible"). */
function TpiForm(props: { test: TestDef; r: TestResult }) {
  const qs = TPI_FORMS[props.test.id];
  if (!qs) return null;
  return (
    <div className="mob-tpi" aria-label={tr('Rating as on the TPI form', 'Bewertung wie im TPI-Formular')}>
      <strong className="mob-tpi-head">{tr('Rating as on the TPI form', 'Bewertung wie im TPI-Formular')}</strong>
      {qs.map((q, i) => {
        const pick = q.pick(props.r);
        const opts = [{ label: NOT_TESTED, grade: undefined }, ...q.options];
        const chosen = pick == null ? 0 : pick + 1;
        return (
          <div key={i} className="mob-tpi-q">
            <span className="small mob-tpi-question">{t(q.q)}</span>
            <ul className="mob-tpi-options">
              {opts.map((o, j) => (
                <li key={j} className={`mob-tpi-opt${j === chosen ? ` on ${o.grade ?? 'none'}` : ''}`} aria-current={j === chosen ? 'true' : undefined}>
                  <i aria-hidden="true" />
                  <span>{t(o.label)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** The criteria of the last time, per side (31.10.2026: "the single criteria have to be judged"). */
function LatestChecks(props: { r: TestResult }) {
  const parts = (
    [
      ['left', props.r.left, tr('Left', 'Links')],
      ['right', props.r.right, tr('Right', 'Rechts')],
      ['both', props.r.both, ''],
    ] as const
  ).filter(([, m]) => m?.checks?.length && !m.pain);
  if (!parts.length) return null;
  return (
    <section className="card mob-latest-checks">
      <strong>{tr('The criteria last time', 'Die Prüfkriterien beim letzten Mal')}</strong>
      {parts.map(([k, m, label]) => (
        <div key={k}>
          {label && <span className="muted small">{label}</span>}
          <CheckList checks={m!.checks!} />
        </div>
      ))}
    </section>
  );
}

/**
 * The values of a test over time, on its scale (measuring, not grading): each bar is how much movement (the side with
 * less counts), the line across is where the goal asks for – after a repeat the gap shows at a glance.
 */
function HistoryChart(props: { test: TestDef; history: { s: Screening; r: TestResult }[] }) {
  const goal = loadGoal();
  const pts = [...props.history].reverse().slice(-8);
  const pos = pts.map((p) => testPos(props.test, p.r));
  if (!pos.some((x) => x != null)) return null;
  const tgt = targetPos(props.test, goal);
  const tv = targetValue(props.test, goal);
  // the number above a bar: the value of the side with less movement
  const shown = (r: TestResult): ReactNode => {
    const ms = [r.both, r.left, r.right].filter((m): m is Measurement => !!m && !m.pain);
    if (!ms.length) return <PainIcon size={13} />; // it hurt: the sign of pain, not a "!"
    const m = ms.reduce((x, y) => ((measurePos(props.test, x) ?? 1) <= (measurePos(props.test, y) ?? 1) ? x : y));
    return m.value != null ? String(Math.round(m.value)) : tr('self', 'selbst');
  };
  return (
    <figure className="mob-chart" aria-label={tr('Your values over time', 'Deine Werte im Verlauf')}>
      <div className="mob-bars">
        {pts.map((p, i) => (
          <div key={p.s.id} className="mob-bar">
            <span className="small">{shown(p.r)}</span>
            <span className="mob-bar-track">
              <i style={{ height: `${Math.max(4, (pos[i] ?? 0) * 100)}%` }} />
              <b style={{ bottom: `${tgt * 100}%` }} />
            </span>
            <span className="muted small">{new Date(p.s.createdAt).toLocaleDateString(tr('en-GB', 'de-DE'), { day: 'numeric', month: 'numeric' })}</span>
          </div>
        ))}
      </div>
      <figcaption className="muted small">
        {goal ? tr('Bar: how much movement (the side with less counts) · line: your goal', 'Balken: wie viel Bewegung (die Seite mit weniger zählt) · Strich: dein Ziel') : tr('Bar: how much movement (the side with less counts) · line: the golf value', 'Balken: wie viel Bewegung (die Seite mit weniger zählt) · Strich: Golf-Richtwert')}
        {tv != null && props.test.metric ? ` (${tr('about', 'etwa')} ${valueText(props.test.metric, tv, tr)})` : ''}
      </figcaption>
    </figure>
  );
}

/** The values the guided training measured for a test, on the same scale and with the line of the goal. */
function TrainedValues(props: { test: TestDef; values: { at: string; value: number; drill: string }[] }) {
  const goal = loadGoal();
  const tgt = targetPos(props.test, goal);
  return (
    <section className="mob-trained">
      <span className="eyebrow">{tr('From your training', 'Aus deinem Training')}</span>
      <div className="list">
        {props.values.slice(0, 6).map((x) => {
          const pos = measurePos(props.test, { value: x.value, grade: 'limited', source: 'camera', at: x.at });
          return (
            <div key={x.at + x.drill} className="list-item mob-area-row">
              <span className="grow">
                <span className="title">{valueText(props.test.metric!, Math.round(x.value), tr)}</span>
                <span className="muted small">
                  {dateText(x.at)} · {t(drillById(x.drill)?.name ?? { en: x.drill, de: x.drill })}
                </span>
              </span>
              {pos != null && <LevelBar pos={pos} target={tgt} small />}
            </div>
          );
        })}
      </div>
      <span className="muted small">{tr('Measured in the guided drill – both sides together, not the test procedure; the next screening shows the comparison.', 'Gemessen in der geführten Übung – beide Seiten zusammen, nicht der Testablauf; das nächste Screening zeigt den Vergleich.')}</span>
    </section>
  );
}

/** Picture, phone, steps and goal of a test. */
function TestBrief(props: { test: TestDef; side: Side | null; noPicture?: boolean }) {
  const test = props.test;
  const top = test.metric === 'trunkRotation' ? <TopTurn part="shoulders" goal={45} still="hips" /> : test.metric === 'pelvicRotation' ? <TopTurn part="hips" goal={30} still="shoulders" /> : test.metric === 'lowerQuarter' ? <TopTurn part="hips" goal={60} still="feet" /> : test.metric === 'neck' ? <TopTurn part="head" goal={70} still="shoulders" /> : null;
  return (
    <>
      <Suspense fallback={<div className="mob-3d-wait" />}>
        <Anim3D test={test.id} say={[t(test.setup), ...test.steps.map(t)]} />
      </Suspense>
      <section className="card tr-section">
        <p className="mob-why">{t(test.why)}</p>
        <ol className="tr-steps">
          <li>{t(test.setup)}</li>
          {test.steps.map((s, i) => (
            <li key={i}>{t(s)}</li>
          ))}
        </ol>
        <p className="mob-target">
          <strong>{tr('Golf value', 'Golf-Richtwert')}:</strong> {t(test.target)}
          {test.metric && loadGoal() && (
            <>
              {' · '}
              <strong>{tr('for your goal', 'für dein Ziel')}:</strong> {tr('about', 'etwa')} {valueText(test.metric, targetValue(test, loadGoal()), tr)}
            </>
          )}
        </p>
        {test.needs && (
          <p className="muted small">
            {tr('You need', 'Du brauchst')}: {t(test.needs)}
          </p>
        )}
      </section>
      {/* the drawing with the numbered details the text is about (the self checks show theirs as the choices) */}
      {!props.noPicture && <TestPicture test={test} />}
      {top}
      {test.mode === 'camera' && <PhoneSetup view={test.view ?? 'front'} height={test.metric === 'bridge' || test.metric === 'reachRollLift' ? 'floor' : test.metric === 'trunkRotation' || test.metric === 'lat' ? 'knee' : test.metric === 'forearm' || test.metric === 'wristHinge' || test.metric === 'wristFlex' ? 'chest' : 'hip'} />}
      <VideoCard v={test.video} />
      <VideoNote />
    </>
  );
}

// ---------- a screening in play ----------

/** The steps of a screening: every test once, sided tests once per side (left first). */
function stepsOf(s: Screening): { test: TestId; side: Side | null }[] {
  return s.tests.flatMap((id): { test: TestId; side: Side | null }[] => (testById(id).sides && testById(id).mode === 'camera' ? (['left', 'right'] as Side[]).map((side) => ({ test: id, side })) : [{ test: id, side: null }]));
}
const stepDone = (s: Screening, st: { test: TestId; side: Side | null }) => {
  const r = s.results[st.test];
  return !!(st.side ? r?.[st.side] : r?.both) || !!s.skipped?.includes(st.test);
};

/** The cause found for a deep squat that missed: on the measurement, with a note in words. */
const CAUSE_NOTE: Record<SquatCause, L> = {
  upper: { en: 'Cause: shoulders and upper back – with the hands behind the head it works', de: 'Ursache: Schultern und oberer Rücken – mit den Händen hinter dem Kopf geht es' },
  ankle: { en: 'Cause: the ankles – the knee does not reach the wall', de: 'Ursache: Sprunggelenke – das Knie erreicht die Wand nicht' },
  hips: { en: 'Cause: hips and trunk – too shallow even without the arms', de: 'Ursache: Hüfte und Rumpf – auch ohne Arme zu wenig tief' },
};
/** The drills for the cause (REVIEW(golf) – Chris). */
const CAUSE_DRILLS: Record<SquatCause, string[]> = {
  upper: ['mob-wall-angels', 'open-books', 'mob-lat-stretch'],
  ankle: ['mob-ankle-wall', 'deep-squat'],
  hips: ['hip-9090', 'deep-squat', 'glute-bridge'],
};
/** The drills of a test – for the deep squat those of the cause, once it is known. */
function drillsOf(test: TestDef, r: TestResult | undefined): string[] {
  const c = test.id === 'deep-squat' ? r?.both?.cause : undefined;
  return c ? CAUSE_DRILLS[c] : test.drills;
}

function withCause(s: Screening, cause: SquatCause): Screening {
  const r = s.results['deep-squat'];
  if (!r?.both) return s;
  return { ...s, results: { ...s.results, 'deep-squat': { ...r, both: { ...r.both, cause, notes: [...(r.both.notes ?? []), CAUSE_NOTE[cause]] } } } };
}

/** The setup of the trainer mode: where the phone goes, what you need, the tests – then one tap. */
function CoachSetup(props: { screening: Screening; single: boolean; onStart: () => void; onSelf: () => void }) {
  const cams = props.screening.tests.map(testById).filter((x) => x.mode === 'camera');
  const selfs = props.screening.tests.map(testById).filter((x) => x.mode === 'self');
  const needs = [...new Set(cams.map((x) => (x.needs ? t(x.needs) : '')).filter(Boolean))];
  // the body tracking loads while the phone is set up (≈ 22 MB the first time) – after Start the first test begins at once
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
      {/* the camera setup: a picture and one line, then Start – no intro with steps (Facelift 11.11.2026, a9) */}
      <PhoneSetup view="front" height="hip" />
      <p className="muted small mob-setup-line">
        {tr('Phone upright at hip height, 2.5–3 m away, sound on – the app shows each test, measures and goes on by itself.', 'Handy hochkant auf Hüfthöhe, 2,5–3 m entfernt, Ton an – die App macht jeden Test vor, misst und macht von selbst weiter.')}
      </p>
      {needs.length > 0 && (
        <p className="muted small">
          {tr('You need', 'Du brauchst')}: {needs.join(', ')}
        </p>
      )}
      <span className="eyebrow">{tr('The tests', 'Die Tests')}</span>
      <div className="mob-setup-tests" aria-label={tr('The tests', 'Die Tests')}>
        {cams.map((x) => (
          <TestThumb key={x.id} test={x} />
        ))}
      </div>
      {!props.single && selfs.length > 0 && <p className="muted small">{tr(`Then ${selfs.length} short questions on the phone.`, `Danach ${selfs.length} kurze Fragen am Handy.`)}</p>}
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
      <button type="button" className="btn-primary mob-start-coach" onClick={props.onStart}>
        {tr('Start', 'Start')}
      </button>
      {props.single && (
        <div className="mob-pills">
          <button type="button" className="chip" onClick={props.onSelf}>
            {tr('Judge it myself', 'Selbst einschätzen')}
          </button>
        </div>
      )}
    </section>
  );
}

const ANKLE_STEPS = [
  L('Toes a hand width (10 cm) from the wall, kneel on the other knee.', 'Zehen eine Handbreit (10 cm) vor der Wand, auf das andere Knie knien.'),
  L('Push the knee forward to the wall – the heel stays down. Then the other leg.', 'Das Knie nach vorn zur Wand schieben – die Ferse bleibt unten. Dann das andere Bein.'),
];

/** The heels came up: the knee-to-wall test tells whether the ankles are the limit (TPI: 10 cm, heel down). */
function AnkleCheck(props: { onPick: (ok: boolean) => void }) {
  return (
    <section className="tr-block mob-self mob-ankle">
      <Suspense fallback={<div className="mob-3d-wait" />}>
        <Anim3D clip={DRILL_CLIPS['mob-ankle-wall']} say={[ANKLE_STEPS[0], ANKLE_STEPS[1]].map(t)} />
      </Suspense>
      <span className="eyebrow">{tr('Knee to the wall', 'Knie zur Wand')}</span>
      <section className="card tr-section">
        <ol className="tr-steps">
          <li>{t(ANKLE_STEPS[0])}</li>
          <li>{t(ANKLE_STEPS[1])}</li>
        </ol>
      </section>
      <span className="eyebrow">{tr('Which one is you?', 'Was passt zu dir?')}</span>
      <button type="button" className="mob-option pass" onClick={() => props.onPick(true)}>
        <span className="mob-option-label">
          <span>{tr('The knee touches the wall on both sides, heel down', 'Das Knie berührt auf beiden Seiten die Wand, Ferse unten')}</span>
        </span>
      </button>
      <button type="button" className="mob-option fail" onClick={() => props.onPick(false)}>
        <span className="mob-option-label">
          <span>{tr('The knee does not reach it, or the heel comes up', 'Das Knie kommt nicht hin oder die Ferse hebt ab')}</span>
        </span>
      </button>
    </section>
  );
}

type Felt = 'glutes' | 'hamstrings' | 'back' | null;

/** The bridge measured with "the wrong muscles": a pass becomes limited, the note says which muscles worked. */
function withFeel(s: Screening, where: 'hamstrings' | 'back'): Screening {
  const r = s.results.bridge;
  if (!r) return s;
  const note: L =
    where === 'hamstrings'
      ? { en: 'The back of the thighs did the work, not the glutes', de: 'Die Oberschenkel-Rückseite hat gearbeitet, nicht das Gesäß' }
      : { en: 'The low back did the work, not the glutes', de: 'Der untere Rücken hat gearbeitet, nicht das Gesäß' };
  const fix = (m: Measurement | undefined): Measurement | undefined => (m && !m.pain ? { ...m, grade: m.grade === 'pass' ? 'limited' : m.grade, notes: [...(m.notes ?? []), note] } : m);
  const next: TestResult = {};
  if (r.left) next.left = fix(r.left);
  if (r.right) next.right = fix(r.right);
  if (r.both) next.both = fix(r.both);
  return { ...s, results: { ...s.results, bridge: next } };
}

/** After the bridge: where did you feel it? Glutes = right; back of the thighs or low back = the wrong muscles (TPI). */
function FeelCheck(props: { test: TestDef; onPick: (where: Felt) => void }) {
  const opts: [Felt, string, string][] = [
    ['glutes', tr('In the glutes', 'Im Gesäß'), 'pass'],
    ['hamstrings', tr('In the back of the thighs (or a cramp)', 'In der Oberschenkel-Rückseite (oder ein Krampf)'), 'limited'],
    ['back', tr('In the low back', 'Im unteren Rücken'), 'limited'],
  ];
  return (
    <section className="tr-block mob-self mob-feel">
      <SketchView sketch={props.test.sketch} label={t(props.test.name)} />
      <span className="eyebrow">{tr('Where did you feel it most?', 'Wo hast du es vor allem gespürt?')}</span>
      {opts.map(([id, label, g]) => (
        <button key={id} type="button" className={`mob-option ${g}`} onClick={() => props.onPick(id)}>
          <span className="mob-option-label">
            <span>{label}</span>
          </span>
        </button>
      ))}
      <button type="button" className="btn-secondary" onClick={() => props.onPick(null)}>
        {tr("I don't know", 'Weiß nicht')}
      </button>
    </section>
  );
}

function ScreeningPlay(props: { screening: Screening; onPause: () => void; onFinished: (s: Screening) => void; onDelete: () => void }) {
  const [s, setS] = useState<Screening>(props.screening);
  const steps = stepsOf(s);
  const firstOpen = () => Math.max(0, steps.findIndex((st) => !stepDone(s, st)));
  // paused with the camera part done but questions still open: those come first
  const askFirst = s.ask?.length && !steps.some((st) => testById(st.test).mode === 'camera' && !stepDone(s, st)) ? s.ask[0] : null;
  const askStep = (q: 'feel' | 'ankle') => steps.findIndex((st) => st.test === (q === 'feel' ? 'bridge' : 'deep-squat'));
  const [k, setK] = useState<number>(() => (askFirst ? askStep(askFirst) : firstOpen()));
  // the trainer mode (Sascha 17.10.2026): set up once, one tap – then the camera tests run one after the other
  const [stage, setStage] = useState<'setup' | 'brief' | 'camera' | 'self' | 'feel' | 'retest' | 'ankle' | 'hold'>(() => askFirst ?? (testById(steps[firstOpen()]?.test ?? s.tests[0]).mode === 'camera' ? 'setup' : 'brief'));
  // questions that need a tap, asked after the camera part (the player stays away from the phone until then); they are
  // kept in the screening, so a pause does not lose them
  const [later, setLater] = useState<('feel' | 'ankle')[]>(() => s.ask ?? []);
  const withAsk = (cur: Screening, q: ('feel' | 'ankle')[]): Screening => (q.length ? { ...cur, ask: q } : cur.ask ? { ...cur, ask: undefined } : cur);
  // where "Continue" in the pause goes back to: the camera test or the squat retest
  const [held, setHeld] = useState<'camera' | 'retest'>('camera');
  const hold = (from: 'camera' | 'retest') => {
    setHeld(from);
    setStage('hold');
  };
  const streamRef = useRef<MediaStream | null>(null);
  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopStream, []);
  const [drawer, setDrawer] = useState(false);
  const [exit, setExit] = useState<null | 'menu' | 'end'>(null);
  const barTouch = useRef<number | null>(null);
  const step = steps[Math.min(k, steps.length - 1)];
  const test = testById(step.test);
  const testIndex = s.tests.indexOf(step.test);
  const single = s.kind === 'single';

  const store = (next: Screening) => {
    setS(next);
    saveScreening(next);
  };
  const finish = (cur: Screening) => {
    const done = { ...withAsk(cur, []), finishedAt: new Date().toISOString() };
    saveScreening(done);
    props.onFinished(done);
  };
  const goTo = (i: number) => {
    if (i < 0 || i >= steps.length) return;
    setK(i);
    setStage('brief');
    window.scrollTo(0, 0);
  };
  const next = (cur: Screening) => {
    const open = steps.findIndex((st, i) => i > k && !stepDone(cur, st));
    if (open >= 0) goTo(open);
    else if (steps.every((st) => stepDone(cur, st))) {
      // everything done: straight to the result (the trainer mode needs no extra tap)
      finish(cur);
    } else goTo(steps.findIndex((st) => !stepDone(cur, st)));
  };
  const isCam = (st: { test: TestId }) => testById(st.test).mode === 'camera';
  /** the next open camera step (after this one, else any) */
  const nextCam = (cur: Screening) => {
    const after = steps.findIndex((st, i) => i > k && isCam(st) && !stepDone(cur, st));
    return after >= 0 ? after : steps.findIndex((st) => isCam(st) && !stepDone(cur, st));
  };
  /** after a camera step: the next one straight away; at the end the questions, the self checks, the result */
  const goOn = (cur: Screening, queue: ('feel' | 'ankle')[]) => {
    const i = nextCam(cur);
    if (i >= 0) {
      setK(i);
      setStage('camera');
      return;
    }
    stopStream();
    const selfOpen = steps.some((st) => !isCam(st) && !stepDone(cur, st));
    if (queue.length || selfOpen) {
      speak(tr('The camera tests are done. Now a few taps on the phone.', 'Die Kameratests sind fertig. Zum Schluss noch kurz ans Handy.'));
      if (queue.length) {
        setLater(queue);
        setK(askStep(queue[0]));
        setStage(queue[0]);
        return;
      }
      setStage('brief');
      goTo(steps.findIndex((st) => !stepDone(cur, st)));
      return;
    }
    // everything done: straight to the result
    speak(tr('Done. Here is your result.', 'Fertig. Hier ist dein Ergebnis.'));
    finish(cur);
  };
  /** a question at the end answered: the next one, then the self checks or the result */
  const answered = (cur: Screening) => {
    const q = later.slice(1);
    setLater(q);
    const now = withAsk(cur, q);
    store(now);
    if (q.length) {
      setK(askStep(q[0]));
      setStage(q[0]);
      return;
    }
    goOn(now, []);
  };
  const startCoach = () => {
    unlockAudio();
    // the motion log of this screening (when switched on in the setup) starts empty with its first test
    if (!Object.keys(s.results).length) startLog();
    // still on (e.g. back from the pause to another test): use it, never open a second camera
    if (streamRef.current?.active) {
      setStage('camera');
      return;
    }
    // the camera is opened here, in the tap (iPhone), and stays on for all camera tests
    if (!isFakeCamera() && navigator.mediaDevices?.getUserMedia)
      navigator.mediaDevices
        .getUserMedia(cameraWish())
        .then((st) => {
          streamRef.current = st;
          cameraOn(st);
          setStage('camera');
        })
        .catch(() => setStage('camera'));
    else setStage('camera');
  };
  const save = (m: Measurement) => {
    const got = withResult({ ...s, current: testIndex }, step.test, step.side, m);
    const moreOfIt = steps.some((st, i) => i > k && st.test === step.test && !stepDone(got, st));
    const q: ('feel' | 'ankle')[] = m.source === 'camera' && step.test === 'bridge' && !m.pain && !moreOfIt && !later.includes('feel') ? [...later, 'feel'] : later;
    const cur = withAsk(got, q);
    store(cur);
    if (m.source === 'camera') {
      setLater(q);
      // the deep squat missed: the retest follows at once (hands behind the head)
      if (step.test === 'deep-squat' && m.grade !== 'pass' && !m.pain) {
        setStage('retest');
        return;
      }
      goOn(cur, q);
      return;
    }
    // a camera test judged by hand (or it hurt): on with the next camera test
    if (isCam(step)) {
      goOn(cur, later);
      return;
    }
    setStage('brief');
    next(cur);
  };
  const retested = (m: Measurement) => {
    const cause: SquatCause | null = m.pain || m.source !== 'camera' ? null : m.grade === 'pass' ? 'upper' : m.notes?.some((n) => n.en === NOTE_HEELS.en) ? null : 'hips';
    // the heels still come up: knee to the wall at the end (a tap)
    const heels = !m.pain && m.source === 'camera' && m.grade !== 'pass' && m.notes?.some((n) => n.en === NOTE_HEELS.en);
    const q: ('feel' | 'ankle')[] = heels ? [...later, 'ankle'] : later;
    const cur = withAsk(cause ? withCause(s, cause) : s, q);
    if (cur !== s) store(cur);
    setLater(q);
    goOn(cur, q);
  };
  const ankle = (ok: boolean) => {
    const cur = withCause(s, ok ? 'hips' : 'ankle');
    store(cur);
    answered(cur);
  };
  const felt = (where: Felt) => {
    const cur = where === 'glutes' || where === null ? s : withFeel(s, where);
    if (cur !== s) store(cur);
    answered(cur);
  };
  const skip = () => {
    const cur = { ...s, skipped: [...new Set([...(s.skipped ?? []), step.test])] };
    store(cur);
    if (stage === 'camera') return goOn(cur, later);
    next(cur);
  };
  // "Finish" in the camera: the single test is left (kept when measured), the screening asks "finish now?"
  const leaveSingle = () => {
    stopStream();
    if (Object.keys(s.results).length) finish(s);
    else {
      discardEmpty(s.id);
      props.onPause();
    }
  };
  const endNow = (from: 'camera' | 'retest') => {
    hold(from);
    if (single) leaveSingle();
    else {
      stopStream();
      setExit('end');
    }
  };
  const coachFor = (intro: string, demo: Clip | undefined, from: 'camera' | 'retest' = 'camera'): Coach => ({ stream: streamRef.current, intro, demo, onMenu: () => hold(from), onSkip: single ? undefined : skip, onEnd: () => endNow(from) });
  const introOf = () => {
    const n = single ? '' : tr(`Test ${testIndex + 1} of ${s.tests.length}: `, `Test ${testIndex + 1} von ${s.tests.length}: `);
    const side = step.side && test.metric ? ` – ${sideText(test.metric, step.side).replace(/\.$/, '')}` : '';
    return `${n}${t(test.name)}${side}`;
  };
  const nowPos = hasPain(s.results[step.test]) ? null : testPos(test, s.results[step.test]);
  const doneCount = s.tests.filter((id) => s.results[id] || s.skipped?.includes(id)).length;

  if (stage === 'retest')
    return (
      <main className="screen mobility mob-run-camera">
        <CameraTest key="squat-retest" test={test} side={null} variant="handsBehind" coach={coachFor(tr('Retest: the same squat with the hands behind the head', 'Nachtest: dieselbe Kniebeuge mit den Händen hinter dem Kopf'), RETEST_CLIPS.squatHands, 'retest')} onResult={retested} onSelf={() => retested({ value: null, grade: 'limited', source: 'self', at: new Date().toISOString() })} onCancel={() => hold('retest')} />
      </main>
    );

  if (stage === 'camera')
    return (
      <main className="screen mobility mob-run-camera">
        <CameraTest key={`${step.test}-${step.side}`} test={test} side={step.side} previous={previousMeasurement(loadScreenings(), step.test, step.side, s.id)} coach={coachFor(introOf(), CLIPS[step.test])} onResult={save} onSelf={() => setStage('self')} onCancel={() => hold('camera')} />
      </main>
    );

  return (
    <main className="screen game-play training mobility tr-session">
      <TopBar title={single ? t(test.name) : kindName(s.kind)} onBack={() => (!single ? setExit('menu') : Object.keys(s.results).length ? finish(s) : (discardEmpty(s.id), props.onPause()))} backLabel={tr('Leave', 'Verlassen')} />
      {stage === 'setup' ? (
        <CoachSetup screening={s} onStart={startCoach} onSelf={() => setStage('self')} single={single} />
      ) : stage === 'hold' ? (
        // the pause: its status, one bar of icons – Pausieren, Es tut weh, Beenden red and last – then the green "Weiter"
        // (Facelift 11.11.2026, a5: as the training's pause and the round's leave sheet)
        <section className="tr-block mob-hold-screen">
          <section className="card mob-screening-status">
            <strong>
              {tr('Paused', 'Pausiert')} <PausedMark />
            </strong>
            <span className="muted small">{tr(`${doneCount} of ${s.tests.length} tests done – Continue goes on with the test where you stopped.`, `${doneCount} von ${s.tests.length} Tests erledigt – Weiter macht mit dem Test weiter, bei dem du aufgehört hast.`)}</span>
          </section>
          <MobActionBar
            label={tr('The paused test', 'Der pausierte Test')}
            actions={[
              !single && {
                label: tr('Pause', 'Pausieren'),
                aria: tr('Pause – continue later', 'Pausieren – später fortsetzen'),
                icon: 'pause',
                onClick: () => {
                  stopStream();
                  saveScreening(s);
                  props.onPause();
                },
              },
              {
                label: tr('It hurts', 'Es tut weh'),
                aria: tr('It hurts – stop this test', 'Es tut weh – Test abbrechen'),
                icon: 'hurt',
                className: 'mob-pain-stop',
                // pain is its own result (TPI): the test stops, the next one begins
                onClick: () => {
                  const m: Measurement = { value: null, grade: 'fail', source: 'self', pain: true, at: new Date().toISOString() };
                  if (held === 'retest') retested(m);
                  else save(m);
                },
              },
              {
                label: single ? tr('Leave', 'Verlassen') : tr('Finish', 'Beenden'),
                aria: single ? tr('Leave the test', 'Test verlassen') : tr('Finish screening', 'Screening beenden'),
                icon: 'finish',
                danger: true,
                onClick: () => {
                  stopStream();
                  if (single) leaveSingle();
                  else setExit('end');
                },
              },
            ]}
          />
          <button type="button" className="btn-primary" onClick={() => setStage(held)}>
            {tr('Continue', 'Weiter')}
          </button>
        </section>
      ) : (
      <>
      <section className="card tr-now">
        <div className="tr-now-head">
          {nowPos == null && <ResultMark r={s.results[step.test]} test={test} />}
          <span className="grow">
            <span className="eyebrow">
              {single ? (test.mode === 'camera' ? tr('Camera test', 'Kameratest') : tr('Self check', 'Selbsttest')) : tr(`Test ${testIndex + 1} of ${s.tests.length}`, `Test ${testIndex + 1} von ${s.tests.length}`)}
              {step.side && ` · ${step.side === 'left' ? tr('left side', 'linke Seite') : tr('right side', 'rechte Seite')}`}
            </span>
            <strong className="tr-now-name">{t(test.name)}</strong>
            {/* measured: the bar under the name, as wide as the card (beside the name it squeezed it into a column) */}
            {nowPos != null && <LevelBar pos={nowPos} target={targetPos(test, loadGoal())} />}
          </span>
        </div>
        {step.side && test.metric && (stage === 'brief' || stage === 'self') && <p className="mob-side-now">{sideText(test.metric, step.side)}</p>}
      </section>
      {stage === 'feel' ? (
        <FeelCheck test={test} onPick={felt} />
      ) : stage === 'ankle' ? (
        <AnkleCheck onPick={ankle} />
      ) : stage === 'self' ? (
        <SelfCheck test={test} onPick={save} onBack={() => setStage(test.mode === 'self' ? 'brief' : 'brief')} />
      ) : (
        <>
          {/* a self check shows its pictures as the choices below */}
          <TestBrief test={test} side={step.side} noPicture={test.mode === 'self'} />
          {test.mode === 'self' ? (
            <SelfCheck test={test} onPick={save} />
          ) : (
            <div className="sticky-cta">
              <button type="button" className="btn-primary" onClick={startCoach}>
                {tr('Start the camera', 'Kamera starten')}
              </button>
              <div className="mob-pills">
                <button type="button" className="chip" onClick={() => setStage('self')}>
                  {tr('Judge it myself', 'Selbst einschätzen')}
                </button>
                {!single && (
                  <button type="button" className="chip" onClick={skip}>
                    {tr('Skip', 'Überspringen')}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
      </>
      )}

      {!single && stage !== 'setup' && (
        <>
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
              <button type="button" className="hole-bar-arrow" aria-label={tr('Previous test', 'Voriger Test')} onClick={() => goTo(k - 1)} disabled={k === 0}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </button>
              <button type="button" className="map-score" aria-label={tr('Open the overview', 'Übersicht öffnen')} onClick={() => setDrawer(true)}>
                <span className="map-hole-no">{testIndex + 1}</span>
                <span className="hole-bar-par tr-bar-name">
                  <span>{t(test.name)}</span>
                  <span>
                    {doneCount}/{s.tests.length} {tr('done', 'erledigt')}
                  </span>
                </span>
              </button>
              <button type="button" className="hole-bar-arrow" aria-label={tr('Next test', 'Nächster Test')} onClick={() => (k >= steps.length - 1 ? setExit('end') : goTo(k + 1))}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}

      {drawer && (
        <div className="sheet-backdrop" onClick={() => setDrawer(false)}>
          <section className="sheet hole-drawer" role="dialog" aria-label={tr('Screening overview', 'Übersicht des Screenings')} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="drawer-handle" aria-label={tr('Close the overview', 'Übersicht schließen')} onClick={() => setDrawer(false)}>
              <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden="true">
                <path d="M6 3l16 8 16-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="drawer-list">
              {s.tests.map((id, i) => {
                const tt = testById(id);
                const first = steps.findIndex((st) => st.test === id);
                return (
                  <button
                    key={id}
                    type="button"
                    className="drawer-row"
                    aria-current={id === step.test ? 'true' : undefined}
                    onClick={() => {
                      goTo(first);
                      setDrawer(false);
                    }}
                  >
                    <span>
                      {i + 1}. {t(tt.name)}
                      <span className="muted small">{s.results[id] ? ` · ${resultText(tt, s.results[id])}` : s.skipped?.includes(id) ? ` · ${tr('skipped', 'übersprungen')}` : ''}</span>
                    </span>
                    <span aria-hidden="true">{s.results[id] ? '•' : id === step.test ? '●' : '›'}</span>
                  </button>
                );
              })}
            </div>
            <div className="drawer-actions">
              <button
                type="button"
                className="drawer-action"
                onClick={() => {
                  saveScreening(s);
                  props.onPause();
                }}
                aria-label={tr('Pause – continue later', 'Pausieren – später fortsetzen')}
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
                <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" />
                </svg>
                <span>{tr('Finish', 'Beenden')}</span>
              </button>
            </div>
          </section>
        </div>
      )}
      {exit && (
        <div className="sheet-backdrop" onClick={() => setExit(null)}>
          <section className="sheet" role="dialog" aria-label={tr('Leave the screening', 'Screening verlassen')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{kindName(s.kind)}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setExit(null)}>
                ✕
              </button>
            </div>
            {/* exactly the round's leave sheet (Facelift 11.11.2026, a6): the bar – Pausieren, Abbrechen red and last –
                then the one main button; its finish question: Zurück, Löschen red – then "Beenden & Ergebnis zeigen" */}
            {exit === 'menu' ? (
              <div className="sheet-actions">
                <MobActionBar
                  label={tr('This screening', 'Dieses Screening')}
                  actions={[
                    {
                      label: tr('Pause', 'Pausieren'),
                      aria: tr('Pause – continue later', 'Pausieren – später fortsetzen'),
                      icon: 'pause',
                      onClick: () => {
                        stopStream();
                        saveScreening(s);
                        props.onPause();
                      },
                    },
                    { label: tr('Cancel', 'Abbrechen'), aria: tr('Cancel screening', 'Screening abbrechen'), icon: 'delete', danger: true, onClick: props.onDelete },
                  ]}
                />
                <button type="button" className="btn-primary" onClick={() => setExit('end')}>
                  {tr('Finish screening', 'Screening beenden')}
                </button>
              </div>
            ) : (
              <>
                <span>
                  {doneCount < s.tests.length
                    ? tr(`Finish now? ${doneCount} of ${s.tests.length} tests are done – the result shows them.`, `Jetzt beenden? ${doneCount} von ${s.tests.length} Tests sind erledigt – das Ergebnis zeigt sie.`)
                    : tr('All tests done – see what your body says about your swing.', 'Alle Tests erledigt – sieh dir an, was dein Körper über deinen Schwung sagt.')}
                </span>
                <div className="sheet-actions">
                  <MobActionBar
                    label={tr('Or', 'Oder')}
                    actions={[
                      { label: tr('Back', 'Zurück'), icon: 'back', onClick: () => setExit(null) },
                      { label: tr('Delete', 'Löschen'), aria: tr('Delete screening', 'Screening löschen'), icon: 'delete', danger: true, onClick: props.onDelete },
                    ]}
                  />
                  <button type="button" className="btn-primary" onClick={() => finish(s)}>
                    {tr('Finish & show the result', 'Beenden & Ergebnis zeigen')}
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

/** A self check: the player taps the picture that looks like them (camera tests: reached the goal or not). */
function SelfCheck(props: { test: TestDef; onPick: (m: Measurement) => void; onBack?: () => void }) {
  const opts =
    props.test.options ??
    ([
      // described, not graded: about the golf value, a little less, clearly less
      { grade: 'pass', label: { en: `About this far or further: ${props.test.target.en}`, de: `Etwa so weit oder weiter: ${props.test.target.de}` } },
      { grade: 'limited', label: { en: 'A little less', de: 'Etwas weniger' } },
      { grade: 'fail', label: { en: 'Clearly less', de: 'Deutlich weniger' } },
    ] as { grade: Grade; label: L; picture?: () => ReactNode }[]);
  return (
    <section className="tr-block mob-self">
      <span className="eyebrow">{tr('Which one looks like you?', 'Was passt zu dir?')}</span>
      {opts.map((o) => (
        <button key={o.grade} type="button" className={`mob-option ${o.grade}`} onClick={() => props.onPick({ value: null, grade: o.grade, source: 'self', at: new Date().toISOString() })}>
          {'picture' in o && o.picture && <span className="mob-option-pic">{o.picture()}</span>}
          <span className="mob-option-label">
            <span>{t(o.label)}</span>
          </span>
        </button>
      ))}
      <PainButton onPick={props.onPick} />
      {props.onBack && (
        <button type="button" className="btn-secondary" onClick={props.onBack}>
          {tr('Back to the camera test', 'Zurück zum Kameratest')}
        </button>
      )}
    </section>
  );
}

/** "It hurts" – TPI scores pain as its own result: no drill for it, a physio first. */
function PainButton(props: { onPick: (m: Measurement) => void; value?: number | null; source?: Measurement['source'] }) {
  return (
    <button type="button" className="mob-option mob-pain" onClick={() => props.onPick({ value: props.value ?? null, grade: 'fail', source: props.source ?? 'self', pain: true, at: new Date().toISOString() })}>
      <span className="mob-option-label">
        <span className="mob-grade fail pain small" aria-hidden="true">
          <PainIcon size={15} />
        </span>
        <span>{tr('It hurts', 'Es tut weh')}</span>
      </span>
    </button>
  );
}

// ---------- the result ----------

function ResultTab(props: { nav: Nav }) {
  const all = loadScreenings();
  const { results, at } = latestResults(all);
  // lead and trail come from the profile now (a player who corrects it sees the result for the right side)
  const hand = playerHand();
  const [tab, setTab] = useState<'body' | 'swing'>('body');
  const tested = TESTS.filter((x) => results[x.id]);
  if (!tested.length)
    return (
      <section className="tr-block mob-empty">
        <TopTurn part="shoulders" goal={45} still="hips" />
        <p>{tr('No result yet. The quick check takes about five minutes.', 'Noch kein Ergebnis. Der Kurz-Check dauert etwa fünf Minuten.')}</p>
        <button type="button" className="btn-primary" onClick={() => props.nav.toTab('test')}>
          {tr('To the screening', 'Zum Screening')}
        </button>
      </section>
    );
  const patterns = swingPatterns(results, hand);
  const misses = likelyMisses(patterns);
  const newest = Object.values(at).sort().at(-1);
  const goal = loadGoal();
  const score = mobilityScore(TESTS, results, goal);
  // the screening before the newest one, on the same goal: how the overall value changed
  const done = all.filter((s) => s.kind !== 'single' && s.finishedAt && Object.keys(s.results).length).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const prev = done.length >= 2 ? done[done.length - 2] : null;
  const before = prev ? mobilityScore(TESTS, prev.results, goal) : null;
  const change = score && before ? score.score - before.score : null;
  return (
    <>
      <section className="card mob-summary mob-score">
        {score && <ScoreRing score={score.score} />}
        <strong>{tr('Your mobility', 'Deine Beweglichkeit')}</strong>
        {score && (
          <span className="small">
            {tr(`100 = every value at the goal for handicap ${goal?.hcp ?? 10}`, `100 = alle Werte am Ziel für Handicap ${goal?.hcp ?? 10}`)}
            {goal ? '' : tr(' – set your goal below', ' – dein Ziel stellst du unten ein')}
          </span>
        )}
        {change != null && prev && (
          <span className={`small mob-score-change${change > 0 ? ' good-text' : ' muted'}`}>
            {change === 0
              ? tr('the same as the screening before', 'gleich wie beim Screening davor')
              : tr(`${change > 0 ? '+' : '−'}${Math.abs(change)} since ${dateText(prev.createdAt)}`, `${change > 0 ? '+' : '−'}${Math.abs(change)} seit dem ${dateText(prev.createdAt)}`)}
          </span>
        )}
        <span className="muted small">
          {tr(`${tested.length} of ${TESTS.length} tests measured`, `${tested.length} von ${TESTS.length} Tests gemessen`)}
          {newest ? ` · ${tr('as of', 'Stand')} ${dateText(newest)}` : ''} · {hand === 'right' ? tr('right-handed', 'Rechtshänder') : tr('left-handed', 'Linkshänder')}
        </span>
      </section>
      <LogShare />
      {/* the two views as the app's switch "‹ Dein Körper ›" (Facelift 11.11.2026, a1) */}
      <StepPick<'body' | 'swing'>
        label={tr('View', 'Ansicht')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'body', name: tr('Your body', 'Dein Körper') },
          { value: 'swing', name: tr('Your swing', 'Dein Schwung') },
        ]}
      />
      {tab === 'swing' ? (
        <SwingResult patterns={patterns} misses={misses} tested={tested.length} nav={props.nav} />
      ) : (
        <BodyResult results={results} nav={props.nav} />
      )}
      <TrainNext nav={props.nav} />
      <GoalCard />
    </>
  );
}

/** The overall value as a ring: the share of the goal reached, the number inside. */
function ScoreRing(props: { score: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg className="mob-score-ring" viewBox="0 0 100 100" role="img" aria-label={tr(`${props.score} of 100`, `${props.score} von 100`)}>
      <circle cx="50" cy="50" r={r} className="track" />
      <circle cx="50" cy="50" r={r} className="fill" strokeDasharray={`${(c * props.score) / 100} ${c}`} transform="rotate(-90 50 50)" />
      <text x="50" y="47" className="num">
        {props.score}
      </text>
      <text x="50" y="68" className="of">
        / 100
      </text>
    </svg>
  );
}

/** After the result: the next step is the training of the pillar – what it holds, and one tap to start. */
function TrainNext(props: { nav: Nav }) {
  const minutes = loadMinutes();
  const { planDrills, planMinutes, planSession } = pillarPlan(minutes);
  if (!planDrills.length) return null;
  return (
    <section className="card mob-train-next">
      <span className="eyebrow">{tr('Next step', 'Nächster Schritt')}</span>
      <strong>{tr('Your training for it', 'Dein Training dafür')}</strong>
      <span className="muted small">{tr(`${planDrills.length} drills for the areas with the biggest gap, about ${planMinutes} min – the app shows, counts and measures.`, `${planDrills.length} Übungen für die Bereiche mit dem größten Abstand, etwa ${planMinutes} Min. – die App macht vor, zählt und misst.`)}</span>
      <div className="mob-today-pics" aria-hidden="true">
        {planDrills.slice(0, 5).map((d) => (
          <SketchThumb key={d.id} sketch={d.sketch} />
        ))}
      </div>
      <button type="button" className="btn-primary mob-train-next-start" onClick={() => props.nav.train(planSession())}>
        {tr('Train now', 'Jetzt trainieren')}
      </button>
    </section>
  );
}

const pctLevel = (score: number): 'high' | 'moderate' | 'low' => (Math.round(score * 100) >= 66 ? 'high' : Math.round(score * 100) >= 33 ? 'moderate' : 'low');
/** how likely the pattern is, 0 … 1 (reckoned as the TPI app does, mobility/swing.ts) */
const likelihood = (r: PatternResult) => r.score;

function SwingResult(props: { patterns: PatternResult[]; misses: ReturnType<typeof likelyMisses>; tested: number; nav: Nav }) {
  // with few tests most patterns stay unknown (Sascha 02.11.2026: two tests showed only the hollow back, the TPI app 15)
  const few = props.tested < TESTS.length - 3 && (
    <section className="card tr-section mob-swing-few">
      <strong>{tr(`Only ${props.tested} of ${TESTS.length} tests so far`, `Erst ${props.tested} von ${TESTS.length} Tests`)}</strong>
      <span className="muted small">
        {tr('A swing pattern shows once enough of its tests are done. The full screening shows all of them – or import the TPI screen of your physio under Drills → My physio plan.', 'Ein Schwungmuster erscheint, sobald genug seiner Tests gemacht sind. Das volle Screening zeigt alle – oder importiere das TPI-Screening deines Physios unter Übungen → Mein Physio-Plan.')}
      </span>
      <button type="button" className="btn-secondary" onClick={() => props.nav.toTab('test')}>
        {tr('To the screening', 'Zum Screening')}
      </button>
    </section>
  );
  if (!props.patterns.length && few) return few;
  if (!props.patterns.length)
    return (
      <section className="card tr-section">
        <strong className="good-text">{tr('Your body allows a free swing', 'Dein Körper lässt einen freien Schwung zu')}</strong>
        <p>{tr('None of your values points to a swing pattern.', 'Keiner deiner Werte deutet auf ein Schwungmuster hin.')}</p>
      </section>
    );
  return (
    <>
      {few}
      {props.misses.length > 0 && (
      <section className="tr-block">
        <span className="eyebrow">{tr('Misses your body tends to', 'Fehlschläge, die dein Körper begünstigt')}</span>
        <div className="chip-set mob-misses">
          {props.misses.slice(0, 6).map((m) => (
            <span key={m.miss} className="chip mob-miss">
              {t(MISS_NAMES[m.miss])}
            </span>
          ))}
        </div>
      </section>
      )}
      <section className="tr-block">
        <span className="eyebrow">{tr('Swing patterns your body tends to', 'Schwungmuster, die dein Körper begünstigt')}</span>
        <p className="muted small">{tr('How likely each is from your tests – as the TPI app\'s "body swing connection".', 'Wie wahrscheinlich jedes ist, aus deinen Tests – wie die „Body Swing Connection“ der TPI-App.')}</p>
        {[...props.patterns].sort((a, b) => likelihood(b) - likelihood(a)).map((r) => (
          <button key={r.pattern.id} type="button" className="mob-pattern" onClick={() => props.nav.push({ name: 'pattern', id: r.pattern.id })}>
            <SketchThumb sketch={r.pattern.sketch} />
            <span className="grow">
              <strong>{t(r.pattern.name)}</strong>
              {/* how likely, as the TPI app's "body swing connection" shows it: a bar, high from 66 %, moderate from 33 % */}
              <span className="mob-pct-row">
                <span className={`mob-pct ${pctLevel(likelihood(r))}`} aria-hidden="true">
                  <i style={{ width: `${Math.round(likelihood(r) * 100)}%` }} />
                </span>
                <b className={`mob-pct-label ${pctLevel(likelihood(r))}`}>
                  {Math.round(likelihood(r) * 100)} % · {pctLevel(likelihood(r)) === 'high' ? tr('high', 'hoch') : pctLevel(likelihood(r)) === 'moderate' ? tr('moderate', 'mittel') : tr('low', 'niedrig')}
                </b>
              </span>
              <span className="muted small">
                {tr('from', 'aus')}: {r.causes.map((c) => t(testById(c.test).name)).join(', ')}
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
      </section>
    </>
  );
}

function PatternView(props: { id: string; nav: Nav }) {
  const { results } = latestResults(loadScreenings());
  const hand = playerHand();
  const r = swingPatterns(results, hand).find((x) => x.pattern.id === props.id);
  if (!r) return null;
  const p = r.pattern;
  // the drills of the tests behind it, the worst first – a handful, not all
  const drills = [...new Set(r.causes.flatMap((c) => drillsOf(testById(c.test), results[c.test])))].map(drillById).filter((d): d is Drill => !!d).slice(0, 6);
  const lead = leadSide(hand);
  return (
    <main className="screen training mobility">
      <TopBar title={t(p.name)} onBack={props.nav.back} />
      <SketchView sketch={p.sketch} label={t(p.name)} />
      <section className="card tr-section">
        <span className={`mob-level ${r.level}`}>{Math.round(r.score * 100)} % · {r.level === 'likely' ? tr('likely', 'wahrscheinlich') : r.level === 'possible' ? tr('possible', 'möglich') : tr('unlikely', 'eher nicht')}</span>
        <p>{t(p.what)}</p>
        <p className="muted">{t(p.why)}</p>
        <div className="chip-set">
          {p.misses.map((m) => (
            <span key={m} className="chip mob-miss">
              {t(MISS_NAMES[m])}
            </span>
          ))}
        </div>
      </section>
      <section className="tr-block">
        <span className="eyebrow">{tr('Playing with it today', 'So spielst du heute schon damit')}</span>
        <ul className="card tr-section mob-play-now">
          {PLAY_NOW[p.id].map((x, i) => (
            <li key={i}>
              <TickIcon className="mob-play-tick" size={16} />
              {t(x)}
            </li>
          ))}
        </ul>
        <span className="muted small">{tr('Until the drills work – then the full swing comes back.', 'Bis die Übungen wirken – danach kommt der volle Schwung zurück.')}</span>
      </section>
      <section className="tr-block">
        <span className="eyebrow">{tr('Because of these tests', 'Wegen dieser Tests')}</span>
        <div className="list">
          {r.causes.map((c) => {
            const test = testById(c.test);
            const sideLabel = c.side ? ` · ${c.side === 'lead' ? tr('lead side', 'vordere Seite') : tr('trail side', 'hintere Seite')} (${sideName(c.side === 'lead' ? lead : lead === 'left' ? 'right' : 'left')})` : '';
            return (
              <button key={c.test + (c.side ?? '')} type="button" className="list-item mob-test-row" onClick={() => props.nav.push({ name: 'test', id: c.test })}>
                <TestThumb test={test} />
                <span className="grow">
                  <span className="title">{t(test.name)}</span>
                  <span className="muted small">
                    {resultText(test, results[c.test])}
                    {sideLabel}
                  </span>
                </span>
                <ResultMark r={results[c.test]} test={test} small />
              </button>
            );
          })}
        </div>
        <span className="muted small">{tr(`${r.covered[0]} of ${r.covered[1]} related tests done.`, `${r.covered[0]} von ${r.covered[1]} zugehörigen Tests gemacht.`)}</span>
      </section>
      <section className="tr-block">
        <span className="eyebrow">{tr('Drills that help', 'Übungen, die helfen')}</span>
        <DrillList drills={drills} nav={props.nav} />
      </section>
    </main>
  );
}

/** The traffic light of a measurement as the TPI form has it (Sascha 1.11.2026: "rated per test as in the original
 *  TPI – visible in the app"): pass green, limited yellow, fail or pain red. */
type Light = 'green' | 'yellow' | 'red' | 'none';
const lightOf = (m: Measurement | undefined): Light => measuredLight(m) ?? 'none';
const LIGHT_RANK: Record<Light, number> = { red: 0, yellow: 1, green: 2, none: 3 };
/** the lights of a test: one, or left and right */
const lightsOf = (test: TestDef, r: TestResult | undefined): { side: Side | null; light: Light }[] =>
  test.sides ? (['left', 'right'] as Side[]).map((side) => ({ side, light: lightOf(r?.[side] ?? r?.both) })) : [{ side: null, light: lightOf(r?.both ?? r?.left ?? r?.right) }];
const worstLight = (test: TestDef, r: TestResult | undefined): Light => lightsOf(test, r).reduce<Light>((w, x) => (LIGHT_RANK[x.light] < LIGHT_RANK[w] ? x.light : w), 'none');

function Lights(props: { test: TestDef; r: TestResult | undefined }) {
  const ls = lightsOf(props.test, props.r);
  const name = (l: Light) => (l === 'green' ? tr('good', 'gut') : l === 'yellow' ? tr('limited', 'eingeschränkt') : l === 'red' ? tr('poor', 'schlecht') : tr('not tested', 'nicht getestet'));
  return (
    <span className="mob-lights" role="img" aria-label={ls.map((x) => (x.side ? `${sideName(x.side)} ${name(x.light)}` : name(x.light))).join(', ')}>
      {ls.map((x, i) => (
        <span key={i} className="mob-light-wrap">
          <i className={`mob-dot ${x.light}`} />
          {x.side && <small>{x.side === 'left' ? 'L' : 'R'}</small>}
        </span>
      ))}
    </span>
  );
}

/** All tests at a glance, worst first – the overview of the TPI app, clearer (Sascha 1.11.2026) – or by body area. */
function BodyResult(props: { results: Partial<Record<TestId, TestResult>>; nav: Nav }) {
  const [by, setBy] = useState<'light' | 'area'>('light');
  const counts = (['red', 'yellow', 'green'] as Light[]).map((l) => TESTS.filter((x) => props.results[x.id] && worstLight(x, props.results[x.id]) === l).length);
  const order = [...TESTS].sort((a, b) => LIGHT_RANK[worstLight(a, props.results[a.id])] - LIGHT_RANK[worstLight(b, props.results[b.id])]);
  const row = (test: TestDef) => (
    <button key={test.id} type="button" className={`list-item mob-test-row mob-light-row${props.results[test.id] ? '' : ' untested'}`} onClick={() => props.nav.push({ name: 'test', id: test.id, tab: 'result' })}>
      <Lights test={test} r={props.results[test.id]} />
      <span className="grow">
        <span className="title">{t(test.name)}</span>
        <span className="muted small">{resultText(test, props.results[test.id])}</span>
      </span>
      <span aria-hidden="true">›</span>
    </button>
  );
  return (
    <>
      <section className="card mob-light-sum" aria-label={tr('The tests by their rating', 'Die Tests nach Bewertung')}>
        <span className="mob-light-count red">
          <i className="mob-dot red" /> {counts[0]} {tr('poor', 'schlecht')}
        </span>
        <span className="mob-light-count yellow">
          <i className="mob-dot yellow" /> {counts[1]} {tr('limited', 'eingeschränkt')}
        </span>
        <span className="mob-light-count green">
          <i className="mob-dot green" /> {counts[2]} {tr('good', 'gut')}
        </span>
      </section>
      <div className="chip-row mob-sort" role="group" aria-label={tr('Order', 'Sortierung')}>
        <button type="button" aria-pressed={by === 'light'} onClick={() => setBy('light')}>
          {tr('By rating', 'Nach Bewertung')}
        </button>
        <button type="button" aria-pressed={by === 'area'} onClick={() => setBy('area')}>
          {tr('By body area', 'Nach Körperbereich')}
        </button>
      </div>
      {by === 'light' ? <div className="list mob-light-list">{order.map(row)}</div> : <BodyAreas results={props.results} nav={props.nav} />}
    </>
  );
}

function BodyAreas(props: { results: Partial<Record<TestId, TestResult>>; nav: Nav }) {
  const areas = pillar(TESTS, props.results, loadGoal());
  return (
    <>
      <p className="muted small mob-scale-note">
        {loadGoal()
          ? tr('Each bar runs from little to a lot of movement; the line is where your goal asks for.', 'Jeder Balken reicht von wenig bis viel Bewegung; der Strich zeigt, was dein Ziel braucht.')
          : tr('Each bar runs from little to a lot of movement; the line is the golf value – set your goal above.', 'Jeder Balken reicht von wenig bis viel Bewegung; der Strich zeigt den Golf-Richtwert – oben dein Ziel festlegen.')}
      </p>
      {AREAS.map((a) => {
        const tests = TESTS.filter((x) => x.area === a);
        const st = areas.find((x) => x.area === a);
        return (
          <section key={a} className="tr-block">
            <div className="mob-area-head">
              <span className="eyebrow grow">{t(AREA_NAMES[a])}</span>
              {st && <LevelBar pos={st.now} target={st.target} />}
            </div>
            <div className="list">
              {tests.map((test) => (
                <button key={test.id} type="button" className={`list-item mob-test-row${props.results[test.id] ? '' : ' untested'}`} onClick={() => props.nav.push({ name: 'test', id: test.id })}>
                  <TestThumb test={test} />
                  <span className="grow">
                    <span className="title">{t(test.name)}</span>
                    <span className="muted small">{resultText(test, props.results[test.id])}</span>
                  </span>
                  <ResultMark r={props.results[test.id]} test={test} small />
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

// ---------- drills ----------

function DrillList(props: { drills: Drill[]; nav: Nav }) {
  return (
    <div className="list">
      {props.drills.map((d) => (
        <button key={d.id} type="button" className="list-item mob-test-row" onClick={() => props.nav.push({ name: 'drill', id: d.id })}>
          <SketchThumb sketch={d.sketch} />
          <span className="grow">
            <span className="title">{t(d.name)}</span>
            <span className="muted small tr-two-lines">
              {d.minutes} {tr('min', 'Min.')}
              {/* the drills the camera measures (or counts) when done with it */}
              {coachOf(d.id).signal ? ` · ${SIGNALS[coachOf(d.id).signal!].countOnly ? tr('counted by the camera', 'von der Kamera gezählt') : tr('measured by the camera', 'mit Kamera gemessen')}` : coachOf(d.id).watch ? ` · ${tr('the camera watches', 'die Kamera achtet auf')} ${t(WATCH_FOCUS[coachOf(d.id).watch!])}` : ''} · {t(d.goal)}
            </span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}

/** The drills for the tests that did not pass, worst first – and into Training as a plan. */
/** How much a test matters for the swing, 1 = most (Macro Golf, TPI): turning and separating, then posture and
 * stability, then length and the hands. REVIEW(golf) – Chris. */
const GOLF_PRIORITY: Record<TestId, number> = {
  'pelvic-rotation': 1,
  'seated-rotation': 1,
  'lower-quarter': 1,
  'shoulder-9090': 2,
  neck: 2,
  'pelvic-tilt': 2,
  'deep-squat': 3,
  bridge: 3,
  'single-leg': 3,
  'reach-roll-lift': 4,
  lat: 4,
  'toe-touch': 5,
  forearm: 5,
  'wrist-hinge': 5,
  'wrist-flex': 5,
};

/** Tests that hurt: no drills for them – a physio first (TPI: pain is its own result). */
function PainNote(props: { tests: TestDef[] }) {
  return (
    <section className="card mob-pain-note" role="note">
      <span className="mob-grade fail pain" aria-hidden="true">
        <PainIcon />
      </span>
      <span className="grow">
        <strong>{tr('Pain', 'Schmerz')}: {props.tests.map((x) => t(x.name)).join(', ')}</strong>
        <span className="small">{tr('No drills for it here – have a physio look at it first.', 'Dafür gibt es hier keine Übungen – lass das zuerst von einem Physio anschauen.')}</span>
      </span>
    </section>
  );
}

/** the minutes a day the player chose (this device) */
const MINUTES_KEY = 'golfos.mobility.minutes.v1';
function loadMinutes(): number {
  try {
    const m = Number(localStorage.getItem(MINUTES_KEY));
    // (before 31.10.2026 the choice was 10, 15 or 20 min)
    return (DAY_MINUTES as readonly number[]).includes(m) ? m : m === 20 ? 30 : 15;
  } catch {
    return 15;
  }
}
/** How a long day is built, in one line: "2 to move through · 6 for your focus (3 with more sets) · 2 for the other areas". */
function dayBlocksText(day: DayPlan, tr: (en: string, de: string) => string): string {
  const more = Object.keys(day.extraSets).length;
  const parts: string[] = [];
  if (day.warm.length) parts.push(tr(`${day.warm.length} to move through`, `${day.warm.length} zum Durchbewegen`));
  parts.push(tr(`then your focus`, `dann deine Schwerpunkte`) + (more ? tr(` (${more} with more sets)`, ` (${more} mit mehr Sätzen)`) : ''));
  return parts.join(' · ');
}
function saveMinutes(m: number): void {
  try {
    localStorage.setItem(MINUTES_KEY, String(m));
  } catch {
    /* only a preference */
  }
}

/**
 * The pillar and the plan of the day: the areas with the biggest gap to the goal, their drills (what matters most for
 * the swing first, not those that hurt), and as many minutes as the player has – the focus areas in turn (the first
 * drill of each area, then the second …), so a short plan still works on every focus. A longer day (30–60 min) adds
 * moving through first, the other areas below the goal and more sets of the focus drills (dayplan.ts).
 */
function pillarPlan(minutes: number) {
  const { results } = latestResults(loadScreenings());
  const goal = loadGoal();
  const areas = pillar(TESTS, results, goal);
  // a drill that hurt in the last 4 weeks stays out of the plan (stop sign)
  const hurt = painDrills();
  const keep = ['open-books', 'deep-squat', 'glute-bridge', 'single-leg-balance'].map(drillById).filter((d): d is Drill => !!d && !hurt.has(d.id));
  // the drills of an area: of its tests below the goal (not those that hurt), what matters most for the swing first
  const drillsFor = (area: AreaState) =>
    [
      ...new Set(
        area.tests
          .map(testById)
          .filter((x) => !hasPain(results[x.id]) && (testPos(x, results[x.id]) ?? 1) < targetPos(x, goal))
          .sort((x, y) => GOLF_PRIORITY[x.id] - GOLF_PRIORITY[y.id])
          .flatMap((x) => drillsOf(x, results[x.id])),
      ),
    ]
      .map(drillById)
      .filter((d): d is Drill => !!d && !hurt.has(d.id));
  const focus = areas.filter((x) => x.focus);
  const rest = areas.filter((x) => !x.focus);
  const lists = focus.map(drillsFor);
  const order: Drill[] = [];
  for (let i = 0; lists.some((l) => l[i]); i++) for (const l of lists) if (l[i] && !order.includes(l[i])) order.push(l[i]);
  const pool = order.length ? order : keep;
  // the other areas below the goal (biggest gap first), then the drills to keep – what a long day adds after the focus
  const more = [...rest.filter((x) => x.gap > 0).flatMap(drillsFor), ...keep].filter((d) => !pool.includes(d));
  const ids = (list: Drill[]) => list.map((d) => d.id);
  const build = (focusList: Drill[]) => buildDayPlan({ minutes, focus: ids(focusList), more: ids(more) });
  // day by day through all the drills of the focus (a coach varies them): each earlier training day moves the start
  // on by one day's worth – the same plan all of today
  const today = localDay();
  const daysBefore = new Set(loadSessions().filter((x) => x.finishedAt && localDay(x.startedAt) < today).map((x) => localDay(x.startedAt))).size;
  const perDay = build(pool).drills.filter((id) => pool.some((d) => d.id === id)).length || 1;
  const start = pool.length ? (daysBefore * perDay) % pool.length : 0;
  const day = build([...pool.slice(start), ...pool.slice(0, start)]);
  const planDrills = day.drills.map(drillById).filter((d): d is Drill => !!d);
  const planMinutes = Math.round(day.seconds / 60);
  /** the session of today's plan (with its extra sets and warm-up) */
  const planSession = () => newSession(day.drills, planMinutes, { extraSets: day.extraSets, warm: day.warm });
  return { results, goal, areas, keep, drillsFor, focus, rest, planDrills, planMinutes, planSession, day };
}

/** The range warm-up (31.10.2026): 5–7 min before the first ball, made for the areas with the biggest gap. */
function WarmupCard(props: { nav: Nav }) {
  const w = buildWarmup(pillarPlan(loadMinutes()).areas);
  return (
    <section className="tr-block mob-warmup-card">
      <span className="eyebrow">{tr('Range warm-up', 'Range-Warmup')}</span>
      <span className="muted small">{tr(`About ${warmupMinutes(w)} min ${warmupFor(w.areas)} – before the first ball, standing, with a club. The app says each step.`, `Etwa ${warmupMinutes(w)} Min. ${warmupFor(w.areas)} – vor dem ersten Ball, im Stehen, mit Schläger. Die App sagt jeden Schritt an.`)}</span>
      <button type="button" className="btn-secondary mob-warmup-open" onClick={() => props.nav.push({ name: 'warmup' })}>
        {tr('Start the warm-up', 'Warmup starten')}
      </button>
    </section>
  );
}

function DrillsTab(props: { nav: Nav }) {
  const [saved, setSaved] = useState(false);
  const [minutes, setMinutesState] = useState(loadMinutes);
  const setMinutes = (m: number) => {
    setMinutesState(m);
    saveMinutes(m);
  };
  const { results, keep, drillsFor, focus, rest, planDrills, planMinutes, planSession, day } = pillarPlan(minutes);
  const pain = TESTS.filter((x) => hasPain(results[x.id]));
  const paused = openSession();
  // the physio's plan first (Sascha 1.11.2026) – or where to import it
  const physio = <PhysioCard plan={loadPhysio()} onOpen={() => props.nav.push({ name: 'physio' })} onRun={() => props.nav.push({ name: 'physio-run' })} onImport={(p) => {
    importPlan(p);
    props.nav.push({ name: 'physio' });
  }} />;
  if (!Object.keys(results).length)
    return (
      <>
      {physio}
      <section className="tr-block mob-empty">
        <p>{tr('The drills follow from your screening.', 'Die Übungen ergeben sich aus deinem Screening.')}</p>
        <button type="button" className="btn-primary" onClick={() => props.nav.toTab('test')}>
          {tr('To the screening', 'Zum Screening')}
        </button>
      </section>
      </>
    );
  return (
    <>
      {physio}
      <GoalCard />
      {/* the paused training as a paused row of every list – the status in its own column, a tap continues (Facelift
          11.11.2026, a7: as the paused screening on the Screening tab) */}
      {paused && (
        <button type="button" className="list-item mob-open mob-train-open" onClick={() => props.nav.train(paused)}>
          <span className="list-mark">
            <PausedMark />
          </span>
          <span className="grow">
            <span className="title">{tr('Training', 'Training')}</span>
            <span className="muted small">{tr(`Paused · ${paused.done.length} of ${paused.drills.length} drills done`, `Pausiert · ${paused.done.length} von ${paused.drills.length} Übungen erledigt`)}</span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      {pain.length > 0 && <PainNote tests={pain} />}
      <section className="tr-block">
        <span className="eyebrow">{tr('Your mobility pillar', 'Deine Säule Beweglichkeit')}</span>
        <p className="muted small">{tr('For your goal: the areas with the biggest gap first, with the drills for home.', 'Für dein Ziel: die Bereiche mit dem größten Abstand zuerst, mit den Übungen für zu Hause.')}</p>
      </section>
      {focus.length === 0 ? (
        <section className="tr-block">
          <span className="eyebrow">{tr('Keep it', 'Erhalten')}</span>
          <DrillList drills={keep} nav={props.nav} />
        </section>
      ) : (
        focus.map((x) => (
          <section key={x.area} className="tr-block mob-pillar-area">
            <div className="mob-drill-head">
              <span className="eyebrow grow">{t(AREA_NAMES[x.area])}</span>
              <LevelBar pos={x.now} target={x.target} />
            </div>
            <span className="muted small">{x.tests.map((id) => `${t(testById(id).name)}: ${resultText(testById(id), results[id])}`).join(' · ')}</span>
            <DrillList drills={drillsFor(x)} nav={props.nav} />
          </section>
        ))
      )}
      {rest.length > 0 && (
        <section className="tr-block">
          <span className="eyebrow">{tr('The other areas', 'Die anderen Bereiche')}</span>
          <div className="list">
            {rest.map((x) => (
              <div key={x.area} className="list-item mob-area-row">
                <span className="grow">
                  <span className="title">{t(AREA_NAMES[x.area])}</span>
                  <span className="muted small">{x.gap <= 0 ? tr('where your goal asks for', 'dort, wo dein Ziel es braucht') : tr('close to your goal', 'nah an deinem Ziel')}</span>
                </span>
                <LevelBar pos={x.now} target={x.target} small />
              </div>
            ))}
          </div>
        </section>
      )}
      <WarmupCard nav={props.nav} />
      <section className="tr-block mob-plan-time">
        <span className="eyebrow">{tr('Your time a day', 'Deine Zeit am Tag')}</span>
        <div className="chip-set">
          {DAY_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              className={`chip${minutes === m ? ' on' : ''}`}
              aria-pressed={minutes === m}
              onClick={() => {
                setMinutes(m);
                setSaved(false);
              }}
            >
              {m} {tr('min', 'Min.')}
            </button>
          ))}
        </div>
        <span className="muted small">{tr(`${planDrills.length} drills, about ${planMinutes} min – from your focus areas in turn, other ones each training day`, `${planDrills.length} Übungen, etwa ${planMinutes} Min. – abwechselnd aus deinen Schwerpunkten, jeden Trainingstag andere`)}</span>
        {minutes >= 30 && <span className="muted small mob-plan-blocks">{dayBlocksText(day, tr)}</span>}
      </section>
      {/* the plan for Training as an action of the bar, the main button the last thing on the page (Facelift 11.11.2026, a7) */}
      <div className="sticky-cta">
        <MobActionBar
          label={tr('The plan of the day', 'Der Plan des Tages')}
          actions={[
            !saved && {
              label: tr('Into Training', 'Ins Training'),
              aria: tr(`Take the ${minutes}-minute plan into Training`, `${minutes}-Minuten-Plan ins Training übernehmen`),
              icon: 'add',
              onClick: () => {
                saveOwnPlan({
                  id: trainingId(),
                  name: `Agility · ${minutes} ${tr('min', 'Min.')} · ${dateText(new Date().toISOString())}`,
                  items: planDrills.map((d) => ({ drill: d.id, minutes: Math.max(1, Math.round(drillTime(d.id, day.extraSets[d.id]) / 60)) })),
                  createdAt: new Date().toISOString(),
                });
                setSaved(true);
              },
            },
            saved && !!props.nav.openTraining && { label: tr('Open Training', 'Training öffnen'), icon: 'open', onClick: props.nav.openTraining },
          ]}
        />
        {saved && <span className="muted small mob-saved">{tr('The plan is in Training now, under “My plans”.', 'Der Plan liegt jetzt im Training unter „Meine Pläne“.')}</span>}
        <button type="button" className="btn-primary mob-train-start" onClick={() => props.nav.train(planSession())}>
          {tr(`Train now – ${planMinutes} min with the camera`, `Jetzt trainieren – ${planMinutes} Min. mit Kamera`)}
        </button>
      </div>
    </>
  );
}

/** what a goal handicap means, one line in its sheet */
const GOAL_TEXT: Record<number, () => string> = {
  36: () => tr('Getting started – moving freely enough for a whole round', 'Einstieg – beweglich genug für eine ganze Runde'),
  28: () => tr('Leisure golfer – a repeatable swing', 'Freizeitgolfer – ein wiederholbarer Schwung'),
  20: () => tr('Solid club player', 'Solider Clubspieler'),
  15: () => tr('Good club player – full turn, stable on one leg', 'Guter Clubspieler – volle Drehung, stabil auf einem Bein'),
  10: () => tr('Single figures in reach', 'Einstellig in Reichweite'),
  5: () => tr('Strong amateur', 'Starker Amateur'),
  0: () => tr('Team level – every value at the target', 'Mannschaftsniveau – jeder Wert am Ziel'),
};

/**
 * The goal (Sascha 18.10.2026: "from the analysis ask for the player's goals, e.g. the handicap"): the handicap to
 * reach and what matters most – it sets the line on every bar and the order of the pillar.
 */
function GoalCard() {
  const [goal, setGoal] = useState<MobilityGoal | null>(() => loadGoal());
  const [hcp, setHcp] = useState<number | null>(goal?.hcp ?? null);
  const [focus, setFocus] = useState<Focus[]>(goal?.focus ?? []);
  // the save rule (docs/DESIGN.md, Facelift 11.11.2026, a4): the first goal with the floating tick; a goal there already
  // changed saves by itself a moment after the last change (and when the page closes), with the quiet line
  const [saving, setSaving] = useState<'' | 'busy' | 'done'>('');
  const pending = useRef<MobilityGoal | null>(null);
  const timer = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current) saveGoal(pending.current);
    },
    [],
  );
  const change = (h: number | null, f: Focus[]) => {
    setHcp(h);
    setFocus(f);
    if (!goal || h == null) return;
    pending.current = { ...goal, hcp: h, focus: f, at: new Date().toISOString() };
    setSaving('busy');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const g = pending.current;
      pending.current = null;
      if (g) {
        saveGoal(g);
        setGoal(g);
      }
      setSaving('done');
    }, 900);
  };
  const create = () => {
    if (hcp == null) return;
    const g: MobilityGoal = { id: 'goal', hcp, focus, at: new Date().toISOString() };
    saveGoal(g);
    setGoal(g);
    setSaving('');
  };
  const now = profileIndex();
  const hcpName = (h: number) => (h === 0 ? 'Scratch' : String(h));
  return (
    <section className="mob-goal">
      <span className="eyebrow">{tr('Your goal', 'Dein Ziel')}</span>
      {!goal && (
        <span className="muted small">
          {now != null ? tr(`Your handicap now: ${String(now).replace('-', '+')}. `, `Dein Handicap jetzt: ${String(now).replace('.', ',').replace('-', '+')}. `) : ''}
          {tr('The values you need follow from the handicap you want to reach.', 'Aus dem Handicap, das du erreichen willst, ergibt sich, welche Werte du brauchst.')}
        </span>
      )}
      {/* seven values: a row with its sheet, as "Format" in the round setup (docs/DESIGN.md) */}
      <SettingsList>
        <ChoiceRow<number | null>
          label={tr('Handicap to reach', 'Ziel-Handicap')}
          options={GOAL_STEPS.map((h) => ({ value: h, name: hcpName(h), text: GOAL_TEXT[h]?.() }))}
          value={hcp}
          prompt={tr('Choose', 'Wählen')}
          onChange={(h) => change(h, focus)}
        />
      </SettingsList>
      <span className="eyebrow">{tr('What matters most to you (optional)', 'Was dir wichtig ist (optional)')}</span>
      <div className="chip-set">
        {(Object.keys(FOCUS_NAMES) as Focus[]).map((f) => (
          <button key={f} type="button" className={`chip${focus.includes(f) ? ' on' : ''}`} aria-pressed={focus.includes(f)} onClick={() => change(hcp, focus.includes(f) ? focus.filter((x) => x !== f) : [...focus, f])}>
            {t(FOCUS_NAMES[f])}
          </button>
        ))}
      </div>
      {goal ? (
        <span className="muted small autosave-note" role="status">
          {saving === 'busy' ? tr('Saving …', 'Speichert …') : saving === 'done' ? tr('Saved', 'Gespeichert') : tr('Changes are saved by themselves', 'Änderungen werden von selbst gespeichert')}
        </span>
      ) : (
        hcp != null && <FloatActions save={{ label: tr('Save the goal', 'Ziel speichern'), onClick: create }} />
      )}
    </section>
  );
}

/** A drill – in tabs like the drill page of Training (Sascha 17.10.2026: no one-pager): how to · videos. */
function DrillView(props: { id: string; nav: Nav }) {
  const d = drillById(props.id);
  const [tab, setTab] = useState<'learn' | 'videos'>('learn');
  if (!d) return null;
  const videos = d.videos ?? [];
  return (
    <main className="screen training mobility">
      <TopBar title={t(d.name)} onBack={props.nav.back} />
      {/* the views as the app's switch "‹ Anleitung ›" (Facelift 11.11.2026, a1) */}
      {videos.length > 0 && (
        <StepPick<'learn' | 'videos'>
          label={tr('View', 'Ansicht')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'learn', name: tr('How to', 'Anleitung') },
            { value: 'videos', name: 'Videos' },
          ]}
        />
      )}
      {tab === 'videos' ? (
        <>
          {videos.map((v) => (
            <VideoCard key={v.id} v={v} />
          ))}
          <VideoNote />
        </>
      ) : (
        <>
          <DrillHow d={d} />
          <DrillValues id={d.id} />
          <div className="sticky-cta">
            <button type="button" className="btn-primary mob-drill-start" onClick={() => props.nav.train(newSession([d.id], d.minutes))}>
              {tr('Do it with the camera', 'Mit Kamera mitmachen')}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

/** What the camera measured in this drill, session by session (newest first) – the way there. */
function DrillValues(props: { id: string }) {
  const sig = coachOf(props.id).signal;
  if (!sig || sig === 'oneLeg') return null;
  const def = SIGNALS[sig];
  const list = drillHistory(props.id, def.better);
  if (!list.length) return null;
  const vals = list.map((x) => x.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pos = (v: number) => (hi === lo ? 1 : def.better === 'up' ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo));
  return (
    <section className="tr-block mob-drill-values">
      <span className="eyebrow">{tr('Your values', 'Deine Werte')}</span>
      <span className="muted small">{cap(t(def.name))}</span>
      <div className="list">
        {[...list].reverse().slice(0, 6).map((x) => (
          <div key={x.at} className="list-item mob-area-row">
            <span className="grow">
              <span className="title">{signalValueText(sig, x.value, tr)}</span>
              <span className="muted small">{dateText(x.at)}</span>
            </span>
            <LevelBar pos={0.15 + 0.85 * pos(x.value)} small />
          </div>
        ))}
      </div>
    </section>
  );
}

/** The 3D video of the drill on top (like the tests), the steps, the sketch below; without a video the sketch leads. */
function DrillHow(props: { d: Drill }) {
  const d = props.d;
  const clip = DRILL_CLIPS[d.id];
  return (
    <>
      {clip && (
        <Suspense fallback={<div className="mob-3d-wait" />}>
          <Anim3D clip={clip} say={[t(d.setup), ...d.steps.map(t)]} />
        </Suspense>
      )}
      {!clip && d.sketch && <SketchView sketch={d.sketch} label={t(d.name)} />}
      <section className="card tr-section">
        <p className="mob-why">{t(d.goal)}</p>
        <ol className="tr-steps">
          <li>{t(d.setup)}</li>
          {d.steps.map((s, i) => (
            <li key={i}>{t(s)}</li>
          ))}
        </ol>
        <span className="muted small">
          {d.minutes} {tr('min', 'Min.')}
        </span>
      </section>
      {clip && d.sketch && <SketchView sketch={d.sketch} label={t(d.name)} />}
    </>
  );
}

// ---------- history ----------

/**
 * What changed since the screening before (Sascha 18.10.2026: "repeat the analysis later to see how far the values
 * changed"): each area measured both times, where it stands now and by how many points of its scale it moved.
 */
function ChangeCard(props: { list: Screening[] }) {
  const done = props.list.filter((s) => s.kind !== 'single' && Object.keys(s.results).length).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (done.length < 2) return null;
  const [prev, last] = done.slice(-2);
  const goal = loadGoal();
  const before = pillar(TESTS, prev.results, goal);
  const now = pillar(TESTS, last.results, goal);
  const rows = AREAS.map((a) => ({ a, b: before.find((x) => x.area === a), n: now.find((x) => x.area === a) })).filter((x): x is { a: Area; b: AreaState; n: AreaState } => !!x.b && !!x.n);
  if (!rows.length) return null;
  // the overall value then and now (the same goal for both)
  const s0 = mobilityScore(TESTS, prev.results, goal)?.score;
  const s1 = mobilityScore(TESTS, last.results, goal)?.score;
  return (
    <section className="card mob-change">
      <strong>{tr(`Since ${dateText(prev.createdAt)}`, `Seit dem ${dateText(prev.createdAt)}`)}</strong>
      {s0 != null && s1 != null && (
        <span className="small mob-change-score">
          {tr('Your mobility', 'Deine Beweglichkeit')} {s0} → <strong>{s1}</strong>
          <span className={s1 > s0 ? ' good-text' : ' muted'}> ({s1 === s0 ? tr('the same', 'gleich') : `${s1 > s0 ? '+' : '−'}${Math.abs(s1 - s0)}`})</span>
        </span>
      )}
      <div className="list">
        {rows.map(({ a, b, n }) => {
          const d = Math.round((n.now - b.now) * 100);
          return (
            <div key={a} className="list-item mob-area-row">
              <span className="grow">
                <span className="title">{t(AREA_NAMES[a])}</span>
                <span className={`small${d > 0 ? ' good-text' : ' muted'}`}>{d === 0 ? tr('the same', 'gleich') : `${d > 0 ? '+' : '−'}${Math.abs(d)} %`}</span>
              </span>
              <LevelBar pos={n.now} target={n.target} small />
            </div>
          );
        })}
      </div>
      <span className="muted small">{tr('Areas: per cent of each scale from little to a lot of movement.', 'Bereiche: Prozent der Skala von wenig bis viel Bewegung.')}</span>
    </section>
  );
}

type HistoryFilter = 'done' | 'paused' | 'training' | 'bin';

function HistoryTab(props: { nav: Nav }) {
  const list = loadScreenings();
  const trash = loadScreeningTrash();
  const trained = loadSessions().filter((s) => s.done.length);
  const isPaused = (s: Screening) => !s.finishedAt && s.kind !== 'single';
  const paused = list.filter(isPaused);
  const done = list.filter((s) => !isPaused(s));
  const [filter, setFilter] = useState<HistoryFilter | null>(null);
  const pick = (x: HistoryFilter) => setFilter(filter === x ? null : x);
  // a tile's rows all gone: everything again
  useEffect(() => {
    if ((filter === 'bin' && !trash.length) || (filter === 'paused' && !paused.length) || (filter === 'done' && !done.length) || (filter === 'training' && !trained.length)) setFilter(null);
  }, [trash.length, paused.length, done.length, trained.length]);
  const tiles = (
    <div className="tile-row mob-history-tiles">
      <button type="button" className="tile" aria-pressed={filter === 'done'} disabled={!done.length} onClick={() => pick('done')}>
        <span className="tile-head">
          <span className="tile-num">{done.length}</span>
          <span className="tile-mark">{ICONS.test}</span>
        </span>
        <span className="muted small">{tr('screenings', 'Screenings')}</span>
      </button>
      <button type="button" className="tile" aria-pressed={filter === 'paused'} disabled={!paused.length} onClick={() => pick('paused')}>
        <span className="tile-head">
          <span className={`tile-num${paused.length ? ' good-text' : ''}`}>{paused.length}</span>
          <span className="tile-mark">
            <PausedIcon />
          </span>
        </span>
        <span className="muted small">{tr('paused', 'pausiert')}</span>
      </button>
      {/* the guided sessions – as the tile of Training's Verlauf */}
      <button type="button" className="tile" aria-pressed={filter === 'training'} disabled={!trained.length} onClick={() => pick('training')}>
        <span className="tile-head">
          <span className="tile-num">{trained.length}</span>
          <span className="tile-mark">{ICONS.drills}</span>
        </span>
        <span className="muted small">{tr('sessions', 'Einheiten')}</span>
      </button>
      {/* deleted screenings – always there, with 0 and white when the bin is empty, as on the rounds page */}
      <button type="button" className="tile" aria-pressed={filter === 'bin'} disabled={!trash.length} onClick={() => pick('bin')}>
        <span className="tile-head">
          <span className="tile-num">{trash.length}</span>
          <span className="tile-mark">
            <DeletedIcon />
          </span>
        </span>
        <span className="muted small">{tr('deleted', 'gelöscht')}</span>
      </button>
    </div>
  );
  const bin = (
    <Bin
      open={filter === 'bin'}
      title={tr('Deleted screenings', 'Gelöschte Screenings')}
      items={trash.map((x) => ({ id: x.screening.id, date: x.screening.createdAt, title: screeningName(x.screening), meta: tr(`${Object.keys(x.screening.results).length} tests measured`, `${Object.keys(x.screening.results).length} Tests gemessen`), deletedAt: x.deletedAt }))}
      onRestore={(id) => restoreScreening(id)}
      onPurge={(id) => purgeScreening(id)}
    />
  );
  if (!list.length && !trained.length)
    return (
      <>
      {tiles}
      {bin}
      {filter !== 'bin' && (
      <section className="tr-block mob-empty">
        <p>{tr('Your screenings appear here – repeat one every few weeks to see the progress.', 'Hier erscheinen deine Screenings – wiederhole eins alle paar Wochen, um den Fortschritt zu sehen.')}</p>
        <button type="button" className="btn-primary" onClick={() => props.nav.toTab('test')}>
          {tr('To the screening', 'Zum Screening')}
        </button>
        <KeptLogs />
      </section>
      )}
      </>
    );
  const full = list.filter((s) => s.kind !== 'single' && Object.keys(s.results).length).reverse();
  const rows = filter === 'done' ? done : filter === 'paused' ? paused : list;
  const goal = loadGoal();
  return (
    <>
      {tiles}
      {bin}
      {filter == null && <ChangeCard list={list} />}
      {(filter == null || filter === 'training') && <TrainProgress />}
      {(filter == null || filter === 'training') && <TrainHistory />}
      {filter == null && full.length >= 2 && (
        <figure className="mob-chart" aria-label={tr('Your mobility per screening', 'Deine Beweglichkeit je Screening')}>
          <div className="mob-bars">
            {full.slice(-8).map((s, i, shown) => {
              const sc = mobilityScore(TESTS, s.results, goal)?.score ?? 0;
              return (
                <div key={s.id} className="mob-bar">
                  <span className="small">{sc}</span>
                  <i className={i === shown.length - 1 ? 'pass' : ''} style={{ height: `${Math.max(6, sc)}%` }} />
                  <span className="muted small">{new Date(s.createdAt).toLocaleDateString(tr('en-GB', 'de-DE'), { day: 'numeric', month: 'numeric' })}</span>
                </div>
              );
            })}
          </div>
          <figcaption className="muted small">{tr(`Your mobility per screening (100 = every value at the goal for handicap ${goal?.hcp ?? 10})`, `Deine Beweglichkeit je Screening (100 = alle Werte am Ziel für Handicap ${goal?.hcp ?? 10})`)}</figcaption>
        </figure>
      )}
      {filter !== 'training' && filter !== 'bin' && (
      <div className="list">
        {rows.map((s) => {
          const n = Object.keys(s.results).length;
          const anyPaused = rows.some((x) => !x.finishedAt && x.kind !== 'single');
          return (
            // swiped away as a mail (Sascha 02.11.2026) – into the bin, "Undo" brings it back
            <SwipeRow key={s.id} label={screeningName(s)} onDelete={() => deleteScreening(s.id, `${kindName(s.kind)} · ${dateText(s.createdAt)}`)}>
            <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'screening', id: s.id })}>
              {/* the status in its own column before the name – kept free on the other rows while one is paused, so the
                  names start one under the other (Sascha 11.11.2026, status mockups: variant A) */}
              {anyPaused && <span className="list-mark">{!s.finishedAt && s.kind !== 'single' && <PausedMark />}</span>}
              <span className="grow">
                <span className="title">
                  {screeningName(s)}
                  {s.kind === 'single' && s.tests[0] ? ` · ${t(testById(s.tests[0]).name)}` : ''}
                </span>
                <span className="muted small">
                  {dateText(s.createdAt)} · {tr(`${n} tests measured`, `${n} Tests gemessen`)}
                  {s.kind !== 'single' && mobilityScore(TESTS, s.results, goal) ? ` · ${tr('mobility', 'Beweglichkeit')} ${mobilityScore(TESTS, s.results, goal)!.score}` : ''}
                </span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
            </SwipeRow>
          );
        })}
      </div>
      )}
      {filter == null && <KeptLogs />}
    </>
  );
}

/** What the guided training measured, first time against the last – per drill with at least two values. */
function TrainProgress() {
  const rows = Object.keys(DRILL_COACH)
    .map((id) => {
      const sig = coachOf(id).signal;
      if (!sig || sig === 'oneLeg' || SIGNALS[sig].countOnly) return null;
      const def = SIGNALS[sig];
      const h = drillHistory(id, def.better);
      if (h.length < 2) return null;
      const first = h[0];
      const last = h[h.length - 1];
      const d = Math.round((last.value - first.value) * 10) / 10;
      return { id, sig, def, first, last, d, n: h.length, better: def.better === 'up' ? d > 0 : d < 0 };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);
  if (!rows.length) return null;
  return (
    <section className="card mob-change mob-train-progress">
      <strong>{tr('Progress in the training', 'Fortschritt im Training')}</strong>
      <div className="list">
        {rows.map((r) => (
          <div key={r.id} className="list-item mob-area-row">
            <span className="grow">
              <span className="title">{t(drillById(r.id)?.name ?? { en: r.id, de: r.id })}</span>
              <span className="muted small">
                {dateText(r.first.at)}: {signalValueText(r.sig, r.first.value, tr)} → {dateText(r.last.at)}: {signalValueText(r.sig, r.last.value, tr)}
              </span>
            </span>
            <span className={`small${r.better ? ' good-text' : ' muted'}`}>
              {Math.abs(r.d) < (r.def.unit === '°' ? 3 : 1) ? tr('the same', 'gleich') : `${r.d > 0 ? '+' : '−'}${String(r.def.unit === '°' ? Math.round(Math.abs(r.d)) : Math.abs(r.d)).replace('.', tr('.', ','))}${r.def.unit === '°' ? '°' : ` ${r.def.unit}`}`}
            </span>
          </div>
        ))}
      </div>
      <span className="muted small">{tr(`${rows.length === 1 ? 'The measured drill' : 'The measured drills'}, first time against the last.`, `${rows.length === 1 ? 'Die gemessene Übung' : 'Die gemessenen Übungen'}, das erste gegen das letzte Mal.`)}</span>
    </section>
  );
}

/** The guided sessions: the days trained in the last week and each session with what was done. */
function TrainHistory() {
  const list = loadSessions().filter((s) => s.done.length);
  if (!list.length) return null;
  const days = daysThisWeek();
  return (
    <section className="tr-block mob-train-history">
      <span className="eyebrow">{tr('Training', 'Training')}</span>
      <span className="muted small">{tr(`${days} ${days === 1 ? 'day' : 'days'} in the last 7`, `${days} ${days === 1 ? 'Tag' : 'Tage'} in den letzten 7`)}</span>
      <div className="list">
        {list.slice(0, 10).map((s) => {
          const done = s.done.filter((d) => !d.skipped);
          return (
            <div key={s.id} className="list-item mob-train-row">
              {/* the status in its own column, kept free on the other rows while one is paused (variant A, 11.11.2026) */}
              {list.slice(0, 10).some((x) => !x.finishedAt) && <span className="list-mark">{!s.finishedAt && <PausedMark />}</span>}
              <span className="grow">
                <span className="title">{dateText(s.startedAt)}</span>
                <span className="muted small">{done.map((d) => `${t(drillById(d.drill)?.name ?? { en: d.drill, de: d.drill })} (${doneText(d)})`).join(' · ')}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ScreeningView(props: { id: string; nav: Nav }) {
  const s = screeningById(props.id);
  if (!s) return null;
  const paused = !s.finishedAt && s.kind !== 'single';
  const n = Object.keys(s.results).length;
  const score = s.kind !== 'single' ? mobilityScore(TESTS, s.results, loadGoal()) : null;
  return (
    <main className="screen training mobility">
      <TopBar title={screeningName(s)} onBack={props.nav.back} />
      <span className="muted small mob-sub">
        {[dateText(s.createdAt), s.kind === 'single' ? t(testById(s.tests[0]).name) : s.from ? kindName(s.kind) : '', s.hand === 'right' ? tr('right-handed', 'Rechtshänder') : tr('left-handed', 'Linkshänder')].filter(Boolean).join(' · ')}
      </span>
      <section className="card mob-screening-status">
        <span className="grow">
          <strong>
            {paused ? tr('Paused', 'Pausiert') : tr('Finished', 'Abgeschlossen')} {paused && <PausedMark />}
          </strong>
          <span className="muted small">
            {tr(`${n} of ${s.tests.length} tests measured`, `${n} von ${s.tests.length} Tests gemessen`)}
            {score ? ` · ${tr('mobility', 'Beweglichkeit')} ${score.score} / 100` : ''}
          </span>
        </span>
      </section>
      <span className="eyebrow">{tr('Tests', 'Tests')}</span>
      <div className="list">
        {s.tests.map((id) => {
          const test = testById(id);
          return (
            <button key={id} type="button" className={`list-item mob-test-row${s.results[id] ? '' : ' untested'}`} onClick={() => props.nav.push({ name: 'test', id })}>
              <TestThumb test={test} />
              <span className="grow">
                <span className="title">{t(test.name)}</span>
                <span className="muted small">{s.skipped?.includes(id) && !s.results[id] ? tr('skipped', 'übersprungen') : resultText(test, s.results[id])}</span>
              </span>
              <ResultMark r={s.results[id]} test={test} small />
            </button>
          );
        })}
      </div>
      {/* its actions as one bar, as the scorecard of Rounds – Löschen red and last (docs/DESIGN.md) */}
      <div className="sc-actions mob-screening-actions" role="group" aria-label={tr('This screening', 'Dieses Screening')}>
        <button
          type="button"
          className="sc-action"
          onClick={() => {
            const again = newScreening(s.kind, s.kind === 'single' ? s.tests : s.kind === 'quick' ? QUICK : FULL);
            saveScreening(again);
            props.nav.run(again);
          }}
        >
          <RepeatIcon />
          <span>{tr('Repeat', 'Wiederholen')}</span>
        </button>
        <button
          type="button"
          className="sc-action danger"
          onClick={() => {
            deleteScreening(s.id, `${kindName(s.kind)} · ${dateText(s.createdAt)}`);
            props.nav.back();
          }}
        >
          <DeletedIcon size={22} />
          <span>{tr('Delete', 'Löschen')}</span>
        </button>
      </div>
      {paused && (
        <div className="sticky-cta">
          <button type="button" className="btn-primary" onClick={() => props.nav.run(s)}>
            {tr('Continue', 'Fortsetzen')}
          </button>
        </div>
      )}
    </main>
  );
}
