import type { Round } from '../types';
import { playerTotals } from '../lib/scoring';
import { Attribution, formatToPar } from '../components/ui';

export function Home(props: {
  rounds: Round[];
  onNewRound: () => void;
  onContinue: (r: Round) => void;
  onOpen: (r: Round) => void;
  onChanged: () => void;
}) {
  const open = props.rounds.find((r) => !r.finishedAt);
  const finished = props.rounds.filter((r) => r.finishedAt);

  return (
    <main className="screen">
      <div className="topbar">
        <div className="brand">
          GOLF<span>OS</span>
        </div>
        <span className="spacer" />
        <span className="muted small">Rounds · v0.1</span>
      </div>

      {open && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="eyebrow">Round in progress</span>
          <div style={{ font: '600 19px var(--display)' }}>{open.courseName}</div>
          <span className="muted">
            {open.loopOrder.join(' + ')} · hole {open.currentHole + 1} of {open.holes.length}
          </span>
          <button type="button" className="btn-primary" onClick={() => props.onContinue(open)}>
            Continue round
          </button>
        </section>
      )}

      <button type="button" className={open ? 'btn-secondary' : 'btn-primary'} onClick={props.onNewRound}>
        New round
      </button>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2>Your rounds</h2>
        {finished.length === 0 && <p className="muted">No rounds yet. Your finished rounds will appear here.</p>}
        <ul className="list">
          {finished.map((r) => {
            const me = r.players.find((p) => p.isMe)!;
            const t = playerTotals(r.holes, r.entries[me.id], me.playingHandicap);
            return (
              <li key={r.id}>
                <button type="button" className="list-item" onClick={() => props.onOpen(r)}>
                  <span className="grow">
                    <span className="title">{r.courseName}</span>
                    <span className="muted small">
                      {new Date(r.createdAt).toLocaleDateString()} · {r.loopOrder.join(' + ')} · {r.holes.length} holes
                    </span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{ font: '700 20px var(--display)' }}>{t.gross}</span>
                    <span className="muted small" style={{ display: 'block' }}>
                      {formatToPar(t.toPar)}
                      {t.stableford != null ? ` · ${t.stableford} pts` : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <span className="spacer" />
      <Attribution />
    </main>
  );
}
