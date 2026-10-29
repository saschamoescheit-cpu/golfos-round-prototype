import { lazy, Suspense, useEffect, useState } from 'react';
import type { Round } from '../types';
import { ensureGeometry, geometryReady } from '../lib/storage';
import { formDef, holeTeams, standingOf, type Game, type HoleExtra } from '../lib/gameforms';
import { sharingAvailable, stamp } from '../lib/sharedgame';
import { InviteSheet, useGameExchange } from '../components/ShareGame';
import { emptyEntry } from '../lib/scoring';
import { tr } from '../lib/i18n';
import { FormRules, HoleExtras, PressCard, ScoreGrid, StandingCard } from './Games';

// Games on the GPS map (Sascha 16.10.2026: "every game with the map and all its functions like a normal round – only
// the score entry differs"): a game carries a round; the round's hole screen (map, caddie, hole bar, overview, pause
// and finish) is the game's screen. The strokes come from the round's score entry; what the form needs on a hole
// (wolf partner, pairing, press …) and the standing are in the game sheet – a bar over the hole bar opens it.

const HoleScreen = lazy(() => import('./HoleScreen').then((m) => ({ default: m.HoleScreen })));

/** A new round for a game: the game's players and holes, nothing entered. */
export function roundForGame(g: Omit<Game, 'round'>, course: { id: string; name: string }, holes: Round['holes'], loops: string[]): Round {
  const players = g.players.map((p, k) => ({ id: p.id, name: p.name, playingHandicap: p.hcp, isMe: k === 0 }));
  return {
    id: `gr-${g.id}`,
    createdAt: g.createdAt,
    finishedAt: null,
    courseId: course.id,
    courseName: course.name,
    loopOrder: loops,
    holes,
    mode: 'quick',
    players,
    entries: Object.fromEntries(players.map((p) => [p.id, holes.map(() => emptyEntry())])),
    currentHole: 0,
  };
}

/** The game's strokes from its round (a picked-up hole: no score for the game) – a changed score gets its time
 *  stamp, so a shared game keeps the later entry. */
export function withRound(g: Game, r: Round): Game {
  let next: Game = { ...g, round: r, current: r.currentHole };
  const scores: Game['scores'] = {};
  for (const p of g.players) {
    scores[p.id] = g.holes.map((_, i) => {
      const e = r.entries[p.id]?.[i];
      const v = e ? (e.pickedUp ? null : e.strokes) : null;
      if (v !== (g.scores[p.id]?.[i] ?? null)) next = stamp(next, `s:${p.id}:${i}`);
      return v;
    });
  }
  return { ...next, scores };
}

/** Scores that came from the other phones into the round's entries (a shared game). */
function scoresIntoRound(g: Game): Game {
  if (!g.round) return g;
  const r = g.round;
  let changed = false;
  const entries = { ...r.entries };
  for (const p of g.players) {
    entries[p.id] = (r.entries[p.id] ?? []).map((e, i) => {
      const v = g.scores[p.id]?.[i] ?? null;
      if (e.pickedUp || (e.strokes ?? null) === v) return e;
      changed = true;
      return { ...e, strokes: v };
    });
  }
  return changed ? { ...g, round: { ...r, entries } } : g;
}

export function GameOnMap(props: {
  game: Game;
  onChange: (g: Game) => void;
  onPause: () => void;
  onFinish: (g: Game) => void;
  onDelete: (g: Game) => void;
  onOpenBag?: (part: 'bag' | 'caddie') => void;
}) {
  const g = props.game;
  const r = g.round!;
  const [ready, setReady] = useState(geometryReady(r.courseId));
  const [sheet, setSheet] = useState<null | 'game' | 'card'>(null);
  const [canShare, setCanShare] = useState(false);
  const [invite, setInvite] = useState(false);
  useEffect(() => {
    sharingAvailable().then(setCanShare);
  }, []);
  useEffect(() => {
    if (!ready) ensureGeometry(r.courseId).then(() => setReady(true));
  }, [ready, r.courseId]);
  // a shared game: exchange with the other phones every 5 s – the others' scores into the round's entries, and the
  // round as it is now (a score, a shot or the GPS track that came meanwhile stays)
  useGameExchange(g, props.onChange, scoresIntoRound);
  if (!ready) return <main className="screen"><p className="muted">{tr('Loading the course …', 'Platz wird geladen …')}</p></main>;
  const f = formDef(g.form);
  const st = standingOf(g);
  const i = r.currentHole;
  const lead = st.rows[0];
  // the sides of this hole as two coloured teams; the bar's line then says the hole and who leads
  const sides = holeTeams(g, i);
  const meId = g.shared?.me ?? r.players.find((p) => p.isMe)?.id;
  const teams = sides ? (sides.map((ids) => ids.map((id) => ({ name: g.players.find((p) => p.id === id)?.name ?? '?', me: id === meId }))) as [{ name: string; me: boolean }[], { name: string; me: boolean }[]]) : null;
  const leadText = lead && lead.points !== 0 ? `${lead.name} ${lead.value}` : '';
  const line = teams ? [tr(`Hole ${r.holes[i]?.label ?? ''}`, `Loch ${r.holes[i]?.label ?? ''}`), leadText].filter(Boolean).join(' · ') : (st.status ?? (lead ? `${lead.name} ${lead.value}` : ''));
  const setExtra = (patch: Partial<HoleExtra>) => props.onChange(stamp({ ...g, extra: g.extra.map((e, k) => (k === i ? { ...e, ...patch } : e)) }, `x:${i}`));
  return (
    <>
      <Suspense fallback={<main className="screen" />}>
        <HoleScreen
          round={r}
          onChange={(nr) => props.onChange(withRound(g, nr))}
          onExit={props.onPause}
          onEnd={(nr) => props.onFinish(withRound(g, { ...nr, finishedAt: new Date().toISOString() }))}
          onAbort={() => props.onDelete(g)}
          onShowScorecard={(nr, finishing) => (finishing ? props.onFinish(withRound(g, { ...nr, finishedAt: new Date().toISOString() })) : setSheet('card'))}
          onOpenBag={props.onOpenBag}
          game={{ name: f.name(), line, teams, onOpen: () => setSheet('game'), onInvite: canShare ? () => setInvite(true) : null, shared: g.shared?.code ?? null }}
        />
      </Suspense>
      {invite && <InviteSheet game={g} onShared={props.onChange} onClose={() => setInvite(false)} />}
      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <section className="sheet game-sheet" role="dialog" aria-label={sheet === 'game' ? f.name() : tr('Scorecard', 'Scorekarte')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{sheet === 'game' ? `${f.name()} · ${tr('Hole', 'Loch')} ${g.holes[i]?.label ?? ''}` : tr('Scorecard', 'Scorekarte')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setSheet(null)}>
                ✕
              </button>
            </div>
            {sheet === 'game' ? (
              <>
                <HoleExtras game={g} hole={i} onChange={setExtra} />
                {g.settings.double && Number(g.settings.stake) > 0 && <PressCard game={g} hole={i} onChange={props.onChange} />}
                <StandingCard game={g} />
                {/* the rules during the game (the menu has no rules tab any more – Sascha 16.10.2026) */}
                <details className="card game-rules-box">
                  <summary>{tr(`Rules of ${f.name()}`, `Regeln: ${f.name()}`)}</summary>
                  <FormRules form={f} />
                </details>
              </>
            ) : (
              <>
                <ScoreGrid game={g} />
                <StandingCard game={g} />
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
