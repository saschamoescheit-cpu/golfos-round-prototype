import { useState } from 'react';
import type { Course, Round } from './types';
import { loadRounds, saveRound } from './lib/storage';
import { Home } from './screens/Home';
import { CoursePicker } from './screens/CoursePicker';
import { RoundSetup } from './screens/RoundSetup';
import { HoleScreen } from './screens/HoleScreen';
import { Scorecard } from './screens/Scorecard';

type Screen =
  | { name: 'home' }
  | { name: 'pickCourse' }
  | { name: 'setup'; course: Course }
  | { name: 'hole'; round: Round }
  | { name: 'scorecard'; round: Round };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [rounds, setRounds] = useState<Round[]>(() => loadRounds());

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
          onChanged={() => setRounds(loadRounds())}
        />
      );
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
          onDeleted={() => {
            setRounds(loadRounds());
            setScreen({ name: 'home' });
          }}
        />
      );
  }
}
