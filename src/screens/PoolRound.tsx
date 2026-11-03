import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Course, Round } from '../types';
import { tr } from '../lib/i18n';
import { buildRoundHoles, loopOptions } from '../lib/loops';
import { ensureGeometry, geometryReady, loadGeometry, newId } from '../lib/storage';
import { courseTees, defaultTee, profileTee } from '../data/tees';
import { inUsa } from '../lib/weather';
import { parseIndex, playingHandicapFor, ratingFor, saveOwnRating } from '../lib/handicap';
import { isLady, loadProfile } from '../lib/profile';
import { loadFriends } from '../lib/friends';
import { emptyEntry } from '../lib/scoring';
import { dayOf, poolNeedsDetails, provisional, sameName, stateOf } from '../lib/wagers';
import { loadPools, reportWagers } from '../lib/wagerstore';
import { dropPoolRound, finishPoolRound, keepPoolRound, poolRoundEntry, setPoolRoundEntry } from '../lib/poolround';
import { ChoiceRow, SettingsList } from '../components/Settings';
import { TopBar } from '../components/ui';
import { Standings } from './Wagers';
import { PlayerRow, RatingLine, teeChoicesFor } from './RoundSetup';

// A round started from a pool of bets (Sascha 02.11.2026: "start the round right from the bet – else again through
// Rounds, the players set up again"): the course (the pool's round of the day, if it has one), the loop, the pool's
// players with their handicap – then played on the map as a game in Games; the bets judged live from it.

const PUTT_KINDS: string[] = ['greens', 'putts', 'oneputts', 'threeputts', 'updowns'];
const PUTT_METRICS: string[] = ['putts', 'onePutt', 'threePutt', 'green', 'upDown', 'sandSave'];

const HoleScreen = lazy(() => import('./HoleScreen').then((m) => ({ default: m.HoleScreen })));

interface Who {
  id: string;
  name: string;
  hcp: string;
  on: boolean;
  /** his tee – unset: the own tee for this phone's owner, the course's default for the others */
  tee?: string | null;
}

export function PoolRoundSetup(props: { code: string; course: Course | null; onCourse: () => void; onBack: () => void; onStart: (r: Round) => void }) {
  const entry = loadPools().find((e) => e.code === props.code);
  const pool = entry?.pool;
  const course = props.course;
  const options = useMemo(() => (course ? loopOptions(course.holes) : []), [course]);
  const [optionId, setOptionId] = useState(options[0]?.id ?? '');
  useEffect(() => setOptionId(options[0]?.id ?? ''), [options]);
  const option = options.find((o) => o.id === optionId) ?? options[0];
  const holes = course && option ? buildRoundHoles(course.holes, option) : [];
  // the pool's players – this phone's owner first; the handicap from the profile, a friend of the same name
  const [who, setWho] = useState<Who[]>(() => {
    const friends = loadFriends();
    const prof = loadProfile();
    const ps = pool?.players ?? [];
    const me = ps.find((p) => p.id === entry?.me);
    // the HCP typed in the pool's setup counts for the others (03.11.2026); yours always the profile's
    return [...(me ? [me] : []), ...ps.filter((p) => p !== me)].map((p) => ({ id: p.id, name: p.name, hcp: p === me ? (prof.hcpIndex || p.hcp || '') : (p.hcp?.trim() || friends.find((f) => sameName(f.name, p.name))?.hcp || ''), on: true }));
  });
  const [, setRatingsSeen] = useState(0);
  // the score entry, as "Score-Erfassung" in "Neue Runde": what the bets need set, the details always possible
  const [chosenEntry, setChosenEntry] = useState<'strokes' | 'details' | null>(null);
  if (!pool || !entry) return null;
  const needsDetails = !!course && poolNeedsDetails(pool, { day: dayOf(new Date()), course: course.name, courseId: course.id });
  const scoreEntry: 'strokes' | 'details' = needsDetails ? 'details' : (chosenEntry ?? 'strokes');
  const offered = course ? courseTees(course.id, loadGeometry(course.id).teeColours) : null;
  const lady = isLady();
  const startTee = offered ? defaultTee(offered.tees) : null;
  const myTee = offered && course ? (profileTee(offered, loadProfile().tee, course.id, inUsa([course.lon, course.lat])) ?? defaultTee(offered.tees, lady)) : null;
  const playing = who.filter((p) => p.on);
  // the players as in Rounds (Sascha 02.11.2026: "the players and the flight look different from Rounds"): a row each
  // with name, tee, HCP and playing handicap; the pool's names stay as they are – the bets know them by them
  const teeOf = (p: Who) => (p.tee && offered?.tees.includes(p.tee) ? p.tee : p.id === entry.me ? myTee : startTee);
  const nine = holes.length === 9;
  const teeChoices = course && offered ? teeChoicesFor(course.id, holes, offered.tees) : [];
  const ratingOf = (p: Who) => (course && (holes.length === 18 || nine) ? ratingFor(course.id, teeOf(p) ?? '–', holes, p.id === entry.me && lady) : null);
  const playingOf = (p: Who) => (course && parseIndex(p.hcp) != null ? playingHandicapFor(course.id, holes, teeOf(p) ?? '–', p.hcp, p.id === entry.me && lady) : null);
  const ok = !!course && holes.length > 0 && playing.length > 0 && playing.some((p) => p.id === entry.me);
  const start = () => {
    if (!course || !ok) return;
    const players = playing.map((p) => {
      const mine = p.id === entry.me;
      const tee = teeOf(p) ?? undefined;
      return { id: p.id, name: p.name, playingHandicap: parseIndex(p.hcp) == null ? null : playingHandicapFor(course.id, holes, tee ?? '–', p.hcp, mine && lady), isMe: mine, ...(tee ? { tee } : {}) };
    });
    const id = `pr-${newId()}`;
    props.onStart({
      id,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      courseId: course.id,
      courseName: course.name,
      loopOrder: option!.loops,
      holes,
      mode: 'quick',
      players,
      entries: Object.fromEntries(players.map((p) => [p.id, holes.map(() => emptyEntry())])),
      currentHole: 0,
    });
    setPoolRoundEntry(id, scoreEntry); // kept beside the round the moment it is kept
  };
  return (
    <main className="screen">
      <TopBar title={tr('Start the round', 'Runde starten')} onBack={props.onBack} />
      <span className="muted small">{tr(`For the bets "${pool.name}" – the bets are judged live from this round.`, `Für die Wetten „${pool.name}“ – die Wetten werden live aus dieser Runde ausgewertet.`)}</span>
      <section className="setup-part">
        <span className="eyebrow">{tr('Course', 'Platz')}</span>
        <div className="settings-list">
          <button type="button" className="settings-row" onClick={props.onCourse}>
            <span>{tr('Course', 'Platz')}</span>
            <span className={`settings-value${course ? '' : ' good-text'}`}>{course?.name ?? tr('Choose a course', 'Platz wählen')}</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </section>
      {course && options.length > 1 && (
        <section className="setup-part">
          <span className="eyebrow">{tr('Holes', 'Löcher')}</span>
          <div className="choice-grid">
            {options.map((o) => (
              <button key={o.id} type="button" className="choice choice-loop" aria-pressed={o.id === option?.id} onClick={() => setOptionId(o.id)}>
                <strong>{o.label.split(' · ')[0]}</strong>
                {o.label.includes(' · ') && <span className="small muted">{o.label.split(' · ').slice(1).join(' · ')}</span>}
              </button>
            ))}
          </div>
        </section>
      )}
      {/* course rating and slope over the players, as in Rounds */}
      {course && (holes.length === 18 || nine) && playing[0] && (
        <RatingLine
          rating={ratingOf(playing.find((p) => p.id === entry.me) ?? playing[0])}
          nine={nine}
          onSave={(v) => {
            saveOwnRating(course.id, teeOf(playing.find((p) => p.id === entry.me) ?? playing[0]) ?? '–', holes, v);
            setRatingsSeen((k) => k + 1);
          }}
        />
      )}
      <section className="setup-part">
        <span className="eyebrow">{tr('Players', 'Spieler')}</span>
        {playing.map((p, k) => (
          <PlayerRow
            key={p.id}
            className="game-player-row pool-round-player"
            player={{ id: `pr${p.id}`, name: p.name, index: p.hcp, handicap: '', tee: teeOf(p) }}
            nameLabel={p.id === entry.me ? tr('You', 'Du') : tr(`Player ${k + 1}`, `Spieler ${k + 1}`)}
            nameFixed
            rating={ratingOf(p)}
            playing={playingOf(p)}
            nine={nine}
            tees={teeChoices.length ? teeChoices : undefined}
            onChange={(np) => setWho(who.map((x) => (x.id === p.id ? { ...x, hcp: np.index, tee: np.tee } : x)))}
            onRemove={p.id === entry.me ? undefined : () => setWho(who.map((x) => (x.id === p.id ? { ...x, on: false } : x)))}
          />
        ))}
        {/* those of the pool not playing this round: back with a tap, as the friends in Rounds */}
        {who.some((p) => !p.on) && (
          <div className="chip-set" role="group" aria-label={tr('More players of the pool', 'Weitere Spieler des Pools')}>
            {who
              .filter((p) => !p.on)
              .map((p) => (
                <button key={p.id} type="button" className="chip" onClick={() => setWho(who.map((x) => (x.id === p.id ? { ...x, on: true } : x)))}>
                  + {p.name}
                </button>
              ))}
          </div>
        )}
        <span className="muted small">{tr('Who plays with you on this phone – you enter their scores too.', 'Wer mit dir spielt – du erfasst ihre Scores auf diesem Handy mit.')}</span>
      </section>
      <section className="setup-part">
        <span className="eyebrow">{tr('Score entry', 'Score-Erfassung')}</span>
        <SettingsList>
          <ChoiceRow<'strokes' | 'details'>
            label={tr('Entry', 'Erfassung')}
            disabled={needsDetails}
            value={scoreEntry}
            onChange={setChosenEntry}
            options={[
              { value: 'strokes', name: tr('Strokes only (incl. penalties)', 'Nur Schläge (inkl. Strafschläge)'), text: tr('Enough for bets on the score – birdies, pars, to par.', 'Reicht für Wetten auf den Score – Birdies, Pars, zu Par.') },
              { value: 'details', name: tr('With details', 'Mit Details'), text: tr('Putts, tee shot, sand – for every player.', 'Putts, Abschlag, Sand – für jeden Spieler.') },
            ]}
          />
        </SettingsList>
        <span className="muted small">
          {needsDetails
            ? tr('A bet of the pool counts greens, putts or fairways – every player with details, the putts a must.', 'Eine Wette des Pools zählt Grüns, Putts oder Fairways – jeder Spieler mit Details, die Putts sind Pflicht.')
            : tr('Set by the bets of the pool – the details only if you want them.', 'Von den Wetten des Pools vorgegeben – Details nur, wenn du sie willst.')}
        </span>
      </section>
      <span className="spacer" />
      <div className="sticky-cta">
        <button type="button" className="btn-primary" disabled={!ok} onClick={start}>
          {tr('Start the round', 'Runde starten')}
        </button>
      </div>
    </main>
  );
}

/** The round on the map – the bets' standing in the bar over the hole bar, live. */
export function PoolRoundPlay(props: { code: string; round: Round; onChange: (r: Round) => void; onPause: () => void; onDone: () => void; onOpenBag?: (part: 'bag' | 'caddie') => void }) {
  const r = props.round;
  const [ready, setReady] = useState(geometryReady(r.courseId));
  const [sheet, setSheet] = useState(false);
  const [, setTick] = useState(0);
  const done = useRef(false);
  const judging = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!ready) ensureGeometry(r.courseId).then(() => setReady(true));
  }, [ready, r.courseId]);
  // the pool as it changes (the judging writes it)
  useEffect(() => {
    const on = () => setTick((k) => k + 1);
    window.addEventListener('golfos:pools-changed', on);
    return () => window.removeEventListener('golfos:pools-changed', on);
  }, []);
  const entry = loadPools().find((e) => e.code === props.code);
  if (!ready || !entry) return <main className="screen"><p className="muted">{tr('Loading the course …', 'Platz wird geladen …')}</p></main>;
  const pool = entry.pool;
  const today = dayOf(new Date());
  const made = pool.wagers.filter((w) => stateOf(w, pool, today) === 'done').length;
  const prov = pool.wagers.filter((w) => stateOf(w, pool, today) === 'open' && provisional(w, pool.progress[w.id])).length;
  const line = [tr(`${made} made`, `${made} geschafft`), prov ? tr(`${prov} provisional`, `${prov} vorläufig`) : ''].filter(Boolean).join(' · ');
  // the score entry the bets need (Sascha 02.11.2026: "birdies, to par: the strokes incl. penalty strokes; GIR, 3-putts,
  // up and down: the details")
  // a bet on the greens or the putts: the putts of every player before the next hole (Sascha 02.11.2026: "then the putts a
  // must – the next hole only once all are in"; Rounds blocks it in the hole screen)
  const puttsRequired = pool.wagers.some((w) => PUTT_KINDS.includes(w.kind) || (w.kind === 'custom' && PUTT_METRICS.includes(w.metric ?? '')));
  const scoreEntry = poolNeedsDetails(pool, { day: dayOf(r.createdAt), course: r.courseName, courseId: r.courseId }) ? ('details' as const) : (poolRoundEntry(r.id) ?? 'strokes');
  const change = (nr: Round) => {
    if (done.current) return; // finished: a late change does not bring it back
    keepPoolRound(props.code, nr);
    props.onChange(nr);
    // judged live – a moment after the last entry (Sascha: "the bets judged from the round")
    window.clearTimeout(judging.current);
    judging.current = window.setTimeout(() => void reportWagers(), 1200);
  };
  const finish = (nr: Round) => {
    done.current = true;
    window.clearTimeout(judging.current);
    finishPoolRound(nr);
    void reportWagers().then(props.onDone);
  };
  return (
    <>
      <Suspense fallback={<main className="screen" />}>
        <HoleScreen
          round={r}
          onChange={change}
          onExit={props.onPause}
          onEnd={finish}
          onAbort={() => {
            dropPoolRound(r.id);
            props.onDone();
          }}
          onShowScorecard={(nr, finishing) => (finishing ? finish(nr) : setSheet(true))}
          onOpenBag={props.onOpenBag}
          game={{ name: tr(`Bets · ${pool.name}`, `Wetten · ${pool.name}`), line, onOpen: () => setSheet(true), onInvite: null, shared: null, entry: scoreEntry, detailsAll: scoreEntry === 'details', puttsRequired }}
        />
      </Suspense>
      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(false)}>
          <section className="sheet game-sheet" role="dialog" aria-label={tr('Bets', 'Wetten')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr(`Bets · ${pool.name}`, `Wetten · ${pool.name}`)}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setSheet(false)}>
                ✕
              </button>
            </div>
            <Standings pool={pool} today={today} me={entry.me} />
          </section>
        </div>
      )}
    </>
  );
}
