import { lazy, Suspense, useEffect, useState } from 'react';
import type { Course, Round, RoundHole } from './types';
import { ensureGeometry, geometryReady, loadRounds, saveRound } from './lib/storage';
import { Home } from './screens/Home';
import { CoursePicker } from './screens/CoursePicker';
import { RoundSetup } from './screens/RoundSetup';
import { Scorecard } from './screens/Scorecard';
import { NO_RESUME } from './components/ErrorBoundary';
import { Stats } from './screens/Stats';
import { MyBag } from './screens/MyBag';

type Screen =
  | { name: 'home' }
  | { name: 'pickCourse' }
  | { name: 'setup'; course: Course }
  | { name: 'hole'; round: Round }
  | { name: 'scorecard'; round: Round }
  | { name: 'stats' }
  | { name: 'bag' }
  | { name: 'review'; round: Round }
  | { name: 'book'; course: Course; holes: RoundHole[]; tee: string | null };

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

export function App() {
  const [rounds, setRounds] = useState<Round[]>(() => loadRounds());
  const [screen, setScreen] = useState<Screen>(() => {
    const r = SKIP_RESUME ? undefined : roundInPlay(rounds);
    return r ? { name: 'hole', round: r } : { name: 'home' };
  });

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

  switch (screen.name) {
    case 'home':
      return (
        <Home
          rounds={rounds}
          onNewRound={() => setScreen({ name: 'pickCourse' })}
          onContinue={(round) => setScreen({ name: 'hole', round })}
          onOpen={(round) => setScreen({ name: 'scorecard', round })}
          onStats={() => setScreen({ name: 'stats' })}
          onBag={() => setScreen({ name: 'bag' })}
          onChanged={() => setRounds(loadRounds())}
        />
      );
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
      return <MyBag rounds={rounds} onBack={() => setScreen({ name: 'home' })} />;
    case 'stats':
      return <Stats rounds={rounds} onBack={() => setScreen({ name: 'home' })} />;
    case 'pickCourse':
      return <CoursePicker onBack={() => setScreen({ name: 'home' })} onPicked={(course) => setScreen({ name: 'setup', course })} />;
    case 'setup':
      return (
        <RoundSetup
          course={screen.course}
          onBack={() => setScreen({ name: 'pickCourse' })}
          onBook={(holes, tee) => setScreen({ name: 'book', course: screen.course, holes, tee })}
          onStart={(round) => {
            if (!round.preview) persist(round);
            setScreen({ name: 'hole', round });
          }}
        />
      );
    case 'book':
      return (
        <Suspense fallback={<Waiting />}>
          <CourseBook course={screen.course} holes={screen.holes} tee={screen.tee} onBack={() => setScreen({ name: 'setup', course: screen.course })} />
        </Suspense>
      );
    case 'hole':
      return (
        <Suspense fallback={<Waiting />}>
          <HoleScreen
            round={screen.round}
            onChange={(round) => {
              if (!round.preview) persist(round);
              setScreen({ name: 'hole', round });
            }}
            onExit={() => setScreen({ name: 'home' })}
            onShowScorecard={(round) => {
              if (round.preview) return setScreen({ name: 'home' });
              persist(round);
              setScreen({ name: 'scorecard', round });
            }}
          />
        </Suspense>
      );
    case 'scorecard':
      return (
        <Scorecard
          round={screen.round}
          onBackToHole={() => setScreen({ name: 'hole', round: screen.round })}
          onFinish={(round) => {
            persist(round);
            setScreen({ name: 'home' });
          }}
          onClose={() => setScreen({ name: 'home' })}
          onChange={(round) => {
            persist(round);
            setScreen({ name: 'scorecard', round });
          }}
          onReview={(round) => {
            persist(round);
            setScreen({ name: 'review', round });
          }}
          onDeleted={() => {
            setRounds(loadRounds());
            setScreen({ name: 'home' });
          }}
        />
      );
  }
}
