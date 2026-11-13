import { Avatar } from '../components/Avatar';
import { goTour } from '../lib/nav';
import { loadProfile } from '../lib/profile';
import { useEffect, useRef, useState } from 'react';
import type { Round } from '../types';
import { checksShots, fmtHcp, playerTotals, playing18, roundStats, finishRound } from '../lib/scoring';
import { deleteRound, loadRounds } from '../lib/storage';
import { TopBar, formatToPar } from '../components/ui';
import { FloatActions } from '../components/FloatActions';
import { SgCard } from '../components/SgCard';
import { ScoreTable } from '../components/ScoreTable';
import { LeaderboardCard } from '../components/Leaderboard';
import { EventBoardCard, SignCard, useDiffers, useShareViews } from '../components/ShareRound';
import { isTeamRound } from '../lib/games';
import { pickUpAllowed, ScoreSheet } from '../components/ScoreSheet';
import { RoundSummaryCard } from '../components/RoundSummaryCard';
import { RoundReportCard } from '../components/RoundReportCard';
import { shareScorecard } from '../lib/shareCard';
import { buildExport, exportFileName, shareExport } from '../lib/roundexport';
import { loadTrack } from '../lib/track';
import { loadCaddieLog } from '../lib/caddielog';
import { TEE_COLOURS, teeName } from '../data/tees';
import { PlayedHcpCard } from '../components/PlayedHcp';
import { comparisonGroup, roundsSg } from '../lib/sg';
import { loopsText } from '../lib/loops';
import { kindName } from '../lib/roundkind';
import { getLang, tr } from '../lib/i18n';
import { sign, unsign } from '../lib/signing';
import { SignedIcon } from '../components/SignedIcon';
import { PlayedIcon, ToSignIcon } from '../components/RoundIcons';
import { profileIndex } from '../lib/profile';
import { roundWeatherText } from '../lib/weather';
import { betLinked } from '../lib/betlinked';

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
  justSigned?: boolean; // signed with the last step of the check: the round report on top (Sascha 22.10.2026)
  onOpenTraining?: () => void;
  /** the course tapped (a finished round): its statistics */
  onOpenCourse?: (courseName: string) => void;
}) {
  const { round } = props;
  // on several phones: the players this phone counts as their marker (its entries of them are its counts)
  const marked = round.players.filter((p) => round.shared?.roles?.[p.id] === 'mark').map((p) => p.name);
  const [editHole, setEditHole] = useState<number | null>(null);
  // swiped sideways in the hole's panel: the next or the previous hole (Sascha 12.11.2026: "wenn ich eine Scorekarte
  // nachträglich bearbeite, wäre es praktisch, wenn man die Löcher durchkippen könnte, anstatt andauernd zurückzugehen")
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  const swipeEnd = (x: number, y: number) => {
    const s = swipeFrom.current;
    swipeFrom.current = null;
    if (!s || editHole == null) return;
    const dx = x - s.x;
    const dy = y - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const k = editHole + (dx < 0 ? 1 : -1);
    if (k >= 0 && k < round.holes.length) setEditHole(k);
  };
  const differ = useDiffers(round);
  // a shared round: who keeps which score – the others' shown, not changed here, as on the course (Sascha 08.11.2026)
  const views = useShareViews(round);
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
  // The round's state on top, above the result (Sascha 20.10.2026: "the state above the scorecard – changed from there,
  // that saves the single buttons"): signed / to check & sign / saved only; a tap opens the ways to change it.
  // right after finishing the choice opens by itself – how it goes on (Sascha 22.10.2026)
  const [statusOpen, setStatusOpen] = useState(() => !!props.justFinished && !round.signedAt && !round.preview && round.finishedAt != null);
  // finished on this scorecard (past the last hole): the same screen with the finished round – open it then too
  useEffect(() => {
    if (props.justFinished && !round.signedAt && !round.preview && round.finishedAt != null) setStatusOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.justFinished, round.finishedAt]);
  const signed = !!round.signedAt;
  const lastSign = [...(round.signLog ?? [])].reverse().find((x) => x.how !== 'withdraw');
  const signedHow =
    signed && lastSign
      ? [
          lastSign.device ? tr(`on the ${lastSign.device}`, `auf dem ${lastSign.device}`) : '',
          lastSign.how === 'check' ? tr('with the last step of the check', 'beim letzten Prüfschritt') : lastSign.how === 'confirm' ? tr('with "Confirm round"', 'mit „Runde bestätigen“') : tr('here in the state', 'hier im Status'),
        ]
          .filter(Boolean)
          .join(' ')
          .replace(/^./, (c) => c.toUpperCase())
      : null;
  const status = signed
    ? { icon: <SignedIcon size={22} />, title: tr('Signed', 'Signiert'), sub: `${new Date(round.signedAt!).toLocaleString(getLang() === 'de' ? 'de-DE' : undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${tr('counts in your statistics', 'zählt in deiner Statistik')}` }
    : !scoreOnly
      ? { icon: <ToSignIcon size={22} />, title: tr('Check & sign', 'Prüfen & signieren'), sub: tr('open – it counts once signed', 'offen – zählt, sobald signiert') }
      : { icon: <PlayedIcon size={22} />, title: tr('Saved only', 'Nur gespeichert'), sub: tr('does not count in your statistics', 'zählt nicht in deiner Statistik') };
  const choose = (r: Round) => {
    setStatusOpen(false);
    props.onChange(r);
  };
  const attention = !!props.justFinished && !signed;
  const statusRow = finished && !round.preview ? (
    <>
      <button type="button" className={`card sc-status${signed ? ' signed' : ''}${attention ? ' attention' : ''}`} aria-label={tr(`State of the round: ${status.title} – change`, `Status der Runde: ${status.title} – ändern`)} onClick={() => setStatusOpen(true)}>
        <span className="sc-status-icon" aria-hidden="true">{status.icon}</span>
        <span className="grow">
          <strong>{attention ? `${tr('Round saved', 'Runde gespeichert')} · ${status.title}` : status.title}</strong>
          <span className="muted small">{attention ? tr('Tap to choose how it goes on', 'Antippen: wie es weitergeht') : status.sub}</span>
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {statusOpen && (
        <div className="sheet-backdrop" onClick={() => setStatusOpen(false)}>
          <section className="sheet" role="dialog" aria-label={tr('State of the round', 'Status der Runde')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{attention ? tr('Round saved. How does it go on?', 'Runde gespeichert. Wie geht es weiter?') : tr('State of the round', 'Status der Runde')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setStatusOpen(false)}>
                ✕
              </button>
            </div>
            <div className="pick-list">
              {signed ? (
                <>
                  <button type="button" className="pick-option" aria-pressed onClick={() => setStatusOpen(false)}>
                    <span className="grow">
                      <strong>{tr('Signed', 'Signiert')}</strong>
                      <span className="muted small">{status.sub}</span>
                      {/* where the signature came from (Sascha 28.10.2026: a round "jumped to signed by itself") */}
                      {signedHow && <span className="muted small sign-how">{signedHow}</span>}
                    </span>
                    <span className="pick-check" aria-hidden="true">✓</span>
                  </button>
                  <button type="button" className="pick-option" onClick={() => choose(unsign(round))}>
                    <span className="grow">
                      <strong>{tr('Withdraw the signature', 'Signatur zurücknehmen')}</strong>
                      <span className="muted small">{tr('It no longer counts in your statistics.', 'Sie zählt dann nicht mehr in deiner Statistik.')}</span>
                    </span>
                  </button>
                </>
              ) : (
                <>
                  {canReview && (
                    // right after finishing "now" is the choice (Sascha 22.10.2026: "the standard is always check & sign now")
                    <button
                      type="button"
                      className="pick-option"
                      aria-pressed={attention}
                      onClick={() => {
                        setStatusOpen(false);
                        props.onReview({ ...round, capture: 'full' });
                      }}
                    >
                      <span className="grow">
                        <strong>{tr('Check & sign now', 'Jetzt prüfen & signieren')}</strong>
                        <span className="muted small">{tr('Check the shots, then sign – it counts in your statistics.', 'Schläge prüfen, dann signieren – sie zählt in deiner Statistik.')}</span>
                      </span>
                      {attention ? <span className="pick-check" aria-hidden="true">✓</span> : <span aria-hidden="true">›</span>}
                    </button>
                  )}
                  {(!canReview || !scoreOnly) && (
                    <button type="button" className="pick-option" onClick={() => choose(sign(round))}>
                      <span className="grow">
                        <strong>{tr('Sign', 'Signieren')}</strong>
                        <span className="muted small">{tr('As it is – it counts in your statistics.', 'So wie sie ist – sie zählt in deiner Statistik.')}</span>
                      </span>
                    </button>
                  )}
                  {canReview && (
                    <button type="button" className="pick-option" aria-pressed={!scoreOnly && !attention} onClick={() => choose({ ...round, capture: 'full' })}>
                      <span className="grow">
                        <strong>{tr('Check & sign later', 'Später prüfen & signieren')}</strong>
                        <span className="muted small">{tr('It waits under "check & sign".', 'Sie wartet unter „prüfen & signieren“.')}</span>
                      </span>
                      {!scoreOnly && !attention && <span className="pick-check" aria-hidden="true">✓</span>}
                    </button>
                  )}
                  {canReview && (
                    <button type="button" className="pick-option" aria-pressed={scoreOnly} onClick={() => choose({ ...round, capture: 'score' })}>
                      <span className="grow">
                        <strong>{tr('Save only', 'Nur speichern')}</strong>
                        <span className="muted small">{tr('Under "played" – it does not count in your statistics.', 'Unter „gespielt“ – sie zählt nicht in deiner Statistik.')}</span>
                      </span>
                      {scoreOnly && <span className="pick-check" aria-hidden="true">✓</span>}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  ) : null;

  return (
    <main className="screen">
      <TopBar title={tr('Scorecard', 'Scorekarte')} onBack={finished ? props.onClose : props.onBackToHole} backLabel={finished ? tr('Close', 'Schließen') : tr('Back to hole', 'Zurück zum Loch')} />
      {/* the player's photo at the top right, next to course and date (Sascha 16.10.2026: not in the table's
          name column, where it cut the name off) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {finished && props.onOpenCourse ? (
          <button type="button" className="link-text" style={{ font: '600 19px var(--display)', textDecoration: 'none' }} aria-label={tr(`${round.courseName} – statistics`, `${round.courseName} – Statistik`)} onClick={() => props.onOpenCourse!(round.courseName)}>
            {round.courseName} <span className="muted" aria-hidden="true">›</span>
          </button>
        ) : (
          <div style={{ font: '600 19px var(--display)' }}>{round.courseName}</div>
        )}
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


      {statusRow}

      <section className="card sc-hero">
        {/* whose the big figures are, on top – the partners below (Sascha 12.11.2026: "Sascha should stand on top with his score, below the other players") */}
        {round.players.length > 1 && (
          <div className="sc-hero-name">
            <strong>{me.name}</strong>
            {me.playingHandicap != null && <span className="muted small"> · {tr('hcp', 'SV')} {fmtHcp(me.playingHandicap)}</span>}
          </div>
        )}
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
                {/* in columns – strokes, to par, points under each other (Sascha 11.11.2026: "79 und 92 untereinander ausgerichtet") */}
                <strong className="sc-o-num">{t.holesPlayed ? t.gross : '–'}</strong>
                <span className="muted small sc-o-num">{t.holesPlayed ? formatToPar(t.toPar) : ''}</span>
                <span className="muted small sc-o-num">{t.stableford != null ? `${t.stableford} ${tr('pts', 'Pkt.')}` : ''}</span>
              </div>
            );
          })}
      </section>

      {/* the board of all phones as last exchanged – own scores ranked, a marker's differing count flagged; a
          tournament all flights (Sascha 29.10.2026: "a scorecard with both players and their scores") */}
      {round.shared && <EventBoardCard code={round.shared.code} myFlight={round.shared.flight} refresh onOpenTour={finished ? () => goTour(round.shared!.code) : undefined} />}
      {round.shared && <SignCard round={round} onHole={setEditHole} onChange={props.onChange} />}
      {round.players.length > 1 && !round.shared && <LeaderboardCard round={round} />}
      {round.shared && marked.length > 0 && (
        <span className="muted small">
          {tr(
            `The card below: your own score and your count of ${marked.join(', ')} as marker – their own scores are on the board above.`,
            `Die Karte unten: dein eigener Score und deine Zählung von ${marked.join(', ')} als Zähler – deren eigene Scores stehen oben im Live-Stand.`,
          )}
        </span>
      )}

      <ScoreTable round={round} onHole={setEditHole} differ={differ} />

      {/* a hole tapped on the card (or its pencil, an empty hole): the same score panel as on the course – strokes, putts,
          sand shots, penalties, tee shot (Sascha 20.10.2026: "the same menu as on a round") */}
      {editHole != null && (
        <div
          className="score-panel-screen"
          onPointerDown={(e) => (swipeFrom.current = { x: e.clientX, y: e.clientY })}
          onPointerUp={(e) => swipeEnd(e.clientX, e.clientY)}
          onPointerCancel={() => (swipeFrom.current = null)}
          onTouchStart={(e) => (swipeFrom.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => swipeEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY)}
        >
          <ScoreSheet
            key={editHole}
            hole={round.holes[editHole]}
            players={round.players}
            entries={Object.fromEntries(round.players.map((p) => [p.id, round.entries[p.id][editHole]]))}
            toPar={Object.fromEntries(
              round.players.map((p) => {
                const t = playerTotals(round.holes, round.entries[p.id], p.playingHandicap);
                return [p.id, t.holesPlayed ? t.toPar : null];
              }),
            )}
            canPlacePutts={false}
            team={isTeamRound(round)}
            pickUp={pickUpAllowed(round)}
            details={(pid) => betLinked(round) && (round.shared?.roles?.[pid] === 'mark' || round.shared?.roles?.[pid] === 'free')}
            shared={Object.fromEntries(
              Object.entries(views).map(([pid, v]) => [
                pid,
                { keptBy: v.role === 'view' ? (v.keptBy ?? '') : null, other: v.other ? { label: v.other.label, cell: v.other.cells[editHole] ?? null } : undefined, locked: v.locked },
              ]),
            )}
            onChange={(pid, patch) =>
              props.onChange({ ...round, entries: { ...round.entries, [pid]: round.entries[pid].map((e, k) => (k === editHole ? { ...e, ...patch } : e)) } })
            }
            onPlacePutts={() => undefined}
            onClose={() => setEditHole(null)}
            closeLabel={tr('Back to the scorecard', 'Zurück zur Scorekarte')}
          />
          {/* the arrows of the app's hole bar below it, besides the swipe (Sascha 13.11.2026: "zusätzlich unten mit Pfeilen
              im Stil der App für links und rechts") */}
          <div className="hole-nav score-panel-nav" role="group" aria-label={tr('Holes', 'Löcher')}>
            <button type="button" className="icon-btn hole-step" aria-label={tr('Previous hole', 'Voriges Loch')} disabled={editHole === 0} onClick={() => setEditHole(Math.max(0, editHole - 1))}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <span className="muted small">
              {tr(`Hole ${round.holes[editHole]?.label} of ${round.holes.length}`, `Loch ${round.holes[editHole]?.label} von ${round.holes.length}`)}
            </span>
            <button type="button" className="icon-btn hole-step" aria-label={tr('Next hole', 'Nächstes Loch')} disabled={editHole === round.holes.length - 1} onClick={() => setEditHole(Math.min(round.holes.length - 1, editHole + 1))}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <PlayedHcpCard round={round} onChange={props.onChange} />

      {finished && round.signedAt && <RoundReportCard round={round} history={loadRounds()} highlight={props.justSigned} onOpenTraining={props.onOpenTraining} />}
      {finished && <RoundSummaryCard round={round} history={loadRounds()} />}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="eyebrow">{tr('Your stats', 'Deine Statistik')}</span>
        <div className="stat-grid">
          <Stat label="Putts" value={String(stats.putts)} />
          <Stat label={tr('Fairways hit', 'Fairways getroffen')} value={`${stats.fairwaysHit} / ${stats.fairwaysPossible}`} />
          <Stat label="GIR" value={`${stats.gir} / ${stats.girPossible}`} />
          <Stat label={tr('Penalties', 'Strafschläge')} value={String(stats.penalties)} />
          <Stat label={tr('Sand saves', 'Sand Saves')} value={`${stats.sandSaves} / ${stats.bunkerHoles}`} />
        </div>
      </section>

      {sg && <SgCard title={tr('Strokes gained this round', 'Strokes Gained dieser Runde')} values={sg.per18} shots={sg.shotsPer18} holes={sg.holes} base={round.holes.length <= 9 ? 9 : 18} defaultGroup={comparisonGroup(profileIndex() ?? playing18(round.holes.length, me.playingHandicap))} />}

      {/* only when the round ends – a look at the score during the round needs no save / delete (Sascha 15.10.2026);
          at the end of the page, below the statistics (Sascha 20.10.2026) */}
      {/* while finishing (Sascha 15.10.2026): save or delete – at the end of the page, below the statistics (20.10.2026) */}
      {!finished && props.finishing && !round.preview && (
        <section className="card finish-card">
          <strong>{tr('Finish the round', 'Runde abschließen')}</strong>
          <span className="muted small">{tr('Save it for your stats – or delete it.', 'Speichere sie für deine Statistik – oder lösche sie.')}</span>
          {/* as when finishing on the course (Sascha 13.11.2026: "mit Icons darstellen wie an anderen Stellen"): deleting as a
              red tile with its sign, then the one main button. One tap deletes – "Rückgängig" brings it back (15.10.2026) */}
          <div className="sc-actions" role="group" aria-label={tr('Finish the round', 'Runde abschließen')}>
            <button
              type="button"
              className="sc-action danger"
              aria-label={tr('Delete round', 'Runde löschen')}
              onClick={() => {
                deleteRound(round.id, true);
                props.onDeleted();
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
              </svg>
              <span>{tr('Delete', 'Löschen')}</span>
            </button>
          </div>
          <button type="button" className="btn-primary" onClick={() => props.onFinish(finishRound(round, !canReview))}>
            {tr('Save & finish', 'Speichern & beenden')}
          </button>
        </section>
      )}

      <span className="spacer" />
      {/* the round's actions in one row with their symbols (Sascha 18.10.2026), in this order (20.10.2026): check the shots, share, export, delete */}
      {/* "Schläge prüfen" floating bottom right (Sascha 12.11.2026: "Hier wäre ein Schwebebalken für Schläge prüfen gut") –
          the round's other actions stay in the row below */}
      {finished && canReview && editHole == null && <FloatActions pen={{ label: tr('Check shots', 'Schläge prüfen'), onClick: () => props.onReview({ ...round, capture: 'full' }) }} />}
      {finished && (
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
          {/* the round as a file – score, the shots noted by hand, the GPS track – for the analysis in the Dropbox (Sascha 18.10.2026) */}
          {!round.preview && (
            <button
              type="button"
              className="sc-action"
              onClick={() =>
                shareExport(buildExport({ app: __BUILD_TIME__, round, track: loadTrack(round.id), caddieLog: loadCaddieLog(round.id), detectedNow: [] }), exportFileName(round))
                  .then((r) => setShareMsg(r === 'downloaded' ? tr('Round data saved as a file (Downloads).', 'Rundendaten als Datei gespeichert (Downloads).') : null))
                  .catch(() => setShareMsg(tr('The file could not be made.', 'Die Datei konnte nicht erstellt werden.')))
              }
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12M8 11l4 4 4-4" />
                <path d="M5 21h14" />
              </svg>
              <span>Export</span>
            </button>
          )}
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
        </div>
      )}
      {shareMsg && <p className="muted small" style={{ margin: 0 }}>{shareMsg}</p>}
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
