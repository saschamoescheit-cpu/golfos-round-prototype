import { useRef, useState } from 'react';
import type { Round } from '../types';
import { playerTotals } from '../lib/scoring';
import { Attribution, formatToPar } from '../components/ui';
import { restoreBackup, shareBackup } from '../lib/backup';

export function Home(props: {
  rounds: Round[];
  onNewRound: () => void;
  onContinue: (r: Round) => void;
  onOpen: (r: Round) => void;
  onChanged: () => void;
}) {
  const open = props.rounds.find((r) => !r.finishedAt);
  const fileInput = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const finished = props.rounds.filter((r) => r.finishedAt);

  return (
    <main className="screen">
      <div className="topbar">
        <div className="brand">
          GOLF<span>OS</span>
        </div>
        <span className="spacer" />
        <span className="muted small" title={__BUILD_TIME__}>
          Version {new Date(__BUILD_TIME__).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
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
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2>Backup</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Your rounds live only on this phone. Safari and the home-screen app keep separate data – use a backup to move or save it.
        </p>
        <div className="nav-bottom" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button type="button" className="btn-secondary" onClick={() => shareBackup().catch(() => setBackupMsg('Backup cancelled.'))}>
            Save backup
          </button>
          <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()}>
            Restore backup
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const { rounds } = restoreBackup(JSON.parse(await file.text()));
              setBackupMsg(`Backup restored · ${rounds} ${rounds === 1 ? 'round' : 'rounds'} added.`);
              props.onChanged();
            } catch (err) {
              setBackupMsg(err instanceof Error ? err.message : 'This file could not be read.');
            }
          }}
        />
        {backupMsg && <p className="small" style={{ margin: 0 }}>{backupMsg}</p>}
      </section>

      <span className="spacer" />
      <Attribution />
    </main>
  );
}
