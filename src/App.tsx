import { useState } from 'react';
import type { Course, Round } from './types';
import { loadRounds, saveRound } from './lib/storage';
import { Home } from './screens/Home';
import { CoursePicker } from './screens/CoursePicker';
import { RoundSetup } from './screens/RoundSetup';
import { HoleScreen } from './screens/HoleScreen';
import { Scorecard } from './screens/Scorecard';
import { NO_RESUME } from './components/ErrorBoundary';
import { Stats } from './screens/Stats';
import { RoundReview } from './screens/RoundReview';

type Screen =
  | { name: 'home' }
  | { name: 'pickCourse' }
  | { name: 'setup'; course: Course }
  | { name: 'hole'; round: Round }
  | { name: 'scorecard'; round: Round }
  | { name: 'stats' }
  | { name: 'review'; round: Round };

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

  switch (screen.name) {
    case 'home':
      return (
        <Home
          rounds={rounds}
          onNewRound={() => setScreen({ name: 'pickCourse' })}
          onContinue={(round) => setScreen({ name: 'hole', round })}
          onOpen={(round) => setScreen({ name: 'scorecard', round })}
          onStats={() => setScreen({ name: 'stats' })}
          onChanged={() => setRounds(loadRounds())}
        />
      );
    case 'review':
      return (
        <RoundReview
          round={screen.round}
          onChange={(round) => {
            persist(round);
            setScreen({ name: 'review', round });
          }}
          onDone={() => setScreen({ name: 'scorecard', round: screen.round })}
        />
      );
    case 'stats':
      return <Stats rounds={rounds} onBack={() => setScreen({ name: 'home' })} />;
    case 'pickCourse':
      return <CoursePicker onBack={() => setScreen({ name: 'home' })} onPicked={(course) => setScreen({ name: 'setup', course })} />;
    case 'setup':
      return (
        <RoundSetup
          course={screen.course}
          onBack={() => setScreen({ name: 'pickCourse' })}
          onStart={(round) => {
            persist(round);
            setScreen({ name: 'hole', round });
          }}
        />
      );
    case 'hole':
      return (
        <HoleScreen
          round={screen.round}
          onChange={(round) => {
            persist(round);
            setScreen({ name: 'hole', round });
          }}
          onExit={() => setScreen({ name: 'home' })}
          onShowScorecard={(round) => {
            persist(round);
            setScreen({ name: 'scorecard', round });
          }}
        />
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
