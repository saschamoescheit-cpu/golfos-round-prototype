import { lazy, Suspense, useEffect, useState } from 'react';
import type { Course, Round, RoundHole } from './types';
import { closeStaleRounds, deleteRound, ensureGeometry, geometryReady, loadCarryBag, loadRounds, saveRound } from './lib/storage';
import { commitParAt } from './lib/scoring';
import { carryToReview } from './lib/stats';
import { restoreLostRounds } from './lib/restore';
import { PlayTab } from './screens/Play';
import { RoundsTab, uncheckedRounds } from './screens/Rounds';
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

type Screen =
  | { name: 'tab'; tab: Tab } // the five menu tabs (play, rounds, record, stats, profile)
  | { name: 'pickCourse' }
  | { name: 'setup'; course: Course }
  | { name: 'hole'; round: Round }
  | { name: 'scorecard'; round: Round; back?: Screen; justFinished?: boolean; finishing?: boolean }
  | { name: 'courseStats'; courseName: string }
  | { name: 'bag'; part: 'bag' | 'caddie'; back?: Screen }
  | { name: 'review'; round: Round }
  | { name: 'book'; course: Course; holes: RoundHole[]; tee: string | null; playing?: number | null };

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
const Waiting = () => (
  <main className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
    <span className="spinner" aria-label="…" />
  </main>
);

const HOME: Screen = { name: 'tab', tab: 'play' };
const ROUNDS: Screen = { name: 'tab', tab: 'rounds' };

export function App() {
  // rounds left open for more than a day are tidied up first (finished with their scores, or deleted when empty)
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
  const [module, setModuleState] = useState<AppModule | null>(() => (screen.name === 'hole' ? 'rounds' : sessionModule()));
  const [homeTab, setHomeTab] = useState<HomeTab>('start');
  const [gamesTab, setGamesTab] = useState<GamesTab | undefined>(undefined);
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
  };

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
  if (module !== 'rounds' && bagFrom) return <MyBag rounds={rounds} part={bagFrom.part} onBack={() => setBagFrom(null)} />;
  if (!module)
    return (
      <Home
        tab={homeTab}
        onTab={setHomeTab}
        roundOpen={rounds.some((r) => !r.finishedAt)}
        gameOpen={loadGames().some((g) => !g.finishedAt)}
        onPick={(m) => {
          if (m === 'games') setGamesTab(undefined);
          setModule(m);
        }}
        profile={profile}
      />
    );
  if (module === 'games') return <GamesApp onModules={() => setModule(null)} profile={profile} tab={gamesTab} onTabChange={setGamesTab} />;

  switch (screen.name) {
    case 'tab': {
      const tab = screen.tab;
      const dots = { rounds: uncheckedRounds(rounds).length > 0, profile: carryToReview(rounds, loadCarryBag()).length > 0 };
      return (
        <main className="screen with-tabs">
          {tab === 'play' && (
            <PlayTab
              rounds={rounds}
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
              onCheck={() => setScreen(ROUNDS)}
              onModules={() => setModule(null)}
            />
          )}
          {tab === 'rounds' && <RoundsTab rounds={rounds} onOpen={(round) => setScreen({ name: 'scorecard', round, back: ROUNDS })} onContinue={(round) => setScreen({ name: 'hole', round })} />}
          {tab === 'record' && (
            <RecordTab
              rounds={rounds}
              onOpenRound={(round) => setScreen({ name: 'scorecard', round, back: { name: 'tab', tab: 'record' } })}
              onProfile={() => setScreen({ name: 'tab', tab: 'profile' })}
            />
          )}
          {tab === 'stats' && <Stats rounds={rounds} onOpenCourse={(courseName) => setScreen({ name: 'courseStats', courseName })} />}
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
      return <MyBag rounds={rounds} part={screen.part} onBack={() => setScreen(screen.back ?? { name: 'tab', tab: 'profile' })} />;
    case 'courseStats':
      return (
        <CourseStats
          rounds={rounds}
          courseName={screen.courseName}
          onBack={() => setScreen({ name: 'tab', tab: 'stats' })}
          onOpen={(round) => setScreen({ name: 'scorecard', round, back: { name: 'courseStats', courseName: screen.courseName } })}
        />
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
          <CourseBook course={screen.course} holes={screen.holes} tee={screen.tee} playing={screen.playing ?? null} onBack={() => setScreen({ name: 'setup', course: screen.course })} />
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
              setPaused(screen.round.id);
              setScreen(HOME);
            }}
            onEnd={(round) => {
              const done = { ...round, finishedAt: new Date().toISOString() };
              persist(done);
              setScreen({ name: 'scorecard', round: done, back: ROUNDS, justFinished: true });
            }}
            onAbort={(round) => {
              deleteRound(round.id, true);
              setRounds(loadRounds());
              setScreen(HOME);
            }}
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
      );
  }
}
