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
import { DRILL_CLIPS, RETEST_CLIPS } from '../mobility/anim3d/drills';
import { CLIPS } from '../mobility/anim3d/clips';
import type { Clip } from '../mobility/anim3d/scene';
import type { Coach } from '../mobility/CameraTest';
import { CameraTest, isFakeCamera, sideText, unlockAudio } from '../mobility/CameraTest';
import { loadPose } from '../mobility/pose';
import { speak } from '../lib/caddietalk';
import { NOTE_HEELS, valueText } from '../mobility/measure';
import { PhoneSetup, TopTurn } from '../mobility/pictures';
import { deleteScreening, discardEmpty, loadScreenings, newScreening, saveScreening, screeningById, withResult } from '../mobility/store';
import { FOCUS_NAMES, GOAL_STEPS, loadGoal, measurePos, pillar, saveGoal, targetPos, targetValue, testPos, type AreaState, type Focus, type MobilityGoal } from '../mobility/profile';
import { profileIndex } from '../lib/profile';
import { hasPain, leadSide, previousMeasurement, likelyMisses, latestResults, MISS_NAMES, PLAY_NOW, swingPatterns, type PatternResult } from '../mobility/swing';
import { FULL, QUICK, TESTS, TestPicture, testById } from '../mobility/tests';
import type { Area, Grade, Measurement, Screening, Side, SquatCause, TestDef, TestId, TestResult } from '../mobility/types';
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

const CAUSE_SHORT: Record<SquatCause, L> = {
  upper: { en: 'cause: shoulders, upper back', de: 'Ursache: Schultern, oberer Rücken' },
  ankle: { en: 'cause: ankles', de: 'Ursache: Sprunggelenke' },
  hips: { en: 'cause: hips, trunk', de: 'Ursache: Hüfte, Rumpf' },
};

/** The value of a result in words – both sides for sided tests ("left 48° · right 39°"). */
function resultText(test: TestDef, r: TestResult | undefined): string {
  if (!r) return tr('not tested yet', 'noch nicht getestet');
  const one = (m: Measurement) => (m.pain ? tr('pain', 'Schmerz') : m.source === 'self' ? tr('self-judged', 'selbst eingeschätzt') : test.metric ? valueText(test.metric, m.value, tr) + (m.cause ? ` · ${t(CAUSE_SHORT[m.cause])}` : '') : '');
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
      <span className={`mob-grade fail pain${props.small ? ' small' : ''}`} aria-label={tr('pain', 'Schmerz')}>
        !
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
  // repeat every four weeks (GOWOD 30 days, Amazon Halo 2–4 weeks, TPI coaches 4 weeks) – a hint, no lock
  const lastDone = all.filter((s) => s.finishedAt && s.kind !== 'single' && Object.keys(s.results).length).map((s) => s.finishedAt!).sort().at(-1);
  const next = lastDone ? { last: lastDone, from: new Date(new Date(lastDone).getTime() + 28 * 86400000).toISOString() } : null;
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
      <p className="muted small mob-when">
        {next ? tr(`Last screening ${dateText(next.last)} · the next one from ${dateText(next.from)}. `, `Letztes Screening ${dateText(next.last)} · das nächste ab ${dateText(next.from)}. `) : ''}
        {tr('For values you can compare: not warmed up, about the same time of day.', 'Für vergleichbare Werte: nicht aufgewärmt, etwa zur gleichen Tageszeit.')}
      </p>
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
function TestView(props: { id: TestId; nav: Nav }) {
  const test = testById(props.id);
  const [tab, setTab] = useState<'how' | 'result' | 'drills'>('how');
  const all = loadScreenings();
  const history = all
    .map((s) => ({ s, r: s.results[props.id] }))
    .filter((x): x is { s: Screening; r: TestResult } => !!x.r)
    .sort((a, b) => b.s.createdAt.localeCompare(a.s.createdAt));
  const drills = drillsOf(test, latestResults(loadScreenings()).results[test.id]).map(drillById).filter((d): d is Drill => !!d);
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
                    <ResultMark r={r} test={test} small />
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
  const shown = (r: TestResult): string => {
    const ms = [r.both, r.left, r.right].filter((m): m is Measurement => !!m && !m.pain);
    if (!ms.length) return '!';
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
      <h2>{tr('Set up the phone – once', 'Handy aufstellen – einmal')}</h2>
      <PhoneSetup view="front" height="hip" />
      <ol className="card tr-section tr-steps">
        <li>{tr('Phone upright on a stand or against a bottle, at hip height, the screen towards you.', 'Handy hochkant auf ein Stativ oder an eine Flasche lehnen, auf Hüfthöhe, Bildschirm zu dir.')}</li>
        <li>{tr('Step back 2.5–3 m, sound on. The app shows each test, then you copy it.', '2,5–3 m zurückgehen, Ton an. Die App macht jeden Test vor, dann machst du ihn nach.')}</li>
        <li>{tr('It measures, says the result and goes on by itself – you only come back at the end.', 'Sie misst, sagt das Ergebnis und macht von selbst weiter – du kommst erst am Ende zurück.')}</li>
      </ol>
      {needs.length > 0 && (
        <p className="muted small">
          {tr('You need', 'Du brauchst')}: {needs.join(', ')}
        </p>
      )}
      <div className="mob-setup-tests" aria-label={tr('The tests', 'Die Tests')}>
        {cams.map((x) => (
          <TestThumb key={x.id} test={x} />
        ))}
      </div>
      {!props.single && selfs.length > 0 && <p className="muted small">{tr(`Then ${selfs.length} short questions on the phone.`, `Danach ${selfs.length} kurze Fragen am Handy.`)}</p>}
      <p className="muted small mob-private">{tr('The picture stays on your phone – nothing is recorded or sent.', 'Das Bild bleibt auf deinem Handy – nichts wird aufgenommen oder gesendet.')}</p>
      <p className={`small mob-model ${model}`} role="status">
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

/** The heels came up: the knee-to-wall test tells whether the ankles are the limit (TPI: 10 cm, heel down). */
function AnkleCheck(props: { onPick: (ok: boolean) => void }) {
  return (
    <section className="tr-block mob-self mob-ankle">
      <Suspense fallback={<div className="mob-3d-wait" />}>
        <Anim3D clip={DRILL_CLIPS['mob-ankle-wall']} />
      </Suspense>
      <section className="card tr-section">
        <h2>{tr('Knee to the wall', 'Knie zur Wand')}</h2>
        <ol className="tr-steps">
          <li>{tr('Toes a hand width (10 cm) from the wall, kneel on the other knee.', 'Zehen eine Handbreit (10 cm) vor der Wand, auf das andere Knie knien.')}</li>
          <li>{tr('Push the knee forward to the wall – the heel stays down. Then the other leg.', 'Das Knie nach vorn zur Wand schieben – die Ferse bleibt unten. Dann das andere Bein.')}</li>
        </ol>
      </section>
      <h2>{tr('Which one is you?', 'Was passt zu dir?')}</h2>
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
      <h2>{tr('Where did you feel it most?', 'Wo hast du es vor allem gespürt?')}</h2>
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
  const [k, setK] = useState<number>(() => firstOpen());
  // the trainer mode (Sascha 17.10.2026): set up once, one tap – then the camera tests run one after the other
  const [stage, setStage] = useState<'setup' | 'brief' | 'camera' | 'self' | 'feel' | 'retest' | 'ankle' | 'hold'>(() => (testById(steps[firstOpen()]?.test ?? s.tests[0]).mode === 'camera' ? 'setup' : 'brief'));
  // questions that need a tap, asked after the camera part (the player stays away from the phone until then)
  const [later, setLater] = useState<('feel' | 'ankle')[]>([]);
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
        setK(steps.findIndex((st) => st.test === (queue[0] === 'feel' ? 'bridge' : 'deep-squat')));
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
    if (q.length) {
      setK(steps.findIndex((st) => st.test === (q[0] === 'feel' ? 'bridge' : 'deep-squat')));
      setStage(q[0]);
      return;
    }
    goOn(cur, []);
  };
  const startCoach = () => {
    unlockAudio();
    // still on (e.g. back from the pause to another test): use it, never open a second camera
    if (streamRef.current?.active) {
      setStage('camera');
      return;
    }
    // the camera is opened here, in the tap (iPhone), and stays on for all camera tests
    if (!isFakeCamera() && navigator.mediaDevices?.getUserMedia)
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false })
        .then((st) => {
          streamRef.current = st;
          setStage('camera');
        })
        .catch(() => setStage('camera'));
    else setStage('camera');
  };
  const save = (m: Measurement) => {
    const cur = withResult({ ...s, current: testIndex }, step.test, step.side, m);
    store(cur);
    if (m.source === 'camera') {
      const moreOfIt = steps.some((st, i) => i > k && st.test === step.test && !stepDone(cur, st));
      const q: ('feel' | 'ankle')[] = step.test === 'bridge' && !m.pain && !moreOfIt && !later.includes('feel') ? [...later, 'feel'] : later;
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
    const cur = cause ? withCause(s, cause) : s;
    if (cur !== s) store(cur);
    // the heels still come up: knee to the wall at the end (a tap)
    const heels = !m.pain && m.source === 'camera' && m.grade !== 'pass' && m.notes?.some((n) => n.en === NOTE_HEELS.en);
    const q: ('feel' | 'ankle')[] = heels ? [...later, 'ankle'] : later;
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
  const coachFor = (intro: string, demo: Clip | undefined): Coach => ({ stream: streamRef.current, intro, demo, onMenu: () => setStage('hold'), onSkip: skip });
  const introOf = () => {
    const n = single ? '' : tr(`Test ${testIndex + 1} of ${s.tests.length}: `, `Test ${testIndex + 1} von ${s.tests.length}: `);
    const side = step.side && test.metric ? ` – ${sideText(test.metric, step.side).replace(/\.$/, '')}` : '';
    return `${n}${t(test.name)}${side}`;
  };
  const doneCount = s.tests.filter((id) => s.results[id] || s.skipped?.includes(id)).length;

  if (stage === 'retest')
    return (
      <main className="screen mobility mob-run-camera">
        <CameraTest key="squat-retest" test={test} side={null} variant="handsBehind" coach={coachFor(tr('Retest: the same squat with the hands behind the head', 'Nachtest: dieselbe Kniebeuge mit den Händen hinter dem Kopf'), RETEST_CLIPS.squatHands)} onResult={retested} onSelf={() => retested({ value: null, grade: 'limited', source: 'self', at: new Date().toISOString() })} onCancel={() => setStage('hold')} />
      </main>
    );

  if (stage === 'camera')
    return (
      <main className="screen mobility mob-run-camera">
        <CameraTest key={`${step.test}-${step.side}`} test={test} side={step.side} previous={previousMeasurement(loadScreenings(), step.test, step.side, s.id)} coach={coachFor(introOf(), CLIPS[step.test])} onResult={save} onSelf={() => setStage('self')} onCancel={() => setStage('hold')} />
      </main>
    );

  return (
    <main className="screen game-play training mobility tr-session">
      <TopBar title={single ? t(test.name) : kindName(s.kind)} onBack={() => (!single ? setExit('menu') : Object.keys(s.results).length ? finish(s) : (discardEmpty(s.id), props.onPause()))} backLabel={tr('Leave', 'Verlassen')} />
      {stage === 'setup' ? (
        <CoachSetup screening={s} onStart={startCoach} onSelf={() => setStage('self')} single={single} />
      ) : stage === 'hold' ? (
        <section className="tr-block mob-hold-screen">
          <h2>{tr('Paused', 'Pausiert')}</h2>
          <p className="muted">{tr(`${doneCount} of ${s.tests.length} tests done. Continue goes on with the test where you stopped.`, `${doneCount} von ${s.tests.length} Tests erledigt. Weiter macht mit dem Test weiter, bei dem du aufgehört hast.`)}</p>
          <button type="button" className="btn-primary" onClick={() => setStage('camera')}>
            {tr('Continue', 'Weiter')}
          </button>
          {!single && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                stopStream();
                saveScreening(s);
                props.onPause();
              }}
            >
              {tr('Pause – continue later', 'Pausieren – später fortsetzen')}
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              stopStream();
              if (single) {
                if (Object.keys(s.results).length) finish(s);
                else {
                  discardEmpty(s.id);
                  props.onPause();
                }
              } else setExit('end');
            }}
          >
            {single ? tr('Leave the test', 'Test verlassen') : tr('Finish screening', 'Screening beenden')}
          </button>
        </section>
      ) : (
      <>
      <section className="card tr-now">
        <div className="tr-now-head">
          <ResultMark r={s.results[step.test]} test={test} />
          <span className="grow">
            <span className="eyebrow">
              {single ? (test.mode === 'camera' ? tr('Camera test', 'Kameratest') : tr('Self check', 'Selbsttest')) : tr(`Test ${testIndex + 1} of ${s.tests.length}`, `Test ${testIndex + 1} von ${s.tests.length}`)}
              {step.side && ` · ${step.side === 'left' ? tr('left side', 'linke Seite') : tr('right side', 'rechte Seite')}`}
            </span>
            <strong className="tr-now-name">{t(test.name)}</strong>
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
      // described, not graded: about the golf value, a little less, clearly less
      { grade: 'pass', label: { en: `About this far or further: ${props.test.target.en}`, de: `Etwa so weit oder weiter: ${props.test.target.de}` } },
      { grade: 'limited', label: { en: 'A little less', de: 'Etwas weniger' } },
      { grade: 'fail', label: { en: 'Clearly less', de: 'Deutlich weniger' } },
    ] as { grade: Grade; label: L; picture?: () => ReactNode }[]);
  return (
    <section className="tr-block mob-self">
      <h2>{tr('Which one looks like you?', 'Was passt zu dir?')}</h2>
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
          !
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
  return (
    <>
      <section className="card mob-summary">
        <strong>{tr('Your mobility profile', 'Dein Beweglichkeitsprofil')}</strong>
        <span className="muted small">
          {tr(`${tested.length} of ${TESTS.length} tests measured`, `${tested.length} von ${TESTS.length} Tests gemessen`)}
          {newest ? ` · ${tr('as of', 'Stand')} ${dateText(newest)}` : ''} · {hand === 'right' ? tr('right-handed', 'Rechtshänder') : tr('left-handed', 'Linkshänder')}
        </span>
      </section>
      <GoalCard />
      <div className="segmented tr-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'body'} aria-pressed={tab === 'body'} onClick={() => setTab('body')}>
          {tr('Your body', 'Dein Körper')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'swing'} aria-pressed={tab === 'swing'} onClick={() => setTab('swing')}>
          {tr('Your swing', 'Dein Schwung')}
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
        <p>{tr('None of your values points to a swing pattern.', 'Keiner deiner Werte deutet auf ein Schwungmuster hin.')}</p>
      </section>
    );
  return (
    <>
      <section className="tr-block">
        <h2>{tr('Misses your body tends to', 'Fehlschläge, die dein Körper begünstigt')}</h2>
        <div className="chip-set mob-misses">
          {props.misses.slice(0, 6).map((m) => (
            <span key={m.miss} className="chip mob-miss">
              {t(MISS_NAMES[m.miss])}
            </span>
          ))}
        </div>
      </section>
      <section className="tr-block">
        <h2>{tr('Swing patterns your body tends to', 'Schwungmuster, die dein Körper begünstigt')}</h2>
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
  const drills = [...new Set(r.causes.flatMap((c) => drillsOf(testById(c.test), results[c.test])))].map(drillById).filter((d): d is Drill => !!d).slice(0, 6);
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
        <h2>{tr('Playing with it today', 'So spielst du heute schon damit')}</h2>
        <ul className="card tr-section mob-play-now">
          {PLAY_NOW[p.id].map((x, i) => (
            <li key={i}>{t(x)}</li>
          ))}
        </ul>
        <span className="muted small">{tr('Until the drills work – then the full swing comes back.', 'Bis die Übungen wirken – danach kommt der volle Schwung zurück.')}</span>
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
        <h2>{tr('Drills that help', 'Übungen, die helfen')}</h2>
        <DrillList drills={drills} nav={props.nav} />
      </section>
    </main>
  );
}

function BodyResult(props: { results: Partial<Record<TestId, TestResult>>; nav: Nav }) {
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
            <h2 className="mob-area-head">
              <span>{t(AREA_NAMES[a])}</span>
              {st && <LevelBar pos={st.now} target={st.target} />}
            </h2>
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
        !
      </span>
      <span className="grow">
        <strong>{tr('Pain', 'Schmerz')}: {props.tests.map((x) => t(x.name)).join(', ')}</strong>
        <span className="small">{tr('No drills for it here – have a physio look at it first.', 'Dafür gibt es hier keine Übungen – lass das zuerst von einem Physio anschauen.')}</span>
      </span>
    </section>
  );
}

function DrillsTab(props: { nav: Nav }) {
  const { results } = latestResults(loadScreenings());
  const [saved, setSaved] = useState(false);
  const goal = loadGoal();
  const areas = pillar(TESTS, results, goal);
  const pain = TESTS.filter((x) => hasPain(results[x.id]));
  const keep = ['open-books', 'deep-squat', 'glute-bridge', 'single-leg-balance'].map(drillById).filter((d): d is Drill => !!d);
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
      .filter((d): d is Drill => !!d);
  const focus = areas.filter((x) => x.focus);
  const rest = areas.filter((x) => !x.focus);
  const all = [...new Set(focus.flatMap(drillsFor))];
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
      <GoalCard />
      {pain.length > 0 && <PainNote tests={pain} />}
      <section className="tr-block">
        <h2>{tr('Your mobility pillar', 'Deine Säule Beweglichkeit')}</h2>
        <p className="muted small">{tr('For your goal: the areas with the biggest gap first, with the drills for home.', 'Für dein Ziel: die Bereiche mit dem größten Abstand zuerst, mit den Übungen für zu Hause.')}</p>
      </section>
      {focus.length === 0 ? (
        <section className="tr-block">
          <h2>{tr('Keep it', 'Erhalten')}</h2>
          <DrillList drills={keep} nav={props.nav} />
        </section>
      ) : (
        focus.map((x) => (
          <section key={x.area} className="tr-block mob-pillar-area">
            <h2 className="mob-drill-head">
              <span>{t(AREA_NAMES[x.area])}</span>
              <LevelBar pos={x.now} target={x.target} />
            </h2>
            <span className="muted small">{x.tests.map((id) => `${t(testById(id).name)}: ${resultText(testById(id), results[id])}`).join(' · ')}</span>
            <DrillList drills={drillsFor(x)} nav={props.nav} />
          </section>
        ))
      )}
      {rest.length > 0 && (
        <section className="tr-block">
          <h2>{tr('The other areas', 'Die anderen Bereiche')}</h2>
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

/**
 * The goal (Sascha 18.10.2026: "from the analysis ask for the player's goals, e.g. the handicap"): the handicap to
 * reach and what matters most – it sets the line on every bar and the order of the pillar.
 */
function GoalCard() {
  const [goal, setGoal] = useState<MobilityGoal | null>(() => loadGoal());
  const [edit, setEdit] = useState(!goal);
  const [hcp, setHcp] = useState<number | null>(goal?.hcp ?? null);
  const [focus, setFocus] = useState<Focus[]>(goal?.focus ?? []);
  const now = profileIndex();
  const hcpName = (h: number) => (h === 0 ? 'Scratch' : String(h));
  if (goal && !edit)
    return (
      <section className="card mob-goal">
        <span className="grow">
          <strong>
            {tr('Your goal', 'Dein Ziel')}: {goal.hcp === 0 ? 'Scratch' : tr(`handicap ${goal.hcp}`, `Handicap ${goal.hcp}`)}
          </strong>
          <span className="muted small">{goal.focus.length ? goal.focus.map((f) => t(FOCUS_NAMES[f])).join(' · ') : tr('no focus set', 'ohne Schwerpunkt')}</span>
        </span>
        <button type="button" className="btn-secondary" onClick={() => setEdit(true)}>
          {tr('Change', 'Ändern')}
        </button>
      </section>
    );
  return (
    <section className="card mob-goal edit">
      <strong>{tr('What is your goal?', 'Was ist dein Ziel?')}</strong>
      <span className="muted small">
        {now != null ? tr(`Your handicap now: ${String(now).replace('-', '+')}. `, `Dein Handicap jetzt: ${String(now).replace('.', ',').replace('-', '+')}. `) : ''}
        {tr('The values you need follow from it.', 'Daraus ergibt sich, welche Werte du brauchst.')}
      </span>
      <span className="small">{tr('Handicap to reach', 'Ziel-Handicap')}</span>
      <div className="chip-set">
        {GOAL_STEPS.map((h) => (
          <button key={h} type="button" className={`chip${hcp === h ? ' on' : ''}`} aria-pressed={hcp === h} onClick={() => setHcp(h)}>
            {hcpName(h)}
          </button>
        ))}
      </div>
      <span className="small">{tr('What matters most to you (optional)', 'Was dir wichtig ist (optional)')}</span>
      <div className="chip-set">
        {(Object.keys(FOCUS_NAMES) as Focus[]).map((f) => (
          <button key={f} type="button" className={`chip${focus.includes(f) ? ' on' : ''}`} aria-pressed={focus.includes(f)} onClick={() => setFocus(focus.includes(f) ? focus.filter((x) => x !== f) : [...focus, f])}>
            {t(FOCUS_NAMES[f])}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn-primary"
        disabled={hcp == null}
        onClick={() => {
          const g: MobilityGoal = { id: 'goal', hcp: hcp!, focus, at: new Date().toISOString() };
          saveGoal(g);
          setGoal(g);
          setEdit(false);
        }}
      >
        {tr('Save the goal', 'Ziel speichern')}
      </button>
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
  return (
    <section className="card mob-change">
      <strong>{tr(`Since ${dateText(prev.createdAt)}`, `Seit dem ${dateText(prev.createdAt)}`)}</strong>
      <div className="list">
        {rows.map(({ a, b, n }) => {
          const d = Math.round((n.now - b.now) * 100);
          return (
            <div key={a} className="list-item mob-area-row">
              <span className="grow">
                <span className="title">{t(AREA_NAMES[a])}</span>
                <span className={`small${d > 0 ? ' good-text' : ' muted'}`}>{d === 0 ? tr('the same', 'gleich') : tr(`${d > 0 ? '+' : '−'}${Math.abs(d)} points`, `${d > 0 ? '+' : '−'}${Math.abs(d)} Punkte`)}</span>
              </span>
              <LevelBar pos={n.now} target={n.target} small />
            </div>
          );
        })}
      </div>
      <span className="muted small">{tr('Points: per cent of each scale from little to a lot of movement.', 'Punkte: Prozent der Skala von wenig bis viel Bewegung.')}</span>
    </section>
  );
}

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
      <ChangeCard list={list} />
      {full.length >= 2 && (
        <figure className="mob-chart" aria-label={tr('Mobility on average per screening', 'Beweglichkeit im Mittel je Screening')}>
          <div className="mob-bars">
            {full.slice(-8).map((s) => {
              const ps = s.tests.map((id) => testPos(testById(id), s.results[id])).filter((p): p is number => p != null);
              const avg = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
              return (
                <div key={s.id} className="mob-bar">
                  <span className="small">{Math.round(avg * 100)} %</span>
                  <i style={{ height: `${Math.max(6, avg * 100)}%` }} />
                  <span className="muted small">{new Date(s.createdAt).toLocaleDateString(tr('en-GB', 'de-DE'), { day: 'numeric', month: 'numeric' })}</span>
                </div>
              );
            })}
          </div>
          <figcaption className="muted small">{tr('Where your values sit on average on their scales (100 % = a lot of movement)', 'Wo deine Werte im Mittel auf ihren Skalen liegen (100 % = viel Bewegung)')}</figcaption>
        </figure>
      )}
      <div className="list">
        {list.map((s) => {
          const n = Object.keys(s.results).length;
          return (
            <button key={s.id} type="button" className="list-item" onClick={() => props.nav.push({ name: 'screening', id: s.id })}>
              <span className="grow">
                <span className="title">
                  {kindName(s.kind)}
                  {s.kind === 'single' && s.tests[0] ? ` · ${t(testById(s.tests[0]).name)}` : ''} {!s.finishedAt && s.kind !== 'single' && <PausedMark />}
                </span>
                <span className="muted small">
                  {dateText(s.createdAt)} · {tr(`${n} tests measured`, `${n} Tests gemessen`)}
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
              <ResultMark r={s.results[id]} test={test} small />
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
