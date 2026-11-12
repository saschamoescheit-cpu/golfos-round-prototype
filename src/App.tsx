import { openModuleSheet } from './components/ModuleSheet';
import { tr } from './lib/i18n';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NAV_EVENT, type NavTarget } from './lib/nav';
import type { Course, Round, RoundHole } from './types';
import { closeStaleRounds, deleteRound, ensureGeometry, geometryReady, loadCachedCourse, loadCarryBag, loadRounds, saveRound } from './lib/storage';
import { commitParAt, finishRound, playerTotals } from './lib/scoring';
import { endWatchIfIdle, endWatchRound, endWatchRoundIfGone } from './lib/watch';
import { isTeamRound } from './lib/games';
import { carryToReview } from './lib/stats';
import { restoreLostRounds } from './lib/restore';
import { finishSignIn, liveConnect, syncNow, syncSoon, watchChanges, watchRefusedWrites } from './lib/sync';
import { isNative, onAppLink } from './lib/native';
import { codeFromText, setPendingAsk, startFriendLinks } from './lib/friendlinks';
import { PlayTab, RoundsTopBar } from './screens/Play';
import { RoundsTab, roundsToSign, type RoundsFilter } from './screens/Rounds';
import { RecordTab } from './screens/Record';
import { ProfileTab } from './screens/Profile';
import { TabBar, type Tab } from './components/TabBar';
import { CoursePicker } from './screens/CoursePicker';
import { RoundSetup } from './screens/RoundSetup';
import { Scorecard } from './screens/Scorecard';
import { NO_RESUME } from './components/ErrorBoundary';
import { Stats } from './screens/Stats';
import { MyBag } from './screens/MyBag';
import { CourseStats } from './screens/CourseStats';
import { GamesApp, type GamesTab } from './screens/Games';
import { Home, type HomeTab, type ModuleCardInfo, type ModulePick, type RunningItem } from './screens/Home';
import { loadGames, sessionModule, setSessionModule, type AppModule } from './lib/gamestore';
import { roundsInPlay } from './lib/poolround';
import type { TrainingTab } from './screens/Training';
import type { MobilityTab } from './screens/Mobility';
import { sign, statRounds, unsignedRounds } from './lib/signing';
import { pushRound, takePushTarget } from './lib/push';
import { exchangeRound } from './lib/sharedround';
import { loadPools, myPoolBalances, reportDuelsSoon, reportWagers, runningPools } from './lib/wagerstore';
import { dayOf } from './lib/wagers';
import { loadTours, startTourPush, toursSoon, toursTodayCodes } from './lib/tourstore';
import { isLastHole } from './lib/holeorder';

/** A practice session of the Training module is paused (read without loading the module). */
const trainingPaused = (): boolean => {
  try {
    return (JSON.parse(localStorage.getItem('golfos.training.sessions.v1') ?? '[]') as { finishedAt: string | null }[]).some((s) => !s.finishedAt);
  } catch {
    return false;
  }
};

type Screen =
  | { name: 'tab'; tab: Tab; filter?: RoundsFilter; back?: Screen } // the five menu tabs (play, rounds, record, stats, profile); back: opened from another page
  | { name: 'pickCourse' }
  | { name: 'setup'; course: Course; from?: { holes: RoundHole[]; tee: string | null } } // from: the loops and tee chosen before (back from the preview or the birdie book)
  | { name: 'hole'; round: Round }
  | { name: 'scorecard'; round: Round; back?: Screen; justFinished?: boolean; finishing?: boolean; justSigned?: boolean }
  | { name: 'courseStats'; courseName: string; back?: Screen }
  | { name: 'bag'; part: 'bag' | 'caddie'; back?: Screen }
  // the scorecard's way back, kept through the check (Sascha 06.11.2026: "back goes one level back, not to the front")
  | { name: 'review'; round: Round; back?: Screen }
  | { name: 'book'; course: Course; holes: RoundHole[]; tee: string | null; playing?: number | null; back?: Screen };

// The player left the round on purpose (pause): a reload in this session stays on the start page.
const PAUSED = 'golfos.paused';
const pausedRound = (() => {
  try {
    return sessionStorage.getItem(PAUSED);
  } catch {
    return null;
  }
})();
const setPaused = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(PAUSED, id);
    else sessionStorage.removeItem(PAUSED);
  } catch {
    /* storage blocked */
  }
};

const sessionStorageHas = () => {
  try {
    return sessionStorage.getItem(PAUSED) != null;
  } catch {
    return false;
  }
};

/** A round started in the last 8 hours (a round takes at most ~6) and not finished: the app reopens straight on its hole (iOS may reload the page while the phone is in the pocket). */
function roundInPlay(rounds: Round[]): Round | undefined {
  return rounds.find((r) => !r.finishedAt && Date.now() - Date.parse(r.createdAt) < 8 * 3600 * 1000);
}

// After a crash the player can ask for the start page instead of the round (read once per page load).
/** A friend's invitation opened (#friend=<code>), read once at the start (the app clears the address then). */
const FRIEND_LINK = location.hash.startsWith('#friend=') ? codeFromText(location.hash) : null;
const SKIP_RESUME = (() => {
  try {
    const skip = sessionStorage.getItem(NO_RESUME) != null;
    sessionStorage.removeItem(NO_RESUME);
    return skip;
  } catch {
    return false; // storage blocked – resume as usual
  }
})();

// The map screens bring the map library (the largest part of the app) – loaded when a hole is opened (feature 026).
const HoleScreen = lazy(() => import('./screens/HoleScreen').then((m) => ({ default: m.HoleScreen })));
const CourseBook = lazy(() => import('./screens/CourseBook').then((m) => ({ default: m.CourseBook })));
const RoundReview = lazy(() => import('./screens/RoundReview').then((m) => ({ default: m.RoundReview })));
// Training (Sascha 15.10.2026) brings its whole library – loaded when the module is opened.
const TrainingApp = lazy(() => import('./screens/Training').then((m) => ({ default: m.TrainingApp })));
// The mobility screen (Sascha 17.10.2026) brings the camera tests – loaded when the module is opened.
const MobilityApp = lazy(() => import('./screens/Mobility').then((m) => ({ default: m.MobilityApp })));
/** A screening of the mobility module is paused (read without loading the module). */
const mobilityPaused = (): boolean => {
  try {
    return (JSON.parse(localStorage.getItem('golfos.mobility.v1') ?? '[]') as { finishedAt: string | null; kind: string }[]).some((s) => !s.finishedAt && s.kind !== 'single');
  } catch {
    return false;
  }
};
/**
 * The guided training of the mobility module on the start page (read without loading the module): paused, done today,
 * or waiting – only on a training day the player set (Sascha 02.11.2026: "a training is shown although I made no
 * plan"; a screening alone is no plan, and Agility's day plan has no days – the physio plan's week has).
 */
const mobilityToday = (): 'paused' | 'done' | 'today' | undefined => {
  try {
    const sessions = JSON.parse(localStorage.getItem('golfos.mobility.sessions.v1') ?? '[]') as { startedAt: string; finishedAt: string | null; done: unknown[] }[];
    const plans = JSON.parse(localStorage.getItem('golfos.mobility.physio.v1') ?? '[]') as { screenedAt: string; schedule?: { perWeek: number; days?: number[] }; log?: { at: string }[] }[];
    // the day on the player's clock (a training at 00:30 belongs to the new day)
    const day = (at: string | number) => new Date(at).toDateString();
    const today = day(Date.now());
    // paused today (one paused on an earlier day does not hold up today's training)
    if (sessions.some((s) => !s.finishedAt && s.done.length > 0 && day(s.startedAt) === today)) return 'paused';
    if (sessions.some((s) => s.finishedAt && day(s.startedAt) === today)) return 'done';
    // the newest physio plan (as loadPhysio) and its week – the same rule as dueToday in mobility/physio.ts
    const plan = [...plans].sort((a, b) => b.screenedAt.localeCompare(a.screenedAt))[0];
    const s = plan?.schedule;
    if (!plan || !s) return undefined;
    const log = plan.log ?? [];
    if (log.some((e) => day(e.at) === today)) return 'done';
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
    if (s.days?.length) return s.days.includes((now.getDay() + 6) % 7) ? 'today' : undefined;
    const week = new Set(log.filter((e) => Date.parse(e.at) >= monday && Date.parse(e.at) <= now.getTime()).map((e) => day(e.at))).size;
    return week < s.perWeek ? 'today' : undefined;
  } catch {
    return undefined;
  }
};
const Waiting = () => (
  <main className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
    <span className="spinner" aria-label="…" />
  </main>
);

const HOME: Screen = { name: 'tab', tab: 'play' };
const ROUNDS: Screen = { name: 'tab', tab: 'rounds' };

// A reload stays on its page (Sascha 03.11.2026: the scorecard at the end of a round, reloaded, jumped back to hole 18's
// map): a round's scorecard or its check kept for the session of this tab; any other page as before.
const SCREEN = 'golfos.screen.v1';
type SavedScreen = { name: 'scorecard' | 'review'; id: string } | { name: 'other' };
function saveScreen(s: Screen): void {
  const v: SavedScreen = s.name === 'scorecard' || s.name === 'review' ? { name: s.name, id: s.round.id } : { name: 'other' };
  try {
    sessionStorage.setItem(SCREEN, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
}
function savedScreen(rounds: Round[]): Screen | null {
  // only while Rounds is the module of this tab (reloaded in Games, Games opens)
  if (sessionModule() !== 'rounds') return null;
  try {
    const v = JSON.parse(sessionStorage.getItem(SCREEN) ?? 'null') as SavedScreen | null;
    const r = v && 'id' in v ? rounds.find((x) => x.id === v.id) : undefined;
    if (r && v?.name === 'scorecard') return { name: 'scorecard', round: r, back: ROUNDS };
    if (r && v?.name === 'review') return { name: 'review', round: r };
  } catch {
    /* nothing kept */
  }
  return null;
}

export function App() {
  // rounds left open for more than a day are tidied up first (finished with their scores, or deleted when empty)
  // a paused course preview (Sascha 15.10.2026: "pause" as in a round) – this tab only, never among the rounds
  const [preview, setPreview] = useState<Round | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('golfos.preview.v1') ?? 'null') as Round | null;
    } catch {
      return null;
    }
  });
  const storePreview = (r: Round | null) => {
    setPreview(r);
    try {
      if (r) sessionStorage.setItem('golfos.preview.v1', JSON.stringify(r));
      else sessionStorage.removeItem('golfos.preview.v1');
    } catch {
      /* storage blocked – this visit only */
    }
  };
  const pickModuleRef = useRef<(m: ModulePick) => void>(() => undefined);
  const [rounds, setRounds] = useState<Round[]>(() => {
    restoreLostRounds(); // rounds whose GPS track is still there (lost by the tidy-up of 14.10.)
    closeStaleRounds(24);
    return loadRounds();
  });
  const [screen, setScreen] = useState<Screen>(() => {
    if (location.hash.startsWith('#round=')) return HOME; // a round's join link: Rounds' start page asks to join
    const kept = savedScreen(rounds);
    if (kept) return kept;
    const r = SKIP_RESUME ? undefined : roundInPlay(rounds);
    if (r && r.id === pausedRound) return HOME;
    return r ? { name: 'hole', round: r } : HOME;
  });
  // a new screen starts at its top (Sascha 20.10.2026: "Schläge prüfen" from the bottom of the scorecard opened at the
  // bottom, empty while it loaded) – the hole map keeps its own place
  useEffect(() => saveScreen(screen), [screen]);
  const screenKey = screen.name === 'tab' ? `tab-${screen.tab}` : screen.name;
  useEffect(() => {
    if (screen.name !== 'hole') window.scrollTo(0, 0);
  }, [screenKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Two modules (Sascha 15.10.2026): "Rounds" (round and analysis) and "Games" (side games) – chosen when the app
  // opens; a round in play reopens straight on its hole, a reload stays in the module of this tab.
  // a join link opens Games – a round's (#round=) Rounds
  const [module, setModuleState] = useState<AppModule | null>(() => (screen.name === 'hole' || location.hash.startsWith('#round=') ? 'rounds' : location.hash.startsWith('#join=') ? 'games' : FRIEND_LINK ? null : sessionModule()));
  // a friend's invitation (#friend=, Sascha 02.11.2026: "a friend request by WhatsApp"): the friends tab asks to accept
  const [homeTab, setHomeTab] = useState<HomeTab>(() => {
    if (!FRIEND_LINK) return 'start';
    if (location.hash.startsWith('#friend=')) {
      setPendingAsk(FRIEND_LINK);
      history.replaceState(null, '', `${location.pathname}${location.search}`);
    }
    return 'friends';
  });
  const [gamesTab, setGamesTab] = useState<GamesTab | undefined>(undefined);
  const [toursTab, setToursTab] = useState<GamesTab | undefined>(undefined); // the module "Tournaments" (03.11.2026)
  const [trainingTab, setTrainingTab] = useState<TrainingTab | undefined>(undefined);
  const [mobilityTab, setMobilityTab] = useState<MobilityTab | undefined>(undefined);
  // the bag and the caddie settings opened from the profile of the start page or of Games
  const [bagFrom, setBagFrom] = useState<null | { part: 'bag' | 'caddie' }>(null);
  const setModule = (m: AppModule | null) => {
    setSessionModule(m);
    setModuleState(m);
    window.scrollTo(0, 0);
  };

  // one code for both modules (Sascha 29.10.2026: Games as Rounds): a round's code typed under "Join a game" opens
  // "Join a round" in Rounds, a game's code under "Join a round" "Join a game" in Games – as their links do
  const joinRoundByCode = (code: string) => {
    history.replaceState(null, '', `${location.pathname}${location.search}#round=${code}`);
    setScreen(HOME);
    setModule('rounds');
  };
  const joinGameByCode = (code: string) => {
    history.replaceState(null, '', `${location.pathname}${location.search}#join=${code}`);
    setGamesTab(undefined);
    setModule('games');
  };

  // the round on the Apple Watch gone or over, however (finished, given up, deleted, synced): the watch ends it too
  // (Sascha 08.11.2026: "Erik deletes the round on the phone – on the watch it is still there")
  // every round that may be on the watch: of Rounds, a game on the map, a pool's round (Sascha 09.11.2026)
  useEffect(() => {
    const all = () => [
      ...rounds.filter((r) => !r.preview),
      ...loadGames().flatMap((g) => (g.round ? [{ id: g.round.id, finishedAt: g.finishedAt ?? g.round.finishedAt }] : [])),
      ...roundsInPlay(),
    ];
    endWatchRoundIfGone(all());
    // nothing running: the watch told again – now and whenever the app comes back (the first "over" may not have reached it)
    endWatchIfIdle(all());
    const back = () => document.visibilityState === 'visible' && endWatchIfIdle(all());
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [rounds]);

  // "Undo" after a delete brings the round back: show it again
  useEffect(() => {
    const reload = () => setRounds(loadRounds());
    window.addEventListener('golfos:rounds-changed', reload);
    return () => window.removeEventListener('golfos:rounds-changed', reload);
  }, []);

  // Every change to a round is saved immediately, so closing the app never loses a hole.
  const persist = (round: Round) => {
    saveRound(round);
    if (round.finishedAt) pushRound(null, round.id); // the round is over: no thunderstorm warnings for it any more
    // a round on several phones, finished (or corrected in the round check): its scores and "finished" to the others –
    // during the round the hole map exchanges them (Sascha 29.10.2026)
    if (round.finishedAt && round.shared) void exchangeRound(round);
    // the bets of Games judged from the round (Sascha 01.11.2026) – in the background, it never holds up saving
    if (round.finishedAt && !round.preview) void reportWagers().catch(() => null);
    // a duel (5+5+10) today: the card goes along while playing – the other flight sees how it stands (Sascha 09.11.2026)
    else if (!round.preview) reportDuelsSoon();
    setRounds(loadRounds());
    syncSoon();
  };
  // sync with the other devices (feature 013): after the Google login, on start, when the app comes back, every few
  // minutes and shortly after a change – only when signed in and online
  useEffect(() => {
    watchChanges();
    watchRefusedWrites(); // the storage full: rounds and games rescued to the server (08.11.2026)
    finishSignIn().finally(() => syncNow());
    // the iOS app back from Google by its own link: keep the tokens, then start again as the website does after Google
    // … or opened by a friend's link (de.moescheit.golfos://friend/<code>): the friends tab asks to accept
    if (isNative())
      void onAppLink((url) => {
        const friend = url.includes('://friend/') ? codeFromText(url) : null;
        if (friend) {
          setPendingAsk(friend);
          setModule(null);
          setHomeTab('friends');
          return;
        }
        void finishSignIn(url).then((s) => s && location.reload());
      });
    startFriendLinks(); // the own friend card after each sync, the friends' cards every few minutes
    startTourPush(); // a tournament's result told once every flight is in (07.11.2026)
    // a friend's request asks to sign in first (03.11.2026: it shows on every screen): the profile of the start page
    const toProfile = () => {
      setModule(null);
      setHomeTab('profile');
    };
    window.addEventListener('golfos:open-profile', toProfile);
    // a friend's invitation to a round, answered "Join" (03.11.2026): Rounds' "Join a round" with its code
    const toJoin = (e: Event) => joinRoundByCode(String((e as CustomEvent<string>).detail));
    window.addEventListener('golfos:join-round', toJoin);
    // a game or a pool of bets: Games' "Join a game" – opened afresh, so it reads the code
    const toJoinGame = (e: Event) => {
      setModule(null);
      window.setTimeout(() => joinGameByCode(String((e as CustomEvent<string>).detail)), 0);
    };
    window.addEventListener('golfos:join-game', toJoinGame);
    // back to the app: fetch what the other devices changed; leaving it (another tab, the phone locked): send ours
    const onShow = () => {
      syncNow();
      liveConnect(); // the phone was locked: the channel may have dropped
    };
    document.addEventListener('visibilitychange', onShow);
    // while the app is on screen, a look every 20 s: a change on the PC shows on the open iPhone without reloading
    const t = window.setInterval(() => document.visibilityState === 'visible' && syncNow(), 20 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('golfos:open-profile', toProfile);
      window.removeEventListener('golfos:join-round', toJoin);
      window.removeEventListener('golfos:join-game', toJoinGame);
      window.clearInterval(t);
    };
  }, []);

  // the module sheet picked (Sascha 12.11.2026: switching modules quickly – mock-up A)
  useEffect(() => {
    const on = (e: Event) => pickModuleRef.current((e as CustomEvent<AppModule>).detail);
    window.addEventListener('golfos:pick-module', on);
    // "Startseite" in the module sheet (Sascha 13.11.2026: "one does not get back to the start page any more")
    const home = () => {
      setModule(null);
      setHomeTab('start');
    };
    window.addEventListener('golfos:go-home', home);
    return () => {
      window.removeEventListener('golfos:pick-module', on);
      window.removeEventListener('golfos:go-home', home);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // a link into another module remembers where it came from – "Zurück" there goes back (Sascha 12.11.2026: "back goes
  // to the main menu instead of one level")
  const [cameFrom, setCameFrom] = useState<AppModule | null>(null);
  // the module now – the link handlers are set up once, so they read it here, not from their first look
  const moduleNow = useRef(module);
  // the module one is in picked again on the module sheet: opened afresh, as from the start page (a paused session at once)
  const [moduleRun, setModuleRun] = useState(0);
  moduleNow.current = module;
  const returnTo = (here: AppModule) =>
    cameFrom && cameFrom !== here
      ? {
          label: cameFrom === 'rounds' ? tr('Rounds', 'Runden') : cameFrom === 'tournaments' ? tr('Tournaments', 'Turniere') : cameFrom === 'games' ? tr('Games', 'Games') : tr('Back', 'Zurück'),
          go: () => {
            const to = cameFrom;
            setCameFrom(null);
            setModule(to);
          },
        }
      : undefined;
  // a pool of bets or a tournament named anywhere, tapped (Sascha 10.11.2026: click paths across the app) – as a push
  const openPool = (code: string, day?: string) => {
    setCameFrom(moduleNow.current && moduleNow.current !== 'games' ? moduleNow.current : null);
    try {
      sessionStorage.setItem('golfos.openPool', code);
      // the standing opens on that day's round (Sascha 11.11.2026)
      if (day) sessionStorage.setItem('golfos.openPoolDay', day);
      else sessionStorage.removeItem('golfos.openPoolDay');
    } catch {
      /* Games opens on its start page */
    }
    setGamesTab(undefined);
    setModule('games');
    window.dispatchEvent(new CustomEvent('golfos:open-pool', { detail: code }));
  };
  const openTour = (code: string) => {
    // back from a tournament always to the tournaments' list, not to where it was tapped (Sascha 13.11.2026: "wenn ich auf Turnier
    // gehe und dann zurück, lande ich in Rounds – ich komme gar nicht mehr in die Übersicht der Turniere")
    setCameFrom(null);
    try {
      sessionStorage.setItem('golfos.openTour', code);
    } catch {
      /* Tournaments opens on its list */
    }
    setToursTab('tours');
    setModule('tournaments');
    window.dispatchEvent(new Event('golfos:open-tour'));
  };
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<NavTarget>).detail;
      if (t?.pool) openPool(t.pool, t.day);
      else if (t?.tour) openTour(t.tour);
    };
    window.addEventListener(NAV_EVENT, on);
    return () => window.removeEventListener(NAV_EVENT, on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // a tapped push notification (final list, Sascha 23.10.2026): the round to check, the rounds to sign, or Games
  useEffect(() => {
    const go = () => {
      const t = takePushTarget();
      if (!t) return;
      // a bet made in a pool (Sascha 01.11.2026): Games opens that pool
      if (t.pool) {
        openPool(t.pool);
        return;
      }
      if (t.games) {
        setGamesTab(undefined);
        setModule('games');
        return;
      }
      // a tournament changed, its result, a special prize (07.11.2026): Tournaments opens it
      if (t.tour) {
        openTour(t.tour);
        return;
      }
      // a training day of the physio's routine (Agility, 1.11.2026): its drills tab with the plan on top
      if (t.agility) {
        setMobilityTab('drills');
        setModule('mobility');
        return;
      }
      setModule('rounds');
      const r = t.review ? loadRounds().find((x) => x.id === t.review) : undefined;
      if (r && r.signedAt) setScreen({ name: 'scorecard', round: r, back: ROUNDS }); // signed meanwhile on another device
      else if (r) setScreen({ name: 'review', round: r });
      else setScreen({ name: 'tab', tab: 'rounds', filter: 'sign' }); // not on this phone yet: the list of rounds to sign
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Hole map and round check need the course geometry – bundled courses load it on demand (a moment, once).
  const geoId = screen.name === 'hole' || screen.name === 'review' ? screen.round.courseId : screen.name === 'book' ? screen.course.id : null;
  const [, setGeoTick] = useState(0);
  useEffect(() => {
    if (geoId && !geometryReady(geoId)) ensureGeometry(geoId).then(() => setGeoTick((t) => t + 1));
  }, [geoId]);
  if (geoId && !geometryReady(geoId)) return <Waiting />;
  // one profile for the start page, Rounds and Games (Sascha 15.10.2026)
  const profile = (
    <ProfileTab
      rounds={rounds}
      onBag={() => (module === 'rounds' ? setScreen({ name: 'bag', part: 'bag' }) : setBagFrom({ part: 'bag' }))}
      onCaddie={() => (module === 'rounds' ? setScreen({ name: 'bag', part: 'caddie' }) : setBagFrom({ part: 'caddie' }))}
      onChanged={() => setRounds(loadRounds())}
      onFriends={() => {
        setModule(null);
        setHomeTab('friends');
      }}
    />
  );
  // open tasks (Sascha 15.10.2026: the yellow dot also on the start page and in Games): shots to check, carries to take over
  const toCheck = roundsToSign(rounds).length; // the rounds to check & sign – the same number on the home card, the dot and the tile
  const profileDot = carryToReview(rounds, loadCarryBag()).length > 0;
  if (module !== 'rounds' && bagFrom) return <MyBag rounds={rounds} part={bagFrom.part} onBack={() => setBagFrom(null)} />;
  // what the module cards say – the start page and the module sheet the same (Sascha 12.11.2026: mock-up A)
  const cardInfo = (): ModuleCardInfo => ({
    roundOpen: rounds.some((r) => !r.finishedAt),
    toCheck,
    gameOpen: loadGames().some((g) => !g.finishedAt),
    gamesToConfirm: loadGames().filter((g) => g.finishedAt && !g.signedAt).length,
    betsRunning: runningPools().map((e) => e.pool.name),
    tours: toursSoon(),
    trainingOpen: trainingPaused(),
    mobilityOpen: mobilityPaused(),
    mobilityToday: mobilityToday(),
  });
  // "Jetzt dran" on the start page (Sascha 12.11.2026 "Läuft gerade"; 11.11.2026 design round 2: everything that is to do
  // now in one green card, each row a direct way there – the module cards below no longer say it): a paused round,
  // today's tournament, rounds to check & sign, a pool on its days, results to confirm, a paused training, Agility's day
  const running = (): RunningItem[] => {
    const today = dayOf(new Date());
    const out: RunningItem[] = [];
    for (const r of rounds.filter((x) => !x.finishedAt && !x.preview)) {
      const me = r.players.find((p) => p.isMe) ?? r.players[0];
      const played = me ? playerTotals(r.holes, r.entries[me.id], me.playingHandicap).holesPlayed : 0;
      out.push({ key: `round:${r.id}`, kind: 'round', title: r.courseName, line: tr(`Paused · hole ${Math.min(played + 1, r.holes.length)} of ${r.holes.length}`, `Pausiert · Loch ${Math.min(played + 1, r.holes.length)} von ${r.holes.length}`) });
    }
    for (const code of toursTodayCodes()) {
      const t = loadTours().find((e) => e.code === code);
      // not joined yet: the row takes part right away (Sascha 13.11.2026) – joined: it is the paused round's row
      const joined = rounds.some((r) => r.shared?.code === code);
      if (t) out.push({ key: `tour:${code}`, kind: 'tour', title: t.ev.name, line: joined ? tr('Tournament today', 'Turnier heute') : tr('Tournament today · take part', 'Turnier heute · teilnehmen') });
    }
    const sign = roundsToSign(rounds);
    if (sign.length)
      out.push({
        key: 'sign:rounds',
        kind: 'sign',
        title: sign.length === 1 ? tr('1 round to check & sign', '1 Runde prüfen & signieren') : tr(`${sign.length} rounds to check & sign`, `${sign.length} Runden prüfen & signieren`),
        line: [...new Set(sign.map((r) => r.courseName))].slice(0, 2).join(', ') + (sign.length > 2 ? ' …' : ''),
      });
    for (const p of myPoolBalances(today).filter((x) => x.running)) {
      const e = loadPools().find((x) => x.code === p.code);
      const from = e?.pool.from ?? today;
      const to = e?.pool.to ?? today;
      const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
      const day = Math.round((Date.parse(today) - Date.parse(from)) / 864e5) + 1;
      const value = p.amount ? `${p.amount > 0 ? '+' : '−'}${Math.abs(p.amount)} ${p.sym}` : undefined;
      out.push({ key: `pool:${p.code}`, kind: 'pool', title: p.name, line: day >= 1 && day <= days ? tr(`Day ${day} of ${days}`, `Tag ${day} von ${days}`) : tr('Bets running', 'Wetten laufen'), value, good: p.amount > 0 });
    }
    const confirm = loadGames().filter((g) => g.finishedAt && !g.signedAt).length;
    if (confirm)
      out.push({ key: 'confirm:games', kind: 'confirm', title: confirm === 1 ? tr('1 result to confirm', '1 Ergebnis bestätigen') : tr(`${confirm} results to confirm`, `${confirm} Ergebnisse bestätigen`), line: 'Games & Bets' });
    if (trainingPaused()) out.push({ key: 'training:paused', kind: 'training', title: 'Training', line: tr('A session is paused', 'Eine Einheit ist pausiert') });
    const mob = mobilityPaused() ? 'screening' : mobilityToday();
    if (mob && mob !== 'done')
      out.push({
        key: `mobility:${mob}`,
        kind: 'mobility',
        title: 'Agility',
        line: mob === 'screening' ? tr('A screening is paused', 'Ein Screening ist pausiert') : mob === 'paused' ? tr('A training is paused', 'Ein Training ist pausiert') : tr('Your training today is waiting', 'Dein Training heute wartet'),
      });
    return out;
  };
  const openRunning = (r: RunningItem) => {
    const [kind, id] = [r.kind, r.key.slice(r.key.indexOf(':') + 1)];
    if (kind === 'pool') return openPool(id);
    if (kind === 'tour') return rounds.some((x) => x.shared?.code === id) ? openTour(id) : joinRoundByCode(id);
    if (kind === 'sign') return pickModule('rounds'); // straight to the rounds to check & sign
    if (kind === 'confirm') return pickModule('games');
    if (kind === 'training') return pickModule('training');
    if (kind === 'mobility') return pickModule('mobility');
    const round = rounds.find((x) => x.id === id);
    if (round) {
      setModule('rounds');
      setScreen({ name: 'hole', round });
    }
  };
  const pickModule = (m: ModulePick) => {
    // the card's line says what is to do – a tap goes there (night 10./11.11.2026: "click paths"): the rounds to
    // sign (a round open is paused here – it waits on Spielen), today's one tournament
    if (m === 'rounds' && toCheck > 0) setScreen({ name: 'tab', tab: 'rounds', filter: 'sign' });
    if (m === 'tournaments') {
      const today = toursTodayCodes();
      if (today.length === 1) {
        openTour(today[0]);
        return;
      }
    }
    if (m === 'games') setGamesTab(undefined);
    if (m === 'tournaments') setToursTab(undefined);
    if (m === 'training') setTrainingTab(undefined);
    if (m === 'mobility') setMobilityTab(undefined);
    if (m === moduleNow.current) setModuleRun((n) => n + 1);
    setModule(m);
  };
  pickModuleRef.current = pickModule;
  const sheet = () => openModuleSheet(module, cardInfo());
  if (!module)
    return (
      <Home
        tab={homeTab}
        onTab={setHomeTab}
        {...cardInfo()}
        running={running()}
        onRunning={openRunning}
        profileDot={profileDot}
        onPick={pickModule}
        profile={profile}
      />
    );
  // the tournaments a module of their own (Sascha 03.11.2026) – the same screens of a tournament as before
  if (module === 'tournaments') return <GamesApp key="tours" kind="tours" returnTo={returnTo('tournaments')} onModules={sheet} profile={profile} profileDot={profileDot} tab={toursTab} onTabChange={setToursTab} onOpenBag={(part) => setBagFrom({ part })} onJoinRound={joinRoundByCode} />;
  if (module === 'games') return <GamesApp key="games" returnTo={returnTo('games')} onModules={sheet} profile={profile} profileDot={profileDot} tab={gamesTab} onTabChange={setGamesTab} onOpenBag={(part) => setBagFrom({ part })} onJoinRound={joinRoundByCode} onOpenRounds={() => { setScreen(HOME); setModule('rounds'); }} />;
  if (module === 'mobility')
    return (
      <Suspense fallback={<Waiting />}>
        <MobilityApp
          key={`mobility-${moduleRun}`}
          onModules={sheet}
          profile={profile}
          profileDot={profileDot}
          tab={mobilityTab}
          onTabChange={setMobilityTab}
          onOpenTraining={() => {
            // the plan from the screen waits in Training › Practice › My plans
            setTrainingTab('train');
            setModule('training');
          }}
        />
      </Suspense>
    );
  if (module === 'training')
    return (
      <Suspense fallback={<Waiting />}>
        <TrainingApp
          key={`training-${moduleRun}`}
          rounds={statRounds(rounds)}
          unsignedRounds={unsignedRounds(rounds).length}
          onModules={sheet}
          profile={profile}
          profileDot={profileDot}
          tab={trainingTab}
          onTabChange={setTrainingTab}
          onOpenRounds={(to) => {
            // Mein Bag and the caddie settings over Training (back returns there), the rest in Rounds
            if (to === 'bag' || to === 'caddie') return setBagFrom({ part: to });
            setModule('rounds');
            setScreen(to === 'course' ? { name: 'pickCourse' } : { name: 'tab', tab: to === 'stats' ? 'stats' : 'rounds' });
          }}
        />
      </Suspense>
    );

  // the menu at the bottom on the sub pages too (Sascha: "the menu on every page of a module", as in Training)
  const subMenu = (current: Tab) => (
    <TabBar
      tab={current}
      dots={{ rounds: toCheck > 0, profile: profileDot }}
      onTab={(t) => {
        setScreen({ name: 'tab', tab: t });
        window.scrollTo(0, 0);
      }}
    />
  );
  switch (screen.name) {
    case 'tab': {
      const tab = screen.tab;
      const dots = { rounds: toCheck > 0, profile: profileDot };
      return (
        <main className="screen with-tabs">
          {tab === 'play' && (
            <PlayTab
              rounds={rounds}
              preview={preview}
              onPreview={(r) => setScreen({ name: 'hole', round: r })}
              onEndPreview={() => storePreview(null)}
              onNewRound={() => setScreen({ name: 'pickCourse' })}
              onJoined={(round) => {
                persist(round);
                closeStaleRounds(0, round.id); // a new round: no other one stays "in progress"
                setRounds(loadRounds());
                setScreen({ name: 'hole', round });
              }}
              onJoinGame={joinGameByCode}
              // a planned tournament joined before its day: the module Tournaments, its list
              onTours={() => {
                setToursTab('tours');
                setModule('tournaments');
              }}
              onContinue={(round) => setScreen({ name: 'hole', round })}
              onEnd={(round) => {
                endWatchRound(); // the watch ends its workout (08.11.2026)
                const done = finishRound(round, isTeamRound(round));
                persist(done);
                setScreen({ name: 'scorecard', round: done, back: ROUNDS, justFinished: true });
              }}
              onAbort={(round) => {
                deleteRound(round.id, true);
                setPaused(null);
                setRounds(loadRounds());
              }}
              onSign={() => setScreen({ name: 'tab', tab: 'rounds', filter: 'sign' })}
              onModules={sheet}
            />
          )}
          {tab !== 'play' && <RoundsTopBar onModules={sheet} />}
          {tab === 'rounds' && <RoundsTab key={screen.filter ?? 'all'} filter={screen.filter} rounds={rounds} onOpen={(round) => {
            // the rounds to sign: a tap opens the check straight away (night 10./11.11.2026: four taps were one too many)
            if (screen.filter === 'sign' && !round.signedAt) {
              const r = { ...round, capture: 'full' as const };
              persist(r);
              setScreen({ name: 'review', round: r, back: { name: 'tab', tab: 'rounds', filter: 'sign' } });
            } else setScreen({ name: 'scorecard', round, back: ROUNDS });
          }} onContinue={(round) => setScreen({ name: 'hole', round })} onNew={() => setScreen({ name: 'pickCourse' })} />}
          {tab === 'record' && (
            <RecordTab
              rounds={rounds}
              onOpenRound={(round) => setScreen({ name: 'scorecard', round, back: { name: 'tab', tab: 'record' } })}
              onProfile={() => setScreen({ name: 'tab', tab: 'profile', back: { name: 'tab', tab: 'record' } })}
              onToSign={() => setScreen({ name: 'tab', tab: 'rounds', filter: 'sign' })}
              onNew={() => setScreen({ name: 'pickCourse' })}
            />
          )}
          {tab === 'stats' && <Stats rounds={rounds} onOpenCourse={(courseName) => setScreen({ name: 'courseStats', courseName })} onToSign={() => setScreen({ name: 'tab', tab: 'rounds', filter: 'sign' })} onNew={() => setScreen({ name: 'pickCourse' })} />}
          {tab === 'profile' && (screen.back ? <ProfileTab {...profile.props} onBack={() => setScreen(screen.back!)} /> : profile)}
          <TabBar
            tab={tab}
            dots={dots}
            onTab={(t) => {
              setScreen({ name: 'tab', tab: t });
              window.scrollTo(0, 0);
            }}
          />
        </main>
      );
    }
    case 'review':
      return (
        <Suspense fallback={<Waiting />}>
          <RoundReview
            round={screen.round}
            onChange={(round) => {
              persist(round);
              setScreen({ name: 'review', round, back: screen.back });
            }}
            // the latest round, also when it was saved in the same click
            onDone={(signIt) =>
              setScreen((s) => {
                if (s.name !== 'review') return s;
                // checked and chosen to sign: signed with the last step of the check (Sascha 17.10.2026) – only when
                // every hole was checked; "Fertig" leaves without signing (Sascha 22.10.2026)
                const done = signIt && !s.round.signedAt && s.round.capture !== 'score' ? sign(s.round, signIt) : s.round;
                if (done !== s.round) persist(done);
                // just signed: the round report on top of the scorecard
                return { name: 'scorecard', round: done, back: s.back, justSigned: done !== s.round };
              })
            }
          />
        </Suspense>
      );
    case 'bag':
      return (
        <>
          <MyBag rounds={rounds} part={screen.part} onBack={() => setScreen(screen.back ?? { name: 'tab', tab: 'profile' })} />
          {subMenu('profile')}
        </>
      );
    case 'courseStats':
      return (
        <>
        <CourseStats
          rounds={rounds}
          courseName={screen.courseName}
          onBack={() => setScreen(screen.back ?? { name: 'tab', tab: 'stats' })}
          onOpen={(round) => setScreen({ name: 'scorecard', round, back: { name: 'courseStats', courseName: screen.courseName } })}
        />
        {subMenu('stats')}
        </>
      );
    case 'pickCourse':
      return <CoursePicker onBack={() => setScreen(HOME)} onPicked={(course) => setScreen({ name: 'setup', course })} />;
    case 'setup':
      return (
        <RoundSetup
          course={screen.course}
          from={screen.from}
          onBack={() => setScreen({ name: 'pickCourse' })}
          onBook={(holes, tee, playing) => setScreen({ name: 'book', course: screen.course, holes, tee, playing, back: { name: 'setup', course: screen.course, from: { holes, tee } } })}
          onStart={(round) => {
            if (!round.preview) {
              persist(round);
              closeStaleRounds(0, round.id); // a new round: no other one stays "in progress"
              setRounds(loadRounds());
            }
            setScreen({ name: 'hole', round });
          }}
        />
      );
    case 'book':
      return (
        <Suspense fallback={<Waiting />}>
          <CourseBook course={screen.course} holes={screen.holes} tee={screen.tee} playing={screen.playing ?? null} onBack={() => setScreen(screen.back ?? { name: 'setup', course: screen.course })} />
        </Suspense>
      );
    case 'hole':
      if (pausedRound === screen.round.id || sessionStorageHas()) setPaused(null);
      return (
        <Suspense fallback={<Waiting />}>
          <HoleScreen
            round={screen.round}
            onChange={(round) => {
              if (!round.preview) persist(round);
              setScreen({ name: 'hole', round });
            }}
            onExit={() => {
              // a paused course preview waits on the start page ("continue"), nothing goes into the rounds
              if (screen.round.preview) storePreview(screen.round);
              else setPaused(screen.round.id);
              setScreen(HOME);
            }}
            onEnd={(round) => {
              endWatchRound(); // the watch ends its workout (08.11.2026)
                const done = finishRound(round, isTeamRound(round));
              persist(done);
              setScreen({ name: 'scorecard', round: done, back: ROUNDS, justFinished: true });
            }}
            onAbort={(round) => {
              if (round.preview) storePreview(null);
              else deleteRound(round.id, true);
              setRounds(loadRounds());
              // the preview ends where it was started: the round setup, with its loops and tee (Sascha 21.10.2026)
              const course = round.preview ? loadCachedCourse(round.courseId) : null;
              setScreen(course ? { name: 'setup', course, from: { holes: round.holes, tee: round.tee ?? null } } : HOME);
            }}
            onBook={
              screen.round.preview && loadCachedCourse(screen.round.courseId)
                ? () => setScreen({ name: 'book', course: loadCachedCourse(screen.round.courseId)!, holes: screen.round.holes, tee: screen.round.tee ?? null, playing: null, back: { name: 'hole', round: screen.round } })
                : undefined
            }
            onOpenBag={(part) => setScreen({ name: 'bag', part, back: { name: 'hole', round: screen.round } })}
            onShowScorecard={(round, finishing) => {
              if (round.preview) return setScreen(HOME);
              persist(round);
              setScreen({ name: 'scorecard', round, finishing });
            }}
          />
        </Suspense>
      );
    case 'scorecard':
      return (
        <>
        <Scorecard
          round={screen.round}
          onOpenCourse={(courseName) => setScreen({ name: 'courseStats', courseName, back: screen })}
          onBackToHole={() => setScreen({ name: 'hole', round: screen.round })}
          justFinished={screen.justFinished}
          finishing={screen.finishing}
          justSigned={screen.justSigned}
          onOpenTraining={() => {
            // the plan from the report waits in Training › Practice › My plans
            setTrainingTab('train');
            setModule('training');
          }}
          onFinish={(round) => {
            // Finishing on the last hole is leaving it: its untouched score counts as par (quick tracking).
            const done = isLastHole(round, round.currentHole) ? commitParAt(round, round.currentHole) : round;
            persist(done);
            setScreen({ name: 'scorecard', round: done, back: ROUNDS, justFinished: true }); // then: check the shots or delete
          }}
          onClose={() => setScreen(screen.back ?? ROUNDS)}
          onChange={(round) => {
            persist(round);
            setScreen({ name: 'scorecard', round, back: screen.back, justFinished: screen.justFinished, finishing: screen.finishing });
          }}
          onReview={(round) => {
            persist(round);
            setScreen({ name: 'review', round, back: screen.back });
          }}
          onDeleted={() => {
            setRounds(loadRounds());
            setScreen(ROUNDS);
          }}
        />
        {/* the menu on the scorecard too (uniform with Training) – not while the round is being finished */}
        {!screen.finishing && !screen.justFinished && subMenu(screen.back?.name === 'tab' ? screen.back.tab : 'rounds')}
        </>
      );
  }
}
