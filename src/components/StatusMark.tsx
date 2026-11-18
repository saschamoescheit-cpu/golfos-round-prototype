// The state of a list row as one mark in its own column between date and name – as on the rounds and the games
// (Sascha 18.11.2026: "Bei Runden arbeiten wir mit icons und bei den Turnieren nicht, dort steht beendet in grünen Text.
// Es sollte überall einheitlich sein"). The same meaning everywhere: the seal – over, every card signed (as "signiert");
// the pen – cards still to sign (as "prüfen & signieren"); the module's own mark – planned or running.
import type { ReactNode } from 'react';
import { tr } from '../lib/i18n';
import { SignedIcon } from './SignedIcon';
import { PlayedIcon, ToSignIcon } from './RoundIcons';

export type RowState = 'planned' | 'running' | 'waiting' | 'over';

export const rowStateWord = (s: RowState): string =>
  ({ planned: tr('planned', 'geplant'), running: tr('running', 'läuft'), waiting: tr('cards missing', 'Karten fehlen'), over: tr('finished', 'beendet') })[s];

/** planned / running: the module's own mark (a cup for tournaments, the ticket for bets); running without one: the tee */
export function StatusMark(props: { state: RowState; planned?: ReactNode; running?: ReactNode }) {
  const word = rowStateWord(props.state);
  const icon =
    props.state === 'over' ? <SignedIcon size={16} /> : props.state === 'waiting' ? <ToSignIcon size={16} /> : props.state === 'planned' ? props.planned : (props.running ?? <PlayedIcon size={16} />);
  return (
    <span className="list-mark">
      <span className="signed-mark" role="img" aria-label={word} title={word}>
        {icon}
      </span>
    </span>
  );
}
