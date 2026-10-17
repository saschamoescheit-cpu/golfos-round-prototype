import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { tr } from '../lib/i18n';
import { isLeftHanded } from '../lib/profile';
import { MENU_ICONS, MenuBar } from '../components/TabBar';
import { TopTools } from '../components/TopTools';
import { TopBar } from '../components/ui';
import { PausedIcon } from '../components/PausedIcon';
import { drillById } from '../training/content';
import { SketchThumb, SketchView } from '../training/Sketch';
import { VideoCard, VideoNote } from '../training/ui';
import { saveOwnPlan, trainingId } from '../training/store';
import type { Drill, L } from '../training/types';
import { DRILL_CLIPS } from '../mobility/anim3d/drills';
import { CameraTest, gradeName, sideText, unlockAudio } from '../mobility/CameraTest';
import { valueText } from '../mobility/measure';
import { PhoneSetup, TopTurn } from '../mobility/pictures';
import { deleteScreening, discardEmpty, loadScreenings, newScreening, saveScreening, screeningById, withResult } from '../mobility/store';
import { leadSide, likelyMisses, latestResults, MISS_NAMES, swingPatterns, testGrade, type PatternResult } from '../mobility/swing';
import { FULL, QUICK, TESTS, TestPicture, testById } from '../mobility/tests';
import type { Area, Grade, Measurement, Screening, Side, TestDef, TestId, TestResult } from '../mobility/types';
import '../training/training.css';
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
  | { name: 'test'; id: TestId }
  | { name: 'run'; id: string }
  | { name: 'screening'; id: string }
  | { name: 'drill'; id: string }
  | { name: 'pattern'; id: string };

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
const GLYPH: Record<Grade, string> = { pass: '✓', limited: '–', fail: '✕' };
const sideName = (s: Side) => (s === 'left' ? tr('left', 'links') : tr('right', 'rechts'));
const dateText = (iso: string) => new Date(iso).toLocaleDateString(tr('en-GB', 'de-DE'), { day: 'numeric', month: 'short', year: 'numeric' });
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

/** The value of a result in words – both sides for sided tests ("left 48° · right 39°"). */
function resultText(test: TestDef, r: TestResult | undefined): string {
  if (!r) return tr('not tested yet', 'noch nicht getestet');
  const one = (m: Measurement) => (m.source === 'self' ? tr('self-judged', 'selbst eingeschätzt') : test.metric ? valueText(test.metric, m.value, tr) : '');
  if (r.both) return `${one(r.both)}`;
  return (['left', 'right'] as Side[])
    .filter((s) => r[s])
    .map((s) => `${sideName(s)} ${one(r[s]!)}`)
    .join(' · ');
}

function GradeMark(props: { grade: Grade | null; small?: boolean }) {
  if (!props.grade) return <span className={`mob-grade none${props.small ? ' small' : ''}`} aria-label={tr('not tested', 'nicht getestet')} />;
  return (
    <span className={`mob-grade ${props.grade}${props.small ? ' small' : ''}`} aria-label={gradeName(props.grade)}>
      {GLYPH[props.grade]}
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
  const nav: Nav = { push, back, toTab, run: (s) => setStack([{ name: 'tab', tab: 'test' }, { name: 'run', id: s.id }]), replace: (v) => setStack([...stack.slice(0, -1), v]), openTraining: props.onOpenTraining };

  if (view.name === 'run') {
    const s = screeningById(view.id);
    if (s)
      return (
        <ScreeningPlay
          screening={s}
          onPause={() => toTab('test')}
          onFinished={(done) => (done.kind === 'single' ? setStack([{ name: 'tab', tab: 'test' }, { name: 'test', id: done.tests[0] }]) : setStack([{ name: 'tab', tab: 'result' }]))}
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
          <button type="button" className="module-switch" onClick={props.onModules} aria-label={tr('Switch module', 'Modul wechseln')}>
            <span className="brand">
              GOLF<span>OS</span>
            </span>
            <span className="module-tag">Agility</span>
            <span aria-hidden="true">⇄</span>
          </button>
          <TopTools />
        </div>
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
      {view.name === 'test' && <TestView id={view.id} nav={nav} />}
      {view.name === 'screening' && <ScreeningView id={view.id} nav={nav} />}
      {view.name === 'drill' && <DrillView id={view.id} nav={nav} />}
      {view.name === 'pattern' && <PatternView id={view.id} nav={nav} />}
      <MobilityMenu current={root} onPick={toTab} profileDot={props.profileDot} />
    </div>
  );
}

interface Nav {
  push: (v: View) => void;
  back: () => void;
  toTab: (t: MobilityTab) => void;
  run: (s: Screening) => void;
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

function TestTab(props: { nav: Nav }) {
  const all = loadScreenings();
  const open = all.filter((s) => !s.finishedAt && s.kind !== 'single');
  const { results } = latestResults(all);
  const start = (kind: 'quick' | 'full') => {
    const s = newScreening(kind, kind === 'quick' ? QUICK : FULL);
    saveScreening(s);
    props.nav.run(s);
  };
  return (
    <>
      {open.map((s) => (
        <button key={s.id} type="button" className="list-item mob-open" onClick={() => props.nav.run(s)}>
          <span className="grow">
            <span className="title">
              {kindName(s.kind)} <PausedMark />
            </span>
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
      <section className="tr-block">
        <h2>{tr('Single tests', 'Einzelne Tests')}</h2>
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
                <GradeMark grade={testGrade(results[id])} small />
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
function TestView(props: { id: TestId; nav: Nav }) {
  const test = testById(props.id);
  const [tab, setTab] = useState<'how' | 'result' | 'drills'>('how');
  const all = loadScreenings();
  const history = all
    .map((s) => ({ s, r: s.results[props.id] }))
    .filter((x): x is { s: Screening; r: TestResult } => !!x.r)
    .sort((a, b) => b.s.createdAt.localeCompare(a.s.createdAt));
  const drills = test.drills.map(drillById).filter((d): d is Drill => !!d);
  return (
    <main className="screen training mobility">
      <TopBar title={t(test.name)} onBack={props.nav.back} />
      <div className="segmented tr-tabs" role="tablist">
        {(
          [
            ['how', tr('How it works', 'Ablauf')],
            ['result', tr('Results', 'Ergebnisse')],
            ['drills', tr('Drills', 'Übungen')],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'how' && <TestBrief test={test} side={null} />}
      {tab === 'result' && (
        <section className="tr-block">
          {history.length === 0 ? (
            <p className="muted">{tr('Not tested yet.', 'Noch nicht getestet.')}</p>
          ) : (
            <>
              {test.metric && <HistoryChart test={test} history={history} />}
              <div className="list">
                {history.map(({ s, r }) => (
                  <button key={s.id} type="button" className="list-item" onClick={() => props.nav.push({ name: 'screening', id: s.id })}>
                    <span className="grow">
                      <span className="title">{resultText(test, r)}</span>
                      <span className="muted small">
                        {dateText(s.createdAt)} · {kindName(s.kind)}
                      </span>
                    </span>
                    <GradeMark grade={testGrade(r)} small />
                  </button>
                ))}
              </div>
            </>
          )}
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

/** The measured values of a test over time (the better side and the worse side as bars). */
function HistoryChart(props: { test: TestDef; history: { s: Screening; r: TestResult }[] }) {
  const pts = [...props.history].reverse().slice(-8);
  const val = (r: TestResult): number | null => {
    const ms = [r.both, r.left, r.right].filter((m): m is Measurement => !!m && m.value != null);
    if (!ms.length) return null;
    const vs = ms.map((m) => m.value!);
    // the worse side counts (for the toe touch and the 90/90 a smaller value is better)
    const lowerBetter = props.test.metric === 'toeTouch' || props.test.metric === 'shoulder9090';
    return lowerBetter ? Math.max(...vs) : Math.min(...vs);
  };
  const vals = pts.map((p) => val(p.r));
  const max = Math.max(1, ...vals.map((v) => Math.abs(v ?? 0)));
  if (vals.filter((v) => v != null).length < 2) return null;
  return (
    <figure className="mob-chart" aria-label={tr('Your values over time', 'Deine Werte im Verlauf')}>
      <div className="mob-bars">
        {pts.map((p, i) => (
          <div key={p.s.id} className="mob-bar">
            <span className="small">{vals[i] == null ? '–' : Math.round(vals[i]!)}</span>
            <i className={testGrade(p.r) ?? ''} style={{ height: `${Math.max(6, (Math.abs(vals[i] ?? 0) / max) * 100)}%` }} />
            <span className="muted small">{new Date(p.s.createdAt).toLocaleDateString(tr('en-GB', 'de-DE'), { day: 'numeric', month: 'numeric' })}</span>
          </div>
        ))}
      </div>
      <figcaption className="muted small">{tr('The weaker side counts.', 'Es zählt die schwächere Seite.')}</figcaption>
    </figure>
  );
}

/** Picture, phone, steps and goal of a test. */
function TestBrief(props: { test: TestDef; side: Side | null; noPicture?: boolean }) {
  const test = props.test;
  const top = test.metric === 'trunkRotation' ? <TopTurn part="shoulders" goal={45} still="hips" /> : test.metric === 'pelvicRotation' ? <TopTurn part="hips" goal={30} still="shoulders" /> : test.metric === 'lowerQuarter' ? <TopTurn part="hips" goal={60} still="feet" /> : test.metric === 'neck' ? <TopTurn part="head" goal={70} still="shoulders" /> : null;
  return (
    <>
      <Suspense fallback={<div className="mob-3d-wait" />}>
        <Anim3D test={test.id} />
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
          <strong>{tr('Goal', 'Ziel')}:</strong> {t(test.target)}
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
      {test.mode === 'camera' && <PhoneSetup view={test.view ?? 'front'} height={test.metric === 'bridge' ? 'floor' : test.metric === 'trunkRotation' || test.metric === 'lat' ? 'knee' : 'hip'} />}
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

function ScreeningPlay(props: { screening: Screening; onPause: () => void; onFinished: (s: Screening) => void; onDelete: () => void }) {
  const [s, setS] = useState<Screening>(props.screening);
  const steps = stepsOf(s);
  const firstOpen = () => Math.max(0, steps.findIndex((st) => !stepDone(s, st)));
  const [k, setK] = useState<number>(() => firstOpen());
  const [stage, setStage] = useState<'brief' | 'camera' | 'self'>('brief');
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
    const done = { ...cur, finishedAt: new Date().toISOString() };
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
      if (single) finish(cur);
      else setExit('end');
    } else goTo(steps.findIndex((st) => !stepDone(cur, st)));
  };
  const save = (m: Measurement) => {
    const cur = withResult({ ...s, current: testIndex }, step.test, step.side, m);
    store(cur);
    // the other side of the same test: straight back to the camera, the player stays where they are
    const open = steps.findIndex((st, i) => i > k && !stepDone(cur, st));
    if (m.source === 'camera' && open >= 0 && steps[open].test === step.test) {
      setK(open);
      setStage('camera');
      return;
    }
    setStage('brief');
    next(cur);
  };
  const skip = () => {
    const cur = { ...s, skipped: [...new Set([...(s.skipped ?? []), step.test])] };
    store(cur);
    next(cur);
  };
  const doneCount = s.tests.filter((id) => s.results[id] || s.skipped?.includes(id)).length;

  if (stage === 'camera')
    return (
      <main className="screen mobility mob-run-camera">
        <CameraTest key={`${step.test}-${step.side}`} test={test} side={step.side} onResult={save} onSelf={() => setStage('self')} onCancel={() => setStage('brief')} />
      </main>
    );

  return (
    <main className="screen game-play training mobility tr-session">
      <TopBar title={single ? t(test.name) : kindName(s.kind)} onBack={() => (!single ? setExit('menu') : Object.keys(s.results).length ? finish(s) : (discardEmpty(s.id), props.onPause()))} backLabel={tr('Leave', 'Verlassen')} />
      <section className="card tr-now">
        <div className="tr-now-head">
          <GradeMark grade={testGrade(s.results[step.test])} />
          <span className="grow">
            <span className="eyebrow">
              {single ? (test.mode === 'camera' ? tr('Camera test', 'Kameratest') : tr('Self check', 'Selbsttest')) : tr(`Test ${testIndex + 1} of ${s.tests.length}`, `Test ${testIndex + 1} von ${s.tests.length}`)}
              {step.side && ` · ${step.side === 'left' ? tr('left side', 'linke Seite') : tr('right side', 'rechte Seite')}`}
            </span>
            <strong className="tr-now-name">{t(test.name)}</strong>
          </span>
        </div>
        {step.side && test.metric && <p className="mob-side-now">{sideText(test.metric, step.side)}</p>}
      </section>
      {stage === 'self' ? (
        <SelfCheck test={test} onPick={save} onBack={() => setStage(test.mode === 'self' ? 'brief' : 'brief')} />
      ) : (
        <>
          {/* a self check shows its pictures as the choices below */}
          <TestBrief test={test} side={step.side} noPicture={test.mode === 'self'} />
          {test.mode === 'self' ? (
            <SelfCheck test={test} onPick={save} />
          ) : (
            <div className="sticky-cta">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  unlockAudio();
                  setStage('camera');
                }}
              >
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

      {!single && (
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
                    <span aria-hidden="true">{s.results[id] ? GLYPH[testGrade(s.results[id])!] : id === step.test ? '●' : '›'}</span>
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
          <section className="sheet" role="dialog" aria-label={tr('Leave the screening', 'Screening verlassen')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{kindName(s.kind)}</strong>
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
                    saveScreening(s);
                    props.onPause();
                  }}
                >
                  {tr('Pause – continue later', 'Pausieren – später fortsetzen')}
                </button>
                <button type="button" className="btn-primary" onClick={() => setExit('end')}>
                  {tr('Finish screening', 'Screening beenden')}
                </button>
                <button type="button" className="btn-secondary btn-danger" onClick={props.onDelete}>
                  {tr('Cancel screening', 'Screening abbrechen')}
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
                  <button type="button" className="btn-primary" onClick={() => finish(s)}>
                    {tr('Finish & show the result', 'Beenden & Ergebnis zeigen')}
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

/** A self check: the player taps the picture that looks like them (camera tests: reached the goal or not). */
function SelfCheck(props: { test: TestDef; onPick: (m: Measurement) => void; onBack?: () => void }) {
  const opts =
    props.test.options ??
    ([
      { grade: 'pass', label: { en: `Goal reached: ${props.test.target.en}`, de: `Ziel erreicht: ${props.test.target.de}` } },
      { grade: 'limited', label: { en: 'Just missed', de: 'Knapp verfehlt' } },
      { grade: 'fail', label: { en: 'Clearly missed', de: 'Deutlich verfehlt' } },
    ] as { grade: Grade; label: L; picture?: () => ReactNode }[]);
  return (
    <section className="tr-block mob-self">
      <h2>{tr('Which one looks like you?', 'Was passt zu dir?')}</h2>
      {opts.map((o) => (
        <button key={o.grade} type="button" className={`mob-option ${o.grade}`} onClick={() => props.onPick({ value: null, grade: o.grade, source: 'self', at: new Date().toISOString() })}>
          {'picture' in o && o.picture && <span className="mob-option-pic">{o.picture()}</span>}
          <span className="mob-option-label">
            <GradeMark grade={o.grade} small />
            <span>{t(o.label)}</span>
          </span>
        </button>
      ))}
      {props.onBack && (
        <button type="button" className="btn-secondary" onClick={props.onBack}>
          {tr('Back to the camera test', 'Zurück zum Kameratest')}
        </button>
      )}
    </section>
  );
}

// ---------- the result ----------

function ResultTab(props: { nav: Nav }) {
  const all = loadScreenings();
  const { results, at } = latestResults(all);
  // lead and trail come from the profile now (a player who corrects it sees the result for the right side)
  const hand = playerHand();
  const [tab, setTab] = useState<'body' | 'swing'>('swing');
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
  const count = (g: Grade) => tested.filter((x) => testGrade(results[x.id]) === g).length;
  const patterns = swingPatterns(results, hand);
  const misses = likelyMisses(patterns);
  const newest = Object.values(at).sort().at(-1);
  return (
    <>
      <section className="card mob-summary">
        <div className="mob-summary-nums">
          <span className="pass">
            <strong>{count('pass')}</strong> ✓
          </span>
          <span className="limited">
            <strong>{count('limited')}</strong> –
          </span>
          <span className="fail">
            <strong>{count('fail')}</strong> ✕
          </span>
        </div>
        <span className="muted small">
          {tr(`${tested.length} of ${TESTS.length} tests`, `${tested.length} von ${TESTS.length} Tests`)}
          {newest ? ` · ${tr('as of', 'Stand')} ${dateText(newest)}` : ''} · {hand === 'right' ? tr('right-handed', 'Rechtshänder') : tr('left-handed', 'Linkshänder')}
        </span>
      </section>
      <div className="segmented tr-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'swing'} aria-pressed={tab === 'swing'} onClick={() => setTab('swing')}>
          {tr('Your swing', 'Dein Schwung')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'body'} aria-pressed={tab === 'body'} onClick={() => setTab('body')}>
          {tr('Your body', 'Dein Körper')}
        </button>
      </div>
      {tab === 'swing' ? (
        <SwingResult patterns={patterns} misses={misses} nav={props.nav} />
      ) : (
        <BodyResult results={results} nav={props.nav} />
      )}
    </>
  );
}

function SwingResult(props: { patterns: PatternResult[]; misses: ReturnType<typeof likelyMisses>; nav: Nav }) {
  if (!props.patterns.length)
    return (
      <section className="card tr-section">
        <strong className="good-text">{tr('Your body allows a free swing', 'Dein Körper lässt einen freien Schwung zu')}</strong>
        <p>{tr('No test points to a swing pattern. Keep it with the drills now and then.', 'Kein Test deutet auf ein Schwungmuster hin. Halte es mit den Übungen ab und zu.')}</p>
      </section>
    );
  return (
    <>
      <section className="tr-block">
        <h2>{tr('Misses your body points to', 'Fehlschläge, auf die dein Körper hindeutet')}</h2>
        <div className="chip-set mob-misses">
          {props.misses.slice(0, 6).map((m) => (
            <span key={m.miss} className="chip mob-miss">
              {t(MISS_NAMES[m.miss])}
            </span>
          ))}
        </div>
      </section>
      <section className="tr-block">
        <h2>{tr('Swing patterns', 'Schwungmuster')}</h2>
        {props.patterns.map((r) => (
          <button key={r.pattern.id} type="button" className="mob-pattern" onClick={() => props.nav.push({ name: 'pattern', id: r.pattern.id })}>
            <SketchThumb sketch={r.pattern.sketch} />
            <span className="grow">
              <span className={`mob-level ${r.level}`}>{r.level === 'likely' ? tr('likely', 'wahrscheinlich') : tr('possible', 'möglich')}</span>
              <strong>{t(r.pattern.name)}</strong>
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
  const drills = [...new Set(r.causes.flatMap((c) => testById(c.test).drills))].map(drillById).filter((d): d is Drill => !!d).slice(0, 6);
  const lead = leadSide(hand);
  return (
    <main className="screen training mobility">
      <TopBar title={t(p.name)} onBack={props.nav.back} />
      <SketchView sketch={p.sketch} label={t(p.name)} />
      <section className="card tr-section">
        <span className={`mob-level ${r.level}`}>{r.level === 'likely' ? tr('likely', 'wahrscheinlich') : tr('possible', 'möglich')}</span>
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
        <h2>{tr('Because of these tests', 'Wegen dieser Tests')}</h2>
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
                    {gradeName(c.grade)}
                    {sideLabel}
                  </span>
                </span>
                <GradeMark grade={c.grade} small />
              </button>
            );
          })}
        </div>
        <span className="muted small">{tr(`${r.covered[0]} of ${r.covered[1]} related tests done.`, `${r.covered[0]} von ${r.covered[1]} zugehörigen Tests gemacht.`)}</span>
      </section>
      <section className="tr-block">
        <h2>{tr('Drills that help', 'Übungen, die helfen')}</h2>
        <DrillList drills={drills} nav={props.nav} />
      </section>
    </main>
  );
}

function BodyResult(props: { results: Partial<Record<TestId, TestResult>>; nav: Nav }) {
  return (
    <>
      {AREAS.map((a) => {
        const tests = TESTS.filter((x) => x.area === a);
        return (
          <section key={a} className="tr-block">
            <h2>{t(AREA_NAMES[a])}</h2>
            <div className="list">
              {tests.map((test) => (
                <button key={test.id} type="button" className={`list-item mob-test-row${props.results[test.id] ? '' : ' untested'}`} onClick={() => props.nav.push({ name: 'test', id: test.id })}>
                  <TestThumb test={test} />
                  <span className="grow">
                    <span className="title">{t(test.name)}</span>
                    <span className="muted small">{resultText(test, props.results[test.id])}</span>
                  </span>
                  <GradeMark grade={testGrade(props.results[test.id])} small />
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
              {d.minutes} {tr('min', 'Min.')} · {t(d.goal)}
            </span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}

/** The drills for the tests that did not pass, worst first – and into Training as a plan. */
function DrillsTab(props: { nav: Nav }) {
  const { results } = latestResults(loadScreenings());
  const [saved, setSaved] = useState(false);
  const open = TESTS.filter((x) => {
    const g = testGrade(results[x.id]);
    return g === 'fail' || g === 'limited';
  }).sort((a, b) => (testGrade(results[a.id]) === 'fail' ? 0 : 1) - (testGrade(results[b.id]) === 'fail' ? 0 : 1));
  const keep = ['open-books', 'deep-squat', 'glute-bridge', 'single-leg-balance'].map(drillById).filter((d): d is Drill => !!d);
  const all = [...new Set(open.flatMap((x) => x.drills))].map(drillById).filter((d): d is Drill => !!d);
  const planDrills = all.length ? all.slice(0, 8) : keep;
  if (!Object.keys(results).length)
    return (
      <section className="tr-block mob-empty">
        <p>{tr('The drills follow from your screening.', 'Die Übungen ergeben sich aus deinem Screening.')}</p>
        <button type="button" className="btn-primary" onClick={() => props.nav.toTab('test')}>
          {tr('To the screening', 'Zum Screening')}
        </button>
      </section>
    );
  return (
    <>
      {open.length === 0 ? (
        <section className="tr-block">
          <h2>{tr('Keep it', 'Erhalten')}</h2>
          <DrillList drills={keep} nav={props.nav} />
        </section>
      ) : (
        open.map((x) => (
          <section key={x.id} className="tr-block">
            <h2 className="mob-drill-head">
              <GradeMark grade={testGrade(results[x.id])} small />
              <span>{t(x.name)}</span>
            </h2>
            <DrillList drills={x.drills.map(drillById).filter((d): d is Drill => !!d)} nav={props.nav} />
          </section>
        ))
      )}
      <div className="sticky-cta">
        {saved ? (
          <>
            <span className="good-text mob-saved">{tr('The plan is in Training › Practice › My plans.', 'Der Plan liegt in Training › Üben › Meine Pläne.')}</span>
            {props.nav.openTraining && (
              <button type="button" className="btn-secondary" onClick={props.nav.openTraining}>
                {tr('Open Training', 'Training öffnen')}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              saveOwnPlan({
                id: trainingId(),
                name: `Agility · ${dateText(new Date().toISOString())}`,
                items: planDrills.map((d) => ({ drill: d.id, minutes: d.minutes })),
                createdAt: new Date().toISOString(),
              });
              setSaved(true);
            }}
          >
            {tr(`Take ${planDrills.length} drills into Training as a plan`, `${planDrills.length} Übungen als Plan ins Training übernehmen`)}
          </button>
        )}
      </div>
    </>
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
      {videos.length > 0 && (
        <div className="segmented tr-tabs" role="tablist" aria-label={t(d.name)}>
          {(
            [
              ['learn', tr('How to', 'Anleitung')],
              ['videos', 'Videos'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === 'videos' ? (
        <>
          {videos.map((v) => (
            <VideoCard key={v.id} v={v} />
          ))}
          <VideoNote />
        </>
      ) : (
        <DrillHow d={d} />
      )}
    </main>
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
          <Anim3D clip={clip} />
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

function HistoryTab(props: { nav: Nav }) {
  const list = loadScreenings();
  if (!list.length)
    return (
      <section className="tr-block mob-empty">
        <p>{tr('Your screenings appear here – repeat one every few weeks to see the progress.', 'Hier erscheinen deine Screenings – wiederhole eins alle paar Wochen, um den Fortschritt zu sehen.')}</p>
        <button type="button" className="btn-primary" onClick={() => props.nav.toTab('test')}>
          {tr('To the screening', 'Zum Screening')}
        </button>
      </section>
    );
  const full = list.filter((s) => s.kind !== 'single' && Object.keys(s.results).length).reverse();
  return (
    <>
      {full.length >= 2 && (
        <figure className="mob-chart" aria-label={tr('Passed tests per screening', 'Bestandene Tests je Screening')}>
          <div className="mob-bars">
            {full.slice(-8).map((s) => {
              const n = Object.keys(s.results).length;
              const ok = Object.values(s.results).filter((r) => testGrade(r) === 'pass').length;
              return (
                <div key={s.id} className="mob-bar">
                  <span className="small">
                    {ok}/{n}
                  </span>
                  <i className="pass" style={{ height: `${Math.max(6, (ok / Math.max(1, n)) * 100)}%` }} />
                  <span className="muted small">{new Date(s.createdAt).toLocaleDateString(tr('en-GB', 'de-DE'), { day: 'numeric', month: 'numeric' })}</span>
                </div>
              );
            })}
          </div>
          <figcaption className="muted small">{tr('Passed tests per screening', 'Bestandene Tests je Screening')}</figcaption>
        </figure>
      )}
      <div className="list">
        {list.map((s) => {
          const rs = Object.values(s.results);
          const c = (g: Grade) => rs.filter((r) => testGrade(r) === g).length;
          return (
            <button key={s.id} type="button" className="list-item" onClick={() => props.nav.push({ name: 'screening', id: s.id })}>
              <span className="grow">
                <span className="title">
                  {kindName(s.kind)}
                  {s.kind === 'single' && s.tests[0] ? ` · ${t(testById(s.tests[0]).name)}` : ''} {!s.finishedAt && s.kind !== 'single' && <PausedMark />}
                </span>
                <span className="muted small">
                  {dateText(s.createdAt)} · {c('pass')} ✓ · {c('limited')} – · {c('fail')} ✕
                </span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function ScreeningView(props: { id: string; nav: Nav }) {
  const s = screeningById(props.id);
  if (!s) return null;
  return (
    <main className="screen training mobility">
      <TopBar
        title={kindName(s.kind)}
        onBack={props.nav.back}
        right={
          <button
            type="button"
            className="icon-btn"
            aria-label={tr('Delete screening', 'Screening löschen')}
            onClick={() => {
              deleteScreening(s.id, `${kindName(s.kind)} · ${dateText(s.createdAt)}`);
              props.nav.back();
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
            </svg>
          </button>
        }
      />
      <span className="eyebrow">
        {dateText(s.createdAt)} · {s.hand === 'right' ? tr('right-handed', 'Rechtshänder') : tr('left-handed', 'Linkshänder')}
      </span>
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
              <GradeMark grade={testGrade(s.results[id])} small />
            </button>
          );
        })}
      </div>
      {!s.finishedAt && s.kind !== 'single' && (
        <div className="sticky-cta">
          <button type="button" className="btn-primary" onClick={() => props.nav.run(s)}>
            {tr('Continue', 'Fortsetzen')}
          </button>
        </div>
      )}
    </main>
  );
}
