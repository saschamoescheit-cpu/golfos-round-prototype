import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ModulePill } from '../components/ModuleSheet';
import { FloatActions } from '../components/FloatActions';
import { CheckGlyph, CrossGlyph, PenGlyph, StarGlyph } from '../components/Glyph';
import type { Round } from '../types';
import { dec, getLang, tr } from '../lib/i18n';
import { loadProfile, fullName } from '../lib/profile';
import { MENU_ICONS, MenuBar } from '../components/TabBar';
import { TopTools } from '../components/TopTools';
import { Stepper, TopBar } from '../components/ui';
import { SettingsList, StepPick, TickRow, type StepChoice } from '../components/Settings';
import { SwipeRow } from '../components/SwipeRow';
import { Bin } from '../components/Bin';
import { CATEGORIES, DRILLS, catById, drillById, drillsOf } from '../training/content';
import { GEAR, gearById, gearForDrill } from '../training/content/gear';
import { PLANS } from '../training/content/plans';
import { adviceFromRounds } from '../training/recommend';
import { SketchThumb, SketchView } from '../training/Sketch';
import { PausedIcon } from '../components/PausedIcon';
import { DeletedIcon } from '../components/RoundIcons';
import { RulesBook } from '../components/RulesBook';
import { RULES_OF_GOLF } from '../data/rulesOfGolf';
import { Metronome } from '../training/Metronome';
import { FactChart } from '../training/FactChart';
import { ReviewBar } from '../training/ReviewBar';
import { search } from '../training/search';
import type { RoundsTarget } from '../training/content/rounds-links';
import { drillKey, exportMarkdown, factKey, faultKey, gearKey, loadReview, nextOpenDrill, planKey, reviewItems, reviewOn, sectionKey, setReviewOn, videoKey, type ReviewItem, type ReviewKind, type Verdict } from '../training/review';
import { SessionPlay } from '../training/SessionPlay';
import {
  addLog,
  cartCount,
  deleteSession,
  loadCart,
  loadFavs,
  loadLog,
  loadOrders,
  loadOwnPlans,
  loadSessions,
  loadSessionTrash,
  logFor,
  placeOrder,
  purgeSession,
  removeLog,
  restoreLog,
  removeOwnPlan,
  restoreSession,
  saveOwnPlan,
  saveSession,
  setCartQty,
  toggleFav,
  trainingId,
  type Order,
  type LogEntry,
  type OwnPlan,
  type Session,
} from '../training/store';
import type { Category, CategoryId, Drill, Gear, GearKind, L, Level, Place, Plan, Section, Video } from '../training/types';
import {
  bandName,
  bandOf,
  type Band,
  bestOf,
  CAT_ICON,
  Collapsible,
  euro,
  euroRange,
  GearImage,
  kindName,
  levelName,
  meets,
  placeName,
  playerHcp,
  priceOf,
  ResultInput,
  scoreText,
  ResultChart,
  mainValue,
  resultStats,
  unitText,
  higherBetter,
  t,
  TR_GLYPH,
  VideoCard,
  VideoNote,
} from '../training/ui';
import '../training/training.css';

// The "Training" module (Sascha 15.10.2026): a golf knowledge base for practice. Library of categories (basics,
// faults, drills with sketches, videos, gear), practice sessions with a timer (pause / finish / cancel as in Rounds
// and Games), ready-made plans, advice from the player's rounds, the log of results and a shop with a cart that goes
// as far as "order" – nothing is ordered in the prototype (the real app will use partner shops).

export type TrainingTab = 'learn' | 'train' | 'log' | 'shop' | 'profile';

type View =
  | { name: 'tab'; tab: TrainingTab }
  | { name: 'cat'; id: CategoryId }
  | { name: 'drill'; id: string }
  | { name: 'plan'; plan: Plan | OwnPlan; own?: boolean }
  | { name: 'session'; id: string }
  | { name: 'done'; id: string }
  | { name: 'gear'; id: string }
  | { name: 'cart' }
  | { name: 'checkout' }
  | { name: 'ordered'; order: Order }
  | { name: 'builder'; plan: OwnPlan }
  | { name: 'search'; q: string }
  | { name: 'fault'; cat: CategoryId; index: number }
  | { name: 'review' };

const ICONS = {
  learn: MENU_ICONS.rules,
  train: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M9 2h6" />
    </svg>
  ),
  log: MENU_ICONS.list,
  shop: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17.5" cy="20" r="1.3" />
    </svg>
  ),
};

// the marks of the tiles on "Progress", drawn like those over the rounds list (RoundIcons)
const LOG_ICONS = {
  // a session: the stopwatch of the "Practice" tab
  sessions: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M9 2h6" />
    </svg>
  ),
  month: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </svg>
  ),
  // results: bars going up
  results: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16M7 20v-5M12 20V9M17 20V4" />
    </svg>
  ),
};

// the marks of the action bar (.sc-actions) – drawn as those of the scorecard of Rounds (Sascha 03.11.2026: one usability everywhere)
const actIcon = (d: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const ACT_ICONS = {
  share: actIcon(
    <>
      <path d="M12 15V3M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </>,
  ),
  file: actIcon(
    <>
      <path d="M12 3v12M8 11l4 4 4-4" />
      <path d="M5 21h14" />
    </>,
  ),
  delete: actIcon(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />),
  repeat: actIcon(
    <>
      <path d="M17 2l3 3-3 3" />
      <path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3" />
      <path d="M20 13v2a4 4 0 0 1-4 4H4" />
    </>,
  ),
  add: actIcon(
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </>,
  ),
  save: actIcon(
    <>
      <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M8 4v5h7V4M8 20v-6h8v6" />
    </>,
  ),
  star: (on: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ),
};

/** A block's title – a small eyebrow above the block, never a heading inside a card (docs/DESIGN.md; Facelift
 *  11.11.2026, o6/tr2); `aside` a quiet figure on the right of it (the minutes of a plan). */
function Eyebrow(props: { children: ReactNode; aside?: ReactNode }) {
  if (props.aside == null) return <span className="eyebrow">{props.children}</span>;
  return (
    <div className="tr-eb-row">
      <span className="eyebrow">{props.children}</span>
      <span className="muted small">{props.aside}</span>
    </div>
  );
}

/** The parts of a topic or a drill – one shown at a time, as the switch "‹ Runden ›" of the statistics and the pool
 *  (Facelift 11.11.2026, tr1: no block of tabs). */
function ViewPick<T>(props: { options: StepChoice<T>[]; value: T; onChange: (v: T) => void }) {
  return <StepPick<T> label={tr('View', 'Ansicht')} options={props.options} value={props.value} onChange={props.onChange} />;
}

/** Plan items with existing drills only. */
const planItems = (p: { items: { drill: string; minutes: number }[] }) => p.items.filter((i) => drillById(i.drill));
const planMinutes = (p: { items: { drill: string; minutes: number }[] }) => planItems(p).reduce((s, i) => s + i.minutes, 0);
/** How many drills of a topic the player has logged at least once. */
const practised = (id: CategoryId) => {
  const logged = new Set(loadLog().map((e) => e.drill));
  return drillsOf(id).filter((d) => logged.has(d.id)).length;
};

function newSession(name: string, items: { drill: string; minutes: number }[], planId?: string): Session {
  const list = items.filter((i) => drillById(i.drill));
  return { id: trainingId(), name, planId, createdAt: new Date().toISOString(), finishedAt: null, current: 0, items: list.map((i) => ({ ...i })), spent: list.map(() => 0) };
}

function useTrainingTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => setN((x) => x + 1);
    window.addEventListener('golfos:training-changed', on);
    window.addEventListener('golfos:synced', on); // results from another device
    return () => {
      window.removeEventListener('golfos:training-changed', on);
      window.removeEventListener('golfos:synced', on);
    };
  }, []);
  return n;
}

// finished rounds still waiting for the signature (set by TrainingApp; used by the advice block)
let unsignedCount = 0;

// the page stack while Mein Bag is open over Training (the App shows My bag instead of Training for a moment)
let keptStack: { stack: View[]; scroll: number } | null = null;
// read only – cleared after the first render (React may run the state initializer twice)
function takeKeptStack(): View[] | null {
  return keptStack?.stack ?? null;
}

export function TrainingApp(props: {
  rounds: Round[];
  onModules: () => void;
  profile: ReactNode;
  profileDot?: boolean;
  tab?: TrainingTab;
  onTabChange?: (t: TrainingTab) => void;
  /** opens a function of GolfOS Rounds (Mein Bag, caddie, statistics, rounds, course choice) */
  onOpenRounds?: (t: RoundsTarget) => void;
  /** finished rounds not signed yet – they do not count (like the Rounds statistics) */
  unsignedRounds?: number;
}) {
  useTrainingTick();
  const running = loadSessions().filter((s) => !s.finishedAt);
  // a session in play opens straight on its drill (like a round in play)
  // back from Mein Bag (opened over Training) the player is where they were
  const [stack, setStack] = useState<View[]>(() => takeKeptStack() ?? [{ name: 'tab', tab: props.tab ?? 'learn' }, ...(running[0] && !props.tab ? [{ name: 'session', id: running[0].id } as View] : [])]);
  useEffect(() => {
    const k = keptStack;
    keptStack = null;
    if (k) window.setTimeout(() => window.scrollTo(0, k.scroll), 50);
  }, []);
  const view = stack[stack.length - 1];
  const push = (v: View) => {
    setStack([...stack, v]);
    window.scrollTo(0, 0);
  };
  const back = () => {
    setStack(stack.length > 1 ? stack.slice(0, -1) : stack);
    window.scrollTo(0, 0);
  };
  const toTab = (tab: TrainingTab) => {
    setStack([{ name: 'tab', tab }]);
    props.onTabChange?.(tab);
    window.scrollTo(0, 0);
  };
  const start = (s: Session) => {
    saveSession(s);
    setStack([{ name: 'tab', tab: 'train' }, { name: 'session', id: s.id }]);
    window.scrollTo(0, 0);
  };
  unsignedCount = props.unsignedRounds ?? 0;
  const nav: Nav = {
    push,
    back,
    toTab,
    start,
    openRounds: props.onOpenRounds
      ? (to) => {
          if (to === 'bag' || to === 'caddie') keptStack = { stack, scroll: window.scrollY };
          props.onOpenRounds!(to);
        }
      : undefined,
  };

  // the menu stays at the bottom on every page of the module (Sascha 16.10.2026) – only a session in play has its
  // drill bar there instead, like a round in play has the hole bar
  if (view.name === 'tab' || view.name === 'session') return page();
  const root = stack[0].name === 'tab' ? stack[0].tab : 'learn';
  return (
    <div className="tr-with-menu">
      {page()}
      <TrainingMenu current={root} onPick={toTab} profileDot={props.profileDot} />
    </div>
  );

  function page() {
    switch (view.name) {
      case 'tab':
        return <Tabs tab={view.tab} nav={nav} rounds={props.rounds} profile={props.profile} profileDot={props.profileDot} onModules={props.onModules} />;
      case 'cat':
        return <CategoryView id={view.id} nav={nav} />;
      case 'drill':
        return <DrillView id={view.id} nav={nav} />;
      case 'plan':
        return <PlanView plan={view.plan} own={view.own} nav={nav} />;
      case 'builder':
        return <Builder plan={view.plan} nav={nav} />;
      case 'review':
        return <ReviewView nav={nav} />;
      case 'fault':
        return <FaultView cat={view.cat} index={view.index} nav={nav} />;
      case 'search':
        return <SearchView q={view.q} nav={nav} />;
      case 'gear':
        return <GearView id={view.id} nav={nav} />;
      case 'cart':
        return <CartView nav={nav} />;
      case 'checkout':
        return <Checkout nav={nav} onOrdered={(order) => setStack([{ name: 'tab', tab: 'shop' }, { name: 'ordered', order }])} />;
      case 'ordered':
        return <Ordered order={view.order} nav={nav} />;
      case 'session': {
        const s = loadSessions().find((x) => x.id === view.id);
        if (!s) return <Tabs tab="train" nav={nav} rounds={props.rounds} profile={props.profile} onModules={props.onModules} />;
        return (
          <SessionPlay
            session={s}
            onPause={() => setStack([{ name: 'tab', tab: 'train' }])}
            onFinish={(done) => setStack([{ name: 'tab', tab: 'log' }, { name: 'done', id: done.id }])}
            onDelete={() => {
              deleteSession(s.id);
              setStack([{ name: 'tab', tab: 'train' }]);
            }}
            onDrill={(id) => push({ name: 'drill', id })}
          />
        );
      }
      case 'done':
        return <SessionResult id={view.id} nav={nav} />;
    }
  }
}

function TrainingMenu(props: { current: TrainingTab; onPick: (t: TrainingTab) => void; profileDot?: boolean }) {
  const n = cartCount();
  return (
    <MenuBar
      items={[
        { id: 'learn' as TrainingTab, label: tr('Library', 'Wissen'), icon: ICONS.learn },
        { id: 'train' as TrainingTab, label: tr('Practice', 'Üben'), icon: ICONS.train, dot: loadSessions().some((s) => !s.finishedAt) },
        { id: 'log' as TrainingTab, label: tr('Progress', 'Verlauf'), icon: ICONS.log },
        { id: 'shop' as TrainingTab, label: n ? `Shop (${n})` : 'Shop', icon: ICONS.shop },
        { id: 'profile' as TrainingTab, label: tr('Profile', 'Profil'), icon: MENU_ICONS.profile, dot: props.profileDot },
      ]}
      current={props.current}
      onPick={props.onPick}
    />
  );
}

interface Nav {
  push: (v: View) => void;
  back: () => void;
  toTab: (t: TrainingTab) => void;
  start: (s: Session) => void;
  openRounds?: (t: RoundsTarget) => void;
}

// ---------- tabs ----------

function Tabs(props: { tab: TrainingTab; nav: Nav; rounds: Round[]; profile: ReactNode; profileDot?: boolean; onModules: () => void }) {
  return (
    <main className="screen with-tabs training">
      {/* the module header on every tab, the profile too (like Rounds and Games since 16.10.2026) */}
      <div className="topbar">
        <ModulePill name={'Training'} onClick={props.onModules} />
        <TopTools />
      </div>
      {props.tab === 'learn' && <LearnTab nav={props.nav} rounds={props.rounds} />}
      {props.tab === 'train' && <TrainTab nav={props.nav} rounds={props.rounds} />}
      {props.tab === 'log' && <LogTab nav={props.nav} />}
      {props.tab === 'shop' && <ShopTab nav={props.nav} />}
      {props.tab === 'profile' && props.profile}
      <TrainingMenu current={props.tab} onPick={props.nav.toTab} profileDot={props.profileDot} />
    </main>
  );
}

function SearchField(props: { nav: Nav; initial?: string; onChange?: (q: string) => void }) {
  const [q, setQ] = useState(props.initial ?? '');
  return (
    <form
      className="tr-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) props.nav.push({ name: 'search', q: q.trim() });
      }}
    >
      <input
        className="input"
        type="search"
        placeholder={tr('Search drills, faults, gear …', 'Übungen, Fehler, Zubehör suchen …')}
        aria-label={tr('Search', 'Suchen')}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          props.onChange?.(e.target.value);
        }}
      />
    </form>
  );
}

/** One drill per day – from the advice of the player's rounds when there is some, otherwise from all drills. */
function DrillOfTheDay(props: { nav: Nav; prefer: string[] }) {
  const day = Math.floor(Date.now() / 86400000);
  const pool = props.prefer.map(drillById).filter((d): d is Drill => !!d);
  const list = pool.length ? pool : DRILLS;
  const d = list[day % list.length];
  return (
    <button type="button" className="list-item tr-today" onClick={() => props.nav.push({ name: 'drill', id: d.id })}>
      <span className="tr-cat-icon">{CAT_ICON[d.cat]}</span>
      <span className="grow">
        <span className="eyebrow">{tr('Drill of the day', 'Übung des Tages')}</span>
        <span className="title">{t(d.name)}</span>
        <span className="muted small tr-two-lines">{t(d.goal)}</span>
      </span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

/** “What is your problem?” – the faults of all topics as chips, a tap shows cause, cure and drills. */
function FaultFinder(props: { nav: Nav }) {
  const [all, setAll] = useState(false);
  const list = CATEGORIES.flatMap((c) => (c.faults ?? []).map((f, index) => ({ c, f, index })));
  // a short selection: the first fault of the most asked-about topics, then the second ones
  const top = ['ballflight', 'putting', 'chipping', 'irons', 'driver', 'bunker', 'pitching', 'woods'];
  const shown = all ? list : [0, 1].flatMap((k) => top.map((id) => list.find((x) => x.c.id === id && x.index === k)).filter((x): x is (typeof list)[number] => !!x)).slice(0, 12);
  return (
    <section className="tr-block">
      <Eyebrow>{tr('What is your problem?', 'Was ist dein Problem?')}</Eyebrow>
      <div className="chip-set">
        {shown.map(({ c, f, index }) => (
          <button key={`${c.id}-${index}`} type="button" className="chip" onClick={() => props.nav.push({ name: 'fault', cat: c.id, index })}>
            {t(f.name)}
          </button>
        ))}
        {!all && (
          <button type="button" className="chip fact" onClick={() => setAll(true)}>
            {tr(`All ${list.length} …`, `Alle ${list.length} …`)}
          </button>
        )}
      </div>
    </section>
  );
}

function FaultView(props: { cat: CategoryId; index: number; nav: Nav }) {
  const c = catById(props.cat);
  const f = c?.faults?.[props.index];
  if (!c || !f) return null;
  const drills = (f.drills ?? []).map(drillById).filter((d): d is Drill => !!d);
  return (
    <main className="screen training">
      <TopBar title={t(f.name)} onBack={props.nav.back} />
      <span className="eyebrow">{t(c.name)}</span>
      <section className="card tr-section">
        <dl className="tr-fault">
          <dt>{tr('What you see', 'Was du siehst')}</dt>
          <dd>{t(f.looks)}</dd>
          <dt>{tr('Why', 'Warum')}</dt>
          <dd>{t(f.cause)}</dd>
          <dt>{tr('What helps', 'Was hilft')}</dt>
          <dd>{t(f.fix)}</dd>
        </dl>
      </section>
      <ReviewBar itemKey={faultKey(c.id, f.name)} />
      {/* the fault itself next to the right way (Sascha 17.10.2026); the drills below keep their own pictures */}
      {f.sketch ? (
        <>
          <span className="eyebrow">{tr('What the fault looks like', 'So sieht der Fehler aus')}</span>
          <SketchView sketch={f.sketch} label={t(f.name)} />
        </>
      ) : drills[0]?.sketch && (
        <>
          <span className="eyebrow">{tr('The first drill for it', 'Die erste Übung dafür')}: {t(drills[0].name)}</span>
          <SketchView sketch={drills[0].sketch} label={t(drills[0].name)} />
        </>
      )}
      <Eyebrow>{tr('Drills for it', 'Übungen dafür')}</Eyebrow>
      <DrillList drills={drills} nav={props.nav} />
      {drills.length > 0 && (
        <button type="button" className="btn-primary" onClick={() => props.nav.start(newSession(t(f.name), drills.map((d) => ({ drill: d.id, minutes: Math.min(12, d.minutes) }))))}>
          {tr('Practise these drills now', 'Diese Übungen jetzt üben')}
        </button>
      )}
      <TopicRow id={c.id} nav={props.nav} />
    </main>
  );
}

// the drills opened last – "carry on where you were" on the library page (night run 16./17.10.2026)
const RECENT = 'golfos.training.recent.v1';
function loadRecent(): string[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENT) ?? '[]') as string[]).filter((id) => drillById(id));
  } catch {
    return [];
  }
}
function rememberDrill(id: string): void {
  try {
    localStorage.setItem(RECENT, JSON.stringify([id, ...loadRecent().filter((x) => x !== id)].slice(0, 6)));
  } catch {
    /* private mode – nothing to remember */
  }
}

// a drill as a small card in a sideways list (recently opened, favourites): picture, name, minutes and place
function DrillMini(props: { d: Drill; nav: Nav }) {
  const d = props.d;
  return (
    <button type="button" className="tr-mini" onClick={() => props.nav.push({ name: 'drill', id: d.id })}>
      <SketchThumb sketch={d.sketch} fallback={CAT_ICON[d.cat]} />
      <strong>{t(d.name)}</strong>
      <span className="muted small">
        {d.minutes} min · {placeName(d.place)}
      </span>
    </button>
  );
}

function LearnTab(props: { nav: Nav; rounds: Round[] }) {
  const favs = loadFavs().map(drillById).filter((d): d is Drill => !!d);
  const recent = loadRecent().map(drillById).filter((d): d is Drill => !!d).slice(0, 6);
  const advice = useMemo(() => adviceFromRounds(props.rounds), [props.rounds]);
  return (
    <>
      <h1 className="tab-title">{tr('Library', 'Wissen')}</h1>
      <SearchField nav={props.nav} />
      {recent.length > 0 && (
        <section className="tr-block">
          <Eyebrow>{tr('Recently opened', 'Zuletzt angesehen')}</Eyebrow>
          <div className="tr-hscroll">
            {recent.map((d) => (
              <DrillMini key={d.id} d={d} nav={props.nav} />
            ))}
          </div>
        </section>
      )}
      <DrillOfTheDay nav={props.nav} prefer={advice.flatMap((a) => a.drills)} />
      {advice.length === 0 && unsignedCount > 0 && (
        <section className="tr-advice">
          <Eyebrow>{tr('From your rounds', 'Aus deinen Runden')}</Eyebrow>
          <button type="button" className="list-item" onClick={() => props.nav.openRounds?.('rounds')} disabled={!props.nav.openRounds}>
            <span className="grow">
              <span className="title">{tr('Sign your finished rounds', 'Signiere deine beendeten Runden')}</span>
              <span className="muted small">
                {tr(
                  `Scorecard → Sign. Only signed rounds count – then your weak spots become drills here (${unsignedCount} not signed yet).`,
                  `Scorekarte → Signieren. Nur signierte Runden zählen – dann werden deine Schwächen hier zu Übungen (${unsignedCount} noch nicht signiert).`,
                )}
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </section>
      )}
      {advice.length > 0 && (
        <section className="tr-advice">
          <Eyebrow>{tr('From your rounds', 'Aus deinen Runden')}</Eyebrow>
          {advice.map((a) => {
            const c = catById(a.cat);
            if (!c) return null;
            return (
              <button key={a.cat} type="button" className="list-item tr-advice-item" onClick={() => props.nav.push({ name: 'cat', id: a.cat })}>
                <span className="tr-cat-icon">{CAT_ICON[a.cat]}</span>
                <span className="grow">
                  <span className="title">{t(c.name)}</span>
                  <span className="muted small">{a.why}</span>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            );
          })}
        </section>
      )}
      <FaultFinder nav={props.nav} />
      {favs.length > 0 && (
        <section className="tr-block">
          <Eyebrow>{tr('Your favourites', 'Deine Favoriten')}</Eyebrow>
          <div className="tr-hscroll">
            {favs.map((d) => (
              <DrillMini key={d.id} d={d} nav={props.nav} />
            ))}
          </div>
        </section>
      )}
      <section className="tr-block">
        <Eyebrow>{tr('Topics', 'Themen')}</Eyebrow>
        <div className="tr-cat-grid">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className="tr-cat" onClick={() => props.nav.push({ name: 'cat', id: c.id })}>
              <span className="tr-cat-icon">{CAT_ICON[c.id]}</span>
              <strong>{t(c.name)}</strong>
              <span className="muted small">{t(c.short)}</span>
              <span className="tr-count small">
                {tr(`${drillsOf(c.id).length} drills`, `${drillsOf(c.id).length} Übungen`)}
                {practised(c.id) > 0 ? tr(` · ${practised(c.id)} practised`, ` · ${practised(c.id)} geübt`) : ''}
              </span>
            </button>
          ))}
        </div>
      </section>
      <button type="button" className="list-item tr-review-entry" onClick={() => props.nav.push({ name: 'review' })}>
        <span className="tr-cat-icon small" aria-hidden="true">
          <PenGlyph />
        </span>
        <span className="grow">
          <span className="title">{tr('Review the content', 'Inhalte prüfen')}</span>
          <span className="muted small">{tr('For our golf pro: keep, change or cut – and share the list.', 'Für unseren Golfprofi: passt, ändern oder streichen – und die Liste teilen.')}</span>
        </span>
        <span aria-hidden="true">›</span>
      </button>
    </>
  );
}

/** the pause mark of a paused session – the shared green circle with two bars, as in the rounds list */
function PausedMark() {
  return (
    <span className="paused-mark" role="img" aria-label={tr('paused', 'pausiert')}>
      <PausedIcon />
    </span>
  );
}

function TrainTab(props: { nav: Nav; rounds: Round[] }) {
  const sessions = loadSessions();
  const running = sessions.filter((s) => !s.finishedAt);
  const own = loadOwnPlans();
  const advice = useMemo(() => adviceFromRounds(props.rounds), [props.rounds]);
  const [level, setLevel] = useState<Level | 0>(0);
  // a plan from the rounds: the first drill of each piece of advice, about 45 minutes
  const fromRounds = useMemo(() => {
    const items: { drill: string; minutes: number }[] = [];
    for (const a of advice) for (const id of a.drills.filter((x) => drillById(x)).slice(0, 2)) items.push({ drill: id, minutes: Math.min(12, drillById(id)!.minutes) });
    return items.slice(0, 6);
  }, [advice]);
  const plans = PLANS.filter((p) => !p.week && (level === 0 || p.level === 0 || p.level === level) && planItems(p).length);
  const favs = loadFavs().filter((id) => drillById(id));
  const weeks = PLANS.filter((p) => p.week);
  return (
    <>
      <h1 className="tab-title">{tr('Practice', 'Üben')}</h1>
      {running.map((s) => (
        // a paused session like a paused round (Rounds 17.10.2026): the same row as the finished ones, a pause mark at the name,
        // the whole row opens it – no "Weiter ›" text link
        <button key={s.id} type="button" className="list-item" onClick={() => props.nav.push({ name: 'session', id: s.id })}>
          {/* the status in its own column before the name, as in every list (Sascha 11.11.2026, status mockups: variant A) */}
          <span className="list-mark">
            <PausedMark />
          </span>
          <span className="grow">
            <span className="title">{s.name}</span>
            <span className="muted small">
              {tr(`Paused · drill ${s.current + 1} of ${s.items.length}`, `Pausiert · Übung ${s.current + 1} von ${s.items.length}`)}
            </span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      ))}
      {fromRounds.length > 0 && (
        <section className="card play-card">
          <strong className="play-course">{tr('Your plan from your rounds', 'Dein Plan aus deinen Runden')}</strong>
          <span className="muted small">
            {advice.map((a) => t(catById(a.cat)?.name)).join(' · ')} – {fromRounds.length} {tr('drills', 'Übungen')}, {fromRounds.reduce((s, i) => s + i.minutes, 0)} min
          </span>
          <button type="button" className="btn-primary" onClick={() => props.nav.start(newSession(tr('Plan from my rounds', 'Plan aus meinen Runden'), fromRounds, 'rounds'))}>
            {tr('Start plan', 'Plan starten')}
          </button>
        </section>
      )}
      {favs.length >= 2 && (
        <button type="button" className="btn-secondary" onClick={() => props.nav.start(newSession(tr('My favourites', 'Meine Favoriten'), favs.slice(0, 8).map((id) => ({ drill: id, minutes: drillById(id)!.minutes }))))}>
          <StarGlyph /> {tr(`Practise my ${Math.min(8, favs.length)} favourites`, `Meine ${Math.min(8, favs.length)} Favoriten üben`)}
        </button>
      )}
      <section className="tr-block">
        <Eyebrow>{tr('Ready-made plans', 'Fertige Pläne')}</Eyebrow>
        <div className="chip-set" role="group" aria-label={tr('Level', 'Niveau')}>
          {([0, 1, 2, 3] as const).map((l) => (
            <button key={l} type="button" className={`chip${level === l ? ' on' : ''}`} aria-pressed={level === l} onClick={() => setLevel(l)}>
              {levelName(l)}
            </button>
          ))}
        </div>
        <ul className="list">
          {plans.map((p) => (
            <li key={p.id}>
              <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'plan', plan: p })}>
                <span className="tr-cat-icon small">{CAT_ICON[p.focus[0]]}</span>
                <span className="grow">
                  <span className="title">{t(p.name)}</span>
                  <span className="muted small">
                    {planMinutes(p)} min · {planItems(p).length} {tr('drills', 'Übungen')} · {levelName(p.level)}
                  </span>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {weeks.length > 0 && (
        <section className="tr-block">
          <Eyebrow>{tr('Goals and weekly plans', 'Ziel- und Wochenpläne')}</Eyebrow>
          <ul className="list">
            {weeks.map((p) => (
              <li key={p.id}>
                <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'plan', plan: p })}>
                  <span className="tr-cat-icon small">{CAT_ICON.practice}</span>
                  <span className="grow">
                    <span className="title">{t(p.name)}</span>
                    <span className="muted small">{t(p.about)}</span>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {own.length > 0 && (
        <section className="tr-block">
          <Eyebrow>{tr('My plans', 'Meine Pläne')}</Eyebrow>
          <ul className="list">
            {own.map((p) => (
              <li key={p.id}>
                <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'plan', plan: p, own: true })}>
                  <span className="grow">
                    <span className="title">{p.name}</span>
                    <span className="muted small">
                      {planMinutes(p)} min · {planItems(p).length} {tr('drills', 'Übungen')}
                    </span>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* something new – the round green "+" bottom right, as a new round or game (Facelift 11.11.2026, tr7) */}
      <FloatActions plus={{ label: tr('Own session', 'Eigene Einheit'), onClick: () => props.nav.push({ name: 'builder', plan: { id: trainingId(), name: tr('My session', 'Meine Einheit'), items: [], createdAt: new Date().toISOString() } }) }} />
    </>
  );
}

function LogTab(props: { nav: Nav }) {
  const log = loadLog();
  const sessions = loadSessions().filter((s) => s.finishedAt);
  const trash = loadSessionTrash();
  // the page filtered by one tile at a time, as Rounds and Games (Sascha 02.11.2026: "look and logic as everywhere else")
  const [filter, setFilter] = useState<'sessions' | 'results' | 'bin' | null>(null);
  const pick = (f: 'sessions' | 'results' | 'bin') => setFilter(filter === f ? null : f);
  const shows = (f: 'sessions' | 'results') => filter == null || filter === f;
  useEffect(() => {
    if ((filter === 'bin' && !trash.length) || (filter === 'sessions' && !sessions.length) || (filter === 'results' && !log.length)) setFilter(null); // emptied: all again
  }, [trash.length, sessions.length, log.length]);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const band = bandOf(playerHcp());
  const month = new Date().toISOString().slice(0, 7);
  const drillsMonth = log.filter((e) => e.at.startsWith(month)).length;
  const drillIds = [...new Set(log.map((e) => e.drill))].filter((id) => drillById(id));
  // the goals of the player's handicap band: how many of the drills with a goal are reached (16.10.2026)
  const withGoal = drillIds.filter((id) => drillById(id)!.targets && log.some((e) => e.drill === id && e.value != null));
  const reached = withGoal.filter((id) => {
    const d = drillById(id)!;
    return meets(d.scoring, d.targets, bestOf(d.scoring, log.filter((e) => e.drill === id && e.value != null).map((e) => e.value!)), band);
  }).length;
  // where the practice goes: results per topic
  const perTopic = CATEGORIES.map((c) => ({ c, n: log.filter((e) => drillById(e.drill)?.cat === c.id).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);
  return (
    <>
      <h1 className="tab-title">{tr('Progress', 'Verlauf')}</h1>
      <div className="tile-row">
        <button type="button" className="tile" aria-pressed={filter === 'sessions'} disabled={!sessions.length} onClick={() => pick('sessions')}>
          <span className="tile-head">
            <span className="tile-num">{sessions.length}</span>
            <span className="tile-mark">{LOG_ICONS.sessions}</span>
          </span>
          <span className="muted small">{tr('sessions', 'Einheiten')}</span>
        </button>
        {/* counts only – a white mark, as "holes" on the rounds page */}
        <div className="tile">
          <span className="tile-head">
            <span className="tile-num">{drillsMonth}</span>
            <span className="tile-mark">{LOG_ICONS.month}</span>
          </span>
          <span className="muted small">{tr('this month', 'diesen Monat')}</span>
        </div>
        <button type="button" className="tile" aria-pressed={filter === 'results'} disabled={!log.length} onClick={() => pick('results')}>
          <span className="tile-head">
            <span className="tile-num">{log.length}</span>
            <span className="tile-mark">{LOG_ICONS.results}</span>
          </span>
          <span className="muted small">{tr('results', 'Ergebnisse')}</span>
        </button>
        {/* deleted sessions – always there, with 0 and white when the bin is empty, as on the rounds page */}
        <button type="button" className="tile" aria-pressed={filter === 'bin'} disabled={!trash.length} onClick={() => pick('bin')}>
          <span className="tile-head">
            <span className="tile-num">{trash.length}</span>
            <span className="tile-mark"><DeletedIcon /></span>
          </span>
          <span className="muted small">{tr('deleted', 'gelöscht')}</span>
        </button>
      </div>
      <Bin
        open={filter === 'bin'}
        title={tr('Deleted sessions', 'Gelöschte Einheiten')}
        items={trash.map((x) => ({ id: x.session.id, date: x.session.createdAt, title: x.session.name, meta: `${x.session.items.length} ${tr('drills', 'Übungen')}`, deletedAt: x.deletedAt }))}
        onRestore={(id) => restoreSession(id)}
        onPurge={(id) => purgeSession(id)}
      />
      {filter == null && !log.length && !sessions.length && (
        <p className="muted">
          {tr('Your results appear here: start a plan or open a drill and enter your score.', 'Hier erscheinen deine Ergebnisse: Starte einen Plan oder öffne eine Übung und trag dein Ergebnis ein.')}
        </p>
      )}
      {shows('results') && withGoal.length > 0 && (
        <section className="card tr-goals">
          <div className="row">
            <strong>{tr(`Goals for ${bandName(band)}`, `Ziele für ${bandName(band)}`)}</strong>
            <span className="tr-count">
              {reached}/{withGoal.length}
            </span>
          </div>
          <div className="progress" aria-hidden="true">
            <div style={{ width: `${(reached / withGoal.length) * 100}%` }} />
          </div>
          <span className="muted small">
            {tr(
              `${reached} of the ${withGoal.length} drills you have results for reach the goal of your handicap.`,
              `${reached} der ${withGoal.length} Übungen mit Ergebnis erreichen das Ziel deines Handicaps.`,
            )}
          </span>
        </section>
      )}
      {shows('results') && perTopic.length > 1 && (
        <FactChart
          chart={{
            kind: 'bars',
            title: { en: 'Where you practise (results)', de: 'Wo du übst (Ergebnisse)' },
            unit: '',
            bars: perTopic.map((x) => ({ label: x.c.name, value: x.n })),
          }}
        />
      )}
      {shows('results') && drillIds.length > 0 && (
        <section className="tr-block">
          <Eyebrow>{tr('Your drills', 'Deine Übungen')}</Eyebrow>
          <ul className="list">
            {drillIds.map((id) => {
              const d = drillById(id)!;
              // oldest first for the trend
              const vals = log.filter((e) => e.drill === id && e.value != null).map((e) => e.value!).reverse();
              const st = resultStats(d.scoring, vals);
              const ok = st ? meets(d.scoring, d.targets, st.best, band) : null;
              return (
                <li key={id}>
                  <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'drill', id })}>
                    <SketchThumb sketch={d.sketch} fallback={CAT_ICON[d.cat]} />
                    <span className="grow">
                      <span className="title">{t(d.name)}</span>
                      <span className="muted small">
                        {st
                          ? `${tr('best', 'Bestwert')} ${mainValue(d.scoring, st.best)} · Ø ${dec(st.avg)} · ${st.count}×`
                          : tr(`${log.filter((e) => e.drill === id).length}× done`, `${log.filter((e) => e.drill === id).length}× erledigt`)}
                      </span>
                    </span>
                    {st?.trend != null && st.trend !== 0 && (
                      <span className={`tr-delta${st.trend > 0 ? ' up' : ''}`}>
                        <TrendArrow up={st.trend > 0} />
                        {`${st.trend > 0 ? '+' : '−'}${dec(Math.abs(st.trend))}`}
                      </span>
                    )}
                    <span className={`tr-goal-dot${ok ? ' ok' : ''}`} aria-label={ok ? tr('goal reached', 'Ziel erreicht') : undefined}>
                      {ok ? TR_GLYPH.tick() : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {shows('results') && log.length > 0 && <RecentResults log={log} nav={props.nav} band={band} />}
      {shows('sessions') && sessions.length > 0 && (
        <section className="tr-block">
          <Eyebrow>{tr('Sessions', 'Einheiten')}</Eyebrow>
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.id}>
                {/* swiped away as a mail (Sascha 02.11.2026) – into the bin, "Undo" brings it back */}
                <SwipeRow label={s.name} onDelete={() => deleteSession(s.id)}>
                <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'done', id: s.id })}>
                  <span className="round-date">
                    <strong>{new Date(s.createdAt).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}</strong>
                    <span className="muted small">{new Date(s.createdAt).getFullYear()}</span>
                  </span>
                  <span className="grow">
                    <span className="title">{s.name}</span>
                    <span className="muted small">
                      {s.items.filter((i) => i.done).length}/{s.items.length} {tr('drills', 'Übungen')}
                      {(() => {
                        const g = sessionGoals(s, band);
                        return g.of ? tr(` · ${g.reached}/${g.of} goals`, ` · ${g.reached}/${g.of} Ziele`) : '';
                      })()}
                    </span>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// the latest results as a timeline by day (night run 16./17.10.2026: evaluation and history)
function RecentResults(props: { log: LogEntry[]; nav: Nav; band: Band }) {
  const [all, setAll] = useState(false);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const list = (all ? props.log : props.log.slice(0, 8)).filter((e) => drillById(e.drill));
  const dayKey = (iso: string) => iso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const dayName = (k: string) =>
    k === today ? tr('Today', 'Heute') : k === yesterday ? tr('Yesterday', 'Gestern') : new Date(k + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: '2-digit' });
  const days = [...new Set(list.map((e) => dayKey(e.at)))];
  return (
    <section className="tr-block">
      <Eyebrow>{tr('Latest results', 'Letzte Ergebnisse')}</Eyebrow>
      {days.map((k) => (
        <div key={k} className="tr-day">
          <span className="eyebrow">{dayName(k)}</span>
          <ul className="list">
            {list
              .filter((e) => dayKey(e.at) === k)
              .map((e) => {
                const d = drillById(e.drill)!;
                const scored = d.scoring && d.scoring.kind !== 'none';
                const ok = scored ? meets(d.scoring, d.targets, e.value, props.band) : null;
                return (
                  <li key={e.id}>
                    <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'drill', id: d.id })}>
                      <SketchThumb sketch={d.sketch} fallback={CAT_ICON[d.cat]} />
                      <span className="grow">
                        <span className="title">{t(d.name)}</span>
                        <span className="muted small">{scored ? unitText(d.scoring) : tr('done', 'erledigt')}</span>
                      </span>
                      <strong className="tr-hist-value">{scored && e.value != null ? mainValue(d.scoring, e.value) : <span className="tr-done-mark" role="img" aria-label={tr('done', 'erledigt')}>{TR_GLYPH.tick()}</span>}</strong>
                      <span className={`tr-goal-dot${ok ? ' ok' : ''}`} aria-label={ok ? tr('goal reached', 'Ziel erreicht') : undefined}>
                        {ok ? TR_GLYPH.tick() : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      {props.log.length > 8 && (
        <button type="button" className="btn-secondary" onClick={() => setAll(!all)}>
          {all ? tr('Show fewer', 'Weniger anzeigen') : tr(`Show all ${props.log.length}`, `Alle ${props.log.length} anzeigen`)}
        </button>
      )}
    </section>
  );
}

// ---------- category ----------

// the open tab per topic – back from a drill returns to the same tab
// A picture with every text (Sascha 16.10.2026): the section's own sketch or the sketch of the drill that shows it
// (with a link to that drill), and a video in the player's language when one explains it.
function SectionMedia(props: { s: Section; videos?: Video[]; nav: Nav }) {
  const d = props.s.drill ? drillById(props.s.drill) : undefined;
  const sketch = props.s.sketch ?? d?.sketch;
  const vids = (props.s.videos ?? []).map((id) => props.videos?.find((v) => v.id === id)).filter((v): v is Video => !!v);
  const video = vids.find((v) => v.lang === getLang()) ?? vids[0];
  return (
    <>
      {sketch && <SketchView sketch={sketch} label={t(props.s.title)} />}
      {props.s.metronome && <Metronome mode={props.s.metronome} />}
      {d && (
        <button type="button" className="list-item tr-section-drill" onClick={() => props.nav.push({ name: 'drill', id: d.id })}>
          <span className="tr-cat-icon small">{CAT_ICON[d.cat]}</span>
          <span className="grow">
            <span className="eyebrow">{tr('Practise it', 'So übst du es')}</span>
            <span className="title">{t(d.name)}</span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      {video && <VideoCard v={video} />}
    </>
  );
}

const CAT_TAB = new Map<CategoryId, 'drills' | 'basics' | 'faults' | 'videos'>();

function CategoryView(props: { id: CategoryId; nav: Nav }) {
  const c = catById(props.id);
  const [tab, setTabState] = useState<'drills' | 'basics' | 'faults' | 'videos'>(() => CAT_TAB.get(props.id) ?? 'drills');
  const setTab = (x: typeof tab) => {
    CAT_TAB.set(props.id, x);
    setTabState(x);
  };
  const [lvl, setLvl] = useState<Level | 0>(0);
  const [place, setPlace] = useState<Place | null>(null);
  if (!c) return null;
  const all = drillsOf(c.id);
  const places = [...new Set(all.map((d) => d.place))];
  const drills = all.filter((d) => (lvl === 0 || d.level === lvl) && (!place || d.place === place));
  // Sascha 16.10.2026: no one-pager – one part at a time; the gear only at the drill it belongs to
  // (Facelift 11.11.2026, tr1: the parts as the switch "‹ Übungen ›", each with a line what it holds)
  const tabs: StepChoice<typeof tab>[] = [
    { value: 'drills', name: tr('Drills', 'Übungen'), text: tr(`${all.length} drills`, `${all.length} Übungen`) },
    { value: 'basics', name: tr('Basics', 'Grundlagen'), text: tr('Knowledge, numbers, rules', 'Wissen, Zahlen, Regeln') },
    ...(c.faults?.length ? [{ value: 'faults' as const, name: tr('Faults', 'Fehler'), text: tr(`${c.faults.length} common faults`, `${c.faults.length} typische Fehler`) }] : []),
    ...(c.videos?.length ? [{ value: 'videos' as const, name: 'Videos', text: tr(`${c.videos.length} videos`, `${c.videos.length} Videos`) }] : []),
  ];
  return (
    <main className="screen training">
      <TopBar title={t(c.name)} onBack={props.nav.back} />
      <div className="tr-hero">
        <span className="tr-cat-icon large">{CAT_ICON[c.id]}</span>
        <p>{t(c.short)}</p>
      </div>
      <ViewPick options={tabs} value={tab} onChange={setTab} />

      {tab === 'drills' && (
        <>
          <div className="chip-set" role="group" aria-label={tr('Level', 'Niveau')}>
            {([0, 1, 2, 3] as const).map((l) => (
              <button key={l} type="button" className={`chip${lvl === l ? ' on' : ''}`} aria-pressed={lvl === l} onClick={() => setLvl(l)}>
                {levelName(l)}
              </button>
            ))}
          </div>
          {places.length > 1 && (
            <div className="chip-set" role="group" aria-label={tr('Place', 'Ort')}>
              {places.map((p) => (
                <button key={p} type="button" className={`chip${place === p ? ' on' : ''}`} aria-pressed={place === p} onClick={() => setPlace(place === p ? null : p)}>
                  {placeName(p)}
                </button>
              ))}
            </div>
          )}
          <DrillList drills={drills} nav={props.nav} />
        </>
      )}

      {tab === 'basics' && (
        <>
          {c.facts?.length ? (
            <section className="card tr-facts">
              <span className="eyebrow">{tr('Good to know', 'Gut zu wissen')}</span>
              <ul>
                {c.facts.map((f, i) => (
                  <li key={i}>
                    {t(f)}
                    <ReviewBar itemKey={factKey(c.id, f)} compact />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {c.charts?.map((ch, i) => <FactChart key={i} chart={ch} />)}
          {c.sections.map((s, i) => (
            <Collapsible key={i} title={<strong>{t(s.title)}</strong>} open={i === 0}>
              {s.text?.map((p, k) => <p key={k}>{t(p)}</p>)}
              {s.points && (
                <ul className="tr-points">
                  {s.points.map((p, k) => (
                    <li key={k}>{t(p)}</li>
                  ))}
                </ul>
              )}
              {s.fact && <p className="tr-fact">{t(s.fact)}</p>}
              <SectionMedia s={s} videos={c.videos} nav={props.nav} />
              <RoundsLinks targets={s.rounds} nav={props.nav} />
              <ReviewBar itemKey={sectionKey(c.id, s.title)} />
            </Collapsible>
          ))}
          <RuleLinks id={c.id} />
          {c.see?.length ? (
            <div className="chip-set">
              <span className="muted small">{tr('Related topics', 'Passende Themen')}:</span>
              {c.see
                .map(catById)
                .filter((x): x is Category => !!x)
                .map((x) => (
                  <button key={x.id} type="button" className="chip tr-chip-go" onClick={() => props.nav.push({ name: 'cat', id: x.id })}>
                    {t(x.name)} {TR_GLYPH.next()}
                  </button>
                ))}
            </div>
          ) : null}
          <Sources list={c.sources} />
        </>
      )}

      {tab === 'faults' && (
        <>
          <ul className="list">
            {(c.faults ?? []).map((f, i) => (
              <li key={i}>
                <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'fault', cat: c.id, index: i })}>
                  {f.sketch && <SketchThumb sketch={f.sketch} />}
                  <span className="grow">
                    <span className="title">{t(f.name)}</span>
                    <span className="muted small tr-two-lines">{t(f.looks)}</span>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === 'videos' && c.videos?.length ? (
        <>
          <VideoNote />
          {/* videos in the player's language first */}
          {[...c.videos].sort((a, b) => Number(b.lang === getLang()) - Number(a.lang === getLang())).map((v) => (
            <div key={v.id} className="tr-video-item">
              <VideoCard v={v} />
              <ReviewBar itemKey={videoKey(v.id)} />
            </div>
          ))}
        </>
      ) : null}
    </main>
  );
}

// a drill in a plan: small picture, name, minutes – tap opens the drill (Sascha 16.10.2026)
function PlanRow(props: { drill: string; meta: string; nav: Nav }) {
  const d = drillById(props.drill);
  if (!d) return null;
  return (
    <button type="button" className="tr-plan-row" onClick={() => props.nav.push({ name: 'drill', id: d.id })}>
      <SketchThumb sketch={d.sketch} fallback={CAT_ICON[d.cat]} />
      <span className="grow">
        <strong>{t(d.name)}</strong>
        <span className="muted small">{props.meta}</span>
      </span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

// a small drawn arrow for trends (the arrow characters are missing in the app font)
function TrendArrow(props: { up: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ transform: props.up ? undefined : 'rotate(180deg)' }}>
      <path d="M7 2l5 6H9v4H5V8H2z" fill="currentColor" />
    </svg>
  );
}

// a function of GolfOS Rounds a drill or a section names – one tap opens it (Sascha 16.10.2026)
const ROUNDS_TARGET: Record<RoundsTarget, { title: () => string; sub: () => string }> = {
  bag: { title: () => tr('My bag', 'Mein Bag'), sub: () => tr('Carry per club and the pitch chart', 'Carry je Schläger und Pitch-Tabelle') },
  caddie: { title: () => tr('Caddie settings', 'Caddie-Einstellungen'), sub: () => tr('How the caddie advises you on the course', 'Wie dich der Caddie auf dem Platz berät') },
  stats: { title: () => tr('Statistics', 'Statistik'), sub: () => tr('Where you lose strokes – strokes gained, putts, greens', 'Wo du Schläge verlierst – Strokes Gained, Putts, Grüns') },
  rounds: { title: () => tr('Your rounds', 'Deine Runden'), sub: () => tr('Scorecards and the round summary', 'Scorekarten und Rundenfazit') },
  course: { title: () => tr('Course preview & birdie book', 'Platzvorschau & Birdiebook'), sub: () => tr('Choose the course – every hole with map, hazards and slopes', 'Platz wählen – jedes Loch mit Karte, Gefahren und Neigung') },
};
function RoundsLinks(props: { targets?: RoundsTarget[]; nav: Nav }) {
  if (!props.targets?.length || !props.nav.openRounds) return null;
  return (
    <ul className="list tr-rounds-links">
      {props.targets.map((x) => (
        <li key={x}>
          <button type="button" className="list-item" onClick={() => props.nav.openRounds!(x)}>
            <span className="tr-cat-icon small" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 21V3l11 4-11 4" />
                <ellipse cx="12" cy="21" rx="8" ry="1.6" />
              </svg>
            </span>
            <span className="grow">
              <span className="eyebrow">{tr('Open in Rounds', 'In Rounds öffnen')}</span>
              <span className="title">{ROUNDS_TARGET[x].title()}</span>
              <span className="muted small">{ROUNDS_TARGET[x].sub()}</span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// the Rules of Golf that belong to a topic – one tap opens the rule book of the caddie at that rule (Sascha 18.10.2026)
const CAT_RULES: Partial<Record<CategoryId, { n: number; section?: string }[]>> = {
  bunker: [{ n: 12, section: '12.2' }, { n: 12, section: '12.3' }],
  putting: [{ n: 13 }],
  greenreading: [{ n: 13 }],
  trouble: [{ n: 19 }, { n: 17 }, { n: 16 }],
  strategy: [{ n: 18 }, { n: 17 }],
};
function RuleLinks(props: { id: CategoryId }) {
  const [open, setOpen] = useState<{ n: number; section?: string } | null>(null);
  const list = CAT_RULES[props.id];
  if (!list?.length) return null;
  return (
    <section className="tr-rules">
      <Eyebrow>{tr('The rules for it', 'Die Regeln dazu')}</Eyebrow>
      <ul className="list tr-rounds-links">
        {list.map((r) => {
          const rule = RULES_OF_GOLF.find((x) => x.n === r.n);
          if (!rule) return null;
          const sec = r.section ? rule.sections.find((x) => x.id === r.section) : undefined;
          return (
            <li key={r.n + (r.section ?? '')}>
              <button type="button" className="list-item" onClick={() => setOpen(r)}>
                <span className="tr-cat-icon small" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
                    <path d="M4 5.5v16M8 7h8M8 11h6" />
                  </svg>
                </span>
                <span className="grow">
                  <span className="eyebrow">{tr('Rule', 'Regel') + ' ' + (sec ? sec.id : r.n)}</span>
                  <span className="title">{sec ? sec.title() : rule.title()}</span>
                  <span className="muted small">{rule.purpose()}</span>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && <RulesBook start={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

// the way to a topic: a row like every other list row (no underlined link – Sascha 16.10.2026)
function TopicRow(props: { id: CategoryId; nav: Nav }) {
  const c = catById(props.id);
  if (!c) return null;
  return (
    <button type="button" className="list-item tr-topic-row" onClick={() => props.nav.push({ name: 'cat', id: c.id })}>
      <span className="tr-cat-icon small">{CAT_ICON[c.id]}</span>
      <span className="grow">
        <span className="eyebrow">{tr('Topic', 'Thema')}</span>
        <span className="title">{t(c.name)}</span>
        <span className="muted small">{tr('All drills, basics, faults and videos', 'Alle Übungen, Grundlagen, Fehler und Videos')}</span>
      </span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

function DrillList(props: { drills: Drill[]; nav: Nav }) {
  if (!props.drills.length) return <p className="muted">{tr('No drills for this filter.', 'Keine Übungen für diesen Filter.')}</p>;
  const favs = loadFavs();
  const review = reviewOn();
  const marks = review ? loadReview() : {};
  return (
    <ul className="list">
      {props.drills.map((d) => (
        <li key={d.id} className="tr-drill-row">
          <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'drill', id: d.id })}>
            <SketchThumb sketch={d.sketch} fallback={CAT_ICON[d.cat]} />
            <span className="grow">
              <span className="title">
                {review && marks[drillKey(d.id)] ? <>{SIGN[marks[drillKey(d.id)].verdict]} </> : null}
                {favs.includes(d.id) ? (
                  <>
                    <StarGlyph />{' '}
                  </>
                ) : null}
                {t(d.name)}
              </span>
              <span className="muted small tr-two-lines">{t(d.goal)}</span>
              <span className="muted small">
                {levelName(d.level)} · {d.minutes} min · {placeName(d.place)}
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

// the sources as rows (title, website, ↗) – no underlined links
function Sources(props: { list?: { label: string; url: string }[] }) {
  if (!props.list?.length) return null;
  return (
    <Collapsible title={<span className="muted">{tr('Sources', 'Quellen')}</span>} className="tr-sources">
      <ul className="tr-source-list">
        {props.list.map((s) => (
          <li key={s.url}>
            <a className="tr-source" href={s.url} target="_blank" rel="noreferrer">
              <span className="grow">
                <span>{s.label}</span>
                <span className="muted small">{host(s.url)}</span>
              </span>
              <span className="tr-ext" aria-hidden="true">{TR_GLYPH.external()}</span>
            </a>
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}

// ---------- drill ----------

type DrillTab = 'learn' | 'result' | 'videos' | 'gear';
const DRILL_TAB = new Map<string, DrillTab>();

function DrillView(props: { id: string; nav: Nav }) {
  useTrainingTick();
  const d = drillById(props.id);
  // the entry starts at the last result – usually only a step or two away (like par on the score sheet)
  const [value, setValue] = useState<number | null>(() => logFor(props.id).find((e) => e.value != null)?.value ?? null);
  const [saved, setSaved] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // a removed result can be brought back for 8 seconds – the same "Undo" as for rounds, games and sessions
  const [removed, setRemoved] = useState<LogEntry | null>(null);
  const [tabState, setTabState] = useState<DrillTab>(() => DRILL_TAB.get(props.id) ?? 'learn');
  const setTab = (x: DrillTab) => {
    DRILL_TAB.set(props.id, x);
    setTabState(x);
  };
  useEffect(() => {
    if (!removed) return;
    const t = window.setTimeout(() => setRemoved(null), 8000);
    return () => window.clearTimeout(t);
  }, [removed]);
  useEffect(() => {
    if (drillById(props.id)) rememberDrill(props.id);
  }, [props.id]);
  if (!d) return null;
  const fav = loadFavs().includes(d.id);
  const entries = logFor(d.id);
  const hcp = playerHcp();
  const band = bandOf(hcp);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const scored = d.scoring && d.scoring.kind !== 'none';
  const chartEntries = entries.filter((e) => e.value != null).reverse().map((e) => ({ at: e.at, value: e.value! }));
  const stats = resultStats(d.scoring, chartEntries.map((e) => e.value));
  const goalReached = stats != null && meets(d.scoring, d.targets, stats.best, band) === true;
  // Sascha 16.10.2026: the gear belongs to the drill – shown here, not on the topic page
  const plainNeeds = (d.needs ?? []).filter((n): n is L => typeof n !== 'string');
  const gear = gearForDrill(d);
  // Sascha 17.10.2026: no one-pager – the drill page in tabs like the topic pages; a tab only when it has something
  // (Facelift 11.11.2026, tr1: the parts as the switch "‹ Anleitung ›")
  const tabs: StepChoice<DrillTab>[] = [
    { value: 'learn', name: tr('How to', 'Anleitung'), text: tr('Set-up, steps, tips', 'Aufbau, Ablauf, Tipps') },
    ...(scored ? [{ value: 'result' as const, name: tr('Result', 'Ergebnis'), text: tr('Enter it, your history', 'Eintragen, Historie') }] : []),
    ...(d.videos?.length ? [{ value: 'videos' as const, name: 'Videos', text: d.videos.length > 1 ? tr(`${Math.min(2, d.videos.length)} videos`, `${Math.min(2, d.videos.length)} Videos`) : tr('1 video', '1 Video') }] : []),
    ...(gear.length ? [{ value: 'gear' as const, name: tr('Gear', 'Zubehör'), text: tr(`${gear.length} for this drill`, `${gear.length} für diese Übung`) }] : []),
  ];
  const tab: DrillTab = tabs.some((x) => x.value === tabState) ? tabState : 'learn';
  return (
    <main className="screen training">
      <TopBar title={t(d.name)} onBack={props.nav.back} />
      <p className="tr-goal">{t(d.goal)}</p>
      <div className="chip-set facts">
        <span className="chip fact">{levelName(d.level)}</span>
        <span className="chip fact">{d.minutes} min</span>
        <span className="chip fact">{placeName(d.place)}</span>
        {d.balls ? <span className="chip fact">{tr(`${d.balls} balls`, `${d.balls} Bälle`)}</span> : null}
      </div>
      {d.review && <p className="tr-review small">{tr('Content still to be checked by our golf pro.', 'Inhalt wird noch von unserem Golfprofi geprüft.')}</p>}
      {tabs.length > 1 && <ViewPick options={tabs} value={tab} onChange={setTab} />}

      {tab === 'learn' && (
        <>
          {d.sketch && <SketchView sketch={d.sketch} label={t(d.name)} />}
          {d.metronome && <Metronome mode={d.metronome} />}
          {d.origin && (
            <p className="muted small">
              {tr('Known from', 'Bekannt durch')}: {t(d.origin)}
            </p>
          )}
          <Eyebrow>{tr('Set-up', 'Aufbau')}</Eyebrow>
          <section className="card tr-section">
            <p>{t(d.setup)}</p>
            {plainNeeds.length ? (
              <div className="tr-needs">
                <span className="muted small">{tr('You need', 'Du brauchst')}:</span>
                <div className="chip-set">
                  {plainNeeds.map((n, i) => (
                    <span key={i} className="chip fact">
                      {t(n)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
          <Eyebrow>{tr('Steps', 'Ablauf')}</Eyebrow>
          <section className="card tr-section">
            <ol className="tr-steps">
              {d.steps.map((s, i) => (
                <li key={i}>{t(s)}</li>
              ))}
            </ol>
          </section>
          <RoundsLinks targets={d.rounds} nav={props.nav} />
          {d.tips?.length ? (
            <>
              <Eyebrow>{tr('Tips', 'Tipps')}</Eyebrow>
              <section className="card tr-section">
                <ul className="tr-points">
                  {d.tips.map((s, i) => (
                    <li key={i}>{t(s)}</li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}
          {(d.easier || d.harder) && (
            <>
              <Eyebrow>{tr('Variants', 'Varianten')}</Eyebrow>
              <section className="card tr-section tr-variants">
                {d.easier && (
                  <p>
                    <strong>{tr('Easier', 'Leichter')}:</strong> {t(d.easier)}
                  </p>
                )}
                {d.harder && (
                  <p>
                    <strong>{tr('Harder', 'Schwerer')}:</strong> {t(d.harder)}
                  </p>
                )}
              </section>
            </>
          )}
          <Sources list={d.sources} />
        </>
      )}

      {tab === 'result' && (
        <>
          {/* only drills with a measurable result get the result part (no "done it?" for planning or mobility) */}
          {scored && (
            <>
              <Eyebrow>{tr('Enter your result', 'Ergebnis eintragen')}</Eyebrow>
              <section className="card tr-section tr-log">
                <ResultInput
                  drill={d}
                  value={value}
                  onChange={(v) => {
                    setValue(v);
                    setSaved(false);
                  }}
                />
                {/* a quiet line what happens – no button in the card (Facelift 11.11.2026, tr3) */}
                <span className="muted small tr-save-note" role="status">
                  {saved ? tr('Saved – it is in the history below.', 'Gespeichert – steht unten in der Historie.') : tr('Then it shows in the history.', 'Erscheint danach in der Historie.')}
                </span>
              </section>
              {/* a new entry: the round green tick bottom right, as everything new (docs/DESIGN.md "Saving") */}
              <FloatActions
                save={{
                  label: tr('Save result', 'Ergebnis speichern'),
                  disabled: value == null || saved,
                  onClick: () => {
                    addLog({ drill: d.id, value: scored ? value : null });
                    setSaved(true);
                  },
                }}
              />
            </>
          )}
          {scored && stats && <Eyebrow>{tr('Your evaluation', 'Deine Auswertung')}</Eyebrow>}
          {scored && stats && (
            <section className="card tr-section tr-eval">
              <div className="tile-row">
                <div className="tile">
                  <span className="tile-num">{mainValue(d.scoring, stats.best)}</span>
                  <span className="muted small">{tr('best', 'Bestwert')}</span>
                </div>
                <div className="tile">
                  <span className="tile-num">{dec(stats.avg)}</span>
                  <span className="muted small">{stats.count >= 5 ? tr('Ø last 5', 'Ø letzte 5') : tr('average', 'Schnitt')}</span>
                </div>
                <div className="tile">
                  <span className={`tile-num tr-trend${stats.trend != null && stats.trend > 0 ? ' good-text' : ''}`}>
                    {stats.trend != null && stats.trend !== 0 && <TrendArrow up={stats.trend > 0} />}
                    {stats.trend == null ? '–' : stats.trend > 0 ? `+${dec(stats.trend)}` : dec(stats.trend)}
                  </span>
                  <span className="muted small">{stats.trend == null ? tr('trend from 4 results', 'Trend ab 4 Ergebnissen') : stats.trend > 0 ? tr('trend: better', 'Trend: besser') : stats.trend < 0 ? tr('trend: weaker', 'Trend: schwächer') : tr('trend: even', 'Trend: gleich')}</span>
                </div>
                {d.targets && (
                  <div className={`tile${goalReached ? ' reached' : ''}`}>
                    <span className="tile-num">{mainValue(d.scoring, d.targets[band])}</span>
                    <span className="muted small">
                      {goalReached ? (
                        <>
                          {TR_GLYPH.tick()} {tr(`goal ${bandName(band)} reached`, `Ziel ${bandName(band)} erreicht`)}
                        </>
                      ) : (
                        tr(`goal ${bandName(band)}`, `Ziel ${bandName(band)}`)
                      )}
                    </span>
                  </div>
                )}
              </div>
              <ResultChart
                entries={chartEntries}
                goal={d.targets?.[band]}
                lowerBetter={!higherBetter(d.scoring)}
                min={d.scoring?.kind === 'made' ? 0 : undefined}
                max={d.scoring?.kind === 'made' ? d.scoring.of : undefined}
              />
            </section>
          )}
          {scored && entries.length > 0 && <Eyebrow aside={tr(`${entries.length}× logged`, `${entries.length}× eingetragen`)}>{tr('History', 'Historie')}</Eyebrow>}
          {scored && entries.length > 0 && (
            <section className="card tr-section">
              {scored && unitText(d.scoring) && <span className="muted small tr-hist-unit">{unitText(d.scoring)}</span>}
              <ul className="tr-history">
                {(showAll ? entries : entries.slice(0, 5)).map((e, k) => {
                  const prev = entries.slice(k + 1).find((x) => x.value != null);
                  const delta = scored && e.value != null && prev?.value != null ? e.value - prev.value : null;
                  const better = delta == null || delta === 0 ? null : higherBetter(d.scoring) ? delta > 0 : delta < 0;
                  const ok = scored ? meets(d.scoring, d.targets, e.value, band) : null;
                  const when = new Date(e.at);
                  return (
                    <li key={e.id}>
                      <SwipeRow
                        label={tr('Entry', 'Eintrag')}
                        onDelete={() => {
                          removeLog(e.id);
                          setRemoved(e);
                        }}
                      >
                        <div className="tr-hist-row">
                          <span className="round-date">
                            <strong>{when.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}</strong>
                            <span className="muted small">{when.toLocaleDateString(locale, { weekday: 'short' })}</span>
                          </span>
                          <span className="grow">
                            <strong className="tr-hist-value">{scored && e.value != null ? mainValue(d.scoring, e.value) : tr('done', 'erledigt')}</strong>
                          </span>
                          {delta != null && delta !== 0 && (
                            <span className={`tr-delta${better ? ' up' : ''}`}>
                              <TrendArrow up={!!better} />
                              {`${delta > 0 ? '+' : '−'}${dec(Math.abs(delta))}`}
                            </span>
                          )}
                          <span className={`tr-goal-dot${ok ? ' ok' : ''}`} title={ok ? tr('goal reached', 'Ziel erreicht') : undefined} aria-label={ok ? tr('goal reached', 'Ziel erreicht') : undefined}>
                            {ok ? TR_GLYPH.tick() : ''}
                          </span>
                        </div>
                      </SwipeRow>
                    </li>
                  );
                })}
              </ul>
              {entries.length > 5 && (
                <button type="button" className="btn-secondary" onClick={() => setShowAll(!showAll)}>
                  {showAll ? tr('Show fewer', 'Weniger anzeigen') : tr(`Show all ${entries.length}`, `Alle ${entries.length} anzeigen`)}
                </button>
              )}
            </section>
          )}
          {d.targets && <Eyebrow>{tr('Targets by handicap', 'Ziele nach Handicap')}</Eyebrow>}
          {d.targets && (
            <section className="card tr-section">
              <div className="tr-targets">
                {(['high', 'mid', 'low', 'tour'] as const)
                  .filter((b) => d.targets![b] != null)
                  .map((b) => (
                    <div key={b} className={hcp != null && b === band ? 'mine' : ''}>
                      <strong>{d.scoring?.kind === 'made' ? `${d.targets![b]}/${d.scoring.of}` : dec(d.targets![b]!)}</strong>
                      <span className="small">{bandName(b)}</span>
                    </div>
                  ))}
              </div>
              {hcp == null && <span className="muted small">{tr('Enter your handicap in the profile to see your goal highlighted.', 'Trag dein Handicap im Profil ein, dann ist dein Ziel markiert.')}</span>}
            </section>
          )}
        </>
      )}

      {tab === 'videos' && (
        <>
          {d.videos?.length ? (
            <>
              <Eyebrow>{d.videos.length > 1 ? tr('Videos', 'Videos') : tr('Video', 'Video')}</Eyebrow>
              <VideoNote />
              {[...d.videos]
                .sort((a, b) => Number(b.lang === getLang()) - Number(a.lang === getLang()))
                .slice(0, 2)
                .map((v) => (
                  <VideoCard key={v.id} v={v} />
                ))}
            </>
          ) : null}
        </>
      )}

      {tab === 'gear' && (
        <>
          {gear.length > 0 && (
            <section className="tr-block">
              <Eyebrow>{tr('Gear for this drill', 'Zubehör für diese Übung')}</Eyebrow>
              {gear.map((g) => (
                <GearRow key={g.id} g={g} nav={props.nav} />
              ))}
            </section>
          )}
        </>
      )}

      {/* the drill's actions in one bar as on the scorecard of Rounds – the TopBar keeps no tool but the pen (Sascha 03.11.2026) */}
      <div className="sc-actions" role="group" aria-label={t(d.name)}>
        <button type="button" className={`sc-action tr-fav${fav ? ' on' : ''}`} aria-pressed={fav} aria-label={fav ? tr('Remove from favourites', 'Aus Favoriten entfernen') : tr('Add to favourites', 'Zu Favoriten')} onClick={() => toggleFav(d.id)}>
          {ACT_ICONS.star(fav)}
          <span>{tr('Favourite', 'Favorit')}</span>
        </button>
        <button
          type="button"
          className="sc-action"
          aria-label={tr('Add to my own session', 'Zu meiner eigenen Einheit hinzufügen')}
          onClick={() => {
            const own = loadOwnPlans();
            // the newest own plan gets the drill; without one a new plan starts with it
            const base: OwnPlan = own[0] ?? { id: trainingId(), name: tr('My session', 'Meine Einheit'), items: [], createdAt: new Date().toISOString() };
            props.nav.push({ name: 'builder', plan: base.items.some((i) => i.drill === d.id) ? base : { ...base, items: [...base.items, { drill: d.id, minutes: d.minutes }] } });
          }}
        >
          {ACT_ICONS.add}
          <span>{tr('To my session', 'Zur Einheit')}</span>
        </button>
      </div>
      <TopicRow id={d.cat} nav={props.nav} />
      <ReviewBar itemKey={drillKey(d.id)} />
      {reviewOn() && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const next = nextOpenDrill(d.id);
            if (next) props.nav.push({ name: 'drill', id: next });
          }}
        >
          {tr('Next drill to review', 'Nächste ungeprüfte Übung')} {TR_GLYPH.next()}
        </button>
      )}
      {removed && (
        <div className="undo-toast" role="status">
          <span>
            {tr('Result removed', 'Ergebnis entfernt')}
            <span className="muted"> · {scoreText(d.scoring, removed.value)}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              restoreLog(removed);
              setRemoved(null);
            }}
          >
            {tr('Undo', 'Rückgängig')}
          </button>
        </div>
      )}
    </main>
  );
}

// ---------- review mode (Sascha 16.10.2026: go through the module with Chris and shorten it) ----------

// the review's mark as a symbol (SVG – night 10./11.11.2026)
const SIGN: Record<Verdict, JSX.Element> = { ok: <CheckGlyph />, edit: <PenGlyph />, cut: <CrossGlyph /> };
const KIND_NAME: Record<ReviewKind, () => string> = {
  fact: () => tr('Numbers', 'Zahlen'),
  drill: () => tr('Drills', 'Übungen'),
  section: () => tr('Basics', 'Grundlagen'),
  fault: () => tr('Faults', 'Fehler'),
  video: () => tr('Videos', 'Videos'),
  plan: () => tr('Plans', 'Pläne'),
  gear: () => tr('Gear', 'Zubehör'),
};

function ReviewView(props: { nav: Nav }) {
  useTrainingTick();
  const [shared, setShared] = useState<string | null>(null);
  const on = reviewOn();
  const marks = loadReview();
  const items = useMemo(reviewItems, []);
  const done = items.filter((i) => marks[i.key]);
  const count = (v: Verdict) => done.filter((i) => marks[i.key].verdict === v).length;
  const todo = done.filter((i) => marks[i.key].verdict !== 'ok').sort((a, b) => marks[b.key].at.localeCompare(marks[a.key].at));
  const who = fullName(loadProfile());
  const lang = getLang() === 'de' ? 'de' : 'en';

  const open = (i: ReviewItem) => {
    const [kind, ...rest] = i.key.split(':');
    if (kind === 'drill') return props.nav.push({ name: 'drill', id: rest.join(':') });
    if (kind === 'gear') return props.nav.push({ name: 'gear', id: rest.join(':') });
    if (kind === 'plan') {
      const p = PLANS.find((x) => x.id === rest.join(':'));
      return p && props.nav.push({ name: 'plan', plan: p });
    }
    if (kind === 'fault' && i.cat) {
      const index = (catById(i.cat)?.faults ?? []).findIndex((f) => faultKey(i.cat!, f.name) === i.key);
      if (index >= 0) return props.nav.push({ name: 'fault', cat: i.cat, index });
    }
    if (i.cat) {
      CAT_TAB.set(i.cat, kind === 'video' ? 'videos' : kind === 'section' || kind === 'fact' ? 'basics' : 'drills');
      props.nav.push({ name: 'cat', id: i.cat });
    }
  };
  const share = async () => {
    const text = exportMarkdown(lang, who || undefined);
    try {
      if (navigator.share) {
        await navigator.share({ title: tr('GolfOS Training – review', 'GolfOS Training – Prüfung'), text });
        return setShared(tr('Shared.', 'Geteilt.'));
      }
    } catch {
      /* cancelled – fall back to the clipboard */
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared(tr('Copied – paste it into a message or e-mail.', 'Kopiert – in eine Nachricht oder Mail einfügen.'));
    } catch {
      setShared(tr('Could not share – use “Save as file”.', 'Teilen ging nicht – nimm „Als Datei speichern“.'));
    }
  };
  const download = () => {
    const blob = new Blob([exportMarkdown(lang, who || undefined)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `golfos-training-pruefung-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <main className="screen training">
      <TopBar title={tr('Review the content', 'Inhalte prüfen')} onBack={props.nav.back} />
      <button type="button" className="btn-secondary tr-switch" aria-pressed={on} onClick={() => setReviewOn(!on)}>
        {on ? tr('Review mode is on – switch off', 'Prüfmodus ist an – ausschalten') : tr('Switch review mode on', 'Prüfmodus einschalten')}
      </button>
      <div className="tile-row">
        <div className="tile">
          <span className="tile-num">
            {done.length}/{items.length}
          </span>
          <span className="muted small">{tr('reviewed', 'geprüft')}</span>
        </div>
        <div className="tile">
          <span className="tile-num">{count('ok')}</span>
          <span className="muted small">
            <CheckGlyph /> {tr('keep', 'passt')}
          </span>
        </div>
        <div className="tile">
          <span className="tile-num">{count('edit')}</span>
          <span className="muted small">
            <PenGlyph /> {tr('change', 'ändern')}
          </span>
        </div>
        <div className="tile">
          <span className="tile-num">{count('cut')}</span>
          <span className="muted small">
            <CrossGlyph /> {tr('cut', 'streichen')}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          if (!on) setReviewOn(true);
          const next = nextOpenDrill();
          if (next) props.nav.push({ name: 'drill', id: next });
        }}
        disabled={!nextOpenDrill()}
      >
        {tr('Review the next drill', 'Nächste ungeprüfte Übung prüfen')}
      </button>
      <Eyebrow>{tr('By topic', 'Nach Thema')}</Eyebrow>
      <section className="card tr-section">
        <ul className="tr-review-topics">
          {CATEGORIES.map((c) => {
            const list = items.filter((i) => i.cat === c.id);
            const n = list.filter((i) => marks[i.key]).length;
            return (
              <li key={c.id}>
                <button type="button" className="tr-plan-row" onClick={() => props.nav.push({ name: 'cat', id: c.id })}>
                  <span className="tr-cat-icon small">{CAT_ICON[c.id]}</span>
                  <span className="grow">
                    <strong>{t(c.name)}</strong>
                    <span className="muted small">
                      {(['fact', 'drill', 'section', 'fault', 'video'] as ReviewKind[])
                        .map((k) => {
                          const all = list.filter((i) => i.kind === k);
                          return all.length ? `${KIND_NAME[k]()} ${all.filter((i) => marks[i.key]).length}/${all.length}` : '';
                        })
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="tr-count small">
                    {n}/{list.length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {todo.length > 0 && <Eyebrow>{tr('To change or cut', 'Zu ändern oder streichen')}</Eyebrow>}
      {todo.length > 0 && (
        <section className="card tr-section">
          <ul className="tr-review-topics">
            {todo.map((i) => (
              <li key={i.key}>
                <button type="button" className="tr-plan-row" onClick={() => open(i)}>
                  <span className={`tr-review-sign ${marks[i.key].verdict}`}>{SIGN[marks[i.key].verdict]}</span>
                  <span className="grow">
                    <strong>{t(i.title)}</strong>
                    <span className="muted small">
                      {KIND_NAME[i.kind]()}
                      {i.cat ? ` · ${t(catById(i.cat)?.name)}` : ''}
                      {marks[i.key].note ? ` – ${marks[i.key].note}` : ''}
                    </span>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Eyebrow>{tr('Share the list', 'Liste teilen')}</Eyebrow>
      <section className="card tr-section">
        {/* Teilen always the same – the share mark and "Teilen" in the action bar (Sascha 03.11.2026) */}
        <div className="sc-actions" role="group" aria-label={tr('The list', 'Die Liste')}>
          <button type="button" className="sc-action" onClick={() => void share()} disabled={!done.length}>
            {ACT_ICONS.share}
            <span>{tr('Share', 'Teilen')}</span>
          </button>
          <button type="button" className="sc-action" aria-label={tr('Save as file (.md)', 'Als Datei speichern (.md)')} onClick={download} disabled={!done.length}>
            {ACT_ICONS.file}
            <span>{tr('As file', 'Als Datei')}</span>
          </button>
        </div>
        {shared && <span className="muted small" role="status">{shared}</span>}
      </section>
    </main>
  );
}

// ---------- plans ----------

function PlanView(props: { plan: Plan | OwnPlan; own?: boolean; nav: Nav }) {
  const p = props.plan;
  const isOwn = props.own;
  const name = typeof p.name === 'string' ? p.name : t(p.name);
  const week = 'week' in p ? p.week : undefined;
  const items = planItems(p);
  return (
    <main className="screen training">
      <TopBar title={name} onBack={props.nav.back} />
      {/* the pencil bottom right, floating (Sascha 12.11.2026: "the same in the whole app") */}
      {isOwn && <FloatActions pen={{ label: tr('Edit plan', 'Plan bearbeiten'), onClick: () => props.nav.push({ name: 'builder', plan: p as OwnPlan }) }} />}
      {'about' in p && <p className="muted">{t(p.about)}</p>}
      {week ? (
        week.map((day, k) => (
          <div key={k} className="tr-block">
            <Eyebrow aside={`${planMinutes(day)} min`}>{t(day.day)}</Eyebrow>
            <section className="card tr-section">
              <ol className="tr-plan-list">
                {planItems(day).map((i, n) => (
                  <li key={n}>
                    <PlanRow drill={i.drill} meta={`${i.minutes} min`} nav={props.nav} />
                  </li>
                ))}
              </ol>
              <button type="button" className="btn-secondary" onClick={() => props.nav.start(newSession(`${name} – ${t(day.day)}`, day.items, p.id))}>
                {tr('Start this day', 'Diesen Tag starten')}
              </button>
            </section>
          </div>
        ))
      ) : (
        <>
          <Eyebrow aside={`${planMinutes(p)} min`}>{tr('Drills', 'Übungen')}</Eyebrow>
          <section className="card tr-section">
            <ol className="tr-plan-list">
              {items.map((i, n) => (
                <li key={n}>
                  <PlanRow drill={i.drill} meta={`${i.minutes} min · ${placeName(drillById(i.drill)!.place)}`} nav={props.nav} />
                </li>
              ))}
            </ol>
          </section>
          {/* own plan: edited with the pen above; its actions in one bar, then the main button (Sascha 03.11.2026) */}
          {isOwn && (
            <div className="sc-actions" role="group" aria-label={tr('This plan', 'Dieser Plan')}>
              <button
                type="button"
                className="sc-action danger"
                aria-label={tr('Delete plan', 'Plan löschen')}
                onClick={() => {
                  removeOwnPlan(p.id);
                  props.nav.back();
                }}
              >
                {ACT_ICONS.delete}
                <span>{tr('Delete', 'Löschen')}</span>
              </button>
            </div>
          )}
          {/* the main action right after the drills, as on the rounds page */}
          <button type="button" className="btn-primary" disabled={!items.length} onClick={() => props.nav.start(newSession(name, items, p.id))}>
            {tr('Start session', 'Einheit starten')}
          </button>
          {!props.own && <ReviewBar itemKey={planKey(p.id)} />}
          <GearForPlan items={items} nav={props.nav} />
        </>
      )}
    </main>
  );
}

function GearForPlan(props: { items: { drill: string }[]; nav: Nav }) {
  const ids = [...new Set(props.items.flatMap((i) => (drillById(i.drill)?.needs ?? []).filter((n): n is string => typeof n === 'string')))];
  const gear = ids.map(gearById).filter((g): g is Gear => !!g);
  if (!gear.length) return null;
  return (
    <section className="tr-block">
      <Eyebrow>{tr('Helpful for this plan', 'Hilfreich für diesen Plan')}</Eyebrow>
      <div className="tr-hscroll">
        {gear.map((g) => (
          <GearTile key={g.id} g={g} nav={props.nav} />
        ))}
      </div>
    </section>
  );
}

function Builder(props: { plan: OwnPlan; nav: Nav }) {
  const [p, setP] = useState<OwnPlan>(props.plan);
  // an own plan there already: every change kept at once (on this phone – nothing to wait for)
  const [stored] = useState(() => loadOwnPlans().find((x) => x.id === props.plan.id));
  const existing = !!stored;
  const saved = useRef(JSON.stringify(stored ?? null));
  const ok = !!p.items.length && !!p.name.trim();
  useEffect(() => {
    const key = JSON.stringify(p);
    if (!existing || !ok || saved.current === key) return;
    saved.current = key;
    saveOwnPlan(p);
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cat, setCat] = useState<CategoryId | null>(null);
  const [q, setQ] = useState('');
  const pool = DRILLS.filter((d) => (!cat || d.cat === cat || d.also?.includes(cat)) && (!q.trim() || t(d.name).toLowerCase().includes(q.trim().toLowerCase())));
  const add = (d: Drill) => setP({ ...p, items: p.items.some((i) => i.drill === d.id) ? p.items.filter((i) => i.drill !== d.id) : [...p.items, { drill: d.id, minutes: d.minutes }] });
  const move = (k: number, by: number) => {
    const items = [...p.items];
    const [x] = items.splice(k, 1);
    items.splice(Math.max(0, Math.min(items.length, k + by)), 0, x);
    setP({ ...p, items });
  };
  // a drill swiped out of the plan comes back with "Rückgängig" for a moment (as a result, a round, a session)
  const [out, setOut] = useState<{ item: OwnPlan['items'][number]; at: number } | null>(null);
  useEffect(() => {
    if (!out) return;
    const timer = window.setTimeout(() => setOut(null), 8000);
    return () => window.clearTimeout(timer);
  }, [out]);
  return (
    <main className="screen training">
      <TopBar title={tr('Own session', 'Eigene Einheit')} onBack={props.nav.back} />
      <div className="field">
        <label htmlFor="tr-plan-name">{tr('Name', 'Name')}</label>
        <input id="tr-plan-name" className="input" required placeholder={tr('Enter a name', 'Name eingeben')} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      </div>
      {/* the plan's drills (Facelift 11.11.2026, tr5): a card each – swiped left it leaves the plan ("Rückgängig" in
          the toast), the minutes as the app's stepper, the arrow moves it up; no "−", "7′", "+", "↑", "✕" chips */}
      <Eyebrow aside={`${planMinutes(p)} min`}>{tr('Your drills', 'Deine Übungen')}</Eyebrow>
      {!p.items.length && <span className="muted small">{tr('Tick drills in the list below.', 'Hake unten Übungen an.')}</span>}
      {p.items.length > 0 && (
        <ol className="tr-own-list">
          {p.items.map((i, k) => {
            const dk = drillById(i.drill);
            return (
              <li key={i.drill}>
                <SwipeRow
                  label={t(dk?.name)}
                  onDelete={() => {
                    setOut({ item: i, at: k });
                    setP({ ...p, items: p.items.filter((_, j) => j !== k) });
                  }}
                >
                  <div className="card tr-own-row">
                    <span className="grow">
                      <strong>{t(dk?.name)}</strong>
                      {dk && <span className="muted small">{placeName(dk.place)}</span>}
                    </span>
                    <span className="tr-own-ctl">
                      <button type="button" className="icon-btn tr-own-up" aria-label={tr(`${t(dk?.name)} up`, `${t(dk?.name)} nach oben`)} disabled={k === 0} onClick={() => move(k, -1)}>
                        {TR_GLYPH.up()}
                      </button>
                      <Stepper compact min={1} label={tr('Minutes', 'Minuten')} value={i.minutes} onChange={(v) => setP({ ...p, items: p.items.map((x, j) => (j === k ? { ...x, minutes: Math.max(1, v) } : x)) })} />
                      <span className="muted small">min</span>
                    </span>
                  </div>
                </SwipeRow>
              </li>
            );
          })}
        </ol>
      )}
      {/* a new plan: saved with the round green tick bottom right; an own plan changed: saved by itself, a quiet line
          (Sascha 11.11.2026: "wenn nachträglich was bearbeitet wird, … brauchen keine Speicherbuttons mehr") */}
      {existing ? (
        <span className="muted small autosave-note" role="status">
          {!ok ? tr('A name and a drill – then it is saved.', 'Ein Name und eine Übung – dann wird gespeichert.') : tr('Changes are saved by themselves', 'Änderungen werden von selbst gespeichert')}
        </span>
      ) : (
        <FloatActions
          save={{
            label: tr('Save plan', 'Plan speichern'),
            disabled: !ok,
            onClick: () => {
              saveOwnPlan(p);
              props.nav.toTab('train');
            },
          }}
        />
      )}
      {/* the drills to add as rows to tick (TickRow) – the tick on the right, no "+"/"✓" signs */}
      <Eyebrow>{tr('Add drills', 'Übungen hinzufügen')}</Eyebrow>
      <input className="input" type="search" placeholder={tr('Search', 'Suchen')} aria-label={tr('Search drills', 'Übungen suchen')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chip-set">
        <button type="button" className={`chip${cat == null ? ' on' : ''}`} onClick={() => setCat(null)}>
          {tr('All', 'Alle')}
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={`chip${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>
            {t(c.name)}
          </button>
        ))}
      </div>
      {pool.length ? (
        <SettingsList label={tr('Drills to add', 'Übungen zum Hinzufügen')}>
          {pool.map((d) => (
            <TickRow key={d.id} label={t(d.name)} text={`${d.minutes} min · ${placeName(d.place)}`} on={p.items.some((i) => i.drill === d.id)} onChange={() => add(d)} />
          ))}
        </SettingsList>
      ) : (
        <p className="muted">{tr('No drills for this filter.', 'Keine Übungen für diesen Filter.')}</p>
      )}
      {/* the start at the end of the page, after everything to set – never floating (Sascha 17.10.2026 evening;
          Facelift 11.11.2026, tr5: the LAST element) */}
      <button
        type="button"
        className="btn-primary"
        disabled={!p.items.length || !p.name.trim()}
        onClick={() => {
          saveOwnPlan(p);
          props.nav.start(newSession(p.name, p.items, p.id));
        }}
      >
        {tr('Save & start', 'Speichern & starten')}
      </button>
      {out && (
        <div className="undo-toast" role="status">
          <span>
            {tr('Drill removed', 'Übung entfernt')}
            <span className="muted"> · {t(drillById(out.item.drill)?.name)}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              if (!p.items.some((x) => x.drill === out.item.drill)) {
                const items = [...p.items];
                items.splice(Math.min(out.at, items.length), 0, out.item);
                setP({ ...p, items });
              }
              setOut(null);
            }}
          >
            {tr('Undo', 'Rückgängig')}
          </button>
        </div>
      )}
    </main>
  );
}

// ---------- search ----------


function SearchView(props: { q: string; nav: Nav }) {
  const [q, setQ] = useState(props.q);
  const { cats, faults, drills, gear } = useMemo(() => search(q), [q]);
  return (
    <main className="screen training">
      <TopBar title={tr('Search', 'Suche')} onBack={props.nav.back} />
      <input className="input" type="search" autoFocus aria-label={tr('Search', 'Suchen')} value={q} onChange={(e) => setQ(e.target.value)} />
      {cats.length > 0 && (
        <div className="chip-set">
          {cats.map((c) => (
            <button key={c.id} type="button" className="chip tr-chip-go" onClick={() => props.nav.push({ name: 'cat', id: c.id })}>
              {t(c.name)} {TR_GLYPH.next()}
            </button>
          ))}
        </div>
      )}
      {faults.length > 0 && (
        <section className="tr-block">
          <Eyebrow>{tr('Faults', 'Fehler')}</Eyebrow>
          <ul className="list">
            {faults.map(({ c, f, index }, i) => (
              <li key={i}>
                <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'fault', cat: c.id, index })}>
                  <span className="tr-cat-icon small">{CAT_ICON[c.id]}</span>
                  <span className="grow">
                    <span className="title">{t(f.name)}</span>
                    <span className="muted small tr-two-lines">{t(f.fix)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="tr-block">
        <Eyebrow>{tr(`Drills (${drills.length})`, `Übungen (${drills.length})`)}</Eyebrow>
        <DrillList drills={drills} nav={props.nav} />
      </section>
      {gear.length > 0 && (
        <section className="tr-block">
          <Eyebrow>{tr('Gear', 'Zubehör')}</Eyebrow>
          <div className="tr-hscroll">
            {gear.map((g) => (
              <GearTile key={g.id} g={g} nav={props.nav} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

// ---------- shop ----------

function GearTile(props: { g: Gear; nav: Nav }) {
  return (
    <button type="button" className="tr-gear-tile" onClick={() => props.nav.push({ name: 'gear', id: props.g.id })}>
      <GearImage g={props.g} />
      <strong>{t(props.g.name)}</strong>
      <span className="muted small">{euroRange(props.g.price)}</span>
    </button>
  );
}

/** A product in the context of a drill: picture, what it helps with, price, into the cart. */
function GearRow(props: { g: Gear; nav: Nav }) {
  useTrainingTick();
  const inCart = loadCart().some((x) => x.gear === props.g.id);
  return (
    <div className="tr-gear-row">
      <button type="button" className="tr-gear-row-main" onClick={() => props.nav.push({ name: 'gear', id: props.g.id })}>
        <GearImage g={props.g} />
        <span className="grow">
          <strong>{t(props.g.name)}</strong>
          <span className="muted small tr-two-lines">{t(props.g.why)}</span>
          <span className="tr-price small">{euroRange(props.g.price)}</span>
        </span>
      </button>
      <CartChip id={props.g.id} inCart={inCart} />
    </div>
  );
}

function AddToCart(props: { g: Gear }) {
  useTrainingTick();
  const line = loadCart().find((x) => x.gear === props.g.id);
  if (!line)
    return (
      <button type="button" className="btn-primary" onClick={() => setCartQty(props.g.id, 1)}>
        {tr('Add to cart', 'In den Warenkorb')}
      </button>
    );
  return (
    <div className="tr-qty">
      <span className="good-text tr-in-cart">
        {TR_GLYPH.tick()} {tr('In the cart', 'Im Warenkorb')}
      </span>
      <div className="stepper compact">
        <button type="button" aria-label={tr('one less', 'eins weniger')} onClick={() => setCartQty(props.g.id, line.qty - 1)}>
          −
        </button>
        <span className="value">{line.qty}</span>
        <button type="button" aria-label={tr('one more', 'eins mehr')} onClick={() => setCartQty(props.g.id, line.qty + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

/** The cart on a product – the cart icon "In den Korb", once in it the tick "Im Korb" (Facelift 11.11.2026, tr9: no "+"/"✓" signs). */
function CartChip(props: { id: string; inCart: boolean }) {
  return (
    <button type="button" className={`chip tr-cart-chip${props.inCart ? ' on' : ''}`} aria-pressed={props.inCart} onClick={() => setCartQty(props.id, props.inCart ? 0 : 1)}>
      {props.inCart ? TR_GLYPH.tick() : TR_GLYPH.cart()}
      {props.inCart ? tr('In the cart', 'Im Korb') : tr('Into the cart', 'In den Korb')}
    </button>
  );
}

function ShopTab(props: { nav: Nav }) {
  useTrainingTick();
  const [kind, setKind] = useState<GearKind | null>(null);
  const kinds = [...new Set(GEAR.map((g) => g.kind))];
  const [sort, setSort] = useState<'topic' | 'price'>('topic');
  const list = GEAR.filter((g) => !kind || g.kind === kind).sort((a, b) => (sort === 'price' ? priceOf(a) - priceOf(b) : 0));
  const n = cartCount();
  return (
    <>
      <div className="row">
        <h1 className="tab-title">Shop</h1>
        <button type="button" className="tr-cart-btn" onClick={() => props.nav.push({ name: 'cart' })} aria-label={tr(`Cart, ${n} items`, `Warenkorb, ${n} Artikel`)}>
          {ICONS.shop}
          {n > 0 && <span className="count-badge">{n}</span>}
        </button>
      </div>
      <div className="chip-set">
        <button type="button" className={`chip${kind == null ? ' on' : ''}`} onClick={() => setKind(null)}>
          {tr('All', 'Alle')}
        </button>
        {kinds.map((k) => (
          <button key={k} type="button" className={`chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>
            {kindName(k)}
          </button>
        ))}
      </div>
      <div className="chip-set" role="group" aria-label={tr('Sort', 'Sortieren')}>
        <button type="button" className={`chip${sort === 'topic' ? ' on' : ''}`} aria-pressed={sort === 'topic'} onClick={() => setSort('topic')}>
          {tr('By topic', 'Nach Thema')}
        </button>
        <button type="button" className={`chip${sort === 'price' ? ' on' : ''}`} aria-pressed={sort === 'price'} onClick={() => setSort('price')}>
          {tr('Price', 'Preis')} {TR_GLYPH.up()}
        </button>
      </div>
      <div className="tr-shop-grid">
        {list.map((g) => {
          const inCart = loadCart().some((x) => x.gear === g.id);
          return (
            <div key={g.id} className="tr-product">
              <button type="button" className="tr-product-main" onClick={() => props.nav.push({ name: 'gear', id: g.id })}>
                <GearImage g={g} />
                <strong>{t(g.name)}</strong>
                <span className="muted small tr-two-lines">{t(g.why)}</span>
                <span className="tr-price">{euroRange(g.price)}</span>
              </button>
              <CartChip id={g.id} inCart={inCart} />
            </div>
          );
        })}
      </div>
    </>
  );
}

function GearView(props: { id: string; nav: Nav }) {
  const g = gearById(props.id);
  if (!g) return null;
  const drills = DRILLS.filter((d) => d.needs?.includes(g.id));
  return (
    <main className="screen training">
      <TopBar title={t(g.name)} onBack={props.nav.back} />
      <GearImage g={g} size="large" />
      <div className="row">
        <span className="muted">{typeof g.brand === 'string' ? g.brand : t(g.brand)}</span>
        <strong className="tr-price">{euroRange(g.price)}</strong>
      </div>
      <Eyebrow>{tr('What it is', 'Was es ist')}</Eyebrow>
      <section className="card tr-section">
        <p>{t(g.what)}</p>
      </section>
      <Eyebrow>{tr('What it helps with', 'Wobei es hilft')}</Eyebrow>
      <section className="card tr-section">
        <p>{t(g.why)}</p>
        {g.diy && (
          <p className="muted">
            <strong>{tr('Do it yourself', 'Selbst gemacht')}:</strong> {t(g.diy)}
          </p>
        )}
      </section>
      <AddToCart g={g} />
      <ReviewBar itemKey={gearKey(g.id)} />
      {g.url && (
        <a className="btn-secondary" href={g.affiliateUrl || g.url} target="_blank" rel="noreferrer">
          {tr('Manufacturer’s page', 'Seite des Herstellers')} {TR_GLYPH.external()}
        </a>
      )}
      <span className="muted small">{tr('Approximate price; it varies by shop. Picture: manufacturer.', 'Ungefährer Preis; er schwankt je nach Shop. Bild: Hersteller.')}</span>
      {drills.length > 0 && (
        <>
          <Eyebrow>{tr('Drills with it', 'Übungen damit')}</Eyebrow>
          <DrillList drills={drills} nav={props.nav} />
        </>
      )}
      <div className="chip-set">
        {g.cats
          .map(catById)
          .filter((c): c is Category => !!c)
          .map((c) => (
            <button key={c.id} type="button" className="chip tr-chip-go" onClick={() => props.nav.push({ name: 'cat', id: c.id })}>
              {t(c.name)} {TR_GLYPH.next()}
            </button>
          ))}
      </div>
    </main>
  );
}

function CartView(props: { nav: Nav }) {
  useTrainingTick();
  const lines = loadCart().filter((l) => gearById(l.gear));
  const total = lines.reduce((s, l) => s + priceOf(gearById(l.gear)!) * l.qty, 0);
  const orders = loadOrders();
  return (
    <main className="screen training">
      <TopBar title={tr('Cart', 'Warenkorb')} onBack={props.nav.back} />
      {!lines.length ? (
        <p className="muted">{tr('Your cart is empty.', 'Dein Warenkorb ist leer.')}</p>
      ) : (
        <>
          <ul className="list">
            {lines.map((l) => {
              const g = gearById(l.gear)!;
              return (
                <li key={l.gear} className="list-item tr-cart-line">
                  <GearImage g={g} />
                  <span className="grow">
                    <span className="title">{t(g.name)}</span>
                    <span className="muted small">{euro(priceOf(g))}</span>
                  </span>
                  <div className="stepper compact">
                    <button type="button" aria-label={tr('one less', 'eins weniger')} onClick={() => setCartQty(g.id, l.qty - 1)}>
                      −
                    </button>
                    <span className="value">{l.qty}</span>
                    <button type="button" aria-label={tr('one more', 'eins mehr')} onClick={() => setCartQty(g.id, l.qty + 1)}>
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="row tr-total">
            <span>{tr('Total (approx.)', 'Summe (ca.)')}</span>
            <strong>{euro(total)}</strong>
          </div>
          <button type="button" className="btn-primary" onClick={() => props.nav.push({ name: 'checkout' })}>
            {tr('To checkout', 'Zur Kasse')}
          </button>
        </>
      )}
      {orders.length > 0 && (
        <Collapsible title={<span className="muted">{tr(`Earlier orders (${orders.length})`, `Frühere Bestellungen (${orders.length})`)}</span>}>
          <ul className="tr-points small">
            {orders.map((o) => (
              <li key={o.id}>
                {new Date(o.at).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined)} · {o.lines.map((l) => `${l.qty}× ${t(gearById(l.gear)?.name ?? l.gear)}`).join(', ')} · {euro(o.total)}
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
    </main>
  );
}

function Checkout(props: { nav: Nav; onOrdered: (o: Order) => void }) {
  const lines = loadCart().filter((l) => gearById(l.gear));
  const total = lines.reduce((s, l) => s + priceOf(gearById(l.gear)!) * l.qty, 0);
  const shipping = total >= 50 || !lines.length ? 0 : 4.95;
  const profile = loadProfile();
  const [name, setName] = useState(fullName(profile));
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [pay, setPay] = useState<'paypal' | 'card' | 'invoice'>('paypal');
  return (
    <main className="screen training">
      <TopBar title={tr('Checkout', 'Kasse')} onBack={props.nav.back} />
      <p className="tr-review small">
        {tr('Prototype: nothing is ordered and no data is sent. In the app you will order through partner shops.', 'Prototyp: Es wird nichts bestellt und keine Daten werden gesendet. In der App bestellst du später über Partner-Shops.')}
      </p>
      <Eyebrow>{tr('Your order', 'Deine Bestellung')}</Eyebrow>
      <section className="card tr-section">
        <ul className="tr-points">
          {lines.map((l) => (
            <li key={l.gear}>
              {l.qty}× {t(gearById(l.gear)!.name)} – {euro(priceOf(gearById(l.gear)!) * l.qty)}
            </li>
          ))}
        </ul>
        <div className="row">
          <span>{tr('Shipping', 'Versand')}</span>
          <span>{shipping ? euro(shipping) : tr('free', 'kostenlos')}</span>
        </div>
        <div className="row tr-total">
          <span>{tr('Total', 'Gesamt')}</span>
          <strong>{euro(total + shipping)}</strong>
        </div>
      </section>
      <Eyebrow>{tr('Delivery address', 'Lieferadresse')}</Eyebrow>
      <section className="card tr-section">
        <div className="field">
          <label htmlFor="co-name">Name</label>
          <input id="co-name" className="input" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="co-street">{tr('Street and number', 'Straße und Hausnummer')}</label>
          <input id="co-street" className="input" autoComplete="off" value={street} onChange={(e) => setStreet(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="co-city">{tr('Postcode and city', 'PLZ und Ort')}</label>
          <input id="co-city" className="input" autoComplete="off" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
      </section>
      <Eyebrow>{tr('Payment', 'Zahlung')}</Eyebrow>
      <section className="card tr-section">
        <div className="format-list">
          {(
            [
              ['paypal', 'PayPal'],
              ['card', tr('Credit card', 'Kreditkarte')],
              ['invoice', tr('Invoice', 'Rechnung')],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className="format-option" aria-pressed={pay === k} onClick={() => setPay(k)}>
              <strong>{label}</strong>
            </button>
          ))}
        </div>
      </section>
      <button type="button" className="btn-primary" disabled={!lines.length} onClick={() => props.onOrdered(placeOrder(Math.round((total + shipping) * 100) / 100))}>
        {tr('Order now (simulated)', 'Jetzt bestellen (simuliert)')}
      </button>
    </main>
  );
}

function Ordered(props: { order: Order; nav: Nav }) {
  return (
    <main className="screen training">
      <TopBar title={tr('Thank you!', 'Danke!')} onBack={() => props.nav.toTab('shop')} />
      <section className="card tr-section tr-ordered">
        <span className="tr-big-check" aria-hidden="true">
          {TR_GLYPH.tick()}
        </span>
        <strong className="tr-ordered-title">{tr('Order received – in the prototype only', 'Bestellung aufgenommen – nur im Prototyp')}</strong>
        <p className="muted">
          {tr('Nothing was sent or charged. In the real app the order goes to the partner shop at this point.', 'Es wurde nichts gesendet oder abgebucht. In der echten App geht die Bestellung an dieser Stelle an den Partner-Shop.')}
        </p>
        <ul className="tr-points">
          {props.order.lines.map((l) => (
            <li key={l.gear}>
              {l.qty}× {t(gearById(l.gear)?.name ?? l.gear)}
            </li>
          ))}
        </ul>
        <strong>{euro(props.order.total)}</strong>
      </section>
      <button type="button" className="btn-primary" onClick={() => props.nav.toTab('shop')}>
        {tr('Back to the shop', 'Zurück zum Shop')}
      </button>
    </main>
  );
}

// ---------- session result ----------

/** How many drills of a session reached the goal of the player's band (of those with a goal and a result). */
function sessionGoals(s: Session, band: Band): { reached: number; of: number } {
  let reached = 0;
  let of = 0;
  for (const i of s.items) {
    const d = drillById(i.drill);
    const ok = d && i.done ? meets(d.scoring, d.targets, i.value ?? null, band) : null;
    if (ok == null) continue;
    of++;
    if (ok) reached++;
  }
  return { reached, of };
}

function SessionResult(props: { id: string; nav: Nav }) {
  useTrainingTick();
  const s = loadSessions().find((x) => x.id === props.id);
  if (!s) return null;
  const band = bandOf(playerHcp());
  const goals = sessionGoals(s, band);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const minutes = s.items.filter((i) => i.done).reduce((n, i) => n + i.minutes, 0);
  return (
    <main className="screen training">
      <TopBar title={s.name} onBack={props.nav.back} />
      {/* the line under the TopBar, as on a pool or a round: the day · the minutes trained */}
      <span className="muted small">
        {new Date(s.createdAt).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        {minutes ? ` · ${minutes} min` : ''}
        {!s.finishedAt ? ` · ${tr('paused', 'pausiert')}` : ''}
      </span>
      <div className="tile-row">
        <div className="tile">
          <span className="tile-num">{s.items.filter((i) => i.done).length}/{s.items.length}</span>
          <span className="muted small">{tr('drills done', 'Übungen erledigt')}</span>
        </div>
        <div className="tile">
          <span className="tile-num">{s.items.filter((i) => i.value != null).length}</span>
          <span className="muted small">{tr('results', 'Ergebnisse')}</span>
        </div>
        {goals.of > 0 && (
          <div className="tile">
            <span className={`tile-num${goals.reached ? ' good-text' : ''}`}>
              {goals.reached}/{goals.of}
            </span>
            <span className="muted small">{tr('goals reached', 'Ziele erreicht')}</span>
          </div>
        )}
      </div>
      <ul className="list">
        {s.items.map((i, k) => {
          const d = drillById(i.drill);
          if (!d) return null;
          const ok = meets(d.scoring, d.targets, i.value ?? null, band);
          return (
            <li key={k}>
              <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'drill', id: d.id })}>
                <SketchThumb sketch={d.sketch} fallback={CAT_ICON[d.cat]} />
                <span className="grow">
                  <span className="title">{t(d.name)}</span>
                  <span className="muted small">{!i.done ? tr('not done', 'nicht gemacht') : d.scoring && d.scoring.kind !== 'none' ? unitText(d.scoring) : tr('done', 'erledigt')}</span>
                </span>
                {i.done && <strong className="tr-hist-value">{i.value != null && d.scoring && d.scoring.kind !== 'none' ? mainValue(d.scoring, i.value) : <span className="tr-done-mark" role="img" aria-label={tr('done', 'erledigt')}>{TR_GLYPH.tick()}</span>}</strong>}
                <span className={`tr-goal-dot${ok ? ' ok' : ''}`} aria-label={ok ? tr('goal reached', 'Ziel erreicht') : undefined}>
                  {ok ? TR_GLYPH.tick() : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {/* the session's actions in one bar as on the scorecard of Rounds – Löschen red, last (Sascha 03.11.2026) */}
      {s.finishedAt && (
        <div className="sc-actions" role="group" aria-label={tr('This session', 'Diese Einheit')}>
          <button type="button" className="sc-action" onClick={() => props.nav.start(newSession(s.name, s.items.map((i) => ({ drill: i.drill, minutes: i.minutes })), s.planId))}>
            {ACT_ICONS.repeat}
            <span>{tr('Repeat', 'Wiederholen')}</span>
          </button>
          <button
            type="button"
            className="sc-action danger"
            aria-label={tr('Delete session', 'Einheit löschen')}
            onClick={() => {
              deleteSession(s.id);
              props.nav.toTab('log');
            }}
          >
            {ACT_ICONS.delete}
            <span>{tr('Delete', 'Löschen')}</span>
          </button>
        </div>
      )}
    </main>
  );
}
