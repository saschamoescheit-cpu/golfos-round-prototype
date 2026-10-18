import { Avatar } from '../components/Avatar';
import { loadProfile } from '../lib/profile';
import { useState } from 'react';
import type { Round } from '../types';
import { checksShots, fmtHcp, playerTotals, playing18, roundStats } from '../lib/scoring';
import { deleteRound, loadRounds } from '../lib/storage';
import { TopBar, formatToPar } from '../components/ui';
import { SgCard } from '../components/SgCard';
import { ScoreTable } from '../components/ScoreTable';
import { LeaderboardCard } from '../components/Leaderboard';
import { isTeamRound } from '../lib/games';
import { HoleEditSheet } from '../components/HoleEditSheet';
import { RoundSummaryCard } from '../components/RoundSummaryCard';
import { shareScorecard } from '../lib/shareCard';
import { TEE_COLOURS, teeName } from '../data/tees';
import { PlayedHcpCard } from '../components/PlayedHcp';
import { comparisonGroup, roundsSg } from '../lib/sg';
import { loopsText } from '../lib/loops';
import { kindName } from '../lib/roundkind';
import { getLang, tr } from '../lib/i18n';
import { sign, unsign } from '../lib/signing';
import { SignedIcon } from '../components/SignedIcon';
import { CheckShotsIcon } from '../components/RoundIcons';
import { profileIndex } from '../lib/profile';
import { roundWeatherText } from '../lib/weather';

export function Scorecard(props: {
  round: Round;
  onBackToHole: () => void;
  onFinish: (r: Round) => void;
  onClose: () => void;
  onReview: (r: Round) => void;
  onDeleted: () => void;
  onChange: (r: Round) => void;
  justFinished?: boolean; // opened right after finishing: what next – check the shots or delete
  finishing?: boolean; // reached past the last hole: save or delete (a look during the round shows only the score)
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
  // a team ball has no own shots to check
  const canReview = !round.preview && !isTeamRound(round);
  // chosen after the round: detailed (check the shots) or quick (scorecard only) – the GPS track is there either way
  const scoreOnly = !checksShots(round);

  // sign the round like a paper scorecard (Sascha 16.10.2026) – only signed rounds count in the statistics. Signed it
  // stands on top, above the result and the card (Sascha 17.10.2026); to sign it follows the card, after checking it.
  const signCard = finished && !round.preview ? (
    <section className={`card sign-card${round.signedAt ? ' signed' : ''}`} aria-label={tr('Signature', 'Unterschrift')}>
      {round.signedAt ? (
        <>
          <span className="sign-seal big" aria-hidden="true">
            <SignedIcon size={34} />
          </span>
          <span className="grow">
            <strong>{tr('Signed', 'Signiert')}</strong>
            <span className="muted small" style={{ display: 'block' }}>
              {new Date(round.signedAt).toLocaleString(getLang() === 'de' ? 'de-DE' : undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="muted small" style={{ display: 'block' }}>{tr('Counts in your statistics', 'Zählt in deiner Statistik')}</span>
          </span>
          <button type="button" className="icon-btn" aria-label={tr('Withdraw the signature', 'Signatur zurücknehmen')} title={tr('Withdraw the signature', 'Signatur zurücknehmen')} onClick={() => props.onChange(unsign(round))}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
        </>
      ) : (
        <>
          <span className="grow">
            <strong>{scoreOnly ? tr('Kept as a round', 'Als Runde behalten') : tr('Sign your round', 'Runde signieren')}</strong>
            <span className="muted small" style={{ display: 'block' }}>
              {scoreOnly
                ? tr('It does not count in your statistics – check and sign it to count.', 'Zählt nicht in deiner Statistik – prüfen und signieren, damit sie zählt.')
                : tr('Only signed rounds count in your statistics.', 'Nur signierte Runden zählen in deiner Statistik.')}
            </span>
          </span>
          {/* the same three ways as at the end of the round, also later from the list (Sascha 18.10.2026: "today's
              round is not listed under check & sign") */}
          {scoreOnly && canReview ? (
            <>
              <button type="button" className="btn-primary" onClick={() => props.onReview({ ...round, capture: 'full' })}>
                {tr('Check & sign', 'Prüfen & signieren')}
              </button>
              <button type="button" className="btn-secondary sign-later" onClick={() => props.onChange({ ...round, capture: 'full' })}>
                {tr('Check & sign later', 'Später prüfen & signieren')}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-primary" onClick={() => props.onChange(sign(round))}>
                {tr('Sign', 'Signieren')}
              </button>
              {canReview && (
                <button type="button" className="btn-secondary sign-later" onClick={() => props.onChange({ ...round, capture: 'score' })}>
                  {tr('Keep as a round', 'Als Runde behalten')}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  ) : null;

  return (
    <main className="screen">
      <TopBar title={tr('Scorecard', 'Scorekarte')} onBack={finished ? props.onClose : props.onBackToHole} backLabel={finished ? tr('Close', 'Schließen') : tr('Back to hole', 'Zurück zum Loch')} />
      {/* the player's photo at the top right, next to course and date (Sascha 16.10.2026: not in the table's
          name column, where it cut the name off) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 19px var(--display)' }}>{round.courseName}</div>
        <span className="muted small sc-sub">
          {[new Date(round.createdAt).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined), kindName(round.kind), loopsText(round.loopOrder)].filter(Boolean).join(' · ')}
          {round.tee && (
            <>
              {' · '}
              <span className="tee-dot" style={{ background: TEE_COLOURS[round.tee] ?? '#888' }} />
              {teeName(round.tee)}
            </>
          )}
        </span>
        {/* the weather the round was played in, from its holes (GOL-26) */}
        {roundWeatherText(round.entries[me.id]) && <span className="muted small sc-weather">{roundWeatherText(round.entries[me.id])}</span>}
      </div>
      {loadProfile().photo && round.players.some((p) => p.isMe) && <Avatar name={round.players.find((p) => p.isMe)!.name} me size={44} />}
      </div>

      {/* only when the round ends – a look at the score during the round needs no save / delete (Sascha 15.10.2026) */}
      {((!finished && props.finishing) || (finished && props.justFinished)) && !round.preview && (
        <section className="card finish-card">
          <strong>{finished ? tr('Round saved ✓', 'Runde gespeichert ✓') : tr('Finish the round', 'Runde abschließen')}</strong>
          <span className="muted small">
            {finished
              ? canReview
                ? tr(
                    'Check & sign: the shots checked, the round signed – it counts in your statistics. Or keep it as a round – it does not count.',
                    'Prüfen & signieren: Schläge prüfen, Runde signieren – sie zählt in deiner Statistik. Oder als Runde behalten – sie zählt nicht.',
                  )
                : tr('You find it under Rounds – or delete it.', 'Du findest sie unter Runden – oder lösche sie.')
              : tr('Save it for your stats – or delete it.', 'Speichere sie für deine Statistik – oder lösche sie.')}
          </span>
          {!confirmDelete ? (
            <div className="finish-actions">
              {!finished ? (
                <button type="button" className="btn-primary" onClick={() => props.onFinish({ ...round, finishedAt: new Date().toISOString(), capture: round.capture ?? 'score' })}>
                  {tr('Save & finish', 'Speichern & beenden')}
                </button>
              ) : (
                canReview && (
                  <button type="button" className="btn-primary" onClick={() => props.onReview({ ...round, capture: 'full' })}>
                    {tr('Check & sign', 'Prüfen & signieren')}
                  </button>
                )
              )}
              {/* check & sign later (Sascha 18.10.2026): the round waits under "prüfen & signieren" */}
              {finished && canReview && (
                <button type="button" className="btn-secondary" aria-pressed={!scoreOnly} onClick={() => props.onChange({ ...round, capture: 'full' })}>
                  {!scoreOnly ? tr('Check & sign later ✓', 'Später prüfen & signieren ✓') : tr('Check & sign later', 'Später prüfen & signieren')}
                </button>
              )}
              {finished && canReview && (
                <button type="button" className="btn-secondary" aria-pressed={scoreOnly} onClick={() => props.onChange({ ...round, capture: 'score' })}>
                  {scoreOnly ? tr('Kept as a round ✓', 'Als Runde behalten ✓') : tr('Keep as a round', 'Als Runde behalten')}
                </button>
              )}
              {/* one tap – "Undo" brings it back for a few seconds (Sascha 15.10.2026) */}
              <button
                type="button"
                className="btn-secondary btn-danger"
                onClick={() => {
                  deleteRound(round.id, true);
                  props.onDeleted();
                }}
              >
                {tr('Delete round', 'Runde löschen')}
              </button>
            </div>
          ) : (
            <div className="finish-actions">
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
                {tr('Keep', 'Behalten')}
              </button>
              <button
                type="button"
                className="btn-secondary btn-danger"
                onClick={() => {
                  deleteRound(round.id, true);
                  props.onDeleted();
                }}
              >
                {tr('Delete', 'Löschen')}
              </button>
            </div>
          )}
        </section>
      )}

      {round.signedAt && signCard}

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

      {round.players.length > 1 && <LeaderboardCard round={round} />}

      <ScoreTable round={round} onHole={setEditHole} />
      {!round.signedAt && signCard}

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
          <Stat label="GIR" value={`${stats.gir} / ${stats.girPossible}`} />
          <Stat label={tr('Penalties', 'Strafschläge')} value={String(stats.penalties)} />
          <Stat label={tr('Sand saves', 'Sand Saves')} value={`${stats.sandSaves} / ${stats.bunkerHoles}`} />
        </div>
      </section>

      {sg && <SgCard title={tr('Strokes gained this round', 'Strokes Gained dieser Runde')} values={sg.per18} shots={sg.shotsPer18} holes={sg.holes} base={round.holes.length <= 9 ? 9 : 18} defaultGroup={comparisonGroup(profileIndex() ?? playing18(round.holes.length, me.playingHandicap))} />}

      <span className="spacer" />
      {/* save and delete sit in the card at the top while the round is being finished */}
      {/* the round's actions in one row with their symbols (Sascha 18.10.2026): share, check the shots, delete */}
      {finished && !confirmDelete && (
        <div className="sc-actions" role="group" aria-label={tr('This round', 'Diese Runde')}>
          <button
            type="button"
            className="sc-action"
            onClick={() =>
              shareScorecard(round)
                .then((r) => setShareMsg(r === 'downloaded' ? tr('Picture saved – you find it in your downloads.', 'Bild gespeichert – du findest es bei deinen Downloads.') : null))
                .catch(() => setShareMsg(tr('The picture could not be made.', 'Das Bild konnte nicht erstellt werden.')))
            }
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 15V3M8 7l4-4 4 4" />
              <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
            </svg>
            <span>{tr('Share', 'Teilen')}</span>
          </button>
          {canReview && !props.justFinished && (
            <button type="button" className="sc-action" onClick={() => props.onReview({ ...round, capture: 'full' })}>
              <CheckShotsIcon size={22} />
              <span>{tr('Check shots', 'Schläge prüfen')}{round.entries[me.id].some((e) => e.detail?.shots.some((s) => s.review)) ? ' ·' : ''}</span>
            </button>
          )}
          {!props.justFinished && (
            <button
              type="button"
              className="sc-action danger"
              onClick={() => {
                deleteRound(round.id, true);
                props.onDeleted();
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
              </svg>
              <span>{tr('Delete', 'Löschen')}</span>
            </button>
          )}
        </div>
      )}
      {shareMsg && <p className="muted small" style={{ margin: 0 }}>{shareMsg}</p>}
      {finished && !props.justFinished && (!confirmDelete ? null : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>{tr('Delete this round? It stays under "Deleted rounds".', 'Diese Runde löschen? Sie bleibt unter „Gelöschte Runden“.')}</span>
          <div className="nav-bottom" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              {tr('Keep', 'Behalten')}
            </button>
            <button
              type="button"
              className="btn-secondary btn-danger"
              onClick={() => {
                deleteRound(round.id, true);
                props.onDeleted();
              }}
            >
              {tr('Delete', 'Löschen')}
            </button>
          </div>
        </div>
      ))}
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
