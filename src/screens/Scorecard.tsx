import { useState } from 'react';
import type { Round } from '../types';
import { fmtHcp, playerTotals, roundStats } from '../lib/scoring';
import { deleteRound, loadRounds } from '../lib/storage';
import { TopBar, formatToPar } from '../components/ui';
import { SgCard } from '../components/SgCard';
import { ScoreTable } from '../components/ScoreTable';
import { HoleEditSheet } from '../components/HoleEditSheet';
import { RoundSummaryCard } from '../components/RoundSummaryCard';
import { shareScorecard } from '../lib/shareCard';
import { TEE_COLOURS, teeName } from '../data/tees';
import { PlayedHcpCard } from '../components/PlayedHcp';
import { groupForHandicap, roundsSg } from '../lib/sg';
import { loopsText } from '../lib/loops';
import { getLang, tr } from '../lib/i18n';

export function Scorecard(props: {
  round: Round;
  onBackToHole: () => void;
  onFinish: (r: Round) => void;
  onClose: () => void;
  onReview: (r: Round) => void;
  onDeleted: () => void;
  onChange: (r: Round) => void;
}) {
  const { round } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editHole, setEditHole] = useState<number | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const me = round.players.find((p) => p.isMe)!;
  const finished = round.finishedAt != null;
  const stats = roundStats(round.holes, round.entries[me.id]);
  const sg = roundsSg([round]);
  // Always: without a GPS track (GPS off, phone switched off) the shots can still be set by tapping the map.
  const canReview = !round.preview;

  return (
    <main className="screen">
      <TopBar title={tr('Scorecard', 'Scorekarte')} onBack={finished ? props.onClose : props.onBackToHole} backLabel={finished ? tr('Close', 'Schließen') : tr('Back to hole', 'Zurück zum Loch')} />
      <div>
        <div style={{ font: '600 19px var(--display)' }}>{round.courseName}</div>
        <span className="muted small sc-sub">
          {[new Date(round.createdAt).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined), loopsText(round.loopOrder)].filter(Boolean).join(' · ')}
          {round.tee && (
            <>
              {' · '}
              <span className="tee-dot" style={{ background: TEE_COLOURS[round.tee] ?? '#888' }} />
              {teeName(round.tee)}
            </>
          )}
        </span>
      </div>

      <section className="card sc-hero">
        {(() => {
          const t = playerTotals(round.holes, round.entries[me.id], me.playingHandicap);
          return (
            <div className="sc-hero-main">
              <div>
                <div className="sc-big">{t.holesPlayed ? t.gross : '–'}</div>
                <div className="muted small">{tr('strokes', 'Schläge')}</div>
              </div>
              <div>
                <div className="sc-mid">{t.holesPlayed ? formatToPar(t.toPar) : '–'}</div>
                <div className="muted small">{tr('to par', 'zu Par')}</div>
              </div>
              {t.stableford != null && (
                <div>
                  <div className="sc-mid">{t.holesPlayed ? t.stableford : '–'}</div>
                  <div className="muted small">{tr('Stableford pts', 'Stableford')}</div>
                </div>
              )}
              {round.entries[me.id].some((e) => e.putts != null) && (
                <div>
                  <div className="sc-mid">{stats.putts}</div>
                  <div className="muted small">Putts</div>
                </div>
              )}
            </div>
          );
        })()}
        {round.players
          .filter((p) => !p.isMe)
          .map((p) => {
            const t = playerTotals(round.holes, round.entries[p.id], p.playingHandicap);
            return (
              <div key={p.id} className="sc-other">
                <span className="grow">{p.name}{p.playingHandicap != null ? <span className="muted small"> · {tr('hcp', 'SV')} {fmtHcp(p.playingHandicap)}</span> : null}</span>
                <strong>{t.gross}</strong> <span className="muted small">{formatToPar(t.toPar)}</span>
                {t.stableford != null && <span className="muted small"> · {t.stableford} {tr('pts', 'Pkt.')}</span>}
              </div>
            );
          })}
        {me.playingHandicap != null && round.players.length > 1 && <div className="muted small">{me.name} · {tr('hcp', 'SV')} {fmtHcp(me.playingHandicap)}</div>}
      </section>

      <ScoreTable round={round} onHole={setEditHole} />
      <p className="muted small" style={{ margin: '-4px 0 0' }}>{tr('Tap a hole to correct it.', 'Tippe auf ein Loch, um es zu korrigieren.')}</p>
      {editHole != null && (
        <HoleEditSheet
          round={round}
          index={editHole}
          onClose={() => setEditHole(null)}
          onChange={props.onChange}
        />
      )}

      <PlayedHcpCard round={round} onChange={props.onChange} />

      {finished && <RoundSummaryCard round={round} history={loadRounds()} />}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2>{tr('Your stats', 'Deine Statistik')}</h2>
        <div className="stat-grid">
          <Stat label="Putts" value={String(stats.putts)} />
          <Stat label={tr('Fairways hit', 'Fairways getroffen')} value={`${stats.fairwaysHit} / ${stats.fairwaysPossible}`} />
          <Stat label={tr('Greens in regulation', 'Grüns in Regulation')} value={`${stats.gir} / ${stats.girPossible}`} />
          <Stat label={tr('Penalties', 'Strafschläge')} value={String(stats.penalties)} />
          <Stat label={tr('Sand saves', 'Sand Saves')} value={`${stats.sandSaves} / ${stats.bunkerHoles}`} />
        </div>
      </section>

      {finished && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            shareScorecard(round)
              .then((r) => setShareMsg(r === 'downloaded' ? tr('Picture saved – you find it in your downloads.', 'Bild gespeichert – du findest es bei deinen Downloads.') : null))
              .catch(() => setShareMsg(tr('The picture could not be made.', 'Das Bild konnte nicht erstellt werden.')))
          }
        >
          {tr('Share scorecard', 'Scorekarte teilen')}
        </button>
      )}
      {shareMsg && <p className="muted small" style={{ margin: 0 }}>{shareMsg}</p>}
      {canReview && (
        <button type="button" className="btn-secondary" onClick={() => props.onReview(round)}>
          {tr('Check your shots', 'Schläge prüfen')}{round.entries[me.id].some((e) => e.detail?.shots.some((s) => s.review)) ? tr(' · some to check', ' · einige offen') : ''}
        </button>
      )}
      {sg && <SgCard title={tr('Strokes gained this round', 'Strokes Gained dieser Runde')} values={sg.per18} shots={sg.shotsPer18} holes={sg.holes} defaultGroup={groupForHandicap(me.playingHandicap)} />}

      <span className="spacer" />
      {!finished && (
        <button type="button" className="btn-primary" onClick={() => props.onFinish({ ...round, finishedAt: new Date().toISOString() })}>
          {tr('Save & finish round', 'Runde speichern & beenden')}
        </button>
      )}
      {!confirmDelete ? (
        <button type="button" className="btn-secondary btn-danger" onClick={() => setConfirmDelete(true)}>
          {tr('Delete round', 'Runde löschen')}
        </button>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>{tr('Delete this round for good?', 'Diese Runde endgültig löschen?')}</span>
          <div className="nav-bottom" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              {tr('Keep', 'Behalten')}
            </button>
            <button
              type="button"
              className="btn-secondary btn-danger"
              onClick={() => {
                deleteRound(round.id);
                props.onDeleted();
              }}
            >
              {tr('Delete', 'Löschen')}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="num">{props.value}</div>
      <div className="muted small">{props.label}</div>
    </div>
  );
}
