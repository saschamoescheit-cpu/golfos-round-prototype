import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { DateBlock, monthHeading } from '../components/DateBlock';
import { ModulePill } from '../components/ModuleSheet';
import { FloatActions } from '../components/FloatActions';
import { OwnDetailsRow } from '../components/OwnDetailsRow';
import { SpeakerIcon, useSpeaking } from '../components/SpeakerIcon';
import type { Course, Round } from '../types';
import { ScoreTable } from '../components/ScoreTable';
import { loadFriends } from '../lib/friends';
import { Avatar } from '../components/Avatar';
import { emptyEntry } from '../lib/scoring';
import { getLang, tr } from '../lib/i18n';
import { buildRoundHoles, loopOptions } from '../lib/loops';
import { isLady, shownName, loadProfile } from '../lib/profile';
import { loadCachedCourse, loadGeometry, newId } from '../lib/storage';
import { isSpeaking, onSpeaking, stopSpeaking, toggleSpeak } from '../lib/caddietalk';
import { defaultWho, setMoneySym, WHO, type Currency, type ScoreWho } from '../lib/gameforms';
import { currencySymbol } from '../lib/gameforms';
import { isMoney, isNone, oweText, prizeAmount, prizeSym, type Prize } from '../lib/prize';
import { PrizeRow } from '../components/PrizeRow';
import { CheckGlyph } from '../components/Glyph';
import { gamePrize, gameTransfers } from '../lib/gamepay';
import { FORMS, chicagoHole, capChain, onChain, snapCap, money, teamsOf, chicagoTeams, stakeCap, allowanceOf, canPress, fitsPlayers, formDef, formatEuro, holesPlayed, playersText, sidesOf, stakeNow, standingOf, strokesOn, type FormDef, type FormId, type Game, type GameHole, type HoleExtra } from '../lib/gameforms';
import { deleteGame, loadFormFavs, loadGames, loadGameTrash, purgeGame, restoreGame, saveGame, toggleFormFav } from '../lib/gamestore';
import { Bin } from '../components/Bin';
import { SwipeRow } from '../components/SwipeRow';
import { InviteSheet, JoinSheet, useGameExchange } from '../components/ShareGame';
import { exchange, keptBy, sharingAvailable, stamp } from '../lib/sharedgame';
import { pushGame } from '../lib/push';
import { TopBar } from '../components/ui';
import { MENU_ICONS, MenuBar } from '../components/TabBar';
import { TopTools } from '../components/TopTools';
import { FriendChips } from './Home';
import { ChoiceRow, PickSheet, SettingsList, SettingsRow, SheetRow, ToggleList, ToggleRow, AddRow } from '../components/Settings';
import { StakeRow } from '../components/StakePicker';
import { PlayerRow, RatingLine, teeChoicesFor } from './RoundSetup';
import { courseTees, defaultTee, profileTee } from '../data/tees';
import { inUsa } from '../lib/weather';
import { courseHandicap, parseIndex, ratingFor, saveOwnRating } from '../lib/handicap';
import { fetchShared } from '../lib/sharedratings';
import { CoursePicker } from './CoursePicker';
import { loadCourse } from '../lib/courses';
import { BETS_ICON, BetsTab, PoolScreen, PoolSetup, StartBetCard, takeOpenPool, usePools } from './Wagers';
import { SeriesScreen, TOURS_ICON, TourScreen, TourStartCard, ToursTab, useTours } from './Tournaments';
import { TourSetup, newTourDraft, pickCourse, type TourDraft } from './TourPlan';
import { loadSeries, tourState } from '../lib/tourstore';
import { isLive, loadPools } from '../lib/wagerstore';
import { DuelSetup } from './Duels';
import { keepPoolRound, poolRoundOf } from '../lib/poolround';
import { PoolRoundPlay, PoolRoundSetup } from './PoolRound';
import { dayOf } from '../lib/wagers';
import { GameOnMap, roundForGame } from './GameOnMap';
import { SignedIcon } from '../components/SignedIcon';
import { Balance } from './Balance';
import { PausedIcon } from '../components/PausedIcon';
import { DeletedIcon, HolesIcon, PlayedIcon, ToSignIcon } from '../components/RoundIcons';

// The "Games" module (Sascha 15.10.2026): side games as a product of its own – choose a game form, the course and the
// players, enter the strokes hole by hole (plus what the form needs, e.g. the wolf's partner), and see the standing and
// who pays whom. Not linked to the round analysis yet; a side game next to a round may follow later.

export type GamesTab = 'play' | 'games' | 'bets' | 'balance' | 'tours' | 'profile';
type View =
  | { name: 'tab'; tab: GamesTab }
  | { name: 'setup'; draft: Draft }
  | { name: 'course'; draft: Draft }
  | { name: 'play'; game: Game }
  | { name: 'result'; game: Game; /** the menu it was opened from – back there (the balance) */ back?: GamesTab }
  | { name: 'poolSetup'; back: GamesTab }
  | { name: 'pool'; code: string; back?: GamesTab; /** opened from another module – "Zurück" goes back there */ ext?: boolean }
  | { name: 'tourSetup'; draft: TourDraft; back: View }
  | { name: 'tourCourse'; draft: TourDraft; back: View }
  // the page it was opened from – "Zurück" goes there, one level back (Sascha 06.11.2026: "a round of the series opened and
  // back – it jumps right to the front instead of one level back")
  | { name: 'tour'; code: string; back?: View; ext?: boolean }
  | { name: 'series'; code: string; back?: View; ext?: boolean }
  // the pool's way back (the balance or "Wetten") kept through its round
  | { name: 'poolRoundSetup'; code: string; course: Course | null; back?: GamesTab }
  | { name: 'poolRoundCourse'; code: string; back?: GamesTab }
  | { name: 'poolRound'; code: string; round: Round; back?: GamesTab };

interface DraftPlayer {
  id: string;
  name: string;
  hcp: string; // the handicap index as typed – the playing handicap follows from the course (as in Rounds, 22.10.2026)
  tee?: string | null;
}
interface Draft {
  form: FormId;
  course: Course | null; // null = without course data (18 holes, par 4)
  optionId: string;
  players: DraftPlayer[];
  settings: Record<string, number | boolean | string>;
  hcpTouched?: boolean; // the player chose the handicap share himself – no WHS default over it any more
  /** false: no game form chosen yet (Sascha 03.11.2026: "Skins always preset – leave it empty, so one has to choose") –
   *  the form's rules and settings show once one is picked, "Spiel starten" waits for it */
  formChosen?: boolean;
  /** what is played for (Sascha 03.11.2026: "not only money – drinks, a meal …, and without a stake") – none yet: to choose */
  prize?: Prize | null;
  /** who enters the scores on several phones – missing: the form's default (Sascha 07.11.2026) */
  who?: ScoreWho;
  scorer?: string;
  /** "Einer für alle": who still enters his own details on the map (07.11.2026) */
  ownDetails?: string[];
}

/** The leader – or nobody when the first two are level. */
/** The standing in words – for reading aloud and for sharing (Sascha 15.10.2026: "nobody has to read it out"). */
export function standingText(g: Game, spoken: boolean): string {
  const st = standingOf(g);
  const f = formDef(g.form);
  const n = holesPlayed(g);
  const sign = (v: string) => (spoken ? v.replace(/^\+/, tr('plus ', 'plus ')).replace(/^[−-]/, tr('minus ', 'minus ')) : v);
  const lines: string[] = [];
  if (!spoken) lines.push(`${f.name()} · ${g.courseName} · ${new Date(g.createdAt).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined)}`);
  const head = g.finishedAt ? tr(`Result after ${n} holes`, `Ergebnis nach ${n} Löchern`) : tr(`Standing after ${n} holes`, `Zwischenstand nach ${n} Löchern`);
  lines.push(spoken ? `${head}.` : head);
  st.rows.forEach((r) => {
    const place = 1 + st.rows.filter((o) => o.points > r.points).length;
    lines.push(spoken ? `${place}. ${r.name}: ${sign(r.value)}.` : `${place}. ${r.name} ${r.value}`);
  });
  const pays = gameTransfers(g, st.money);
  const prize = gamePrize(g);
  if (pays.length) {
    const nm = (id: string) => g.players.find((p) => p.id === id)?.name ?? id;
    if (!spoken) lines.push(tr('Settlement', 'Abrechnung'));
    pays.forEach((t) =>
      lines.push(
        spoken && isMoney(prize)
          ? tr(`${nm(t.from)} pays ${nm(t.to)} ${money(t.amount)}.`, `${nm(t.from)} zahlt ${money(t.amount)} an ${nm(t.to)}.`)
          : `${oweText(nm(t.from), nm(t.to), prize)} ${prizeAmount(t.amount, prize)}${spoken ? '.' : ''}`,
      ),
    );
  }
  return lines.join(spoken ? ' ' : '\n');
}

/** Everyone on top – a team wins together ("Sascha & Ben"); null only when all stand equal (Sascha: "Unentschieden"
 *  showed for a Chicago team that had won). */
const topRows = <R extends { points: number }>(rows: R[]): R[] => {
  if (!rows.length) return [];
  const top = rows.filter((r) => r.points === rows[0].points);
  return rows.length > 1 && top.length === rows.length ? [] : top;
};
const winnerOf = (rows: { name: string; points: number }[]): string | null => {
  const top = topRows(rows);
  return top.length ? top.map((r) => r.name).join(' & ') : null;
};

const defaults = (f: FormDef) => Object.fromEntries(f.settings.map((s) => [s.key, s.default]));

/** The WHS recommendation for the form and the number of players, unless the player chose the share himself. */
function withWhs(d: Draft): Draft {
  const rec = formDef(d.form).hcpFor?.(d.players.length);
  return rec && !d.hcpTouched && d.settings.allowance != null ? { ...d, settings: { ...d.settings, allowance: rec } } : d;
}

/** As many player rows as the form needs (Sascha 17.10.2026: "Chicago needs 4 – show 4, not 2"); never fewer than 2. */
function atLeast(players: DraftPlayer[], n: number): DraftPlayer[] {
  const out = players.slice();
  while (out.length < Math.max(2, n)) out.push({ id: newId(), name: '', hcp: '' });
  return out;
}

/** The stakes of a form played for a thing (Sascha 04.11.2026: "drinks, food – 1×, not 5×; 18 holes for one drink"): 1× – with
 *  several (vorne, hinten, 18) only the last, the others none. */
function thingStakes(f: FormDef): Record<string, number> {
  const stakes = f.settings.filter((x) => x.type === 'stake');
  return Object.fromEntries(stakes.map((st, k) => [st.key, stakes.length > 1 && k < stakes.length - 1 ? 0 : 1]));
}

function newDraft(chosen?: FormId): Draft {
  const p = loadProfile();
  const me = { id: 'me', name: shownName(p) || tr('Me', 'Ich'), hcp: p.hcpIndex.trim() };
  const form = chosen ?? 'skins'; // only a placeholder until a form is picked
  return withWhs({ form, course: null, optionId: '', players: atLeast([me], formDef(form).players[0]), settings: defaults(formDef(form)), formChosen: !!chosen });
}

/** A tournament opened by a tapped push (read once): its code – a series' code opens the series. */
function takeOpenTour(keep = false): string | null {
  try {
    const code = sessionStorage.getItem('golfos.openTour');
    if (code && !keep) sessionStorage.removeItem('golfos.openTour');
    return code;
  } catch {
    return null;
  }
}
const tourView = (code: string, ext = false): View =>
  loadSeries().some((e) => e.code === code) ? { name: 'series', code, back: { name: 'tab', tab: 'tours' }, ...(ext ? { ext } : {}) } : { name: 'tour', code, back: { name: 'tab', tab: 'tours' }, ...(ext ? { ext } : {}) };
// where each module was (Sascha 12.11.2026: "back goes to the main menu instead of one level"): a module left for another
// and come back to opens where it was – a series, its round, a pool – not on its list
const keptView: Partial<Record<'games' | 'tours', View>> = {};
const keepable = (v: View) => v.name === 'tab' || v.name === 'pool' || v.name === 'tour' || v.name === 'series';

export function GamesApp(props: {
  /** 'games' – "Games & Bets": games and pools of bets; 'tours' – "Tournaments", a module of its own (Sascha
   *  03.11.2026: "the tournaments out of Games, their own menu item below Games") – the same screens of a tournament */
  kind?: 'games' | 'tours';
  onModules: () => void; profile: ReactNode; profileDot?: boolean; /** opened from another module by a link: "Zurück" goes back there (12.11.2026) */ returnTo?: { label: string; go: () => void }; tab?: GamesTab; onTabChange?: (t: GamesTab) => void; onOpenBag?: (part: 'bag' | 'caddie') => void; /** a round's code under "Join a game": on to Rounds */ onJoinRound?: (code: string) => void; /** Rounds, its start page – today's tournament to take part in (a pool's "Zum Turnier") */ onOpenRounds?: () => void }) {
  const [games, setGames] = useState<Game[]>(loadGames);
  const running = games.filter((g) => !g.finishedAt);
  const [view, setView] = useState<View>(() => {
    if (props.kind === 'tours') {
      // a push about a tournament (changed, its result, a special prize – 07.11.2026): only read here – the first look may
      // run twice (React's strict mode), it is taken once the screen is there
      const tour = takeOpenTour(true);
      if (tour) return tourView(tour, !!props.returnTo);
      return keptView.tours ?? { name: 'tab', tab: props.tab ?? 'play' };
    }
    const pool = takeOpenPool(true); // a push about a bet made: its pool – taken below (the first look may run twice)
    if (pool) return { name: 'pool', code: pool, ...(props.returnTo ? { ext: true } : {}) };
    if (keptView.games && !running[0] && !location.hash.startsWith('#join=')) return keptView.games;
    return running[0] && !props.tab && !location.hash.startsWith('#join=') ? { name: 'play', game: running[0] } : { name: 'tab', tab: props.tab ?? 'play' };
  });
  // the push tapped while Games is open already
  useEffect(() => {
    if (props.kind !== 'tours') return;
    takeOpenTour(); // read by the first look
    const open = () => {
      const tour = takeOpenTour();
      if (tour) setView(tourView(tour));
    };
    window.addEventListener('golfos:open-tour', open);
    return () => window.removeEventListener('golfos:open-tour', open);
  }, []);
  useEffect(() => {
    if (props.kind === 'tours') return;
    takeOpenPool(); // read by the first look
    const open = () => {
      const pool = takeOpenPool();
      if (pool) setView({ name: 'pool', code: pool });
    };
    window.addEventListener('golfos:open-pool', open);
    return () => window.removeEventListener('golfos:open-pool', open);
  }, []);
  const store = (g: Game) => {
    saveGame(g);
    // a shared game, finished (or corrected afterwards): its scores and "finished" to the others once more – while it
    // is played the game's screen exchanges them (as in Rounds, Sascha 29.10.2026)
    if (g.finishedAt && g.shared) void exchange(g);
    setGames(loadGames());
  };
  useEffect(() => {
    const reload = () => setGames(loadGames());
    window.addEventListener('golfos:games-changed', reload);
    return () => window.removeEventListener('golfos:games-changed', reload);
  }, []);
  const remove = (g: Game) => {
    deleteGame(g.id);
    setGames(loadGames());
  };

  useEffect(() => {
    if (keepable(view)) keptView[props.kind === 'tours' ? 'tours' : 'games'] = view;
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  // one level back – a menu tab tells the module which tab is shown
  const goBack = (v: View) => {
    setView(v);
    if (v.name === 'tab') props.onTabChange?.(v.tab);
  };
  // the label of "Zurück" on a tournament's or a series' page: where it goes
  const backTo = (v?: View) => (v?.name === 'series' ? tr('Series', 'Serie') : v?.name === 'tour' ? tr('Tournament', 'Turnier') : undefined);
  // every page of Games opens at its top (Sascha 03.11.2026: "a new pool showed its QR code below – I had to scroll up; the
  // dialogs always start at the top"): the app scrolls on its own pages only, Games keeps its views itself
  const viewKey = view.name === 'tab' ? `tab-${view.tab}` : 'code' in view ? `${view.name}-${view.code}` : 'game' in view ? `${view.name}-${view.game.id}` : view.name;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [viewKey]);
  // the money on screen in what the game shown is played for – euro, dollar, a thing, points (Sascha 01./03.11.2026)
  setMoneySym(view.name === 'play' || view.name === 'result' ? gameSym(view.game) : view.name === 'setup' || view.name === 'course' ? (view.draft.prize ? prizeSym(view.draft.prize) : currencySymbol(view.draft.settings.currency)) : currencySymbol(undefined));
  switch (view.name) {
    case 'tab':
      return (
        <GamesTabs
          kind={props.kind ?? 'games'}
          tab={view.tab}
          games={games}
          profile={props.profile}
          profileDot={props.profileDot}
          onTab={(tab) => {
            setView({ name: 'tab', tab });
            props.onTabChange?.(tab);
            window.scrollTo(0, 0);
          }}
          onModules={props.onModules}
          onJoinRound={props.onJoinRound}
          onNewPool={() => setView({ name: 'poolSetup', back: view.tab })}
          onOpenPool={(code) => setView({ name: 'pool', code, back: view.tab })}
          onNewTour={() => setView({ name: 'tourSetup', draft: newTourDraft(), back: view })}
          onOpenTour={(code) => setView({ name: 'tour', code, back: view })}
          onOpenSeries={(code) => setView({ name: 'series', code, back: view })}
          onNew={(form) => setView({ name: 'setup', draft: newDraft(form) })}
          onJoined={(g) => {
            store(g);
            setView({ name: 'play', game: g });
          }}
          onOpen={(g) => setView(g.finishedAt ? { name: 'result', game: g, back: view.tab === 'balance' ? 'balance' : undefined } : { name: 'play', game: g })}
          onFinish={(g) => {
            const done = { ...g, finishedAt: new Date().toISOString(), ...(g.round ? { round: { ...g.round, finishedAt: new Date().toISOString() } } : {}) };
            if (done.shared) pushGame('finished', done.shared.code); // the others hear of it (push, final list 23.10.2026)
            store(done);
            setView({ name: 'result', game: done });
          }}
          onDelete={(g) => remove(g)}
        />
      );
    case 'course':
      return (
        <CoursePicker
          onBack={() => setView({ name: 'setup', draft: view.draft })}
          onPicked={(course) => setView({ name: 'setup', draft: { ...view.draft, course, optionId: loopOptions(course.holes)[0]?.id ?? '' } })}
        />
      );
    case 'setup':
      return (
        <GameSetup
          draft={view.draft}
          onChange={(draft) => setView({ name: 'setup', draft })}
          onBack={() => setView({ name: 'tab', tab: 'play' })}
          onCourse={() => setView({ name: 'course', draft: view.draft })}
          onStart={(g) => {
            store(g);
            setView({ name: 'play', game: g });
          }}
          onDuel={(code) => setView({ name: 'pool', code, back: 'play' })}
        />
      );
    case 'play':
      if (view.game.round)
        return (
          <GameOnMap
            game={view.game}
            onChange={(g) => {
              store(g);
              setView({ name: 'play', game: g });
            }}
            onPause={() => setView({ name: 'tab', tab: 'play' })}
            onFinish={(g) => {
              const done = { ...g, finishedAt: new Date().toISOString() };
              if (done.shared) pushGame('finished', done.shared.code); // the others hear of it (push, final list 23.10.2026)
              store(done);
              setView({ name: 'result', game: done });
            }}
            onDelete={(g) => {
              remove(g);
              setView({ name: 'tab', tab: 'play' });
            }}
            onOpenBag={props.onOpenBag}
          />
        );
      return (
        <GamePlay
          game={view.game}
          onChange={(g) => {
            store(g);
            setView({ name: 'play', game: g });
          }}
          onBack={() => setView({ name: 'tab', tab: 'play' })}
          onFinish={(g) => {
            const done = { ...g, finishedAt: new Date().toISOString() };
            if (done.shared) pushGame('finished', done.shared.code); // the others hear of it (push, final list 23.10.2026)
            store(done);
            setView({ name: 'result', game: done });
          }}
          onDelete={(g) => {
            remove(g);
            setView({ name: 'tab', tab: 'play' });
          }}
        />
      );
    // bets over a trip (Sascha 01.11.2026)
    case 'poolSetup':
      return <PoolSetup onBack={() => setView({ name: 'tab', tab: view.back })} onCreated={(code) => setView({ name: 'pool', code })} />;
    case 'pool':
      // back to the menu "Bets" – the pools are kept there (Sascha 01.11.2026)
      return (
        <PoolScreen
          code={view.code}
          backLabel={view.ext && props.returnTo ? props.returnTo.label : view.back === 'balance' ? tr('Balance', 'Bilanz') : undefined}
          onTour={props.onOpenRounds}
          onRound={(code) => {
            const running = poolRoundOf(code);
            if (running) return setView({ name: 'poolRound', code, round: running, back: view.back });
            // the course of the pool's round today, when it has one and it is on this phone
            const p = loadPools().find((e) => e.code === code)?.pool;
            const today = p?.rounds?.find((x) => x.day === dayOf(new Date()) && x.courseId);
            const cached = today?.courseId ? loadCachedCourse(today.courseId) : null;
            setView({ name: 'poolRoundSetup', code, course: cached, back: view.back });
            // not on this phone (the pool set up on another – Sascha 03.11.2026: "the course chosen for the bet, asked again"):
            // loaded from where the round keeps it
            if (!cached && today?.src)
              void loadCourse(today.src)
                .then((c) => c.holes.length && setView((v) => (v.name === 'poolRoundSetup' && v.code === code && !v.course ? { ...v, course: c } : v)))
                .catch(() => null);
          }}
          onBack={() => {
            // opened from another module by a link: back there (Sascha 12.11.2026)
            if (view.ext && props.returnTo) {
              setView({ name: 'tab', tab: 'bets' });
              return props.returnTo.go();
            }
            // back where it was opened (Sascha 04.11.2026: the balance; night 10./11.11.2026: Spielen too – a challenge,
            // a duel set up there); else the bets
            const back: GamesTab = view.back === 'balance' || view.back === 'play' ? view.back : 'bets';
            setView({ name: 'tab', tab: back });
            props.onTabChange?.(back);
          }}
        />
      );
    // a round from the bets, played on the map here (Sascha 02.11.2026)
    case 'poolRoundSetup':
      return (
        <PoolRoundSetup
          code={view.code}
          course={view.course}
          onCourse={() => setView({ name: 'poolRoundCourse', code: view.code, back: view.back })}
          onBack={() => setView({ name: 'pool', code: view.code, back: view.back })}
          onStart={(round) => {
            keepPoolRound(view.code, round);
            setView({ name: 'poolRound', code: view.code, round, back: view.back });
          }}
        />
      );
    case 'poolRoundCourse':
      return <CoursePicker onBack={() => setView({ name: 'poolRoundSetup', code: view.code, course: null, back: view.back })} onPicked={(course) => setView({ name: 'poolRoundSetup', code: view.code, course, back: view.back })} />;
    case 'poolRound':
      return (
        <PoolRoundPlay
          code={view.code}
          round={view.round}
          onChange={(round) => setView({ name: 'poolRound', code: view.code, round, back: view.back })}
          onPause={() => setView({ name: 'pool', code: view.code, back: view.back })}
          onDone={() => setView({ name: 'pool', code: view.code, back: view.back })}
          onOpenBag={props.onOpenBag}
        />
      );
    // tournaments planned here, played in Rounds (Sascha 01.11.2026)
    case 'tourSetup':
      return (
        <TourSetup
          draft={view.draft}
          onChange={(draft) => setView({ ...view, draft })}
          onBack={() => setView(view.back)}
          onCourse={(draft) => setView({ name: 'tourCourse', draft, back: view.back })}
          // a tournament over several rounds: its page is the series'
          // set up or changed: back to the page it was changed on, or on to the new one with the setup's way back
          onSaved={(code, series) => {
            const target: 'series' | 'tour' = series ? 'series' : 'tour';
            // a new one set up from a menu: its way back is the list of the tournaments, where it is kept now
            const b: View = view.back.name === 'tab' ? { name: 'tab', tab: 'tours' } : view.back;
            if ((b.name === 'tour' || b.name === 'series') && b.name === target && b.code === code) setView(b);
            else setView(target === 'series' ? { name: 'series', code, back: b } : { name: 'tour', code, back: b });
          }}
        />
      );
    case 'tourCourse':
      return (
        <CoursePicker
          onBack={() => setView({ name: 'tourSetup', draft: view.draft, back: view.back })}
          onPicked={(course) => setView({ name: 'tourSetup', draft: pickCourse(view.draft, course), back: view.back })}
        />
      );
    case 'tour':
      return (
        <TourScreen
          code={view.code}
          backLabel={view.ext && props.returnTo ? props.returnTo.label : backTo(view.back)}
          onBack={() => {
            if (view.ext && props.returnTo) {
              setView(view.back ?? { name: 'tab', tab: 'tours' });
              return props.returnTo.go();
            }
            goBack(view.back ?? { name: 'tab', tab: 'tours' });
          }}
          onEdit={(draft) => setView({ name: 'tourSetup', draft, back: view })}
          // its series: back to it when it was opened from there, else on to it
          onOpenSeries={(code) => setView(view.back?.name === 'series' && view.back.code === code ? view.back : { name: 'series', code, back: view })}
        />
      );
    case 'series':
      return (
        <SeriesScreen
          code={view.code}
          backLabel={view.ext && props.returnTo ? props.returnTo.label : backTo(view.back)}
          onBack={() => {
            if (view.ext && props.returnTo) {
              setView(view.back ?? { name: 'tab', tab: 'tours' });
              return props.returnTo.go();
            }
            goBack(view.back ?? { name: 'tab', tab: 'tours' });
          }}
          onOpen={(code) => setView(view.back?.name === 'tour' && view.back.code === code ? view.back : { name: 'tour', code, back: view })}
          onAddRound={(draft) => setView({ name: 'tourSetup', draft, back: view })}
          onEdit={(draft) => setView({ name: 'tourSetup', draft, back: view })}
        />
      );
    case 'result':
      return (
        <GameResult
          game={view.game}
          backLabel={view.back === 'balance' ? tr('Balance', 'Bilanz') : undefined}
          onBack={() => setView({ name: 'tab', tab: view.back ?? 'games' })}
          onReopen={() => {
            const g = { ...view.game, finishedAt: null, ...(view.game.round ? { round: { ...view.game.round, finishedAt: null } } : {}) };
            store(g);
            setView({ name: 'play', game: g });
          }}
          onDelete={() => {
            remove(view.game);
            setView({ name: 'tab', tab: 'games' });
          }}
          onChange={(g) => {
            store(g);
            setView({ name: 'result', game: g });
          }}
        />
      );
  }
}

// ---------- the module's tabs (Sascha 15.10.2026: a menu at the bottom as in Rounds) ----------

function GamesTabs(props: {
  kind: 'games' | 'tours';
  tab: GamesTab;
  games: Game[];
  profile: ReactNode;
  profileDot?: boolean;
  onTab: (t: GamesTab) => void;
  onModules: () => void;
  onNew: (form?: FormId) => void;
  onOpen: (g: Game) => void;
  onJoined: (g: Game) => void;
  onJoinRound?: (code: string) => void;
  onNewPool: () => void;
  onOpenPool: (code: string) => void;
  onNewTour: () => void;
  onOpenTour: (code: string) => void;
  onOpenSeries: (code: string) => void;
  onFinish: (g: Game) => void;
  onDelete: (g: Game) => void;
}) {
  const running = props.games.filter((g) => !g.finishedAt);
  const today = dayOf(new Date());
  const betsRunning = usePools().some((e) => isLive(e, today)); // the dot on "Bets", as on "Play" for a game running
  const toursAhead = useTours().some((e) => ['planned', 'today'].includes(tourState(e, today))); // the dot on "Tournaments": one to come
  // join a friend's game (code or the QR link #join=CODE) – shown once signed in and the shared table exists
  const [canShare, setCanShare] = useState<boolean | null>(null); // null: still asking
  const [joinOpen, setJoinOpen] = useState<string | null>(() => (location.hash.startsWith('#join=') ? location.hash.slice(6) : null));
  useEffect(() => {
    sharingAvailable().then(setCanShare);
    if (location.hash.startsWith('#join=')) history.replaceState(null, '', location.pathname + location.search);
  }, []);
  // the games list filtered by one tile at a time, as the rounds list (Sascha 17.10.2026: the same in every module)
  const [filter, setFilter] = useState<GamesFilter>(null);
  const binOpen = filter === 'bin';
  const trashCount = loadGameTrash().length;
  useEffect(() => {
    if (filter === 'bin' && !trashCount) setFilter(null); // the bin emptied or restored: all games again
  }, [trashCount, filter]);
  const openList = (f: GamesFilter) => {
    setFilter(f);
    props.onTab('games');
  };
  const confirmCount = props.games.filter((g) => g.finishedAt && !g.signedAt).length;
  return (
    <main className="screen with-tabs">
      {/* the module header on every tab, the profile too (uniform with Rounds and Training) */}
      {(
        <div className="topbar">
          <ModulePill name={props.kind === 'tours' ? 'Tournaments' : 'Games & Bets'} onClick={props.onModules} />
          <TopTools />
        </div>
      )}
      {/* Tournaments (03.11.2026): plan one or join – the list of them in the menu "Tournaments", played in Rounds */}
      {props.kind === 'tours' && props.tab === 'play' && (
        <>
          <h1 className="tab-title">{tr('Plan a tournament', 'Turnier planen')}</h1>
          <TourStartCard canShare={!!canShare} onNew={props.onNewTour} onJoin={() => setJoinOpen('')} />
          {toursAhead && (
            <button type="button" className="list-item" onClick={() => props.onTab('tours')}>
              <span className="grow">
                <span className="title">{tr('Tournaments to come', 'Anstehende Turniere')}</span>
                <span className="muted small">{tr('Today and planned – flights, tee times, leaderboard', 'Heute und geplant – Flights, Startzeiten, Rangliste')}</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          )}
        </>
      )}
      {props.kind === 'games' && props.tab === 'play' && (
        <>
          <h1 className="tab-title">{tr('Play a game', 'Spiel starten')}</h1>
          {/* the game in progress as the round in progress on Rounds (Sascha 25.10.2026: Rounds is the pattern) */}
          {running.map((g) => (
            <RunningGame key={g.id} game={g} onContinue={() => props.onOpen(g)} onFinish={() => props.onFinish(g)} onDelete={() => props.onDelete(g)} />
          ))}
          {/* 5+5+10 challenges to answer: in the inbox only (Sascha 13.11.2026: "ausschließlich in der Box") */}
          {/* as "Start a new round" in Rounds (Sascha 15.10.2026: the same in every module) */}
          <section className="card play-card">
            <strong className="play-course">{tr('Start a new game', 'Neues Spiel starten')}</strong>
            <button type="button" className={running.length ? 'btn-secondary' : 'btn-primary'} onClick={() => props.onNew()}>
              {tr('New game', 'Neues Spiel')}
            </button>
            {canShare && (
              <button type="button" className="btn-secondary" onClick={() => setJoinOpen('')}>
                {tr("Join a friend's game", 'Spiel beitreten')}
              </button>
            )}
          </section>
          {/* start a bet beside starting a game – the bets themselves are kept in the menu "Bets" (Sascha 01.11.2026) */}
          <StartBetCard canShare={!!canShare} onNew={props.onNewPool} onJoin={() => setJoinOpen('')} />
          {confirmCount > 0 && (
            <button type="button" className="list-item" onClick={() => openList('confirm')}>
              <span className="grow">
                <span className="title">{tr('Confirm the results', 'Ergebnisse bestätigen')}</span>
                <span className="muted small">
                  {confirmCount === 1 ? tr('1 game not confirmed yet', '1 Spiel noch nicht bestätigt') : tr(`${confirmCount} games not confirmed yet`, `${confirmCount} Spiele noch nicht bestätigt`)}
                </span>
              </span>
              <span className="count-badge">{confirmCount}</span>
              <span aria-hidden="true">›</span>
            </button>
          )}
        </>
      )}
      {joinOpen != null && canShare != null && (
            <>
              {canShare ? (
                <JoinSheet
                  initial={joinOpen}
                  onClose={() => setJoinOpen(null)}
                  onJoined={(g) => {
                    setJoinOpen(null);
                    props.onJoined(g);
                  }}
                  onPool={(c) => {
                    setJoinOpen(null);
                    props.onOpenPool(c);
                  }}
                  onRoundCode={
                    props.onJoinRound &&
                    ((c) => {
                      setJoinOpen(null);
                      props.onJoinRound!(c);
                    })
                  }
                />
              ) : (
                <div className="sheet-backdrop" onClick={() => setJoinOpen(null)}>
                  <section className="sheet" role="dialog" aria-label={tr('Join a game', 'Spiel beitreten')} onClick={(e) => e.stopPropagation()}>
                    <strong>{tr('Join a game', 'Spiel beitreten')}</strong>
                    <span className="muted">
                      {tr('Sign in first: Profile → "On all your devices" → "Sign in with Google". Then open the link again.', 'Melde dich zuerst an: Profil → „Auf allen Geräten“ → „Mit Google anmelden“. Dann den Link noch einmal öffnen.')}
                    </span>
                    <button type="button" className="btn-secondary" onClick={() => setJoinOpen(null)}>
                      {tr('OK', 'OK')}
                    </button>
                  </section>
                </div>
              )}
            </>
          )}
      {props.tab === 'bets' && <BetsTab onOpen={props.onOpenPool} onNew={props.onNewPool} />}
      {props.tab === 'tours' && <ToursTab onOpen={props.onOpenTour} onOpenSeries={props.onOpenSeries} onNew={props.onNewTour} />}
      {props.tab === 'games' && (
        <>
          <h1 className="tab-title">{tr('Games', 'Spiele')}</h1>
          <GameTiles games={props.games} filter={filter} onFilter={(f) => setFilter(filter === f ? null : f)} />
          <Bin
            open={binOpen && loadGameTrash().length > 0}
            title={tr('Deleted games', 'Gelöschte Spiele')}
            items={loadGameTrash().map((t) => ({ id: t.game.id, date: t.game.createdAt, title: `${formDef(t.game.form).name()} · ${t.game.courseName}`, meta: t.game.players.map((p) => p.name).join(', '), deletedAt: t.deletedAt }))}
            onRestore={restoreGame}
            onPurge={purgeGame}
          />
          {/* no "no games yet" (Sascha 03.11.2026) – the tiles say it; a new game: the round "+" bottom right (12.11.2026) */}
          <FloatActions plus={{ label: tr('New game', 'Neues Spiel'), onClick: () => props.onNew() }} />
          {props.games.length > 0 && !binOpen && <GameList games={props.games.filter((g) => (filter === 'confirm' ? g.finishedAt && !g.signedAt : filter === 'running' ? !g.finishedAt : filter === 'played' ? g.finishedAt : filter === 'confirmed' ? g.finishedAt && g.signedAt : true))} onOpen={props.onOpen} />}
        </>
      )}
      {/* the balance a menu of its own – the games' and the bets' (Sascha 03.11.2026: "make Bilanz another menu item,
          with the balances of the games and of the bets") */}
      {props.tab === 'balance' && (
        <>
          <h1 className="tab-title">{tr('Balance', 'Bilanz')}</h1>
          <Balance
            games={props.games}
            inTab
            onOpenPool={props.onOpenPool}
            onOpenGame={props.onOpen}
            onConfirm={(gs) => {
              // the notice tapped (Sascha 03.11.2026): one game to confirm opens, several – "Spiele", those to confirm
              if (gs.length === 1) return props.onOpen(gs[0]);
              setFilter('confirm');
              props.onTab('games');
            }}
          />
        </>
      )}
      {props.tab === 'profile' && props.profile}
      <MenuBar
        items={
          props.kind === 'tours'
            ? [
                { id: 'play' as GamesTab, label: tr('Plan', 'Planen'), icon: MENU_ICONS.game },
                { id: 'tours' as GamesTab, label: tr('Tournaments', 'Turniere'), icon: TOURS_ICON, dot: toursAhead },
                { id: 'profile' as GamesTab, label: tr('Profile', 'Profil'), icon: MENU_ICONS.profile, dot: props.profileDot },
              ]
            : [
                { id: 'play' as GamesTab, label: tr('Play', 'Spielen'), icon: MENU_ICONS.game, dot: running.length > 0 },
                { id: 'games' as GamesTab, label: tr('Games', 'Spiele'), icon: MENU_ICONS.list },
                { id: 'bets' as GamesTab, label: tr('Bets', 'Wetten'), icon: BETS_ICON, dot: betsRunning },
                { id: 'balance' as GamesTab, label: tr('Balance', 'Bilanz'), icon: MENU_ICONS.balance },
                { id: 'profile' as GamesTab, label: tr('Profile', 'Profil'), icon: MENU_ICONS.profile, dot: props.profileDot },
              ]
        }
        current={props.tab}
        onPick={(t) => {
          setFilter(null); // the menu shows all again
          props.onTab(t);
        }}
      />
    </main>
  );
}

function GameList(props: { games: Game[]; onOpen: (g: Game) => void; title?: string }) {
  const remove = (g: Game) => {
    deleteGame(g.id);
    window.dispatchEvent(new Event('golfos:games-changed'));
  };
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {props.title && <span className="eyebrow">{props.title}</span>}
      <ul className="list">
        {props.games.map((g, k) => {
          const f = formDef(g.form);
          // the month above its first row – the date block says only the day (Sascha 12.11.2026)
          const month = monthHeading(props.games.map((x) => x.createdAt), k);
          const head = month && <span className="eyebrow list-month">{month}</span>;
          const st = standingOf(g);
          const winner = g.finishedAt ? winnerOf(st.rows) : null;
          const row = (
            <button type="button" className="list-item" aria-label={g.finishedAt ? undefined : tr(`${f.name()} at ${g.courseName}, paused – continue`, `${f.name()} ${g.courseName}, pausiert – fortsetzen`)} onClick={() => props.onOpen(g)}>
              <DateBlock iso={g.createdAt} />
              {/* the same marks as on the rounds: confirmed (seal), to confirm (pen), paused (pause) – in their own column
                  between date and name (Sascha 11.11.2026, status mockups: variant A) */}
              <span className="list-mark">
                  {!g.finishedAt ? (
                    <span className="paused-mark" role="img" aria-label={tr('paused', 'pausiert')} title={tr('paused', 'pausiert')}>
                      <PausedIcon size={16} />
                    </span>
                  ) : g.signedAt ? (
                    <span className="signed-mark" role="img" aria-label={tr('confirmed', 'bestätigt')} title={tr('confirmed', 'bestätigt')}>
                      <SignedIcon size={16} />
                    </span>
                  ) : (
                    <span className="signed-mark" role="img" aria-label={tr('to confirm', 'zu bestätigen')} title={tr('to confirm', 'zu bestätigen')}>
                      <ToSignIcon size={16} />
                    </span>
                  )}
              </span>
              <span className="grow">
                <span className="title">{f.name()}</span>
                {/* one line as on the rounds list (Sascha 25.10.2026: Games like Rounds) */}
                <span className="muted small one-line">
                  {g.finishedAt
                    ? `${g.courseName} · ${g.players.length} ${tr('players', 'Spieler')}`
                    : tr(`Paused · hole ${g.holes[Math.min(g.current, g.holes.length - 1)]?.label ?? ''}`, `Pausiert · Loch ${g.holes[Math.min(g.current, g.holes.length - 1)]?.label ?? ''}`)}
                </span>
              </span>
              <span className="game-row-result">
                {g.finishedAt ? (
                  <>
                    <strong className="one-line">{winner ?? '–'}</strong>
                    <span className="muted small">{winner ? tr('winner', 'Sieger') : tr('tied', 'unentschieden')}</span>
                  </>
                ) : (
                  <>
                    <strong>
                      {holesPlayed(g)}/{g.holes.length}
                    </strong>
                    <span className="muted small">{tr('holes', 'Löcher')}</span>
                  </>
                )}
              </span>
            </button>
          );
          // swiped away as a mail (Sascha 02.11.2026) – into the bin, "Undo" brings it back
          return g.finishedAt ? (
            <li key={g.id}>
              {head}
              <SwipeRow label={`${f.name()} ${g.courseName}`} onDelete={() => remove(g)}>
                {row}
              </SwipeRow>
            </li>
          ) : (
            // carry on (tap the row) or delete – into the bin, "Undo" brings it back – as a paused round
            <li key={g.id}>
              {head}
              <SwipeRow className="paused-row" label={`${f.name()} ${g.courseName}`} onDelete={() => remove(g)}>
              {row}
              {/* deleted as every row: swiped left (Sascha 11.11.2026, design round 2) – no bin icon in the row */}
              </SwipeRow>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A game in progress on the start page – the same card as "Laufende Runde" on Rounds: continue, finish (asked
 *  first, saves the holes with scores), cancel (asked first, into the bin). */
function RunningGame(props: { game: Game; onContinue: () => void; onFinish: () => void; onDelete: () => void }) {
  const g = props.game;
  const f = formDef(g.form);
  const [confirm, setConfirm] = useState<'end' | 'abort' | null>(null);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const at = Math.min(g.current, g.holes.length - 1);
  const played = holesPlayed(g);
  return (
    <section className="card play-card" aria-label={tr('Game in progress', 'Laufendes Spiel')}>
      <span className="eyebrow">{tr('Game in progress', 'Laufendes Spiel')}</span>
      <div className="play-course">{f.name()}</div>
      <span className="muted small">
        {[
          g.courseName,
          tr(`hole ${g.holes[at]?.label ?? at + 1} · ${at + 1} of ${g.holes.length}`, `Loch ${g.holes[at]?.label ?? at + 1} · ${at + 1} von ${g.holes.length}`),
          tr(`started ${new Date(g.createdAt).toLocaleString(locale, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`, `begonnen ${new Date(g.createdAt).toLocaleString(locale, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`),
        ].join(' · ')}
      </span>
      {confirm === null && (
        <>
          {/* the action bar as on a round's card (docs/DESIGN.md) – cancelling red and last – then the one main button */}
          <div className="sc-actions" role="group" aria-label={tr('This game', 'Dieses Spiel')}>
            <button type="button" className="sc-action" aria-label={tr('Finish game', 'Spiel beenden')} onClick={() => setConfirm('end')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 21V4" />
                <path d="M5 4h11l-2 4 2 4H5" />
              </svg>
              <span>{tr('Finish', 'Beenden')}</span>
            </button>
            <button type="button" className="sc-action danger" aria-label={tr('Cancel game', 'Spiel abbrechen')} onClick={() => setConfirm('abort')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" />
              </svg>
              <span>{tr('Cancel', 'Abbrechen')}</span>
            </button>
          </div>
          <button type="button" className="btn-primary" onClick={props.onContinue}>
            {tr('Continue game', 'Spiel fortsetzen')}
          </button>
        </>
      )}
      {confirm === 'end' && (
        <div className="play-confirm">
          <span>
            {played < g.holes.length
              ? tr(`Finish now? ${played} of ${g.holes.length} holes have all scores – they count, the others stay empty.`, `Jetzt beenden? ${played} von ${g.holes.length} Löchern haben alle Scores – sie zählen, die anderen bleiben leer.`)
              : tr('Finish and settle the game?', 'Spiel beenden und abrechnen?')}
          </span>
          <div className="play-actions">
            <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>
              {tr('Back', 'Zurück')}
            </button>
            <button type="button" className="btn-primary" onClick={props.onFinish}>
              {tr('Finish & settle', 'Beenden & abrechnen')}
            </button>
          </div>
        </div>
      )}
      {confirm === 'abort' && (
        <div className="play-confirm">
          <span>{tr('Cancel and delete the game? You can restore it under "deleted".', 'Spiel abbrechen und löschen? Unter „gelöscht“ kannst du es wiederherstellen.')}</span>
          <div className="play-actions">
            <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>
              {tr('Back', 'Zurück')}
            </button>
            <button type="button" className="btn-secondary btn-danger" onClick={() => { setConfirm(null); props.onDelete(); }}>
              {tr('Delete game', 'Spiel löschen')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Your balance over all finished games: wins, money, and against whom (player 1 is you). */
/** The rules of a game form as a voice reads them: signs in words (Sascha 15.10.2026: "nobody has to read out the
 *  rules – all four players listen"). */
export function rulesSpoken(f: FormDef): string {
  const words = (t: string) =>
    t
      .replace(/(\d) − (\d)/g, tr('$1 minus $2', '$1 minus $2'))
      .replace(/−(\d)/g, tr('minus $1', 'minus $1'))
      .replace(/\+(\d)/g, tr('plus $1', 'plus $1'))
      .replace(/ × /g, tr(' times ', ' mal '))
      .replace(/ = /g, tr(' is ', ' gleich '))
      .replace(/ → /g, ', ')
      .replace(/ … /g, tr(' up to ', ' bis '))
      .replace(/…/g, '')
      .replace(/([A-D])\+([A-D])/g, tr('$1 and $2', '$1 und $2'))
      .replace(/ · /g, ', ');
  return [f.name() + '.', words(f.short()), ...f.rules().map(words)].map((x) => (/[.!?:]$/.test(x.trim()) ? x.trim() : x.trim() + '.')).join(' ');
}

export function FormRules(props: { form: FormDef }) {
  const talking = useSyncExternalStore(onSpeaking, isSpeaking, () => false);
  // leaving the rules stops the voice
  useEffect(() => () => stopSpeaking(), [props.form.id]);
  return (
    <>
      {/* only the speaker, as the caddie's on the round, before the rules – long rules hid it (Sascha 17.10.2026) */}
      <button type="button" className="btn-secondary read-rules" aria-pressed={talking} aria-label={tr('Read the rules aloud or stop', 'Spielform vorlesen oder stoppen')} title={tr('Read aloud', 'Vorlesen')} onClick={() => toggleSpeak(rulesSpoken(props.form))}>
        <SpeakerIcon size={22} />
      </button>
      <ul className="game-rules">
        {props.form.rules().map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </>
  );
}


// ---------- setup ----------

function GameSetup(props: { draft: Draft; onChange: (d: Draft) => void; onBack: () => void; onCourse: () => void; onStart: (g: Game) => void; /** 5+5+10 challenged in a pool: its page */ onDuel?: (code: string) => void }) {
  const d = props.draft;
  // 5+5+10: one against one, a duel each (Sascha 09.11.2026) – in the pool of bets of the day, without one a new one
  // (10.11.2026: "against linked friends or players made as in a round")
  const duel = d.formChosen !== false && d.form === 'fivefiveten' && !!props.onDuel;
  const duelBox = useRef<HTMLDivElement>(null);
  const wasDuel = useRef(duel);
  useEffect(() => {
    // the first part after the rules card ("Gegner")
    if (duel && !wasDuel.current) (duelBox.current?.nextElementSibling ?? duelBox.current)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    wasDuel.current = duel;
  }, [duel]);
  // euro or dollar (Sascha 01.11.2026): as chosen – else the dollar on a course in the USA; the stakes shown in it
  const currency: Currency = typeof d.settings.currency === 'string' && /^[A-Z]{3}$/.test(d.settings.currency) ? d.settings.currency : d.course && inUsa([d.course.lon, d.course.lat]) ? 'USD' : 'EUR';
  // what is played for (Sascha 03.11.2026) – money in its currency, a thing, nothing; the stakes shown in it
  const prize = d.prize ?? null;
  setMoneySym(prize ? prizeSym(prize) : currencySymbol(currency));
  const none = !!prize && isNone(prize);
  const f = formDef(d.form);
  const chosen = d.formChosen !== false; // a draft from before 03.11.2026 had its form
  const [picker, setPicker] = useState(false);
  const [favs, setFavs] = useState(loadFormFavs);
  const byName = [...FORMS].sort((a, b) => a.name().localeCompare(b.name(), getLang()));
  // front nine, back nine and the total: only the 18-hole combinations (Sascha 03.11.2026: "9 holes make no sense for 5+5+10")
  const needs18 = d.form === 'fivefiveten' || d.form === 'nassau';
  const options = useMemo(() => {
    if (!d.course) return [];
    const all = loopOptions(d.course.holes);
    const full = needs18 ? all.filter((o) => buildRoundHoles(d.course!.holes, o).length === 18) : all;
    return full.length ? full : all;
  }, [d.course, needs18]);
  // the tees the course offers – as in the round setup
  const offered = useMemo(() => (d.course ? courseTees(d.course.id, loadGeometry(d.course.id).teeColours) : null), [d.course]);
  const option = options.find((o) => o.id === d.optionId) ?? options[0];
  const holes: GameHole[] = d.course && option
    ? buildRoundHoles(d.course.holes, option).map((h) => ({ label: h.label, par: h.par, si: h.strokeIndex }))
    : Array.from({ length: 18 }, (_, i) => ({ label: String(i + 1), par: 4, si: 0 }));
  // the playing handicap from each player's HCP, tee, course rating and slope – the same as the round setup
  const rholes = d.course && option ? buildRoundHoles(d.course.holes, option) : [];
  const nine = rholes.length === 9;
  const lady = isLady();
  const startTee = offered ? defaultTee(offered.tees) : null;
  // me: the standard tee from my profile where the course has it (Sascha 22.10.2026)
  const myTee = offered ? profileTee(offered, loadProfile().tee, d.course?.id, d.course ? inUsa([d.course.lon, d.course.lat]) : false) ?? defaultTee(offered.tees, lady) : null;
  // only the course's own tees (Sascha 22.10.2026)
  const teeOf = (p: DraftPlayer) => (p.tee && offered?.tees.includes(p.tee) ? p.tee : p.id === 'me' ? myTee : startTee);
  // the values other players entered for this course, and the player's own – read again when new ones came (as the round setup)
  const [, setRatingsSeen] = useState(0);
  useEffect(() => {
    if (!d.course) return;
    let alive = true;
    fetchShared(d.course.id).then(() => alive && setRatingsSeen((k) => k + 1));
    return () => {
      alive = false;
    };
  }, [d.course?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const loopHoles = d.course ? d.course.holes.filter((h) => h.loop === rholes[0]?.loop) : [];
  const parSum = nine ? loopHoles.reduce((s, h) => s + (h.par || 0), 0) * (loopHoles.length <= 9 ? 2 : 1) : rholes.reduce((s, h) => s + (h.par || 0), 0);
  const ratingOf = (p: DraftPlayer) => (d.course && (rholes.length === 18 || nine) ? ratingFor(d.course.id, teeOf(p) ?? '–', rholes, p.id === 'me' && lady) : null);
  const playingOf = (p: DraftPlayer): number | null => {
    const idx = parseIndex(p.hcp);
    if (idx == null) return null;
    const r = ratingOf(p);
    const par = r?.par ?? parSum;
    if (r) return nine ? Math.round((idx * (r.slope / 113) + (r.cr - par)) / 2) : courseHandicap(idx, r, par);
    return Math.round(nine ? idx / 2 : idx);
  };
  const teeChoices = d.course && offered ? teeChoicesFor(d.course.id, rholes, offered.tees) : [];
  const myRating = d.players[0] ? ratingOf(d.players[0]) : null;
  const n = d.players.length;
  const fits = fitsPlayers(f, n);
  const sides = sidesOf(d.form, n, Number(d.settings.partner ?? 1));
  const set = (patch: Partial<Draft>) => props.onChange(withWhs({ ...d, ...patch }));
  const latest = useRef(d); // the draft as it is now – for "Rückgängig" after a player swiped away
  latest.current = d;
  const whs = f.hcpFor?.(n);
  const setPlayer = (id: string, patch: Partial<DraftPlayer>) => set({ players: d.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const label = (i: number) => d.players[i].name.trim() || tr(`Player ${i + 1}`, `Spieler ${i + 1}`);

  const start = () => {
    const players = d.players.map((p, i) => ({ id: p.id, name: label(i), hcp: playingOf(p) }));
    const g: Game = {
      id: newId(),
      createdAt: new Date().toISOString(),
      finishedAt: null,
      courseName: d.course?.name ?? tr('Without course', 'Ohne Platz'),
      holes,
      players,
      form: d.form,
      settings: { ...d.settings, currency: prize && isMoney(prize) ? prize.currency : currency },
      prize: prize ?? undefined,
      scores: Object.fromEntries(players.map((p) => [p.id, holes.map(() => null)])),
      extra: holes.map(() => ({})),
      current: 0,
      who: d.who ?? defaultWho(d.form),
      ...((d.who ?? defaultWho(d.form)) === 'one' && d.scorer && players.some((p) => p.id === d.scorer) ? { scorer: d.scorer } : {}),
      ...((d.who ?? defaultWho(d.form)) === 'one' && d.ownDetails?.length ? { ownDetails: d.ownDetails } : {}),
    };
    // played on the GPS map like a round (Sascha 16.10.2026)
    props.onStart(d.course && option ? { ...g, round: roundForGame(g, d.course, buildRoundHoles(d.course.holes, option), option.loops) } : g);
  };

  return (
    <main className="screen">
      <TopBar title={tr('New game', 'Neues Spiel')} onBack={props.onBack} />

      {/* the form first, then the course (Sascha 03.11.2026: "the form decides what the course offers – 5+5+10 only 18
          holes") */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">{tr('Game form', 'Spielform')}</span>
        <div className="settings-list">
          <button type="button" className="settings-row" onClick={() => setPicker(true)}>
            <span>{tr('Form', 'Spielform')}</span>
            <span className={`settings-value${chosen ? '' : ' need'}`}>{chosen ? f.name() : tr('Choose a game form', 'Spielform wählen')}</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      {/* 5+5+10 one against one, in the pool of bets – also across flights (Sascha 09.11.2026) */}
      {duel && (
        <>
          {/* its rules as every form's – one or more opponents, who keeps the score (Sascha 10.11.2026: "that belongs in the
              form's description") */}
          <div ref={duelBox} className="card">
            <FormRules form={f} />
          </div>
          <DuelSetup onDone={props.onDuel!} />
        </>
      )}

      {!duel && (
      <>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">{tr('Course', 'Platz')}</span>
        <div className="settings-list">
          <button type="button" className="settings-row" onClick={props.onCourse}>
            <span>{tr('Course', 'Platz')}</span>
            <span className={`settings-value${d.course ? '' : ' need'}`}>{d.course?.name ?? tr('Choose a course', 'Platz wählen')}</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
        {d.course && options.length > 1 && (
          <div className="choice-grid">
            {options.map((o) => (
              <button key={o.id} type="button" className="choice choice-loop" aria-pressed={o.id === option?.id} onClick={() => set({ optionId: o.id })}>
                <strong>{o.label.split(' · ')[0]}</strong>
                {o.label.includes(' · ') && <span className="small muted">{o.label.split(' · ').slice(1).join(' · ')}</span>}
              </button>
            ))}
          </div>
        )}
        {d.course && holes.some((h) => !h.par) && (
          <span className="muted small">{tr('Some holes have no par – set it on the hole.', 'Einige Löcher haben kein Par – am Loch einstellen.')}</span>
        )}
      </section>

      {/* its rules under the course – so the course stays in view (17.10.2026) */}
      {chosen && (
        <div className="card">
          <FormRules form={f} />
        </div>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">
          {tr('Players', 'Spieler')}
          {chosen && ` · ${playersText(f)}`}
        </span>
        {/* name · tee · HCP · playing handicap – the same row as in the round setup (Sascha 21.10.2026) */}
        {d.players.map((p, i) => (
          <PlayerRow
            key={p.id}
            className="game-player-row"
            player={{ id: `g${p.id}`, name: p.name, index: p.hcp, handicap: '', tee: teeOf(p) }}
            nameLabel={tr(`Player ${i + 1}`, `Spieler ${i + 1}`)}
            rating={ratingOf(p)}
            playing={playingOf(p)}
            allowance={d.settings.allowance != null ? Number(d.settings.allowance) : d.settings.net === false ? 0 : 100}
            nine={nine}
            tees={teeChoices.length ? teeChoices : undefined}
            onChange={(np) => setPlayer(p.id, { name: np.name, hcp: np.index, tee: np.tee })}
            onRemove={
              i > 0
                ? () => {
                    set({ players: d.players.filter((x) => x.id !== p.id) });
                    return () => {
                      const cur = latest.current;
                      if (cur.players.some((x) => x.id === p.id) || cur.players.length >= 4) return;
                      props.onChange(withWhs({ ...cur, players: [...cur.players.slice(0, i), p, ...cur.players.slice(i)] }));
                    };
                  }
                : undefined
            }
          />
        ))}
        {/* course rating and slope as in the round setup – shown, or typed from the club's scorecard (Sascha 25.10.2026) */}
        {d.course && (rholes.length === 18 || nine) && (
          <RatingLine
            rating={myRating}
            nine={nine}
            onSave={(v) => {
              saveOwnRating(d.course!.id, teeOf(d.players[0]) ?? '–', rholes, v);
              setRatingsSeen((k) => k + 1);
            }}
          />
        )}
        {(n < 4 || d.players.some((p, k) => k > 0 && !p.name.trim() && !p.hcp.trim())) && (
          // a friend takes the first empty row (Chicago starts with four), else a new one
          <FriendChips
            taken={d.players.map((p) => p.name)}
            onAdd={(fr) => {
              const row = { id: newId(), name: fr.name, hcp: fr.hcp };
              const k = d.players.findIndex((p, j) => j > 0 && !p.name.trim() && !p.hcp.trim());
              set({ players: k > 0 ? d.players.map((p, j) => (j === k ? row : p)) : [...d.players, row].slice(0, 4) });
            }}
          />
        )}
        {n < 4 && (
          <AddRow label={tr('Add player', 'Spieler hinzufügen')} onClick={() => set({ players: [...d.players, { id: newId(), name: '', hcp: '' }] })} />
        )}
        {chosen && sides && fits && (
          <div className="game-setting">
            <span className="stepper-label">{tr(`Partner of ${label(0)}`, `Partner von ${label(0)}`)}</span>
            <div className="chip-set">
              {[1, 2, 3].map((k) => (
                <button key={k} type="button" className={`chip${sides[0][1] === k ? ' on' : ''}`} aria-pressed={sides[0][1] === k} onClick={() => set({ settings: { ...d.settings, partner: k } })}>
                  {label(k)}
                </button>
              ))}
            </div>
            <span className="small">
              {tr('Teams', 'Teams')}: {sides[0].map(label).join(' & ')} {tr('vs', 'gegen')} {sides[1].map(label).join(' & ')}
            </span>
          </div>
        )}
        {chosen && d.form === 'wolf' && fits && <span className="small">{tr('The wolf rotates in this order.', 'Der Wolf wechselt in dieser Reihenfolge.')}</span>}
        {chosen && !fits && (
          <span className="small good-text">
            {tr(`${f.name()} needs ${playersText(f)} – you are ${n}.`, `${f.name()} braucht ${playersText(f)} – ihr seid ${n}.`)}
          </span>
        )}
      </section>

      {/* how the scores are entered on several phones (Sascha 07.11.2026: "show how the score entry is done – the
          defaults by the game"), as "Score-Erfassung" in Rounds; right after the players (Facelift 11.11.2026, g1/o1 –
          in every setup the same place) */}
      {chosen && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="eyebrow">{tr('Score entry', 'Score-Erfassung')}</span>
          <SettingsList>
            <ChoiceRow<ScoreWho>
              label={tr('Who enters', 'Wer erfasst')}
              title={tr('Who enters the scores', 'Wer erfasst die Scores')}
              value={d.who ?? defaultWho(d.form)}
              onChange={(who) => set({ who })}
              options={WHO.map((w) => ({ value: w.v, name: w.name(), text: w.text() }))}
            />
            {(d.who ?? defaultWho(d.form)) === 'one' && (
              <ChoiceRow<string>
                label={tr('Scorer', 'Schreiber')}
                value={d.players.some((p) => p.id === d.scorer) ? d.scorer! : (d.players[0]?.id ?? '')}
                onChange={(scorer) => set({ scorer })}
                options={d.players.map((p, k) => ({ value: p.id, name: label(k) }))}
              />
            )}
            {(d.who ?? defaultWho(d.form)) === 'one' && (
              <OwnDetailsRow
                names={d.players.map((p, k) => ({ p, k })).filter(({ p }) => p.id !== (d.players.some((x) => x.id === d.scorer) ? d.scorer : d.players[0]?.id)).map(({ k }) => label(k))}
                value={d.ownDetails ?? []}
                onChange={(ownDetails) => set({ ownDetails })}
              />
            )}
          </SettingsList>
        </section>
      )}


      {/* Worum – what is played for, then the stakes (docs/DESIGN.md: Was → Wo → Wer → Worum → Einstellungen, Sascha 03.11.2026) */}
      {chosen && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="eyebrow">{tr('Played for', 'Worum')}</span>
          <SettingsList>
            {/* what is played for – money (euro or dollar), drinks, a meal, cleaning the clubs, one's own, or nothing; to choose,
                the same row as the bets' (Sascha 03.11.2026: "no trouble for gambling – always other stakes too, and none") */}
            <PrizeRow
              value={prize}
              onChange={(p) => {
                // the stakes follow: a thing 1× (Sascha 04.11.2026: "drinks, food – 1×, not 5×"), with front, back and 18 one
                // drink on the 18 ("18 holes for one drink"); back to money the form's own
                const next: Record<string, number | boolean | string> = { ...d.settings, ...(isMoney(p) ? { currency: p.currency } : {}) };
                if (!isMoney(p) && !isNone(p)) Object.assign(next, thingStakes(f));
                else if (isMoney(p) && prize && !isMoney(prize)) for (const st of f.settings.filter((x) => x.type === 'stake')) next[st.key] = st.default as number;
                set({ prize: p, settings: next });
              }}
            />
            {!none &&
              f.settings
                .filter((s) => s.type === 'stake' && (!s.when || s.when(d.settings)))
                .map((s) => (
                  <StakeRow
                    key={s.key}
                    label={s.label()}
                    value={Number(d.settings[s.key] ?? 0)}
                    // a thing counted: 1 to 5 ("2 × Getränk") – "none" too where there are several (vorne, hinten, 18)
                    sym={prize && !isMoney(prize) ? prizeSym(prize) : undefined}
                    stakes={prize && !isMoney(prize) ? (f.settings.filter((x) => x.type === 'stake').length > 1 ? [0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5]) : undefined}
                    // a new start stake: the cap moves to a step of its doubling chain
                    onChange={(v) => set({ settings: { ...d.settings, [s.key]: v, ...(s.key === 'stake' && Number(d.settings.maxStake) > 0 ? { maxStake: String(snapCap(v, Number(d.settings.maxStake))) } : {}) } })}
                  />
                ))}
          </SettingsList>
        </section>
      )}

      {/* the settings as rows with a sheet, like "Format" in the round setup (Sascha 02.11.2026: "Rounds and Games are the
          base – not everything as tabs"); a yes/no as a switch; see docs/DESIGN.md */}
      {chosen && (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">{tr('Settings', 'Einstellungen')}</span>
        <SettingsList>
          {f.settings
            .filter((s) => s.group !== 'house' && s.type !== 'bool' && s.type !== 'cap' && s.type !== 'presses' && s.type !== 'stake' && (!s.when || s.when(d.settings)))
            .map((s) =>
              s.type === 'choice' ? (
                <ChoiceRow
                  key={s.key}
                  label={s.label()}
                  options={s.options!.map((o) => ({ value: o.value, name: o.label() }))}
                  value={String(d.settings[s.key])}
                  onChange={(v) => set({ settings: { ...d.settings, [s.key]: v }, ...(s.key === 'allowance' ? { hcpTouched: true } : {}) })}
                />
              ) : s.type === 'stake' ? (
                // the amounts as a list like every other row's sheet (Sascha 03.11.2026: "the stake looks other than the
                // other menus")
                <StakeRow
                  key={s.key}
                  label={s.label()}
                  value={Number(d.settings[s.key] ?? 0)}
                  // a thing counted: 1 to 5 ("2 × Getränk")
                  sym={prize && !isMoney(prize) ? prizeSym(prize) : undefined}
                  stakes={prize && !isMoney(prize) ? (f.settings.filter((x) => x.type === 'stake').length > 1 ? [0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5]) : undefined}
                  // a new start stake: the cap moves to a step of its doubling chain
                  onChange={(v) => set({ settings: { ...d.settings, [s.key]: v, ...(s.key === 'stake' && Number(d.settings.maxStake) > 0 ? { maxStake: String(snapCap(v, Number(d.settings.maxStake))) } : {}) } })}
                />
              ) : null,
            )}
          {/* house rules: one row, its switches in the sheet (Sascha 20.10.2026: "summarise them sensibly") */}
          {f.settings.some((s) => s.group === 'house') && (
            <SheetRow
              label={tr('House rules', 'Hausregeln')}
              value={(() => {
                const on = f.settings.filter((s) => s.group === 'house' && (d.settings[s.key] === true || d.settings[s.key] === 'true')).length;
                return on === 0 ? tr('none', 'keine') : on === 1 ? tr('1 rule', '1 Regel') : tr(`${on} rules`, `${on} Regeln`);
              })()}
            >
              <ToggleList>
                {f.settings
                  .filter((s) => s.group === 'house')
                  .map((s) => {
                    const on = d.settings[s.key] === true || d.settings[s.key] === 'true';
                    return <ToggleRow key={s.key} inList pick label={s.label()} on={on} onChange={(v) => set({ settings: { ...d.settings, [s.key]: v } })} />;
                  })}
              </ToggleList>
            </SheetRow>
          )}
          {/* the press: one row like the house rules and the stake, its switch and limits in the sheet (Sascha 10.11.2026:
              "Press everywhere as the other settings – as Hausregeln, Einsatz") */}
          {f.settings.some((s) => s.key === 'double') && (
            <SheetRow label={tr('Press', 'Press')} title={tr('Press (double the stake)', 'Press (Einsatz verdoppeln)')} value={pressText(d.settings)}>
              <ToggleList>
                <ToggleRow inList label={tr('Press (double the stake)', 'Press (Einsatz verdoppeln)')} text={tr('The last one may double the stake.', 'Der Letzte darf den Einsatz verdoppeln.')} on={d.settings.double === true || d.settings.double === 'true'} onChange={(v) => set({ settings: { ...d.settings, double: v } })} />
              </ToggleList>
              {f.settings.some((s) => (s.type === 'cap' || s.type === 'presses') && (!s.when || s.when(d.settings))) && (
                <SettingsList>
                  {f.settings
                    .filter((s) => (s.type === 'cap' || s.type === 'presses') && (!s.when || s.when(d.settings)))
                    .map((s) =>
                      s.type === 'cap' ? (
                        <CapRow key={s.key} label={s.label()} stake={Number(d.settings.stake ?? 0)} value={Number(d.settings[s.key] ?? 0)} onChange={(v) => set({ settings: { ...d.settings, [s.key]: String(v), maxPresses: '0' } })} />
                      ) : (
                        <PressRow key={s.key} label={s.label()} settings={d.settings} onChange={(patch) => set({ settings: { ...d.settings, ...patch } })} />
                      ),
                    )}
                </SettingsList>
              )}
            </SheetRow>
          )}
        </SettingsList>
        {whs && f.settings.some((s) => s.key === 'allowance' && (!s.when || s.when(d.settings))) && (
          <span className="muted small">
            {tr(`WHS recommendation for ${f.name()} with ${n} players: ${whs} %`, `WHS-Empfehlung für ${f.name()} mit ${n} Spielern: ${whs} %`)}
          </span>
        )}
        {f.settings.some((s) => s.group !== 'house' && s.type === 'bool' && s.key !== 'double' && (!s.when || s.when(d.settings))) && (
          <ToggleList>
            {f.settings
              .filter((s) => s.group !== 'house' && s.type === 'bool' && s.key !== 'double' && (!s.when || s.when(d.settings)))
              .map((s) => (
                <ToggleRow key={s.key} inList pick label={s.label()} on={d.settings[s.key] === true || d.settings[s.key] === 'true'} onChange={(v) => set({ settings: { ...d.settings, [s.key]: v } })} />
              ))}
          </ToggleList>
        )}
      </section>
      )}
      </>
      )}

      {picker && (
        <div className="sheet-backdrop" onClick={() => setPicker(false)}>
          <section className="sheet" role="dialog" aria-label={tr('Choose game form', 'Spielform wählen')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('Choose game form', 'Spielform wählen')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setPicker(false)}>
                ✕
              </button>
            </div>
            {/* favourites first in their own group, then the rest alphabetically (Sascha 23.10.2026) */}
            {[
              { key: 'fav', title: tr('Favourites', 'Favoriten'), forms: byName.filter((o) => favs.includes(o.id)) },
              { key: 'all', title: favs.length ? tr('More game forms', 'Weitere Spielformen') : '', forms: byName.filter((o) => !favs.includes(o.id)) },
            ]
              .filter((g) => g.forms.length)
              .map((g) => (
                <div key={g.key} className="pick-group" data-group={g.key}>
                  {g.title && <span className="eyebrow">{g.title}</span>}
                  <div className="pick-list">
                    {g.forms.map((o) => {
                      const fav = favs.includes(o.id);
                      return (
                        <div key={o.id} className="pick-row">
                          <button
                            type="button"
                            className="pick-option"
                            aria-pressed={chosen && o.id === d.form}
                            onClick={() => {
                              props.onChange(withWhs({ ...d, form: o.id, formChosen: true, players: atLeast(d.players, o.players[0]), settings: { ...defaults(o), ...(d.prize && !isMoney(d.prize) && !isNone(d.prize) ? thingStakes(o) : {}), ...(d.settings.partner != null ? { partner: d.settings.partner } : {}) }, hcpTouched: false }));
                              setPicker(false);
                            }}
                          >
                            <span className="grow">
                              <strong>{o.name()}</strong>
                              <span className="muted small">{o.short()}</span>
                              <span className="small" style={{ color: 'var(--muted)' }}>{playersText(o)}</span>
                            </span>
                            {chosen && o.id === d.form && <span className="pick-check" aria-hidden="true">✓</span>}
                          </button>
                          <button
                            type="button"
                            className={`icon-btn fav-star${fav ? ' on' : ''}`}
                            aria-pressed={fav}
                            aria-label={fav ? tr(`Remove ${o.name()} from favourites`, `${o.name()} aus den Favoriten`) : tr(`Mark ${o.name()} as favourite`, `${o.name()} als Favorit`)}
                            onClick={() => setFavs(toggleFormFav(o.id))}
                          >
                            <StarIcon on={fav} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </section>
        </div>
      )}

      {!duel && (
        <>
          <span className="spacer" />
          {/* a game is played on a course (Sascha 15.10.2026): par and stroke index come from it – no start without one */}
          <div className="sticky-cta">
            <button type="button" className="btn-primary" onClick={start} disabled={!chosen || !fits || !d.course || !prize}>
              {tr('Start game', 'Spiel starten')}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

// the favourite mark of a game form: outline, filled in the brand green once marked
function StarIcon(props: { on: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill={props.on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- playing ----------

const DOTS = [
  { key: 'sandy', label: () => 'Sandy' },
  { key: 'greenie', label: () => 'Greenie' },
  { key: 'chipin', label: () => 'Chip-in' },
  { key: 'longputt', label: () => tr('Putt > 10 m', 'Putt > 10 m') },
];

function GamePlay(props: { game: Game; onChange: (g: Game) => void; onBack: () => void; onFinish: (g: Game) => void; onDelete: (g: Game) => void }) {
  const g = props.game;
  const f = formDef(g.form);
  const i = g.current;
  const hole = g.holes[i];
  const st = standingOf(g);
  const last = i === g.holes.length - 1;
  // as in Rounds (Sascha 15.10.2026: "the same usability in every module"): the hole bar at the bottom, the overview
  // pulled up from it, and leaving = pause, finish or cancel
  const [drawer, setDrawer] = useState(false);
  const [exit, setExit] = useState<null | 'menu' | 'end'>(null);
  const [sheet, setSheet] = useState<null | 'card' | 'rules'>(null);
  const barTouch = useRef<number | null>(null);

  // every entry with its time – two phones in one shared game keep the later entry (sharedgame.ts)
  const setScore = (pid: string, v: number | null) => props.onChange(stamp({ ...g, scores: { ...g.scores, [pid]: g.scores[pid].map((s, k) => (k === i ? v : s)) } }, `s:${pid}:${i}`));
  const setExtra = (patch: Partial<HoleExtra>) => props.onChange(stamp({ ...g, extra: g.extra.map((e, k) => (k === i ? { ...e, ...patch } : e)) }, `x:${i}`));
  // a shared game: exchange with the others every 5 s (an entry made meanwhile stays)
  const [canShare, setCanShare] = useState(false);
  const [invite, setInvite] = useState(false);
  useEffect(() => {
    sharingAvailable().then(setCanShare);
  }, []);
  useGameExchange(g, props.onChange);
  const setPar = (par: number) => props.onChange({ ...g, holes: g.holes.map((h, k) => (k === i ? { ...h, par } : h)) });
  const go = (k: number) => props.onChange({ ...g, current: Math.max(0, Math.min(g.holes.length - 1, k)) });
  // "Jeder seinen eigenen" / "Einer für alle" (07.11.2026): what another phone enters stays its own
  const kept = keptBy(g);
  const allPar = () => props.onChange({ ...g, scores: Object.fromEntries(g.players.map((p) => [p.id, g.scores[p.id].map((s, k) => (k === i && s == null && !kept[p.id] ? hole.par || 4 : s))])) });
  const par = hole.par || 4;

  return (
    <main className="screen game-play">
      <TopBar
        title={
          <>
            {tr('Hole', 'Loch')} {hole.label}
            <span className="muted small game-hole-meta">
              {' '}
              · Par {hole.par || '?'}
              {hole.si ? ` · Hcp ${hole.si}` : ''}
            </span>
          </>
        }
        onBack={() => setExit('menu')}
        backLabel={tr('Leave', 'Verlassen')}
        right={<span className="muted small">{f.name()}</span>}
      />

      {!hole.par && (
        <div className="game-setting">
          <span className="stepper-label">{tr('Par of this hole', 'Par dieses Lochs')}</span>
          <div className="chip-set">
            {[3, 4, 5].map((v) => (
              <button key={v} type="button" className="chip" onClick={() => setPar(v)}>
                Par {v}
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="card game-scores">
        {g.players.map((p) => {
          const v = g.scores[p.id][i];
          const strokes = strokesOn(g, p)[i];
          if (kept[p.id] != null)
            return (
              <div key={p.id} className="stepper-row kept-elsewhere">
                <span className="stepper-label">
                  {p.name}
                  <span className="muted small">{kept[p.id] === p.name ? tr('enters his own score', 'trägt seinen Score selbst ein') : tr(`${kept[p.id]} enters it`, `${kept[p.id]} trägt ein`)}</span>
                </span>
                <strong className="stepper-value" aria-label={tr(`Score ${p.name}`, `Score ${p.name}`)}>{v ?? '–'}</strong>
              </div>
            );
          return (
            <div key={p.id} className="stepper-row">
              <span className="stepper-label">
                {p.name}
                {strokes > 0 && <span className="game-dots" aria-label={tr(`${strokes} stroke(s) received`, `${strokes} Vorgabeschlag/-schläge`)}>{'•'.repeat(strokes)}</span>}
              </span>
              <div className="stepper" role="group" aria-label={tr(`Strokes ${p.name}`, `Schläge ${p.name}`)}>
                <button type="button" aria-label={tr('minus one', 'minus eins')} onClick={() => setScore(p.id, v == null ? par - 1 : v <= 1 ? null : v - 1)}>
                  −
                </button>
                <span className={`stepper-value${v == null ? ' empty' : ''}`} aria-live="polite">
                  {v ?? '–'}
                </span>
                <button type="button" aria-label={tr('plus one', 'plus eins')} onClick={() => setScore(p.id, v == null ? par : v + 1)}>
                  +
                </button>
              </div>
            </div>
          );
        })}
        {g.players.some((p) => g.scores[p.id][i] == null && !kept[p.id]) && (
          <button type="button" className="chip" onClick={allPar}>
            {tr('Par for the rest', 'Par für alle übrigen')}
          </button>
        )}
      </section>

      <HoleExtras game={g} hole={i} onChange={setExtra} />

      {g.settings.double && Number(g.settings.stake) > 0 && <PressCard game={g} hole={i} onChange={props.onChange} />}

      <StandingCard game={g} />

      <span className="spacer" />
      <div
        className="game-dock"
        onTouchStart={(e) => (barTouch.current = e.touches[0].clientY)}
        onTouchEnd={(e) => {
          if (barTouch.current != null && barTouch.current - e.changedTouches[0].clientY > 40) setDrawer(true);
          barTouch.current = null;
        }}
      >
        <div className="hole-bar">
          <button type="button" className="hole-bar-handle" aria-label={tr('Open the hole overview', 'Lochübersicht öffnen')} onClick={() => setDrawer(true)}>
            <span />
          </button>
          <button type="button" className="hole-bar-arrow" aria-label={tr('Previous hole', 'Voriges Loch')} onClick={() => go(i - 1)} disabled={i === 0}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button type="button" className="map-score" aria-label={tr(`Hole ${hole.label} – open the overview`, `Loch ${hole.label} – Übersicht öffnen`)} onClick={() => setDrawer(true)}>
            {/* as the round's hole bar (Sascha 11.11.2026, design rounds 2–4): Loch and Par big, Hcp small */}
            <span className="hole-cell" aria-hidden="true">
              <small>{tr('Hole', 'Loch')}</small>
              <span className="map-hole-no">{hole.label}</span>
            </span>
            <span className="hole-cell" aria-hidden="true">
              <small>Par</small>
              <strong>{hole.par || '?'}</strong>
            </span>
            <span className="hole-bar-mini" aria-hidden="true">
              <span>
                <small>Hcp</small>
                <em>{hole.si || '?'}</em>
              </span>
            </span>
            <span className="sr-only">{`Par ${hole.par || '?'} · Hcp ${hole.si || '?'}`}</span>
            <span className="hole-bar-score muted small">
              {g.players.filter((p) => g.scores[p.id][i] != null).length}/{g.players.length}
            </span>
          </button>
          <button type="button" className="hole-bar-arrow" aria-label={last ? tr('Finish game', 'Spiel beenden') : tr('Next hole', 'Nächstes Loch')} onClick={() => (last ? setExit('end') : go(i + 1))}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {drawer && (
        <GameDrawer
          game={g}
          onGo={(k) => {
            go(k);
            setDrawer(false);
          }}
          onClose={() => setDrawer(false)}
          onRules={() => setSheet('rules')}
          onInvite={canShare ? () => { setDrawer(false); setInvite(true); } : null}
          onCard={() => setSheet('card')}
          onPause={props.onBack}
          onEnd={() => {
            setDrawer(false);
            setExit('end');
          }}
        />
      )}
      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <section className="sheet" role="dialog" aria-label={sheet === 'card' ? tr('Scorecard', 'Scorekarte') : f.name()} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{sheet === 'card' ? tr('Scorecard', 'Scorekarte') : f.name()}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setSheet(null)}>
                ✕
              </button>
            </div>
            {sheet === 'card' ? <ScoreGrid game={g} /> : <FormRules form={f} />}
          </section>
        </div>
      )}
      {invite && <InviteSheet game={g} onShared={(sg) => props.onChange(sg)} onClose={() => setInvite(false)} />}
      {exit && (
        <div className="sheet-backdrop" onClick={() => setExit(null)}>
          <section className="sheet" role="dialog" aria-label={tr('Leave the game', 'Spiel verlassen')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{exit === 'end' ? tr('Finish game?', 'Spiel beenden?') : `${f.name()} · ${g.courseName}`}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setExit(null)}>
                ✕
              </button>
            </div>
            {exit === 'menu' ? (
              // the action bar (docs/DESIGN.md) – cancelling red and last – then the one main button: finishing
              <div className="sheet-actions">
                <div className="sc-actions" role="group" aria-label={tr('This game', 'Dieses Spiel')}>
                  <button type="button" className="sc-action" aria-label={tr('Pause – continue later', 'Pausieren – später fortsetzen')} onClick={props.onBack}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 5v14M15 5v14" />
                    </svg>
                    <span>{tr('Pause', 'Pausieren')}</span>
                  </button>
                  <button type="button" className="sc-action danger" aria-label={tr('Cancel game', 'Spiel abbrechen')} onClick={() => props.onDelete(g)}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" />
                    </svg>
                    <span>{tr('Cancel', 'Abbrechen')}</span>
                  </button>
                </div>
                <button type="button" className="btn-primary" onClick={() => setExit('end')}>
                  {tr('Finish game', 'Spiel beenden')}
                </button>
              </div>
            ) : (
              <>
                <span className="muted">
                  {tr(`${holesPlayed(g)} of ${g.holes.length} holes complete. Holes without all scores do not count.`, `${holesPlayed(g)} von ${g.holes.length} Löchern vollständig. Löcher ohne alle Scores zählen nicht.`)}
                  {st.status ? ` ${st.status}` : ''}
                </span>
                <div className="sheet-actions">
                  <div className="sc-actions" role="group" aria-label={tr('Or', 'Oder')}>
                    <button type="button" className="sc-action" aria-label={tr('Back to the game', 'Zurück zum Spiel')} onClick={() => setExit(null)}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                      </svg>
                      <span>{tr('Back', 'Zurück')}</span>
                    </button>
                    <button type="button" className="sc-action danger" aria-label={tr('Delete game', 'Spiel löschen')} onClick={() => props.onDelete(g)}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                      </svg>
                      <span>{tr('Delete', 'Löschen')}</span>
                    </button>
                  </div>
                  <button type="button" className="btn-primary" onClick={() => props.onFinish(g)}>
                    {tr('Finish & settle', 'Beenden & abrechnen')}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

const euroText = money;

/** Press (Sascha 15.10.2026): the last one may double the stake – 0,10 € → 0,20 € … up to the highest stake. */
export function PressCard(props: { game: Game; hole: number; onChange: (g: Game) => void }) {
  const g = props.game;
  const st = standingOf(g);
  const presses = g.presses ?? [];
  const here = presses.find((x) => x.hole === props.hole);
  const low = Math.min(...st.rows.map((r) => r.points));
  const last = holesPlayed(g) > 0 && st.rows.some((r) => r.points !== low) ? st.rows.filter((r) => r.points === low) : [];
  const cap = stakeCap(g);
  // only at the start of a hole, before the first score is entered (Sascha's Chicago concept)
  const started = g.players.some((p) => g.scores[p.id]?.[props.hole] != null);
  return (
    <section className="card game-extra" aria-label="Press">
      <span className="stepper-label">
        {tr('Stake now', 'Einsatz jetzt')}: {euroText(stakeNow(g))}
        <span className="muted small">
          {' '}
          · {presses.length}× {tr('pressed', 'gepresst')}
          {cap !== Infinity && cap > 0 ? ` · max ${euroText(cap)}` : ''}
        </span>
      </span>
      {here ? (
        <button type="button" className="chip" onClick={() => props.onChange({ ...g, presses: presses.filter((x) => x !== here) })}>
          {tr(`Take back the press of ${st.rows.find((r) => r.id === here.by)?.name ?? ''}`, `Press von ${st.rows.find((r) => r.id === here.by)?.name ?? ''} zurücknehmen`)}
        </button>
      ) : started ? (
        <span className="muted small">{tr('Presses only at the start of a hole, before the first score.', 'Pressen nur zu Lochbeginn, vor der ersten Eingabe.')}</span>
      ) : !canPress(g) ? (
        <span className="muted small">{tr('Highest stake reached – no more presses.', 'Höchsteinsatz erreicht – kein Press mehr möglich.')}</span>
      ) : last.length ? (
        <div className="chip-set">
          {last.map((r) => (
            <button key={r.id} type="button" className="chip" onClick={() => props.onChange({ ...g, presses: [...presses, { hole: props.hole, by: r.id }] })}>
              {tr(`${r.name} presses (×2)`, `${r.name} presst (×2)`)}
            </button>
          ))}
        </div>
      ) : (
        <span className="muted small">{tr('The last one may press once someone is behind.', 'Pressen darf der Letzte, sobald jemand hinten liegt.')}</span>
      )}
    </section>
  );
}

export function StandingCard(props: { game: Game; final?: boolean }) {
  const g = props.game;
  const st = standingOf(g);
  const hasMoney = !isNone(gamePrize(g)) && st.money && Object.values(st.money).some((v) => Math.abs(v) > 0.001);
  const talking = useSpeaking();
  return (
    <section className="card game-standing" aria-label={tr('Standing', 'Zwischenstand')}>
      <div className="game-standing-head">
        <span className="eyebrow">{props.final ? tr('Result', 'Ergebnis') : tr('Standing', 'Zwischenstand')}</span>
        <button type="button" className="use-btn small" aria-label={tr('Read the standing aloud', 'Zwischenstand vorlesen')} title={tr('Read aloud', 'Vorlesen')} aria-pressed={talking} onClick={() => toggleSpeak(standingText(g, true))}>
          <SpeakerIcon size={16} />
        </button>
      </div>
      {st.status && <span className="small game-status">{st.status}</span>}
      <span className="muted small">
        {allowanceOf(g) ? tr(`Handicap ${allowanceOf(g)} %`, `Vorgabe ${allowanceOf(g)} %`) : tr('Gross, without handicap', 'Brutto, ohne Vorgabe')}
        {Number(g.settings.stake ?? 0) > 0 && !isNone(gamePrize(g)) ? ` · ${tr('stake', 'Einsatz')} ${euroText(stakeNow(g))}` : ''}

      </span>
      <ol className="game-rows">
        {st.rows.map((r) => (
          // level players share the place; only a leader of his own is marked
          <li key={r.id} className={st.rows.filter((o) => o.points === r.points).length === 1 && r === st.rows[0] ? 'lead' : ''}>
            <span className="game-rank">{1 + st.rows.filter((o) => o.points > r.points).length}</span>
            <span className="grow">
              <strong>{r.name}</strong>
              {r.detail && <span className="muted small"> · {r.detail}</span>}
            </span>
            <span className="game-value">{r.value}</span>
          </li>
        ))}
      </ol>
      {hasMoney && (
        // four players in two lines, two each (Sascha 04.11.2026)
        <div className={`game-money${g.players.length === 4 ? ' game-money-4' : ''}`}>
          {/* in the order of the ranking, 1 to 4 from left to right (Sascha 03.11.2026) */}
          {st.rows.map((r) => g.players.find((p) => p.id === r.id)!).filter(Boolean).map((p) => (
            <span key={p.id} className={st.money![p.id] > 0 ? 'good-text' : st.money![p.id] < 0 ? 'bad-text' : 'muted'}>
              {p.name} {formatEuro(st.money![p.id])}
            </span>
          ))}
        </div>
      )}
      {/* how it came about – per pair its nines (5+5+10), hole by hole (Chicago), Sascha 03.11.2026 */}
      {st.details?.map((d) => (
        <details key={d.title} className="game-details" open>
          <summary>{d.title}</summary>
          {/* a team game hole by hole as a table (Sascha 03.11.2026: "still not clear"): the pairs by short names, the
              winning number green, the result with its money below, pressed as a small badge; the names once below */}
          {d.lines.some((l) => l.row) ? (
            <>
              <table className="game-hist">
                <thead>
                  <tr>
                    <th>{tr('Hole', 'Loch')}</th>
                    <th>{tr('Pairs', 'Paarung')}</th>
                    <th>{tr('Numbers', 'Zahlen')}</th>
                    <th>{tr('Result', 'Ergebnis')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l, k) =>
                    l.row ? (
                      <tr key={k}>
                        <td className="game-hist-hole">
                          {l.row.hole}
                          {l.row.pressed > 0 && <span className="game-hist-press">{l.row.pressed > 1 ? `P×${l.row.pressed}` : 'P'}</span>}
                        </td>
                        <td className="game-hist-pairs">
                          <span className={l.row.win === 'a' ? 'won' : undefined}>{l.row.a}</span>
                          <span className="muted"> – </span>
                          <span className={l.row.win === 'b' ? 'won' : undefined}>{l.row.b}</span>
                        </td>
                        <td className="game-hist-nums">
                          <span className={l.row.win === 'a' ? 'won' : undefined}>{l.row.na}</span>
                          <span className="muted"> : </span>
                          <span className={l.row.win === 'b' ? 'won' : undefined}>{l.row.nb}</span>
                        </td>
                        <td className="game-hist-res">
                          {l.row.win ? (
                            <>
                              <strong>+{l.row.pts}</strong>
                              {l.row.amount && <small>{l.row.amount}</small>}
                            </>
                          ) : (
                            <span className="muted">{tr('tied', 'gleich')}</span>
                          )}
                        </td>
                      </tr>
                    ) : null,
                  )}
                </tbody>
              </table>
              {d.legend && <span className="muted small game-hist-legend">{d.legend} · {tr('P = pressed', 'P = gepresst')}</span>}
            </>
          ) : (
            <ul>
              {/* two lines a row (Sascha 03.11.2026: "better laid out"): what and its result, below it the scores */}
              {d.lines.map((l, k) => (
                <li key={k}>
                  <span className="game-details-top">
                    <span className="game-details-label">{l.label}</span>
                    {l.value && <strong className={/^(gleich|tied)$/.test(l.value) ? 'muted' : undefined}>{l.value}</strong>}
                  </span>
                  <span className="game-details-text">{l.text}</span>
                </li>
              ))}
            </ul>
            )}
        </details>
      ))}
    </section>
  );
}

function GameResult(props: { game: Game; onBack: () => void; backLabel?: string; onReopen: () => void; onDelete: () => void; onChange: (g: Game) => void }) {
  const g = props.game;
  const f = formDef(g.form);
  const st = standingOf(g);
  const pays = gameTransfers(g, st.money);
  const prize = gamePrize(g);
  const nm = (id: string) => g.players.find((p) => p.id === id)?.name ?? id;
  // the leaders' faces: oneself, or a linked friend (his photo and name from his profile); a guest without
  const leaders = winnerOf(st.rows) ? st.rows.filter((r) => r.points === st.rows[0].points) : [];
  const friends = loadFriends();
  const faces = leaders
    .map((r) => {
      if (r.id === 'me') return { name: r.name, me: true as boolean, photo: undefined as string | undefined };
      const fr = friends.find((x) => x.uid && (x.name.trim() === r.name.trim() || (x.fullName ?? '').trim() === r.name.trim()));
      return fr ? { name: fr.fullName || fr.name, me: false, photo: fr.photo } : null;
    })
    .filter((x): x is { name: string; me: boolean; photo: string | undefined } => !!x);
  // confirm the result like a scorecard (Sascha 16.10.2026: as signing a round) – only confirmed games count. As on a
  // round: confirmed it stands on top, to confirm it follows the result, the settlement and the scores (after checking them)
  // confirmed: one line as a signed round's (Sascha 03.11.2026: "much too big – at most as a signed round")
  const confirmCard = (
    <section className={g.signedAt ? 'card sign-card sc-status signed game-confirmed' : 'card sign-card'} aria-label={tr('Confirmation', 'Bestätigung')}>
      {g.signedAt ? (
        <>
          <span className="sc-status-icon" aria-hidden="true">
            <SignedIcon size={22} />
          </span>
          <span className="grow">
            <strong>{tr('Result confirmed', 'Ergebnis bestätigt')}</strong>
            <span className="muted small">
              {new Date(g.signedAt).toLocaleString(getLang() === 'de' ? 'de-DE' : undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {tr('counts in your balance', 'zählt in deiner Bilanz')}
            </span>
          </span>
          <button type="button" className="icon-btn" aria-label={tr('Withdraw the confirmation', 'Bestätigung zurücknehmen')} title={tr('Withdraw the confirmation', 'Bestätigung zurücknehmen')} onClick={() => props.onChange({ ...g, signedAt: null })}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </svg>
          </button>
        </>
      ) : (
        <>
          <span className="grow">
            <strong>{tr('Confirm the result', 'Ergebnis bestätigen')}</strong>
            <span className="muted small" style={{ display: 'block' }}>
              {tr('Like signing a scorecard – only confirmed games count in your balance.', 'Wie das Signieren einer Scorekarte – nur bestätigte Spiele zählen in deiner Bilanz.')}
            </span>
          </span>
          <button type="button" className="btn-primary" onClick={() => props.onChange({ ...g, signedAt: new Date().toISOString() })}>
            {tr('Confirm', 'Bestätigen')}
          </button>
        </>
      )}
    </section>
  );
  return (
    <main className="screen">
      <TopBar title={f.name()} onBack={props.onBack} backLabel={props.backLabel ?? tr('Games', 'Spiele')} />
      <span className="muted small">
        {g.courseName} · {new Date(g.createdAt).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined)} · {holesPlayed(g)}/{g.holes.length} {tr('holes', 'Löcher')}
      </span>
      {g.signedAt && confirmCard}
      {/* the winner with his photo – oneself or a linked friend, his name from his profile (Sascha 03.11.2026) */}
      <section className={`card game-winner${faces.length ? ' with-faces' : ''}`}>
        {faces.length > 0 && (
          <span className="game-winner-faces" aria-hidden="true">
            {faces.map((x) => (
              <Avatar key={x.name} name={x.name} me={x.me} photo={x.photo} size={56} />
            ))}
          </span>
        )}
        <span className="game-winner-text">
          <span className="eyebrow">{winnerOf(st.rows) ? tr('Winner', 'Sieger') : tr('Result', 'Ergebnis')}</span>
          <strong>{faces.length === 1 && leaders.length === 1 ? faces[0].name : (winnerOf(st.rows) ?? tr('Tied', 'Unentschieden'))}</strong>
          <span className="muted">{winnerOf(st.rows) ? st.rows[0].value : st.status}</span>
        </span>
      </section>
      <StandingCard game={g} final />
      {pays.length > 0 && (
        <section className="card">
          <span className="eyebrow">{tr('Settlement', 'Abrechnung')}</span>
          <ul className="game-pays">
            {pays.map((t) => (
              <li key={`${t.from}-${t.to}`}>
                {/* who pays whom, in words (Sascha 03.11.2026: "Cedric zahlt an Sascha 5 €" – "Erik gibt Cedric aus 1 × Getränk") */}
                <span>{oweText(nm(t.from), nm(t.to), prize)}</span>
                <strong>{prizeAmount(t.amount, prize)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ScoreGrid game={g} />
      <span className="spacer" />
      {/* the action bar as on a round's scorecard (docs/DESIGN.md, Sascha 03.11.2026) – deleting red, last; one tap, "Undo" and
          the bin bring it back (15.10.2026) – then the one main button: confirming */}
      <ShareResult game={g} onReopen={props.onReopen} onDelete={props.onDelete} />
      {!g.signedAt && confirmCard}
    </main>
  );
}

/** The scores as a scorecard of Rounds (Sascha 03.11.2026: "like the other scorecards in Rounds, with the legend"): the
 *  same table – per nine its block, Out / In, the golf marks and the legend; the game's holes and scores. */
export function ScoreGrid(props: { game: Game }) {
  const g = props.game;
  const round = {
    ...(g.round ?? {}),
    courseId: g.round?.courseId ?? '',
    tee: g.round?.tee ?? null,
    holes: g.holes.map((h, i) => ({ index: i, label: h.label, loop: '', number: i + 1, par: h.par, strokeIndex: h.si || i + 1 })),
    players: g.players.map((p) => ({ id: p.id, name: p.name, playingHandicap: null, isMe: p.id === 'me' })),
    entries: Object.fromEntries(g.players.map((p) => [p.id, g.holes.map((_, i) => ({ ...emptyEntry(), strokes: g.scores[p.id]?.[i] ?? null }))])),
  } as unknown as Round;
  return (
    <div className="game-grid-card">
      <span className="eyebrow">{tr('Scores', 'Scores')}</span>
      <ScoreTable round={round} />
    </div>
  );
}

/** Hammer on the hole: doublings accepted, or a side gave the hole up (night run 15./16.10.2026). */
function HammerCard(props: { game: Game; hole: number; onChange: (x: Partial<HoleExtra>) => void }) {
  const g = props.game;
  const x = g.extra[props.hole] ?? {};
  const h = x.hammer ?? 0;
  const [A, B] = teamsOf(g);
  const side = (ids: string[]) => ids.map((id) => g.players.find((p) => p.id === id)?.name ?? '?').join(' & ');
  return (
    <section className="card game-extra" aria-label="Hammer">
      <span className="stepper-label">
        {tr('This hole is worth', 'Dieses Loch zählt')} {money(Number(g.settings.stake ?? 0) * 2 ** h)}
        <span className="muted small"> · {h}× {tr('hammered', 'gehämmert')}</span>
      </span>
      <div className="chip-set">
        <button type="button" className="chip" onClick={() => props.onChange({ hammer: h + 1, conceded: undefined })}>
          {tr('Hammer (×2)', 'Hammer (×2)')}
        </button>
        {h > 0 && (
          <button type="button" className="chip" onClick={() => props.onChange({ hammer: h - 1 })}>
            {tr('Take back', 'Zurücknehmen')}
          </button>
        )}
      </div>
      <span className="muted small">{tr('A hammer declined: the side gives the hole up at its value before.', 'Hammer abgelehnt: die Seite gibt das Loch zum bisherigen Wert auf.')}</span>
      <div className="chip-set">
        {(['A', 'B'] as const).map((k) => (
          <button key={k} type="button" className={`chip${x.conceded === k ? ' on' : ''}`} aria-pressed={x.conceded === k} onClick={() => props.onChange({ conceded: x.conceded === k ? undefined : k })}>
            {tr(`${side(k === 'A' ? A : B)} gives up`, `${side(k === 'A' ? A : B)} gibt auf`)}
          </button>
        ))}
      </div>
    </section>
  );
}

/** The highest stake (Sascha 15.10.2026): the steps of the doubling chain up to 6,40 €, "no cap", and a field for higher
 *  steps (12,80 €, 25,60 € …) that only takes a step of the chain – since 03.11.2026 a row with its list like every other
 *  ("auch wieder mit Tabs"): each step with its doublings, one tap picks and closes. */
/** The press in one line (Sascha 10.11.2026): "Aus" – or "An · bis 1,60 $", "An · 4×", "An · ohne Limit". */
function pressText(s: Record<string, number | boolean | string>): string {
  if (!(s.double === true || s.double === 'true')) return tr('Off', 'Aus');
  const cap = Number(s.maxStake ?? 0);
  const presses = Number(s.maxPresses ?? 0);
  const limit = presses > 0 ? `${presses}×` : cap > 0 ? tr(`up to ${money(cap)}`, `bis ${money(cap)}`) : tr('no cap', 'ohne Limit');
  return `${tr('On', 'An')} · ${limit}`;
}

function CapRow(props: { label: string; stake: number; value: number; onChange: (v: number) => void }) {
  const chain = capChain(props.stake);
  const custom = props.value > 0 && !chain.some((c) => Math.abs(c - props.value) < 0.005);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const MORE = -1;
  const next = (() => {
    const top = chain[chain.length - 1] ?? props.stake;
    return [top * 2, top * 4, top * 8].map((v) => money(Math.round(v * 100) / 100)).join(', ');
  })();
  const close = () => {
    setOpen(false);
    setTyping(false);
    setError(null);
  };
  const take = () => {
    const v = Number(text.replace(/[€$]/g, '').replace(/\s/g, '').replace(',', '.'));
    if (!text.trim() || !Number.isFinite(v)) return setError(tr('Type an amount, e.g. ' + next.split(', ')[0], 'Gib einen Betrag ein, z. B. ' + next.split(', ')[0]));
    if (!onChain(props.stake, v))
      return setError(tr(`Only doublings of ${money(props.stake)} – e.g. ${next}.`, `Nur Verdopplungen von ${money(props.stake)} möglich – z. B. ${next}.`));
    props.onChange(Math.round(v * 100) / 100);
    close();
  };
  const times = (v: number) => (props.stake > 0 ? Math.round(Math.log2(v / props.stake)) : 0);
  const picked = chain.find((c) => Math.abs(c - props.value) < 0.005);
  return (
    <>
      <SettingsRow label={props.label} value={props.value > 0 ? tr(`up to ${money(props.value)}`, `bis ${money(props.value)}`) : tr('no cap', 'ohne Limit')} onClick={() => setOpen(true)} />
      {open && (
        <PickSheet<number>
          title={props.label}
          current={typing || custom ? MORE : props.value === 0 ? 0 : (picked ?? MORE)}
          options={[
            ...chain.map((v) => ({ value: v, name: money(v), text: tr(`${money(props.stake)} doubled ${times(v)}×`, `${money(props.stake)} ${times(v)}× verdoppelt`) })),
            { value: MORE, name: custom ? tr(`Higher: ${money(props.value)}`, `Höher: ${money(props.value)}`) : tr('Higher …', 'Höher …'), text: tr(`e.g. ${next}`, `z. B. ${next}`) },
            { value: 0, name: tr('No cap', 'Ohne Limit'), text: tr('Pressed as often as one likes', 'Beliebig oft pressen') },
          ]}
          onPick={(v) => {
            if (v === MORE) {
              setTyping(true);
              setText(custom ? money(props.value).replace(/ [€$]$/, '') : '');
              return;
            }
            props.onChange(v);
            close();
          }}
          onClose={close}
          {...(typing ? { onSave: take, saveLabel: tr('Use', 'Übernehmen') } : {})}
        >
          {typing && (
            <div className="cap-input">
              <input
                className="input"
                inputMode="decimal"
                autoFocus
                aria-label={tr('Highest stake in euros', 'Höchsteinsatz in Euro')}
                placeholder={next.split(', ')[0]}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && take()}
              />
            </div>
          )}
          {error && <span className="small good-text" role="alert">{error}</span>}
        </PickSheet>
      )}
    </>
  );
}

/** Presses allowed – the highest stake counted in doublings (Sascha 15.10.2026: from 0,10 € to 1,60 € is 4× pressing).
 *  Both rows set the same limit; with a start stake it is stored as the highest stake. */
/** The presses' limit as a row's value: "3×" or "ohne Limit" (as the picker counts them). */
function pressesText(settings: Record<string, number | boolean | string>): string {
  const stake = Number(settings.stake ?? 0);
  const cap = Number(settings.maxStake ?? 0);
  const now = stake > 0 ? (cap > 0 ? Math.round(Math.log2(cap / stake)) : 0) : Number(settings.maxPresses ?? 0);
  return now ? `${now}×` : tr('no cap', 'ohne Limit');
}

function PressRow(props: { label: string; settings: Record<string, number | boolean | string>; onChange: (patch: Record<string, string>) => void }) {
  const stake = Number(props.settings.stake ?? 0);
  const cap = Number(props.settings.maxStake ?? 0);
  const now = stake > 0 ? (cap > 0 ? Math.round(Math.log2(cap / stake)) : 0) : Number(props.settings.maxPresses ?? 0);
  const n = Math.max(stake > 0 ? capChain(stake).length : 5, now);
  const [open, setOpen] = useState(false);
  const pick = (k: number) =>
    stake > 0 ? props.onChange({ maxStake: k ? String(Math.round(stake * 2 ** k * 100) / 100) : '0', maxPresses: '0' }) : props.onChange({ maxPresses: String(k) });
  return (
    <>
      <SettingsRow label={props.label} value={pressesText(props.settings)} onClick={() => setOpen(true)} />
      {open && (
        <PickSheet<number>
          title={props.label}
          current={now}
          options={[
            ...Array.from({ length: n }, (_, i) => i + 1).map((k) => ({ value: k, name: `${k}×`, text: stake > 0 ? tr(`up to ${money(Math.round(stake * 2 ** k * 100) / 100)}`, `bis ${money(Math.round(stake * 2 ** k * 100) / 100)}`) : undefined })),
            { value: 0, name: tr('No cap', 'Ohne Limit'), text: tr('Pressed as often as one likes', 'Beliebig oft pressen') },
          ]}
          onPick={(k) => {
            pick(k);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The game's hole overview, pulled up from the hole bar – the same as in a round (Sascha 15.10.2026): every hole
 *  (a tap jumps there), the standing, the rules, and scorecard · pause · finish. */
function GameDrawer(props: { game: Game; onGo: (k: number) => void; onClose: () => void; onRules: () => void; onCard: () => void; onPause: () => void; onEnd: () => void; onInvite?: (() => void) | null }) {
  const g = props.game;
  const touchY = useRef<number | null>(null);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section
        className="sheet hole-drawer"
        role="dialog"
        aria-label={tr('Hole overview', 'Lochübersicht')}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (touchY.current = e.touches[0].clientY)}
        onTouchEnd={(e) => {
          if (touchY.current != null && e.changedTouches[0].clientY - touchY.current > 70 && (e.currentTarget.scrollTop ?? 0) <= 0) props.onClose();
          touchY.current = null;
        }}
      >
        <button type="button" className="drawer-handle" aria-label={tr('Close the hole overview', 'Lochübersicht schließen')} onClick={props.onClose}>
          <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden="true">
            <path d="M6 3l16 8 16-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="drawer-holes" role="group" aria-label={tr('Holes', 'Löcher')}>
          {g.holes.map((h, k) => {
            const n = g.players.filter((p) => g.scores[p.id][k] != null).length;
            const done = n === g.players.length;
            return (
              <button
                key={k}
                type="button"
                className={`drawer-hole${k === g.current ? ' current' : ''}${done ? ' par' : ''}`}
                aria-current={k === g.current ? 'true' : undefined}
                aria-label={tr(`Hole ${h.label}${done ? ', complete' : ''}`, `Loch ${h.label}${done ? ', vollständig' : ''}`)}
                onClick={() => props.onGo(k)}
              >
                <span className="drawer-hole-no">{h.label}</span>
                {done ? <span className="drawer-hole-score" aria-hidden="true"><CheckGlyph /></span> : n > 0 ? <span className="drawer-hole-score">{n}/{g.players.length}</span> : null}
              </button>
            );
          })}
        </div>
        <StandingCard game={g} />
        <div className="drawer-list">
          <button type="button" className="drawer-row" onClick={props.onRules}>
            <span>{tr('Game form & rules', 'Spielform & Regeln')}</span>
            <span aria-hidden="true">›</span>
          </button>
          {props.onInvite && (
            <button type="button" className="drawer-row" onClick={props.onInvite}>
              <span>{g.shared ? tr(`Players' phones · code ${g.shared.code}`, `Handys der Mitspieler · Code ${g.shared.code}`) : tr('Invite players', 'Mitspieler einladen')}</span>
              <span aria-hidden="true">›</span>
            </button>
          )}
        </div>
        <div className="drawer-actions">
          <button type="button" className="drawer-action" onClick={props.onCard}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <path d="M8 8h8M8 12h8M8 16h5" />
            </svg>
            <span>{tr('Scorecard', 'Scorekarte')}</span>
          </button>
          <button type="button" className="drawer-action" onClick={props.onPause} aria-label={tr('Pause game – continue later', 'Spiel pausieren – später fortsetzen')}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" rx="1.2" />
              <rect x="14" y="4" width="4" height="16" rx="1.2" />
            </svg>
            <span>{tr('Pause', 'Pausieren')}</span>
          </button>
          <button type="button" className="drawer-action end" onClick={props.onEnd} aria-label={tr('Finish game', 'Spiel beenden')}>
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" />
            </svg>
            <span>{tr('Finish', 'Beenden')}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

/** Chicago on this hole (Sascha 15.10.2026): each team's number, the difference, and plus/minus per player. */
function ChicagoHoleResult(props: { game: Game; hole: number }) {
  const g = props.game;
  const h = chicagoHole(g, props.hole);
  if (!h) return <span className="muted small">{tr('The team numbers show once all four scores are in.', 'Die Teamzahlen erscheinen, sobald alle vier Scores eingetragen sind.')}</span>;
  const nm = (ids: string[]) => ids.map((id) => g.players.find((p) => p.id === id)?.name ?? '?').join(' & ');
  const sign = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '±0');
  const netto = allowanceOf(g) > 0 && g.players.some((p) => strokesOn(g, p)[props.hole] > 0);
  return (
    <div className="chicago-result" aria-label={tr('Result of this hole', 'Ergebnis dieses Lochs')}>
      {[h.a, h.b].map((t, k) => {
        const pts = k === 0 ? h.diff : -h.diff;
        return (
          <div key={k} className="chicago-team">
            <span className="grow">{nm(t.ids)}</span>
            <strong className="chicago-num">{t.num}</strong>
            <strong className={pts > 0 ? 'good-text' : pts < 0 ? 'bad-text' : 'muted'}>{sign(pts)}</strong>
          </div>
        );
      })}
      <span className="muted small">
        {h.diff === 0
          ? tr('Same number – the hole is halved.', 'Gleiche Zahl – das Loch ist geteilt.')
          : tr(`Difference ${Math.max(h.a.num, h.b.num)} − ${Math.min(h.a.num, h.b.num)} = ${Math.abs(h.diff)}: each player of the lower team +${Math.abs(h.diff)}, of the other −${Math.abs(h.diff)}.`, `Differenz ${Math.max(h.a.num, h.b.num)} − ${Math.min(h.a.num, h.b.num)} = ${Math.abs(h.diff)}: jeder Spieler des Teams mit der kleineren Zahl +${Math.abs(h.diff)}, des anderen −${Math.abs(h.diff)}.`)}
        {netto ? tr(' (net)', ' (netto)') : ''}
      </span>
    </div>
  );
}

/** Share the result and who pays whom (WhatsApp, Messages …); without the share sheet it is copied. */
function ShareResult(props: { game: Game; onReopen: () => void; onDelete: () => void }) {
  const [done, setDone] = useState<string | null>(null);
  const share = async () => {
    const text = standingText(props.game, false);
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    try {
      if (nav.share) {
        await nav.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setDone(tr('Copied – paste it into your chat.', 'Kopiert – in den Chat einfügen.'));
    } catch {
      /* cancelled */
    }
  };
  return (
    <>
      <div className="sc-actions" role="group" aria-label={tr('This game', 'Dieses Spiel')}>
        <button type="button" className="sc-action" aria-label={tr('Share result', 'Ergebnis teilen')} onClick={share}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
              <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
            </svg>
          <span>{tr('Share', 'Teilen')}</span>
        </button>
        <button type="button" className="sc-action" aria-label={tr('Correct scores', 'Scores korrigieren')} onClick={props.onReopen}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
            </svg>
          <span>{tr('Correct', 'Korrigieren')}</span>
        </button>
        <button type="button" className="sc-action danger" aria-label={tr('Delete game', 'Spiel löschen')} onClick={props.onDelete}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
            </svg>
          <span>{tr('Delete', 'Löschen')}</span>
        </button>
      </div>
      {done && <span className="muted small">{done}</span>}
    </>
  );
}

type GamesFilter = 'confirm' | 'running' | 'played' | 'confirmed' | 'bin' | null;

/** The tiles over the games list – as over the rounds list (Sascha 17.10.2026): to confirm, in play, played,
 *  confirmed and the bin, each with its mark, one at a time filtering the list. */
function GameTiles(props: { games: Game[]; filter: GamesFilter; onFilter: (f: GamesFilter) => void }) {
  const trash = loadGameTrash().length;
  const toConfirm = props.games.filter((g) => g.finishedAt && !g.signedAt).length;
  const running = props.games.filter((g) => !g.finishedAt).length;
  const confirmed = props.games.filter((g) => g.finishedAt && g.signedAt).length;
  const played = props.games.filter((g) => g.finishedAt).length;
  const holes = props.games.filter((g) => g.finishedAt).reduce((n, g) => n + holesPlayed(g), 0);
  return (
    <div className="tile-row">
      <button type="button" className="tile" aria-pressed={props.filter === 'confirm'} disabled={!toConfirm} onClick={() => props.onFilter('confirm')}>
        <span className="tile-head">
          <span className={`tile-num${toConfirm ? ' good-text' : ''}`}>{toConfirm}</span>
          <span className="tile-mark"><ToSignIcon /></span>
        </span>
        <span className="muted small">{tr('to confirm', 'zu bestätigen')}</span>
      </button>
      {/* always there, as "pausiert" on the rounds page – 0 and white when no game waits (Sascha 25.10.2026) */}
      <button type="button" className="tile" aria-pressed={props.filter === 'running'} disabled={!running} onClick={() => props.onFilter('running')}>
        <span className="tile-head">
          <span className={`tile-num${running ? ' good-text' : ''}`}>{running}</span>
          <span className="tile-mark"><PausedIcon /></span>
        </span>
        <span className="muted small">{tr('paused', 'pausiert')}</span>
      </button>
      {/* filters like in rounds (Sascha 21.10.2026) */}
      <button type="button" className="tile" aria-pressed={props.filter === 'played'} disabled={!played} onClick={() => props.onFilter('played')}>
        <span className="tile-head">
          <span className="tile-num">{played}</span>
          <span className="tile-mark"><PlayedIcon /></span>
        </span>
        <span className="muted small">{tr('played', 'gespielt')}</span>
      </button>
      <button type="button" className="tile" aria-pressed={props.filter === 'confirmed'} disabled={!confirmed} onClick={() => props.onFilter('confirmed')}>
        <span className="tile-head">
          <span className="tile-num">{confirmed}</span>
          <span className="tile-mark"><SignedIcon /></span>
        </span>
        <span className="muted small">{tr('confirmed', 'bestätigt')}</span>
      </button>
      {/* the holes played – counts only, a white mark as on the rounds page */}
      <div className="tile">
        <span className="tile-head">
          <span className="tile-num">{holes}</span>
          <span className="tile-mark"><HolesIcon /></span>
        </span>
        <span className="muted small">{tr('holes', 'Löcher')}</span>
      </div>
      {/* always there, 0 and white when empty – like the rounds page (Sascha 23.10.2026) */}
      <button type="button" className="tile" aria-pressed={props.filter === 'bin'} disabled={!trash} onClick={() => props.onFilter('bin')}>
        <span className="tile-head">
          <span className="tile-num">{trash}</span>
          <span className="tile-mark"><DeletedIcon /></span>
        </span>
        <span className="muted small">{tr('deleted', 'gelöscht')}</span>
      </button>
    </div>
  );
}

/** What a form needs entered on a hole besides the strokes (wolf partner, bingo/bango/bongo, three-putts, pairing,
 *  hammer, dots) – in the plain game view and in the game sheet on the map. */
export function HoleExtras(props: { game: Game; hole: number; onChange: (patch: Partial<HoleExtra>) => void }) {
  const g = props.game;
  const f = formDef(g.form);
  const i = props.hole;
  const hole = g.holes[i];
  const x: HoleExtra = g.extra[i] ?? {};
  const wolf = g.players[i % g.players.length];
  const setExtra = props.onChange;
  return (
    <>
        {f.input === 'wolf' && (
          <section className="card game-extra">
            <span className="eyebrow">
              {tr('Wolf', 'Wolf')}: {wolf.name}
            </span>
            <span className="muted small">{tr('Partner after the tee shots – or alone.', 'Partner nach den Abschlägen – oder allein.')}</span>
            <div className="chip-set">
              {g.players
                .filter((p) => p.id !== wolf.id)
                .map((p) => (
                  <button key={p.id} type="button" className={`chip${x.wolfPartner === p.id ? ' on' : ''}`} aria-pressed={x.wolfPartner === p.id} onClick={() => setExtra({ wolfPartner: p.id, wolfBlind: false })}>
                    {p.name}
                  </button>
                ))}
              <button type="button" className={`chip${x.wolfPartner === null && !x.wolfBlind ? ' on' : ''}`} aria-pressed={x.wolfPartner === null && !x.wolfBlind} onClick={() => setExtra({ wolfPartner: null, wolfBlind: false })}>
                Lone Wolf
              </button>
              <button type="button" className={`chip${x.wolfPartner === null && x.wolfBlind ? ' on' : ''}`} aria-pressed={x.wolfPartner === null && !!x.wolfBlind} onClick={() => setExtra({ wolfPartner: null, wolfBlind: true })}>
                Blind Wolf ×2
              </button>
            </div>
          </section>
        )}

        {f.input === 'bbb' && (
          <section className="card game-extra">
            {(
              [
                ['bingo', 'Bingo', tr('first on the green', 'zuerst auf dem Grün')],
                ['bango', 'Bango', tr('closest to the pin', 'am nächsten zur Fahne')],
                ['bongo', 'Bongo', tr('first in the hole', 'zuerst eingelocht')],
              ] as const
            ).map(([k, nm, text]) => (
              <div key={k} className="game-setting">
                <span className="stepper-label">
                  {nm} <span className="muted small">{text}</span>
                </span>
                <div className="chip-set">
                  {g.players.map((p) => (
                    <button key={p.id} type="button" className={`chip${x[k] === p.id ? ' on' : ''}`} aria-pressed={x[k] === p.id} onClick={() => setExtra({ [k]: x[k] === p.id ? null : p.id })}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {f.input === 'snake' && (
          <section className="card game-extra">
            <span className="stepper-label">{tr('Three-putt on this hole', 'Dreiputt an diesem Loch')}</span>
            <span className="muted small">{tr('In the order they happened – the last one takes the snake.', 'In der Reihenfolge, in der sie passiert sind – der Letzte bekommt die Schlange.')}</span>
            <div className="chip-set">
              {g.players.map((p) => {
                const on = (x.threePutt ?? []).includes(p.id);
                return (
                  <button key={p.id} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setExtra({ threePutt: on ? x.threePutt!.filter((id) => id !== p.id) : [...(x.threePutt ?? []), p.id] })}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {f.input === 'chicago' && (
          <section className="card game-extra" aria-label={tr('Pairing', 'Paarung')}>
            <span className="stepper-label">{tr('Pairing on this hole', 'Paarung an diesem Loch')}</span>
            <div className="chip-set">
              {[1, 2, 3].map((k) => {
                const [A, B] = chicagoTeams({ players: g.players, extra: g.extra.map((e, j) => (j === i ? { ...e, pairing: k } : e)) }, i);
                const on = chicagoTeams(g, i)[0][1] === A[1];
                const nm = (ids: string[]) => ids.map((id) => g.players.find((p) => p.id === id)?.name ?? '?').join(' & ');
                return (
                  <button key={k} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setExtra({ pairing: k })}>
                    {nm(A)} {tr('vs', 'gegen')} {nm(B)}
                  </button>
                );
              })}
            </div>
            <ChicagoHoleResult game={g} hole={i} />
          </section>
        )}

        {f.input === 'hammer' && (
          <HammerCard game={g} hole={i} onChange={setExtra} />
        )}

        {f.input === 'dots' && (
          <section className="card game-extra">
            <span className="muted small">{tr('Birdies and eagles count by themselves.', 'Birdies und Eagles zählen von selbst.')}</span>
            {g.players.map((p) => (
              <div key={p.id} className="game-setting">
                <span className="stepper-label">{p.name}</span>
                <div className="chip-set">
                  {DOTS.filter((dt) => dt.key !== 'greenie' || hole.par === 3).map((dt) => {
                    const mine = x.dots?.[p.id] ?? [];
                    const on = mine.includes(dt.key);
                    return (
                      <button key={dt.key} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setExtra({ dots: { ...x.dots, [p.id]: on ? mine.filter((k) => k !== dt.key) : [...mine, dt.key] } })}>
                        {dt.label()}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}
    </>
  );
}

const gameSym = (g: Game): string => prizeSym(gamePrize(g));
