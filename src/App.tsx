import { lazy, Suspense, useEffect, useState } from 'react';
import type { Course, Round, RoundHole } from './types';
import { closeStaleRounds, deleteRound, ensureGeometry, geometryReady, loadCachedCourse, loadCarryBag, loadRounds, saveRound } from './lib/storage';
import { commitParAt } from './lib/scoring';
import { carryToReview } from './lib/stats';
import { restoreLostRounds } from './lib/restore';
import { finishSignIn, liveConnect, syncNow, syncSoon, watchChanges } from './lib/sync';
import { PlayTab, RoundsTopBar } from './screens/Play';
import { RoundsTab, uncheckedRounds, type RoundsFilter } from './screens/Rounds';
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
import { Home, type HomeTab } from './screens/Home';
import { loadGames, sessionModule, setSessionModule, type AppModule } from './lib/gamestore';
import type { TrainingTab } from './screens/Training';
import { statRounds, unsignedRounds } from './lib/signing';

/** A practice session of the Training module is paused (read without loading the module). */
const trainingPaused = (): boolean => {
  try {
    return (JSON.parse(localStorage.getItem('golfos.training.sessions.v1') ?? '[]') as { finishedAt: string | null }[]).some((s) => !s.finishedAt);
  } catch {
    return false;
  }
};

type Screen =
  | { name: 'tab'; tab: Tab; filter?: RoundsFilter } // the five menu tabs (play, rounds, record, stats, profile)
  | { name: 'pickCourse' }
  | { name: 'setup'; course: Course }
  | { name: 'hole'; round: Round }
  | { name: 'scorecard'; round: Round; back?: Screen; justFinished?: boolean; finishing?: boolean }
  | { name: 'courseStats'; courseName: string }
  | { name: 'bag'; part: 'bag' | 'caddie'; back?: Screen }
  | { name: 'review'; round: Round }
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
const Waiting = () => (
  <main className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
    <span className="spinner" aria-label="…" />
  </main>
);

const HOME: Screen = { name: 'tab', tab: 'play' };
const ROUNDS: Screen = { name: 'tab', tab: 'rounds' };

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
  const [rounds, setRounds] = useState<Round[]>(() => {
    restoreLostRounds(); // rounds whose GPS track is still there (lost by the tidy-up of 14.10.)
    closeStaleRounds(24);
    return loadRounds();
  });
  const [screen, setScreen] = useState<Screen>(() => {
    const r = SKIP_RESUME ? undefined : roundInPlay(rounds);
    if (r && r.id === pausedRound) return HOME;
    return r ? { name: 'hole', round: r } : HOME;
  });
  // Two modules (Sascha 15.10.2026): "Rounds" (round and analysis) and "Games" (side games) – chosen when the app
  // opens; a round in play reopens straight on its hole, a reload stays in the module of this tab.
  const [module, setModuleState] = useState<AppModule | null>(() => (screen.name === 'hole' ? 'rounds' : location.hash.startsWith('#join=') ? 'games' : sessionModule())); // a join link opens Games
  const [homeTab, setHomeTab] = useState<HomeTab>('start');
  const [gamesTab, setGamesTab] = useState<GamesTab | undefined>(undefined);
  const [trainingTab, setTrainingTab] = useState<TrainingTab | undefined>(undefined);
  // the bag and the caddie settings opened from the profile of the start page or of Games
  const [bagFrom, setBagFrom] = useState<null | { part: 'bag' | 'caddie' }>(null);
  const setModule = (m: AppModule | null) => {
    setSessionModule(m);
    setModuleState(m);
    window.scrollTo(0, 0);
  };

  // "Undo" after a delete brings the round back: show it again
  useEffect(() => {
    const reload = () => setRounds(loadRounds());
    window.addEventListener('golfos:rounds-changed', reload);
    return () => window.removeEventListener('golfos:rounds-changed', reload);
  }, []);

  // Every change to a round is saved immediately, so closing the app never loses a hole.
  const persist = (round: Round) => {
    saveRound(round);
    setRounds(loadRounds());
    syncSoon();
  };
  // sync with the other devices (feature 013): after the Google login, on start, when the app comes back, every few
  // minutes and shortly after a change – only when signed in and online
  useEffect(() => {
    watchChanges();
    finishSignIn().finally(() => syncNow());
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
      window.clearInterval(t);
    };
  }, []);

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
    />
  );
  // open tasks (Sascha 15.10.2026: the yellow dot also on the start page and in Games): shots to check, carries to take over
  const toCheck = uncheckedRounds(rounds).length;
  const profileDot = carryToReview(rounds, loadCarryBag()).length > 0;
  if (module !== 'rounds' && bagFrom) return <MyBag rounds={rounds} part={bagFrom.part} onBack={() => setBagFrom(null)} />;
  if (!module)
    return (
      <Home
        tab={homeTab}
        onTab={setHomeTab}
        roundOpen={rounds.some((r) => !r.finishedAt)}
        toCheck={toCheck}
        profileDot={profileDot}
        gameOpen={loadGames().some((g) => !g.finishedAt)}
        trainingOpen={trainingPaused()}
        onPick={(m) => {
          if (m === 'games') setGamesTab(undefined);
          if (m === 'training') setTrainingTab(undefined);
          setModule(m);
        }}
        profile={profile}
      />
    );
  if (module === 'games') return <GamesApp onModules={() => setModule(null)} profile={profile} profileDot={profileDot} tab={gamesTab} onTabChange={setGamesTab} onOpenBag={(part) => setBagFrom({ part })} />;
  if (module === 'training')
    return (
      <Suspense fallback={<Waiting />}>
        <TrainingApp
          rounds={statRounds(rounds)}
          unsignedRounds={unsignedRounds(rounds).length}
          onModules={() => setModule(null)}
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
              onContinue={(round) => setScreen({ name: 'hole', round })}
              onEnd={(round) => {
                const done = { ...round, finishedAt: new Date().toISOString() };
                persist(done);
                setScreen({ name: 'scorecard', round: done, back: ROUNDS, justFinished: true });
              }}
              onAbort={(round) => {
                deleteRound(round.id, true);
                setPaused(null);
                setRounds(loadRounds());
              }}
              onCheck={() => setScreen({ name: 'tab', tab: 'rounds', filter: 'check' })}
              onSign={() => setScreen({ name: 'tab', tab: 'rounds', filter: 'sign' })}
              onModules={() => setModule(null)}
            />
          )}
          {tab !== 'play' && <RoundsTopBar onModules={() => setModule(null)} />}
          {tab === 'rounds' && <RoundsTab key={screen.filter ?? 'all'} filter={screen.filter} rounds={rounds} onOpen={(round) => setScreen({ name: 'scorecard', round, back: ROUNDS })} onContinue={(round) => setScreen({ name: 'hole', round })} />}
          {tab === 'record' && (
            <RecordTab
              rounds={rounds}
              onOpenRound={(round) => setScreen({ name: 'scorecard', round, back: { name: 'tab', tab: 'record' } })}
              onProfile={() => setScreen({ name: 'tab', tab: 'profile' })}
            />
          )}
          {tab === 'stats' && <Stats rounds={rounds} onOpenCourse={(courseName) => setScreen({ name: 'courseStats', courseName })} onToSign={() => setScreen({ name: 'tab', tab: 'rounds', filter: 'sign' })} />}
          {tab === 'profile' && profile}
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
              setScreen({ name: 'review', round });
            }}
            // the latest round, also when it was saved in the same click
            onDone={() => setScreen((s) => (s.name === 'review' ? { name: 'scorecard', round: s.round } : s))}
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
          onBack={() => setScreen({ name: 'tab', tab: 'stats' })}
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
          onBack={() => setScreen({ name: 'pickCourse' })}
          onBook={(holes, tee, playing) => setScreen({ name: 'book', course: screen.course, holes, tee, playing })}
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
              const done = { ...round, finishedAt: new Date().toISOString() };
              persist(done);
              setScreen({ name: 'scorecard', round: done, back: ROUNDS, justFinished: true });
            }}
            onAbort={(round) => {
              if (round.preview) storePreview(null);
              else deleteRound(round.id, true);
              setRounds(loadRounds());
              setScreen(HOME);
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
          onBackToHole={() => setScreen({ name: 'hole', round: screen.round })}
          justFinished={screen.justFinished}
          finishing={screen.finishing}
          onFinish={(round) => {
            // Finishing on the last hole is leaving it: its untouched score counts as par (quick tracking).
            const done = round.currentHole === round.holes.length - 1 ? commitParAt(round, round.currentHole) : round;
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
            setScreen({ name: 'review', round });
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
