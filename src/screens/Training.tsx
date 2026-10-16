import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Round } from '../types';
import { dec, getLang, tr } from '../lib/i18n';
import { loadProfile, fullName } from '../lib/profile';
import { MENU_ICONS, MenuBar } from '../components/TabBar';
import { TopTools } from '../components/TopTools';
import { TopBar } from '../components/ui';
import { Bin } from '../components/Bin';
import { CATEGORIES, DRILLS, catById, drillById, drillsOf } from '../training/content';
import { GEAR, gearById, gearForDrill } from '../training/content/gear';
import { PLANS } from '../training/content/plans';
import { adviceFromRounds } from '../training/recommend';
import { SketchView } from '../training/Sketch';
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
  removeOwnPlan,
  restoreSession,
  saveOwnPlan,
  saveSession,
  setCartQty,
  toggleFav,
  trainingId,
  type Order,
  type OwnPlan,
  type Session,
} from '../training/store';
import type { Category, CategoryId, Drill, Gear, GearKind, L, Level, Place, Plan, Section, Video } from '../training/types';
import {
  bandName,
  bandOf,
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
  Sparkline,
  t,
  VideoCard,
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
  | { name: 'fault'; cat: CategoryId; index: number };

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

export function TrainingApp(props: { rounds: Round[]; onModules: () => void; profile: ReactNode; profileDot?: boolean; tab?: TrainingTab; onTabChange?: (t: TrainingTab) => void }) {
  useTrainingTick();
  const running = loadSessions().filter((s) => !s.finishedAt);
  // a session in play opens straight on its drill (like a round in play)
  const [stack, setStack] = useState<View[]>(() => [{ name: 'tab', tab: props.tab ?? 'learn' }, ...(running[0] && !props.tab ? [{ name: 'session', id: running[0].id } as View] : [])]);
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
  const nav: Nav = { push, back, toTab, start };

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
}

// ---------- tabs ----------

function Tabs(props: { tab: TrainingTab; nav: Nav; rounds: Round[]; profile: ReactNode; profileDot?: boolean; onModules: () => void }) {
  return (
    <main className="screen with-tabs training">
      {props.tab !== 'profile' && (
        <div className="topbar">
          <button type="button" className="module-switch" onClick={props.onModules} aria-label={tr('Switch module', 'Modul wechseln')}>
            <span className="brand">
              GOLF<span>OS</span>
            </span>
            <span className="module-tag">Training</span>
            <span aria-hidden="true">⇄</span>
          </button>
          <TopTools />
        </div>
      )}
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
      <h2>{tr('What is your problem?', 'Was ist dein Problem?')}</h2>
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
      {drills[0]?.sketch && (
        <>
          <span className="eyebrow">{tr('The first drill for it', 'Die erste Übung dafür')}: {t(drills[0].name)}</span>
          <SketchView sketch={drills[0].sketch} label={t(drills[0].name)} />
        </>
      )}
      <h2>{tr('Drills for it', 'Übungen dafür')}</h2>
      <DrillList drills={drills} nav={props.nav} />
      {drills.length > 0 && (
        <button type="button" className="btn-primary" onClick={() => props.nav.start(newSession(t(f.name), drills.map((d) => ({ drill: d.id, minutes: Math.min(12, d.minutes) }))))}>
          {tr('Practise these drills now', 'Diese Übungen jetzt üben')}
        </button>
      )}
      <button type="button" className="btn-ghost" onClick={() => props.nav.push({ name: 'cat', id: c.id })}>
        {tr('More on', 'Mehr zu')} {t(c.name)} ›
      </button>
    </main>
  );
}

function LearnTab(props: { nav: Nav; rounds: Round[] }) {
  const favs = loadFavs().map(drillById).filter((d): d is Drill => !!d);
  const advice = useMemo(() => adviceFromRounds(props.rounds), [props.rounds]);
  return (
    <>
      <h1 className="tab-title">{tr('Library', 'Wissen')}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {tr(
          `Everything for your practice: ${CATEGORIES.length} topics, ${DRILLS.length} drills with sketches, explainer videos and practice gear.`,
          `Alles fürs Training: ${CATEGORIES.length} Themen, ${DRILLS.length} Übungen mit Skizzen, Erklärvideos und Trainingszubehör.`,
        )}
      </p>
      <SearchField nav={props.nav} />
      <DrillOfTheDay nav={props.nav} prefer={advice.flatMap((a) => a.drills)} />
      {advice.length > 0 && (
        <section className="tr-advice">
          <h2>{tr('From your rounds', 'Aus deinen Runden')}</h2>
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
          <h2>{tr('Your favourites', 'Deine Favoriten')}</h2>
          <div className="tr-hscroll">
            {favs.map((d) => (
              <button key={d.id} type="button" className="tr-mini" onClick={() => props.nav.push({ name: 'drill', id: d.id })}>
                <span className="tr-cat-icon small">{CAT_ICON[d.cat]}</span>
                <strong>{t(d.name)}</strong>
                <span className="muted small">
                  {d.minutes} min · {placeName(d.place)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="tr-block">
        <h2>{tr('Topics', 'Themen')}</h2>
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
    </>
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
        <button key={s.id} type="button" className="list-item live" onClick={() => props.nav.push({ name: 'session', id: s.id })}>
          <span className="grow">
            <span className="title">{s.name}</span>
            <span className="muted small">
              {tr(`Paused · drill ${s.current + 1} of ${s.items.length}`, `Pausiert · Übung ${s.current + 1} von ${s.items.length}`)}
            </span>
          </span>
          <span className="small module-live">{tr('Continue ›', 'Weiter ›')}</span>
        </button>
      ))}
      {fromRounds.length > 0 && (
        <section className="card tr-plan-card">
          <span className="eyebrow">{tr('Your plan from your rounds', 'Dein Plan aus deinen Runden')}</span>
          <strong>{advice.map((a) => t(catById(a.cat)?.name)).join(' · ')}</strong>
          <span className="muted small">{advice.map((a) => a.why).join(' · ')}</span>
          <span className="muted small">
            {fromRounds.length} {tr('drills', 'Übungen')} · {fromRounds.reduce((s, i) => s + i.minutes, 0)} min
          </span>
          <button type="button" className="btn-primary" onClick={() => props.nav.start(newSession(tr('Plan from my rounds', 'Plan aus meinen Runden'), fromRounds, 'rounds'))}>
            {tr('Start now', 'Jetzt starten')}
          </button>
        </section>
      )}
      {favs.length >= 2 && (
        <button type="button" className="btn-secondary" onClick={() => props.nav.start(newSession(tr('My favourites', 'Meine Favoriten'), favs.slice(0, 8).map((id) => ({ drill: id, minutes: drillById(id)!.minutes }))))}>
          ★ {tr(`Practise my ${Math.min(8, favs.length)} favourites`, `Meine ${Math.min(8, favs.length)} Favoriten üben`)}
        </button>
      )}
      <section className="tr-block">
        <div className="row">
          <h2>{tr('Ready-made plans', 'Fertige Pläne')}</h2>
        </div>
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
          <h2>{tr('Goals and weekly plans', 'Ziel- und Wochenpläne')}</h2>
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
      <section className="tr-block">
        <h2>{tr('My plans', 'Meine Pläne')}</h2>
        {own.length > 0 && (
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
        )}
        <button type="button" className="btn-secondary" onClick={() => props.nav.push({ name: 'builder', plan: { id: trainingId(), name: tr('My session', 'Meine Einheit'), items: [], createdAt: new Date().toISOString() } })}>
          {tr('+ Build your own session', '+ Eigene Einheit zusammenstellen')}
        </button>
      </section>
    </>
  );
}

function LogTab(props: { nav: Nav }) {
  const log = loadLog();
  const sessions = loadSessions().filter((s) => s.finishedAt);
  const trash = loadSessionTrash();
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const band = bandOf(playerHcp());
  const month = new Date().toISOString().slice(0, 7);
  const drillsMonth = log.filter((e) => e.at.startsWith(month)).length;
  const drillIds = [...new Set(log.map((e) => e.drill))].filter((id) => drillById(id));
  return (
    <>
      <h1 className="tab-title">{tr('Progress', 'Verlauf')}</h1>
      <div className="tr-stats">
        <div>
          <strong>{sessions.length}</strong>
          <span className="muted small">{tr('sessions', 'Einheiten')}</span>
        </div>
        <div>
          <strong>{drillsMonth}</strong>
          <span className="muted small">{tr('drills this month', 'Übungen diesen Monat')}</span>
        </div>
        <div>
          <strong>{log.length}</strong>
          <span className="muted small">{tr('results', 'Ergebnisse')}</span>
        </div>
      </div>
      {!log.length && !sessions.length && (
        <p className="muted">
          {tr('Your results appear here: start a plan or open a drill and enter your score.', 'Hier erscheinen deine Ergebnisse: Starte einen Plan oder öffne eine Übung und trag dein Ergebnis ein.')}
        </p>
      )}
      {drillIds.length > 0 && (
        <section className="tr-block">
          <h2>{tr('Personal bests', 'Bestwerte')}</h2>
          <ul className="list">
            {drillIds.map((id) => {
              const d = drillById(id)!;
              const vals = log.filter((e) => e.drill === id && e.value != null).map((e) => e.value!) ;
              const best = bestOf(d.scoring, vals);
              const ok = meets(d.scoring, d.targets, best, band);
              return (
                <li key={id}>
                  <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'drill', id })}>
                    <span className="tr-cat-icon small">{CAT_ICON[d.cat]}</span>
                    <span className="grow">
                      <span className="title">{t(d.name)}</span>
                      <span className="muted small">
                        {tr('best', 'Bestwert')}: {scoreText(d.scoring, best)}
                        {d.targets ? ` · ${tr('goal', 'Ziel')} ${bandName(band)}: ${dec(d.targets[band])}` : ''}
                      </span>
                    </span>
                    {ok != null && <span className={`badge ${ok ? 'ok' : 'warn'}`}>{ok ? '✓' : '…'}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {sessions.length > 0 && (
        <section className="tr-block">
          <h2>{tr('Sessions', 'Einheiten')}</h2>
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.id}>
                <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'done', id: s.id })}>
                  <span className="round-date">
                    <strong>{new Date(s.createdAt).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}</strong>
                    <span className="muted small">{new Date(s.createdAt).getFullYear()}</span>
                  </span>
                  <span className="grow">
                    <span className="title">{s.name}</span>
                    <span className="muted small">
                      {s.items.filter((i) => i.done).length}/{s.items.length} {tr('drills', 'Übungen')}
                    </span>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Bin
        title={tr('Deleted sessions', 'Gelöschte Einheiten')}
        items={trash.map((x) => ({ id: x.session.id, date: x.session.createdAt, title: x.session.name, meta: `${x.session.items.length} ${tr('drills', 'Übungen')}`, deletedAt: x.deletedAt }))}
        onRestore={(id) => restoreSession(id)}
        onPurge={(id) => purgeSession(id)}
      />
    </>
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
  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'drills', label: tr('Drills', 'Übungen') },
    { id: 'basics', label: tr('Basics', 'Grundlagen') },
    ...(c.faults?.length ? [{ id: 'faults' as const, label: tr('Faults', 'Fehler') }] : []),
    ...(c.videos?.length ? [{ id: 'videos' as const, label: 'Videos' }] : []),
  ];
  return (
    <main className="screen training">
      <TopBar title={t(c.name)} onBack={props.nav.back} />
      <div className="tr-hero">
        <span className="tr-cat-icon large">{CAT_ICON[c.id]}</span>
        <p>{t(c.short)}</p>
      </div>
      <div className="segmented tr-tabs" role="tablist" aria-label={t(c.name)}>
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} aria-pressed={tab === x.id} onClick={() => setTab(x.id)}>
            {x.label}
          </button>
        ))}
      </div>

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
          <p className="tr-intro-text">{t(c.intro)}</p>
          {c.facts?.length ? (
            <section className="card tr-facts">
              <span className="eyebrow">{tr('Good to know', 'Gut zu wissen')}</span>
              <ul>
                {c.facts.map((f, i) => (
                  <li key={i}>{t(f)}</li>
                ))}
              </ul>
            </section>
          ) : null}
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
            </Collapsible>
          ))}
          {c.see?.length ? (
            <div className="chip-set">
              <span className="muted small">{tr('Related topics', 'Passende Themen')}:</span>
              {c.see
                .map(catById)
                .filter((x): x is Category => !!x)
                .map((x) => (
                  <button key={x.id} type="button" className="chip" onClick={() => props.nav.push({ name: 'cat', id: x.id })}>
                    {t(x.name)} ›
                  </button>
                ))}
            </div>
          ) : null}
          <Sources list={c.sources} />
        </>
      )}

      {tab === 'faults' && (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {tr('Tap a fault: what you see, why it happens, what helps – and the drills for it.', 'Tippe auf einen Fehler: was du siehst, warum er passiert, was hilft – und die Übungen dafür.')}
          </p>
          <ul className="list">
            {(c.faults ?? []).map((f, i) => (
              <li key={i}>
                <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'fault', cat: c.id, index: i })}>
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
          {/* videos in the player's language first */}
          {[...c.videos].sort((a, b) => Number(b.lang === getLang()) - Number(a.lang === getLang())).map((v) => (
            <VideoCard key={v.id} v={v} />
          ))}
        </>
      ) : null}
    </main>
  );
}

function DrillList(props: { drills: Drill[]; nav: Nav; onAdd?: (d: Drill) => void; added?: string[] }) {
  if (!props.drills.length) return <p className="muted">{tr('No drills for this filter.', 'Keine Übungen für diesen Filter.')}</p>;
  const favs = loadFavs();
  return (
    <ul className="list">
      {props.drills.map((d) => (
        <li key={d.id} className="tr-drill-row">
          <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'drill', id: d.id })}>
            <span className="tr-cat-icon small">{CAT_ICON[d.cat]}</span>
            <span className="grow">
              <span className="title">
                {favs.includes(d.id) ? '★ ' : ''}
                {t(d.name)}
              </span>
              <span className="muted small tr-two-lines">{t(d.goal)}</span>
              <span className="muted small">
                {levelName(d.level)} · {d.minutes} min · {placeName(d.place)}
              </span>
            </span>
            {!props.onAdd && <span aria-hidden="true">›</span>}
          </button>
          {props.onAdd && (
            <button type="button" className={`icon-btn tr-add${props.added?.includes(d.id) ? ' on' : ''}`} aria-label={tr(`Add ${t(d.name)}`, `${t(d.name)} hinzufügen`)} onClick={() => props.onAdd!(d)}>
              {props.added?.includes(d.id) ? '✓' : '+'}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Sources(props: { list?: { label: string; url: string }[] }) {
  if (!props.list?.length) return null;
  return (
    <Collapsible title={<span className="muted">{tr('Sources', 'Quellen')}</span>} className="tr-sources">
      <ul className="tr-points small">
        {props.list.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.label} ↗
            </a>
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}

// ---------- drill ----------

function DrillView(props: { id: string; nav: Nav }) {
  useTrainingTick();
  const d = drillById(props.id);
  const [value, setValue] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  if (!d) return null;
  const fav = loadFavs().includes(d.id);
  const entries = logFor(d.id);
  const vals = entries.filter((e) => e.value != null).map((e) => e.value!);
  const best = bestOf(d.scoring, vals);
  const hcp = playerHcp();
  const band = bandOf(hcp);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const scored = d.scoring && d.scoring.kind !== 'none';
  // Sascha 16.10.2026: the gear belongs to the drill – shown here, not on the topic page
  const plainNeeds = (d.needs ?? []).filter((n): n is L => typeof n !== 'string');
  const gear = gearForDrill(d);
  return (
    <main className="screen training">
      <TopBar
        title={t(d.name)}
        onBack={props.nav.back}
        right={
          <button type="button" className={`icon-btn tr-fav${fav ? ' on' : ''}`} aria-pressed={fav} aria-label={fav ? tr('Remove from favourites', 'Aus Favoriten entfernen') : tr('Add to favourites', 'Zu Favoriten')} onClick={() => toggleFav(d.id)}>
            {fav ? '★' : '☆'}
          </button>
        }
      />
      <p className="tr-goal">{t(d.goal)}</p>
      <div className="chip-set facts">
        <span className="chip fact">{levelName(d.level)}</span>
        <span className="chip fact">{d.minutes} min</span>
        <span className="chip fact">{placeName(d.place)}</span>
        {d.balls ? <span className="chip fact">{tr(`${d.balls} balls`, `${d.balls} Bälle`)}</span> : null}
      </div>
      {d.review && <p className="tr-review small">{tr('Content still to be checked by our golf pro.', 'Inhalt wird noch von unserem Golfprofi geprüft.')}</p>}
      {d.sketch && <SketchView sketch={d.sketch} label={t(d.name)} />}
      {d.origin && (
        <p className="muted small">
          {tr('Known from', 'Bekannt durch')}: {t(d.origin)}
        </p>
      )}
      <section className="card tr-section">
        <h2>{tr('Set-up', 'Aufbau')}</h2>
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
      <section className="card tr-section">
        <h2>{tr('How it works', 'So geht’s')}</h2>
        <ol className="tr-steps">
          {d.steps.map((s, i) => (
            <li key={i}>{t(s)}</li>
          ))}
        </ol>
      </section>
      {d.tips?.length ? (
        <section className="card tr-section">
          <h2>{tr('Tips', 'Tipps')}</h2>
          <ul className="tr-points">
            {d.tips.map((s, i) => (
              <li key={i}>{t(s)}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {(d.easier || d.harder) && (
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
      )}
      {gear.length > 0 && (
        <section className="tr-block">
          <h2>{tr('Gear for this drill', 'Zubehör für diese Übung')}</h2>
          {gear.map((g) => (
            <GearRow key={g.id} g={g} nav={props.nav} />
          ))}
        </section>
      )}
      {d.targets && (
        <section className="card tr-section">
          <h2>{tr('Targets by handicap', 'Ziele nach Handicap')}</h2>
          <div className="tr-targets">
            {(['high', 'mid', 'low', 'tour'] as const)
              .filter((b) => d.targets![b] != null)
              .map((b) => (
                <div key={b} className={b === band ? 'mine' : ''}>
                  <strong>{d.scoring?.kind === 'made' ? `${d.targets![b]}/${d.scoring.of}` : dec(d.targets![b]!)}</strong>
                  <span className="small">{bandName(b)}</span>
                </div>
              ))}
          </div>
          <span className="muted small">
            {hcp == null ? tr('Enter your handicap in the profile to see your goal highlighted.', 'Trag dein Handicap im Profil ein, dann ist dein Ziel markiert.') : tr('Approximate values.', 'Richtwerte.')}
          </span>
        </section>
      )}
      <section className="card tr-section tr-log">
        <h2>{scored ? tr('Your result', 'Dein Ergebnis') : tr('Done it?', 'Erledigt?')}</h2>
        <ResultInput
          drill={d}
          value={value}
          onChange={(v) => {
            setValue(v);
            setSaved(false);
          }}
        />
        <button
          type="button"
          className="btn-primary"
          disabled={scored && value == null}
          onClick={() => {
            addLog({ drill: d.id, value: scored ? value : null });
            setSaved(true);
            setValue(null);
          }}
        >
          {saved ? tr('Saved ✓', 'Gespeichert ✓') : scored ? tr('Save result', 'Ergebnis speichern') : tr('Mark as done', 'Als erledigt speichern')}
        </button>
        {vals.length > 0 && (
          <>
            <span className="muted small">
              {tr('Best', 'Bestwert')}: {scoreText(d.scoring, best)} · {tr(`${entries.length}× logged`, `${entries.length}× eingetragen`)}
            </span>
            <Sparkline values={[...vals].reverse()} goal={d.targets?.[band]} />
          </>
        )}
        {entries.length > 0 && (
          <ul className="tr-entries">
            {entries.slice(0, 6).map((e) => (
              <li key={e.id}>
                <span className="muted small">{new Date(e.at).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                <span>{scoreText(d.scoring, e.value)}</span>
                <button type="button" className="btn-ghost small" aria-label={tr('Remove this entry', 'Eintrag entfernen')} onClick={() => removeLog(e.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="tr-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            const own = loadOwnPlans();
            // the newest own plan gets the drill; without one a new plan starts with it
            const base: OwnPlan = own[0] ?? { id: trainingId(), name: tr('My session', 'Meine Einheit'), items: [], createdAt: new Date().toISOString() };
            props.nav.push({ name: 'builder', plan: base.items.some((i) => i.drill === d.id) ? base : { ...base, items: [...base.items, { drill: d.id, minutes: d.minutes }] } });
          }}
        >
          {tr('+ Add to my own session', '+ Zu meiner eigenen Einheit')}
        </button>
      </div>
      {d.videos?.length ? (
        <>
          <h2>{tr('Video', 'Video')}</h2>
          {d.videos.map((v) => (
            <VideoCard key={v.id} v={v} />
          ))}
        </>
      ) : null}
      <button type="button" className="btn-ghost" onClick={() => props.nav.push({ name: 'cat', id: d.cat })}>
        {tr('More on', 'Mehr zu')} {t(catById(d.cat)?.name)} ›
      </button>
      <Sources list={d.sources} />
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
      {'about' in p && <p className="muted">{t(p.about)}</p>}
      {week ? (
        week.map((day, k) => (
          <section key={k} className="card tr-section">
            <div className="row">
              <h2>{t(day.day)}</h2>
              <span className="muted small">{planMinutes(day)} min</span>
            </div>
            <ol className="tr-plan-list">
              {planItems(day).map((i, n) => (
                <li key={n}>
                  <button type="button" className="tr-link" onClick={() => props.nav.push({ name: 'drill', id: i.drill })}>
                    {t(drillById(i.drill)!.name)}
                  </button>
                  <span className="muted small">{i.minutes} min</span>
                </li>
              ))}
            </ol>
            <button type="button" className="btn-secondary" onClick={() => props.nav.start(newSession(`${name} – ${t(day.day)}`, day.items, p.id))}>
              {tr('Start this day', 'Diesen Tag starten')}
            </button>
          </section>
        ))
      ) : (
        <>
          <section className="card tr-section">
            <div className="row">
              <h2>{tr('Drills', 'Übungen')}</h2>
              <span className="muted small">{planMinutes(p)} min</span>
            </div>
            <ol className="tr-plan-list">
              {items.map((i, n) => (
                <li key={n}>
                  <button type="button" className="tr-link" onClick={() => props.nav.push({ name: 'drill', id: i.drill })}>
                    {t(drillById(i.drill)!.name)}
                  </button>
                  <span className="muted small">
                    {i.minutes} min · {placeName(drillById(i.drill)!.place)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <GearForPlan items={items} nav={props.nav} />
          <button type="button" className="btn-primary" disabled={!items.length} onClick={() => props.nav.start(newSession(name, items, p.id))}>
            {tr('Start session', 'Einheit starten')}
          </button>
          {isOwn && (
            <div className="tr-actions">
              <button type="button" className="btn-secondary" onClick={() => props.nav.push({ name: 'builder', plan: p as OwnPlan })}>
                {tr('Edit plan', 'Plan bearbeiten')}
              </button>
              <button
                type="button"
                className="btn-secondary btn-danger"
                onClick={() => {
                  removeOwnPlan(p.id);
                  props.nav.back();
                }}
              >
                {tr('Delete plan', 'Plan löschen')}
              </button>
            </div>
          )}
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
      <h2>{tr('Helpful for this plan', 'Hilfreich für diesen Plan')}</h2>
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
  return (
    <main className="screen training">
      <TopBar title={tr('Own session', 'Eigene Einheit')} onBack={props.nav.back} />
      <div className="field">
        <label htmlFor="tr-plan-name">{tr('Name', 'Name')}</label>
        <input id="tr-plan-name" className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      </div>
      <section className="card tr-section">
        <div className="row">
          <h2>{tr('Your drills', 'Deine Übungen')}</h2>
          <span className="muted small">{planMinutes(p)} min</span>
        </div>
        {!p.items.length && <span className="muted small">{tr('Add drills from the list below.', 'Füge Übungen aus der Liste unten hinzu.')}</span>}
        <ol className="tr-plan-list">
          {p.items.map((i, k) => (
            <li key={i.drill}>
              <span className="grow">{t(drillById(i.drill)?.name)}</span>
              <span className="tr-min">
                <button type="button" className="chip" aria-label={tr('fewer minutes', 'weniger Minuten')} onClick={() => setP({ ...p, items: p.items.map((x, j) => (j === k ? { ...x, minutes: Math.max(1, x.minutes - 1) } : x)) })}>
                  −
                </button>
                <span>{i.minutes}′</span>
                <button type="button" className="chip" aria-label={tr('more minutes', 'mehr Minuten')} onClick={() => setP({ ...p, items: p.items.map((x, j) => (j === k ? { ...x, minutes: x.minutes + 1 } : x)) })}>
                  +
                </button>
              </span>
              <button type="button" className="chip" aria-label={tr('up', 'nach oben')} disabled={k === 0} onClick={() => move(k, -1)}>
                ↑
              </button>
              <button type="button" className="chip" aria-label={tr('remove', 'entfernen')} onClick={() => setP({ ...p, items: p.items.filter((_, j) => j !== k) })}>
                ✕
              </button>
            </li>
          ))}
        </ol>
        <div className="tr-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={!p.items.length}
            onClick={() => {
              saveOwnPlan(p);
              props.nav.start(newSession(p.name, p.items, p.id));
            }}
          >
            {tr('Save & start', 'Speichern & starten')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!p.items.length}
            onClick={() => {
              saveOwnPlan(p);
              props.nav.toTab('train');
            }}
          >
            {tr('Save plan', 'Plan speichern')}
          </button>
        </div>
      </section>
      <h2>{tr('Add drills', 'Übungen hinzufügen')}</h2>
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
      <DrillList drills={pool} nav={props.nav} onAdd={add} added={p.items.map((i) => i.drill)} />
    </main>
  );
}

// ---------- search ----------

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function SearchView(props: { q: string; nav: Nav }) {
  const [q, setQ] = useState(props.q);
  const words = norm(q).split(/\s+/).filter(Boolean);
  const hit = (...texts: (string | undefined)[]) => {
    const all = norm(texts.filter(Boolean).join(' '));
    return words.length > 0 && words.every((w) => all.includes(w));
  };
  const both = (x?: { en: string; de: string }) => (x ? `${x.en} ${x.de}` : '');
  const drills = DRILLS.filter((d) => hit(both(d.name), both(d.goal), both(d.setup), ...d.steps.map(both), both(d.origin)));
  const cats = CATEGORIES.filter((c) => hit(both(c.name), both(c.short), both(c.intro)));
  const faults = CATEGORIES.flatMap((c) => (c.faults ?? []).map((f, index) => ({ c, f, index }))).filter(({ f }) => hit(both(f.name), both(f.looks), both(f.cause)));
  const gear = GEAR.filter((g) => hit(g.name, typeof g.brand === 'string' ? g.brand : both(g.brand), both(g.what), both(g.why)));
  return (
    <main className="screen training">
      <TopBar title={tr('Search', 'Suche')} onBack={props.nav.back} />
      <input className="input" type="search" autoFocus aria-label={tr('Search', 'Suchen')} value={q} onChange={(e) => setQ(e.target.value)} />
      {cats.length > 0 && (
        <div className="chip-set">
          {cats.map((c) => (
            <button key={c.id} type="button" className="chip" onClick={() => props.nav.push({ name: 'cat', id: c.id })}>
              {t(c.name)} ›
            </button>
          ))}
        </div>
      )}
      {faults.length > 0 && (
        <section className="tr-block">
          <h2>{tr('Faults', 'Fehler')}</h2>
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
        <h2>{tr(`Drills (${drills.length})`, `Übungen (${drills.length})`)}</h2>
        <DrillList drills={drills} nav={props.nav} />
      </section>
      {gear.length > 0 && (
        <section className="tr-block">
          <h2>{tr('Gear', 'Zubehör')}</h2>
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
      <strong>{props.g.name}</strong>
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
          <strong>{props.g.name}</strong>
          <span className="muted small tr-two-lines">{t(props.g.why)}</span>
          <span className="tr-price small">{euroRange(props.g.price)}</span>
        </span>
      </button>
      <button type="button" className={`chip${inCart ? ' on' : ''}`} onClick={() => setCartQty(props.g.id, inCart ? 0 : 1)}>
        {inCart ? `✓ ${tr('in cart', 'im Korb')}` : `+ ${tr('cart', 'Warenkorb')}`}
      </button>
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
      <span className="good-text">✓ {tr('In the cart', 'Im Warenkorb')}</span>
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
      <p className="muted" style={{ margin: 0 }}>
        {tr('Practice gear that fits the drills – put it in the cart and order later.', 'Trainingszubehör passend zu den Übungen – in den Warenkorb legen und später bestellen.')}
      </p>
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
          {tr('Price ↑', 'Preis ↑')}
        </button>
      </div>
      <div className="tr-shop-grid">
        {list.map((g) => {
          const inCart = loadCart().some((x) => x.gear === g.id);
          return (
            <div key={g.id} className="tr-product">
              <button type="button" className="tr-product-main" onClick={() => props.nav.push({ name: 'gear', id: g.id })}>
                <GearImage g={g} />
                <strong>{g.name}</strong>
                <span className="muted small tr-two-lines">{t(g.why)}</span>
                <span className="tr-price">{euroRange(g.price)}</span>
              </button>
              <button type="button" className={`chip${inCart ? ' on' : ''}`} onClick={() => setCartQty(g.id, inCart ? 0 : 1)}>
                {inCart ? `✓ ${tr('in cart', 'im Korb')}` : `+ ${tr('cart', 'Warenkorb')}`}
              </button>
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
      <TopBar title={g.name} onBack={props.nav.back} />
      <GearImage g={g} size="large" />
      <div className="row">
        <span className="muted">{typeof g.brand === 'string' ? g.brand : t(g.brand)}</span>
        <strong className="tr-price">{euroRange(g.price)}</strong>
      </div>
      <section className="card tr-section">
        <h2>{tr('What it is', 'Was es ist')}</h2>
        <p>{t(g.what)}</p>
        <h2>{tr('What it helps with', 'Wobei es hilft')}</h2>
        <p>{t(g.why)}</p>
        {g.diy && (
          <p className="muted">
            <strong>{tr('Do it yourself', 'Selbst gemacht')}:</strong> {t(g.diy)}
          </p>
        )}
      </section>
      <AddToCart g={g} />
      {g.url && (
        <a className="btn-secondary" href={g.affiliateUrl || g.url} target="_blank" rel="noreferrer">
          {tr('Manufacturer’s page', 'Seite des Herstellers')} ↗
        </a>
      )}
      <span className="muted small">{tr('Approximate price; it varies by shop. Picture: manufacturer.', 'Ungefährer Preis; er schwankt je nach Shop. Bild: Hersteller.')}</span>
      {drills.length > 0 && (
        <>
          <h2>{tr('Drills with it', 'Übungen damit')}</h2>
          <DrillList drills={drills} nav={props.nav} />
        </>
      )}
      <div className="chip-set">
        {g.cats
          .map(catById)
          .filter((c): c is Category => !!c)
          .map((c) => (
            <button key={c.id} type="button" className="chip" onClick={() => props.nav.push({ name: 'cat', id: c.id })}>
              {t(c.name)} ›
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
                    <span className="title">{g.name}</span>
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
                {new Date(o.at).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined)} · {o.lines.map((l) => `${l.qty}× ${gearById(l.gear)?.name ?? l.gear}`).join(', ')} · {euro(o.total)}
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
      <section className="card tr-section">
        <h2>{tr('Your order', 'Deine Bestellung')}</h2>
        <ul className="tr-points">
          {lines.map((l) => (
            <li key={l.gear}>
              {l.qty}× {gearById(l.gear)!.name} – {euro(priceOf(gearById(l.gear)!) * l.qty)}
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
      <section className="card tr-section">
        <h2>{tr('Delivery address', 'Lieferadresse')}</h2>
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
      <section className="card tr-section">
        <h2>{tr('Payment', 'Zahlung')}</h2>
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
          ✓
        </span>
        <h2>{tr('Order received – in the prototype only', 'Bestellung aufgenommen – nur im Prototyp')}</h2>
        <p className="muted">
          {tr('Nothing was sent or charged. In the real app the order goes to the partner shop at this point.', 'Es wurde nichts gesendet oder abgebucht. In der echten App geht die Bestellung an dieser Stelle an den Partner-Shop.')}
        </p>
        <ul className="tr-points">
          {props.order.lines.map((l) => (
            <li key={l.gear}>
              {l.qty}× {gearById(l.gear)?.name ?? l.gear}
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

function SessionResult(props: { id: string; nav: Nav }) {
  useTrainingTick();
  const s = loadSessions().find((x) => x.id === props.id);
  if (!s) return null;
  const band = bandOf(playerHcp());
  return (
    <main className="screen training">
      <TopBar title={s.name} onBack={props.nav.back} />
      <div className="tr-stats">
        <div>
          <strong>{s.items.filter((i) => i.done).length}/{s.items.length}</strong>
          <span className="muted small">{tr('drills done', 'Übungen erledigt')}</span>
        </div>
        <div>
          <strong>{s.items.filter((i) => i.value != null).length}</strong>
          <span className="muted small">{tr('results', 'Ergebnisse')}</span>
        </div>
      </div>
      <ul className="list">
        {s.items.map((i, k) => {
          const d = drillById(i.drill);
          if (!d) return null;
          const ok = meets(d.scoring, d.targets, i.value ?? null, band);
          return (
            <li key={k}>
              <button type="button" className="list-item" onClick={() => props.nav.push({ name: 'drill', id: d.id })}>
                <span className="tr-cat-icon small">{CAT_ICON[d.cat]}</span>
                <span className="grow">
                  <span className="title">{t(d.name)}</span>
                  <span className="muted small">
                    {i.done ? scoreText(d.scoring, i.value ?? null) : tr('not done', 'nicht gemacht')}
                  </span>
                </span>
                {ok != null && <span className={`badge ${ok ? 'ok' : 'warn'}`}>{ok ? tr('✓ goal', '✓ Ziel') : tr('below goal', 'unter Ziel')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {s.finishedAt && (
        <div className="tr-actions">
          <button type="button" className="btn-secondary" onClick={() => props.nav.start(newSession(s.name, s.items.map((i) => ({ drill: i.drill, minutes: i.minutes })), s.planId))}>
            {tr('Repeat this session', 'Einheit wiederholen')}
          </button>
          <button
            type="button"
            className="btn-secondary btn-danger"
            onClick={() => {
              deleteSession(s.id);
              props.nav.toTab('log');
            }}
          >
            {tr('Delete session', 'Einheit löschen')}
          </button>
        </div>
      )}
    </main>
  );
}
