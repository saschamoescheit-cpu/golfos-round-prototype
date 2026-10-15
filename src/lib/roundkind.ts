import { tr } from './i18n';

// The kind of round (Sascha 15.10.2026): chosen before the round like the game mode – a tournament, a round with
// friends or a practice round. Kept with the round; the statistics can tell them apart later.
export type RoundKind = 'tournament' | 'social' | 'training';

export const ROUND_KINDS: { id: RoundKind; name: () => string; text: () => string }[] = [
  {
    id: 'tournament',
    name: () => tr('Tournament', 'Turnier'),
    text: () => tr('A competition, e.g. a club tournament.', 'Ein Wettspiel, z. B. ein Turnier im Club.'),
  },
  {
    id: 'social',
    name: () => 'Social',
    text: () => tr('A round with friends or a private round.', 'Eine Runde mit Freunden oder eine private Runde.'),
  },
  {
    id: 'training',
    name: () => tr('Practice', 'Training'),
    text: () => tr('Working on your game – try things out, play a second ball.', 'Am Spiel arbeiten – Dinge ausprobieren, einen zweiten Ball spielen.'),
  },
];

export const kindName = (k: RoundKind | undefined): string => ROUND_KINDS.find((x) => x.id === (k ?? 'social'))!.name();
