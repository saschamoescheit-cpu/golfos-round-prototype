import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Course } from '../types';
import { tr } from '../lib/i18n';
import { buildRoundHoles, loopOptions } from '../lib/loops';
import { shownName, loadProfile } from '../lib/profile';
import { newId } from '../lib/storage';
import { isSpeaking, onSpeaking, stopSpeaking, toggleSpeak } from '../lib/caddietalk';
import { FORMS, chicagoHole, capChain, onChain, snapCap, money, teamsOf, chicagoTeams, stakeCap, allowanceOf, canPress, fitsPlayers, formDef, formatEuro, holesPlayed, playersText, sidesOf, stakeNow, standingOf, strokesOn, transfers, type FormDef, type FormId, type Game, type GameHole, type HoleExtra } from '../lib/gameforms';
import { deleteGame, loadGames, loadGameTrash, purgeGame, restoreGame, saveGame } from '../lib/gamestore';
import { Bin } from '../components/Bin';
import { InviteSheet, JoinSheet } from '../components/ShareGame';
import { exchange, sharingAvailable, stamp } from '../lib/sharedgame';
import { TopBar } from '../components/ui';
import { MENU_ICONS, MenuBar } from '../components/TabBar';
import { TopTools } from '../components/TopTools';
import { FriendChips, roughPlaying } from './Home';
import { CoursePicker } from './CoursePicker';

// The "Games" module (Sascha 15.10.2026): side games as a product of its own – choose a game form, the course and the
// players, enter the strokes hole by hole (plus what the form needs, e.g. the wolf's partner), and see the standing and
// who pays whom. Not linked to the round analysis yet; a side game next to a round may follow later.

export type GamesTab = 'play' | 'games' | 'balance' | 'rules' | 'profile';
type View =
  | { name: 'tab'; tab: GamesTab }
  | { name: 'setup'; draft: Draft }
  | { name: 'course'; draft: Draft }
  | { name: 'play'; game: Game }
  | { name: 'result'; game: Game };

interface DraftPlayer {
  id: string;
  name: string;
  hcp: string;
}
interface Draft {
  form: FormId;
  course: Course | null; // null = without course data (18 holes, par 4)
  optionId: string;
  players: DraftPlayer[];
  settings: Record<string, number | boolean | string>;
  hcpTouched?: boolean; // the player chose the handicap share himself – no WHS default over it any more
}

/** The leader – or nobody when the first two are level. */
/** The standing in words – for reading aloud and for sharing (Sascha 15.10.2026: "nobody has to read it out"). */
export function standingText(g: Game, spoken: boolean): string {
  const st = standingOf(g);
  const f = formDef(g.form);
  const n = holesPlayed(g);
  const sign = (v: string) => (spoken ? v.replace(/^\+/, tr('plus ', 'plus ')).replace(/^[−-]/, tr('minus ', 'minus ')) : v);
  const lines: string[] = [];
  if (!spoken) lines.push(`${f.name()} · ${g.courseName} · ${new Date(g.createdAt).toLocaleDateString()}`);
  const head = g.finishedAt ? tr(`Result after ${n} holes`, `Ergebnis nach ${n} Löchern`) : tr(`Standing after ${n} holes`, `Zwischenstand nach ${n} Löchern`);
  lines.push(spoken ? `${head}.` : head);
  st.rows.forEach((r) => {
    const place = 1 + st.rows.filter((o) => o.points > r.points).length;
    lines.push(spoken ? `${place}. ${r.name}: ${sign(r.value)}.` : `${place}. ${r.name} ${r.value}`);
  });
  const pays = st.money ? transfers(st.money) : [];
  if (pays.length) {
    const nm = (id: string) => g.players.find((p) => p.id === id)?.name ?? id;
    if (!spoken) lines.push(tr('Settlement', 'Abrechnung'));
    pays.forEach((t) => lines.push(spoken ? tr(`${nm(t.from)} pays ${nm(t.to)} ${money(t.amount)}.`, `${nm(t.from)} zahlt ${money(t.amount)} an ${nm(t.to)}.`) : `${nm(t.from)} → ${nm(t.to)} ${money(t.amount)}`));
  }
  return lines.join(spoken ? ' ' : '\n');
}

const winnerOf = (rows: { name: string; points: number }[]): string | null => (rows.length && (rows.length < 2 || rows[0].points !== rows[1].points) ? rows[0].name : null);

const STAKES = [0, 0.1, 0.2, 0.5, 1, 2, 5, 10];
const defaults = (f: FormDef) => Object.fromEntries(f.settings.map((s) => [s.key, s.default]));
const parseHcp = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  const n = Number(t.replace('+', ''));
  return t === '' || !Number.isFinite(n) ? null : Math.round(t.startsWith('+') ? -n : n);
};

/** The WHS recommendation for the form and the number of players, unless the player chose the share himself. */
function withWhs(d: Draft): Draft {
  const rec = formDef(d.form).hcpFor?.(d.players.length);
  return rec && !d.hcpTouched && d.settings.allowance != null ? { ...d, settings: { ...d.settings, allowance: rec } } : d;
}

function newDraft(form: FormId = 'skins'): Draft {
  const p = loadProfile();
  const me = { id: 'me', name: shownName(p) || tr('Me', 'Ich'), hcp: p.hcpIndex ? String(parseHcp(p.hcpIndex) ?? '') : '' };
  return withWhs({ form, course: null, optionId: '', players: [me, { id: newId(), name: '', hcp: '' }], settings: defaults(formDef(form)) });
}

export function GamesApp(props: { onModules: () => void; profile: ReactNode; profileDot?: boolean; tab?: GamesTab; onTabChange?: (t: GamesTab) => void }) {
  const [games, setGames] = useState<Game[]>(loadGames);
  const running = games.filter((g) => !g.finishedAt);
  const [view, setView] = useState<View>(() => (running[0] && !props.tab && !location.hash.startsWith('#join=') ? { name: 'play', game: running[0] } : { name: 'tab', tab: props.tab ?? 'play' }));
  const store = (g: Game) => {
    saveGame(g);
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

  switch (view.name) {
    case 'tab':
      return (
        <GamesTabs
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
          onNew={(form) => setView({ name: 'setup', draft: newDraft(form) })}
          onJoined={(g) => {
            store(g);
            setView({ name: 'play', game: g });
          }}
          onOpen={(g) => setView(g.finishedAt ? { name: 'result', game: g } : { name: 'play', game: g })}
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
        />
      );
    case 'play':
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
            store(done);
            setView({ name: 'result', game: done });
          }}
          onDelete={(g) => {
            remove(g);
            setView({ name: 'tab', tab: 'play' });
          }}
        />
      );
    case 'result':
      return (
        <GameResult
          game={view.game}
          onBack={() => setView({ name: 'tab', tab: 'games' })}
          onReopen={() => {
            const g = { ...view.game, finishedAt: null };
            store(g);
            setView({ name: 'play', game: g });
          }}
          onDelete={() => {
            remove(view.game);
            setView({ name: 'tab', tab: 'games' });
          }}
        />
      );
  }
}

// ---------- the module's tabs (Sascha 15.10.2026: a menu at the bottom as in Rounds) ----------

function GamesTabs(props: {
  tab: GamesTab;
  games: Game[];
  profile: ReactNode;
  profileDot?: boolean;
  onTab: (t: GamesTab) => void;
  onModules: () => void;
  onNew: (form?: FormId) => void;
  onOpen: (g: Game) => void;
  onJoined: (g: Game) => void;
}) {
  const running = props.games.filter((g) => !g.finishedAt);
  // join a friend's game (code or the QR link #join=CODE) – shown once signed in and the shared table exists
  const [canShare, setCanShare] = useState(false);
  const [joinOpen, setJoinOpen] = useState<string | null>(() => (location.hash.startsWith('#join=') ? location.hash.slice(6) : null));
  useEffect(() => {
    sharingAvailable().then(setCanShare);
    if (location.hash.startsWith('#join=')) history.replaceState(null, '', location.pathname + location.search);
  }, []);
  const [binOpen, setBinOpen] = useState(false);
  return (
    <main className="screen with-tabs">
      {props.tab !== 'profile' && (
        <div className="topbar">
          <button type="button" className="module-switch" onClick={props.onModules} aria-label={tr('Switch module', 'Modul wechseln')}>
            <span className="brand">
              GOLF<span>OS</span>
            </span>
            <span className="module-tag">Games</span>
            <span aria-hidden="true">⇄</span>
          </button>
          <TopTools />
        </div>
      )}
      {props.tab === 'play' && (
        <>
          <h1 className="tab-title">{tr('Play a game', 'Spiel starten')}</h1>
          {running.length > 0 && <GameList games={running} onOpen={props.onOpen} title={tr('In play', 'Läuft gerade')} />}
          {/* as "Start a new round" in Rounds (Sascha 15.10.2026: the same in every module) */}
          <section className="card play-card">
            <strong className="play-course">{tr('Start a new game', 'Neues Spiel starten')}</strong>
            <span className="muted small">{tr('Side games among friends – skins, Nassau, wolf and more, with the standing and who pays whom.', 'Spiele unter Freunden – Skins, Nassau, Wolf und mehr, mit Zwischenstand und Abrechnung.')}</span>
            <button type="button" className={running.length ? 'btn-secondary' : 'btn-primary'} onClick={() => props.onNew()}>
              {tr('New game', 'Neues Spiel')}
            </button>
            {canShare && (
              <button type="button" className="btn-secondary" onClick={() => setJoinOpen('')}>
                {tr("Join a friend's game", 'Spiel beitreten')}
              </button>
            )}
          </section>
          {joinOpen != null && (
            <>
              {canShare ? (
                <JoinSheet
                  initial={joinOpen}
                  onClose={() => setJoinOpen(null)}
                  onJoined={(g) => {
                    setJoinOpen(null);
                    props.onJoined(g);
                  }}
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
        </>
      )}
      {props.tab === 'games' && (
        <>
          <h1 className="tab-title">{tr('Games', 'Spiele')}</h1>
          <GameTiles games={props.games} binOpen={binOpen} onBin={() => setBinOpen(!binOpen)} />
          <Bin
            open={binOpen && loadGameTrash().length > 0}
            title={tr('Deleted games', 'Gelöschte Spiele')}
            items={loadGameTrash().map((t) => ({ id: t.game.id, date: t.game.createdAt, title: `${formDef(t.game.form).name()} · ${t.game.courseName}`, meta: t.game.players.map((p) => p.name).join(', '), deletedAt: t.deletedAt }))}
            onRestore={restoreGame}
            onPurge={purgeGame}
          />
          {props.games.length ? <GameList games={props.games} onOpen={props.onOpen} /> : <p className="muted">{tr('No games yet.', 'Noch keine Spiele.')}</p>}
        </>
      )}
      {props.tab === 'balance' && <Balance games={props.games} />}
      {props.tab === 'rules' && <FormCatalog onPlay={props.onNew} />}
      {props.tab === 'profile' && props.profile}
      <MenuBar
        items={[
          { id: 'play' as GamesTab, label: tr('Play', 'Spielen'), icon: MENU_ICONS.game, dot: running.length > 0 },
          { id: 'games' as GamesTab, label: tr('Games', 'Spiele'), icon: MENU_ICONS.list },
          { id: 'balance' as GamesTab, label: tr('Balance', 'Bilanz'), icon: MENU_ICONS.balance },
          { id: 'rules' as GamesTab, label: tr('Rules', 'Regeln'), icon: MENU_ICONS.rules },
          { id: 'profile' as GamesTab, label: tr('Profile', 'Profil'), icon: MENU_ICONS.profile, dot: props.profileDot },
        ]}
        current={props.tab}
        onPick={props.onTab}
      />
    </main>
  );
}

function GameList(props: { games: Game[]; onOpen: (g: Game) => void; title?: string }) {
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {props.title && <span className="eyebrow">{props.title}</span>}
      <ul className="list">
        {props.games.map((g) => {
          const f = formDef(g.form);
          const st = standingOf(g);
          return (
            <li key={g.id}>
              <button type="button" className={`list-item${g.finishedAt ? '' : ' live'}`} onClick={() => props.onOpen(g)}>
                <span className="grow">
                  <span className="title">
                    {f.name()} · {g.courseName}
                  </span>
                  <span className="muted small">
                    {date(g.createdAt)} · {g.players.map((p) => p.name).join(', ')}
                  </span>
                  <span className="small">
                    {g.finishedAt
                      ? winnerOf(st.rows)
                        ? `${tr('Winner', 'Sieger')}: ${winnerOf(st.rows)}`
                        : tr('Tied', 'Unentschieden')
                      : tr(`In play – ${holesPlayed(g)} of ${g.holes.length} holes`, `Läuft – ${holesPlayed(g)} von ${g.holes.length} Löchern`)}
                  </span>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Your balance over all finished games: wins, money, and against whom (player 1 is you). */
function Balance(props: { games: Game[] }) {
  const done = props.games.filter((g) => g.finishedAt);
  let wins = 0;
  let money = 0;
  // head to head per friend (Sascha 15.10.2026): games, who finished ahead, money
  const vs = new Map<string, { name: string; games: number; money: number; won: number; lost: number }>();
  for (const g of done) {
    const me = g.players[0];
    const st = standingOf(g);
    const lead = winnerOf(st.rows) ? st.rows[0].id : null;
    if (lead === me.id || lead === 'A') wins++;
    money += st.money?.[me.id] ?? 0;
    const pays = st.money ? transfers(st.money) : [];
    for (const p of g.players.slice(1)) {
      const key = p.name.trim().toLowerCase();
      const row = vs.get(key) ?? { name: p.name, games: 0, money: 0, won: 0, lost: 0 };
      row.games++;
      const mine = st.rows.find((r) => r.id === me.id)?.points;
      const his = st.rows.find((r) => r.id === p.id)?.points;
      if (mine != null && his != null && mine !== his) {
        if (mine > his) row.won++;
        else row.lost++;
      }
      for (const t of pays) {
        if (t.from === p.id && t.to === me.id) row.money += t.amount;
        if (t.from === me.id && t.to === p.id) row.money -= t.amount;
      }
      vs.set(key, row);
    }
  }
  const cls = (v: number) => (v > 0.004 ? 'good-text' : v < -0.004 ? 'bad-text' : 'muted');
  return (
    <>
      <h1 className="tab-title">{tr('Balance', 'Bilanz')}</h1>
      {done.length === 0 ? (
        <p className="muted">{tr('Your balance shows once you finished a game.', 'Deine Bilanz erscheint, sobald du ein Spiel beendet hast.')}</p>
      ) : (
        <>
          <section className="card balance-totals">
            <div>
              <strong>{done.length}</strong>
              <span className="muted small">{tr('games', 'Spiele')}</span>
            </div>
            <div>
              <strong>{wins}</strong>
              <span className="muted small">{tr('wins', 'Siege')}</span>
            </div>
            <div>
              <strong className={cls(money)}>{formatEuro(money)}</strong>
              <span className="muted small">{tr('money', 'Geld')}</span>
            </div>
          </section>
          <section className="card">
            <span className="eyebrow">{tr('Against your friends', 'Gegen deine Mitspieler')}</span>
            <ul className="game-pays">
              {[...vs.values()]
                .sort((a, b) => b.games - a.games)
                .map((r) => (
                  <li key={r.name}>
                    <span>
                      {r.name}{' '}
                      <span className="muted small">
                        · {r.games} {r.games === 1 ? tr('game', 'Spiel') : tr('games', 'Spiele')} · {tr(`${r.won}:${r.lost} ahead`, `${r.won}:${r.lost} vorne`)}
                      </span>
                    </span>
                    <strong className={cls(r.money)}>{formatEuro(r.money)}</strong>
                  </li>
                ))}
            </ul>
            <span className="muted small">{tr('"2:1 ahead": in how many games you finished ahead of the player and behind him. Money from the settlements (you are player 1).', '„2:1 vorne“: in wie vielen Spielen du vor bzw. hinter dem Mitspieler lagst. Geld aus den Abrechnungen (du bist Spieler 1).')}</span>
          </section>
        </>
      )}
    </>
  );
}

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

function FormRules(props: { form: FormDef }) {
  const talking = useSyncExternalStore(onSpeaking, isSpeaking, () => false);
  // leaving the rules stops the voice
  useEffect(() => () => stopSpeaking(), [props.form.id]);
  return (
    <>
      <ul className="game-rules">
        {props.form.rules().map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <button type="button" className="btn-secondary read-rules" aria-pressed={talking} onClick={() => toggleSpeak(rulesSpoken(props.form))}>
        {talking ? tr('■ Stop reading', '■ Vorlesen stoppen') : tr('🔊 Read the rules aloud', '🔊 Spielform vorlesen')}
      </button>
    </>
  );
}

function FormCatalog(props: { onPlay: (f: FormId) => void }) {
  const [open, setOpen] = useState<FormId | null>(null);
  return (
    <>
      <h1 className="tab-title">{tr('Game forms & rules', 'Spielformen & Regeln')}</h1>
      <ul className="list">
        {FORMS.map((f) => (
          <li key={f.id} className="card game-form">
            <button type="button" className="game-form-head" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>
              <span className="grow">
                <strong>{f.name()}</strong>
                <span className="muted small">{f.short()}</span>
              </span>
              <span className="game-players small">{playersText(f)}</span>
            </button>
            {open === f.id && (
              <>
                <FormRules form={f} />
                <button type="button" className="btn-secondary" onClick={() => props.onPlay(f.id)}>
                  {tr(`Play ${f.name()}`, `${f.name()} spielen`)}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- setup ----------

function GameSetup(props: { draft: Draft; onChange: (d: Draft) => void; onBack: () => void; onCourse: () => void; onStart: (g: Game) => void }) {
  const d = props.draft;
  const f = formDef(d.form);
  const [picker, setPicker] = useState(false);
  const options = useMemo(() => (d.course ? loopOptions(d.course.holes) : []), [d.course]);
  const option = options.find((o) => o.id === d.optionId) ?? options[0];
  const holes: GameHole[] = d.course && option
    ? buildRoundHoles(d.course.holes, option).map((h) => ({ label: h.label, par: h.par, si: h.strokeIndex }))
    : Array.from({ length: 18 }, (_, i) => ({ label: String(i + 1), par: 4, si: 0 }));
  const n = d.players.length;
  const fits = fitsPlayers(f, n);
  const sides = sidesOf(d.form, n, Number(d.settings.partner ?? 1));
  const set = (patch: Partial<Draft>) => props.onChange(withWhs({ ...d, ...patch }));
  const whs = f.hcpFor?.(n);
  const setPlayer = (id: string, patch: Partial<DraftPlayer>) => set({ players: d.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const label = (i: number) => d.players[i].name.trim() || tr(`Player ${i + 1}`, `Spieler ${i + 1}`);

  const start = () => {
    const players = d.players.map((p, i) => ({ id: p.id, name: label(i), hcp: parseHcp(p.hcp) }));
    props.onStart({
      id: newId(),
      createdAt: new Date().toISOString(),
      finishedAt: null,
      courseName: d.course?.name ?? tr('Without course', 'Ohne Platz'),
      holes,
      players,
      form: d.form,
      settings: d.settings,
      scores: Object.fromEntries(players.map((p) => [p.id, holes.map(() => null)])),
      extra: holes.map(() => ({})),
      current: 0,
    });
  };

  return (
    <main className="screen">
      <TopBar title={tr('New game', 'Neues Spiel')} onBack={props.onBack} />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">{tr('Game form', 'Spielform')}</span>
        <div className="settings-list">
          <button type="button" className="settings-row" onClick={() => setPicker(true)}>
            <span>{tr('Form', 'Spielform')}</span>
            <span className="settings-value">{f.name()}</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
        <div className="card">
          <span className="muted small">{f.short()}</span>
          <FormRules form={f} />
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">{tr('Course', 'Platz')}</span>
        <div className="settings-list">
          <button type="button" className="settings-row" onClick={props.onCourse}>
            <span>{tr('Course', 'Platz')}</span>
            <span className={`settings-value${d.course ? '' : ' warn-text'}`}>{d.course?.name ?? tr('Choose a course', 'Platz wählen')}</span>
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
        {!d.course && <span className="muted small">{tr('18 holes, par 4 each – the par can be changed on every hole.', '18 Löcher, je Par 4 – das Par lässt sich an jedem Loch ändern.')}</span>}
        {d.course && holes.some((h) => !h.par) && (
          <span className="muted small">{tr('Some holes have no par – set it on the hole.', 'Einige Löcher haben kein Par – am Loch einstellen.')}</span>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">
          {tr('Players', 'Spieler')} · {playersText(f)}
        </span>
        {d.players.map((p, i) => (
          <div key={p.id} className="card game-player-row">
            <div className="field">
              <label htmlFor={`gname-${p.id}`}>{tr(`Player ${i + 1}`, `Spieler ${i + 1}`)}</label>
              <input id={`gname-${p.id}`} className="input" value={p.name} onChange={(e) => setPlayer(p.id, { name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`ghcp-${p.id}`}>{tr('Playing hcp', 'Spielvorgabe')}</label>
              <input id={`ghcp-${p.id}`} className="input" inputMode="decimal" value={p.hcp} onChange={(e) => setPlayer(p.id, { hcp: e.target.value })} />
            </div>
            {i > 0 ? (
              <button type="button" className="icon-btn" aria-label={tr(`Remove ${label(i)}`, `${label(i)} entfernen`)} onClick={() => set({ players: d.players.filter((x) => x.id !== p.id) })} style={{ marginBottom: 3 }}>
                ✕
              </button>
            ) : (
              <span style={{ width: 44 }} />
            )}
          </div>
        ))}
        {n < 4 && (
          <FriendChips
            taken={d.players.map((p) => p.name)}
            onAdd={(fr) => set({ players: [...d.players.filter((p, k) => k === 0 || p.name.trim() || p.hcp.trim()), { id: newId(), name: fr.name, hcp: roughPlaying(fr.hcp) }].slice(0, 4) })}
          />
        )}
        {n < 4 && (
          <button type="button" className="btn-secondary" onClick={() => set({ players: [...d.players, { id: newId(), name: '', hcp: '' }] })}>
            {tr('+ Add player', '+ Spieler hinzufügen')}
          </button>
        )}
        {sides && fits && (
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
        {d.form === 'wolf' && fits && <span className="small">{tr('The wolf rotates in this order.', 'Der Wolf wechselt in dieser Reihenfolge.')}</span>}
        {!fits && (
          <span className="small" style={{ color: 'var(--warn)' }}>
            {tr(`${f.name()} needs ${playersText(f)} – you are ${n}.`, `${f.name()} braucht ${playersText(f)} – ihr seid ${n}.`)}
          </span>
        )}
        <span className="muted small">{tr('Playing handicap for 18 holes; on 9 holes the game uses half of it. Empty = 0.', 'Spielvorgabe für 18 Löcher; auf 9 Löchern rechnet das Spiel mit der Hälfte. Leer = 0.')}</span>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">{tr('Settings', 'Einstellungen')}</span>
        {f.settings.filter((s) => !s.when || s.when(d.settings)).map((s) => (
          <div key={s.key} className="game-setting">
            <span className="stepper-label">{s.label()}</span>
            {s.type === 'bool' && (
              <div className="chip-set">
                {[true, false].map((v) => (
                  <button key={String(v)} type="button" className={`chip${d.settings[s.key] === v ? ' on' : ''}`} aria-pressed={d.settings[s.key] === v} onClick={() => set({ settings: { ...d.settings, [s.key]: v } })}>
                    {v ? tr('Yes', 'Ja') : tr('No', 'Nein')}
                  </button>
                ))}
              </div>
            )}
            {s.type === 'choice' && (
              <div className="chip-set">
                {s.options!.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`chip${String(d.settings[s.key]) === o.value ? ' on' : ''}`}
                    aria-pressed={String(d.settings[s.key]) === o.value}
                    onClick={() => set({ settings: { ...d.settings, [s.key]: o.value }, ...(s.key === 'allowance' ? { hcpTouched: true } : {}) })}
                  >
                    {o.label()}
                  </button>
                ))}
              </div>
            )}
            {s.type === 'cap' && <CapPicker stake={Number(d.settings.stake ?? 0)} value={Number(d.settings[s.key] ?? 0)} onChange={(v) => set({ settings: { ...d.settings, [s.key]: String(v), maxPresses: '0' } })} />}
            {s.type === 'presses' && <PressPicker settings={d.settings} onChange={(patch) => set({ settings: { ...d.settings, ...patch } })} />}
            {s.key === 'allowance' && whs && (
              <span className="muted small">
                {tr(`WHS recommendation for ${f.name()} with ${n} players: ${whs} %`, `WHS-Empfehlung für ${f.name()} mit ${n} Spielern: ${whs} %`)}
              </span>
            )}
            {s.type === 'stake' && (
              <div className="chip-set">
                {STAKES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`chip${d.settings[s.key] === v ? ' on' : ''}`}
                    aria-pressed={d.settings[s.key] === v}
                    // a new start stake: the cap moves to a step of its doubling chain
                    onClick={() => set({ settings: { ...d.settings, [s.key]: v, ...(s.key === 'stake' && Number(d.settings.maxStake) > 0 ? { maxStake: String(snapCap(v, Number(d.settings.maxStake))) } : {}) } })}
                  >
                    {v ? money(v) : tr('none', 'ohne')}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {picker && (
        <div className="sheet-backdrop" onClick={() => setPicker(false)}>
          <section className="sheet" role="dialog" aria-label={tr('Choose game form', 'Spielform wählen')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('Choose game form', 'Spielform wählen')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setPicker(false)}>
                ✕
              </button>
            </div>
            <div className="pick-list">
              {FORMS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="pick-option"
                  aria-pressed={o.id === d.form}
                  onClick={() => {
                    props.onChange(withWhs({ ...d, form: o.id, settings: { ...defaults(o), ...(d.settings.partner != null ? { partner: d.settings.partner } : {}) }, hcpTouched: false }));
                    setPicker(false);
                  }}
                >
                  <span className="grow">
                    <strong>{o.name()}</strong>
                    <span className="muted small">{o.short()}</span>
                    <span className="small" style={{ color: fitsPlayers(o, n) ? 'var(--muted)' : 'var(--warn)' }}>{playersText(o)}</span>
                  </span>
                  {o.id === d.form && <span className="pick-check" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      <span className="spacer" />
      {/* a game is played on a course (Sascha 15.10.2026): par and stroke index come from it – no start without one */}
      {!d.course && (
        <span className="small warn-text" role="status">
          {tr('Choose the course first – par and stroke index come from it.', 'Wähle zuerst den Platz – Par und Stroke-Index kommen von dort.')}
        </span>
      )}
      <button type="button" className="btn-primary" onClick={start} disabled={!fits || !d.course}>
        {tr('Start game', 'Spiel starten')}
      </button>
    </main>
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
  const x: HoleExtra = g.extra[i] ?? {};
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
  // a shared game: exchange with the others every 5 s
  const latest = useRef(g);
  latest.current = g;
  const [canShare, setCanShare] = useState(false);
  const [invite, setInvite] = useState(false);
  useEffect(() => {
    sharingAvailable().then(setCanShare);
  }, []);
  useEffect(() => {
    if (!g.shared) return;
    const tick = async () => {
      const m = await exchange(latest.current);
      if (m && JSON.stringify(m) !== JSON.stringify(latest.current)) props.onChange(m);
    };
    tick();
    const t = window.setInterval(tick, 5000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.shared?.code]);
  const setPar = (par: number) => props.onChange({ ...g, holes: g.holes.map((h, k) => (k === i ? { ...h, par } : h)) });
  const go = (k: number) => props.onChange({ ...g, current: Math.max(0, Math.min(g.holes.length - 1, k)) });
  const allPar = () => props.onChange({ ...g, scores: Object.fromEntries(g.players.map((p) => [p.id, g.scores[p.id].map((s, k) => (k === i && s == null ? hole.par || 4 : s))])) });
  const par = hole.par || 4;
  const wolf = g.players[i % g.players.length];

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
        {g.players.some((p) => g.scores[p.id][i] == null) && (
          <button type="button" className="chip" onClick={allPar}>
            {tr('Par for the rest', 'Par für alle übrigen')}
          </button>
        )}
      </section>

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
          <span className="muted small">{tr('The pairings rotate hole by hole; change it here if your group plays another one.', 'Die Paarungen wechseln von Loch zu Loch; hier änderbar, wenn ihr anders spielt.')}</span>
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
            <span className="map-hole-no">{hole.label}</span>
            <span className="hole-bar-par">
              <span>Par {hole.par || '?'}</span>
              <span>Hcp {hole.si || '?'}</span>
            </span>
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
              <div className="sheet-actions">
                <button type="button" className="btn-secondary" onClick={props.onBack}>
                  {tr('Pause – continue later', 'Pausieren – später fortsetzen')}
                </button>
                <button type="button" className="btn-primary" onClick={() => setExit('end')}>
                  {tr('Finish game', 'Spiel beenden')}
                </button>
                <button type="button" className="btn-secondary btn-danger" onClick={() => props.onDelete(g)}>
                  {tr('Cancel game', 'Spiel abbrechen')}
                </button>
              </div>
            ) : (
              <>
                <span className="muted">
                  {tr(`${holesPlayed(g)} of ${g.holes.length} holes complete. Holes without all scores do not count.`, `${holesPlayed(g)} von ${g.holes.length} Löchern vollständig. Löcher ohne alle Scores zählen nicht.`)}
                  {st.status ? ` ${st.status}` : ''}
                </span>
                <div className="sheet-actions">
                  <button type="button" className="btn-primary" onClick={() => props.onFinish(g)}>
                    {tr('Finish & settle', 'Beenden & abrechnen')}
                  </button>
                  <button type="button" className="btn-secondary btn-danger" onClick={() => props.onDelete(g)}>
                    {tr('Delete game', 'Spiel löschen')}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setExit(null)}>
                    {tr('Back to the game', 'Zurück zum Spiel')}
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
function PressCard(props: { game: Game; hole: number; onChange: (g: Game) => void }) {
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

function StandingCard(props: { game: Game; final?: boolean }) {
  const g = props.game;
  const st = standingOf(g);
  const hasMoney = st.money && Object.values(st.money).some((v) => Math.abs(v) > 0.001);
  return (
    <section className="card game-standing" aria-label={tr('Standing', 'Zwischenstand')}>
      <div className="game-standing-head">
        <span className="eyebrow">{props.final ? tr('Result', 'Ergebnis') : tr('Standing', 'Zwischenstand')}</span>
        <button type="button" className="use-btn small" aria-label={tr('Read the standing aloud', 'Zwischenstand vorlesen')} title={tr('Read aloud', 'Vorlesen')} onClick={() => toggleSpeak(standingText(g, true))}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9z" />
            <path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />
          </svg>
        </button>
      </div>
      {st.status && <span className="small game-status">{st.status}</span>}
      <span className="muted small">
        {allowanceOf(g) ? tr(`Handicap ${allowanceOf(g)} %`, `Vorgabe ${allowanceOf(g)} %`) : tr('Gross, without handicap', 'Brutto, ohne Vorgabe')}
        {Number(g.settings.stake ?? 0) > 0 ? ` · ${tr('stake', 'Einsatz')} ${euroText(stakeNow(g))}` : ''}

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
        <div className="game-money">
          {g.players.map((p) => (
            <span key={p.id} className={st.money![p.id] > 0 ? 'good-text' : st.money![p.id] < 0 ? 'bad-text' : 'muted'}>
              {p.name} {formatEuro(st.money![p.id])}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function GameResult(props: { game: Game; onBack: () => void; onReopen: () => void; onDelete: () => void }) {
  const g = props.game;
  const f = formDef(g.form);
  const st = standingOf(g);
  const pays = st.money ? transfers(st.money) : [];
  const nm = (id: string) => g.players.find((p) => p.id === id)?.name ?? id;
  return (
    <main className="screen">
      <TopBar title={f.name()} onBack={props.onBack} backLabel={tr('Games', 'Spiele')} />
      <span className="muted small">
        {g.courseName} · {new Date(g.createdAt).toLocaleDateString()} · {holesPlayed(g)}/{g.holes.length} {tr('holes', 'Löcher')}
      </span>
      <section className="card game-winner">
        <span className="eyebrow">{winnerOf(st.rows) ? tr('Winner', 'Sieger') : tr('Result', 'Ergebnis')}</span>
        <strong>{winnerOf(st.rows) ?? tr('Tied', 'Unentschieden')}</strong>
        <span className="muted">{winnerOf(st.rows) ? st.rows[0].value : st.status}</span>
      </section>
      <StandingCard game={g} final />
      {pays.length > 0 && (
        <section className="card">
          <span className="eyebrow">{tr('Settlement', 'Abrechnung')}</span>
          <ul className="game-pays">
            {pays.map((t) => (
              <li key={`${t.from}-${t.to}`}>
                <span>
                  {nm(t.from)} → {nm(t.to)}
                </span>
                <strong>{money(t.amount)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ScoreGrid game={g} />
      <span className="spacer" />
      <ShareResult game={g} />
      <button type="button" className="btn-secondary" onClick={props.onReopen}>
        {tr('Correct scores', 'Scores korrigieren')}
      </button>
      {/* as a round's scorecard: one tap – "Undo" and the bin bring it back (Sascha 15.10.2026) */}
      <button type="button" className="btn-secondary btn-danger" onClick={props.onDelete}>
        {tr('Delete game', 'Spiel löschen')}
      </button>
    </main>
  );
}

function ScoreGrid(props: { game: Game }) {
  const g = props.game;
  return (
    <section className="card game-grid-card">
      <span className="eyebrow">{tr('Scores', 'Scores')}</span>
      <div className="game-grid-scroll">
        <table className="game-grid">
          <thead>
            <tr>
              <th />
              {g.holes.map((h) => (
                <th key={h.label}>{h.label}</th>
              ))}
              <th>Σ</th>
            </tr>
            <tr className="muted">
              <th>Par</th>
              {g.holes.map((h) => (
                <td key={h.label}>{h.par || '–'}</td>
              ))}
              <td>{g.holes.reduce((s, h) => s + h.par, 0)}</td>
            </tr>
          </thead>
          <tbody>
            {g.players.map((p) => (
              <tr key={p.id}>
                <th>{p.name}</th>
                {g.scores[p.id].map((s, k) => (
                  <td key={k} className={s == null ? 'muted' : s < g.holes[k].par ? 'good-text' : ''}>
                    {s ?? '–'}
                  </td>
                ))}
                <td>
                  <strong>{g.scores[p.id].reduce<number>((a, s) => a + (s ?? 0), 0)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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

/** The highest stake (Sascha 15.10.2026): the steps of the doubling chain up to 6,40 € as chips, "no cap", and a field
 *  for higher steps (12,80 €, 25,60 € …) that only takes a step of the chain. */
function CapPicker(props: { stake: number; value: number; onChange: (v: number) => void }) {
  const chain = capChain(props.stake);
  const custom = props.value > 0 && !chain.some((c) => Math.abs(c - props.value) < 0.005);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const next = (() => {
    const top = chain[chain.length - 1] ?? props.stake;
    return [top * 2, top * 4, top * 8].map((v) => money(Math.round(v * 100) / 100)).join(', ');
  })();
  const take = () => {
    const v = Number(text.replace('€', '').replace(/\s/g, '').replace(',', '.'));
    if (!text.trim() || !Number.isFinite(v)) return setError(tr('Type an amount, e.g. ' + next.split(', ')[0], 'Gib einen Betrag ein, z. B. ' + next.split(', ')[0]));
    if (!onChain(props.stake, v))
      return setError(tr(`Only doublings of ${money(props.stake)} – e.g. ${next}.`, `Nur Verdopplungen von ${money(props.stake)} möglich – z. B. ${next}.`));
    setError(null);
    setTyping(false);
    props.onChange(Math.round(v * 100) / 100);
  };
  const doublings = props.value > 0 && props.stake > 0 ? Math.round(Math.log2(props.value / props.stake)) : 0;
  return (
    <>
      <div className="chip-set">
        {chain.map((v) => (
          <button key={v} type="button" className={`chip${!typing && Math.abs(v - props.value) < 0.005 ? ' on' : ''}`} aria-pressed={Math.abs(v - props.value) < 0.005} onClick={() => { setTyping(false); setError(null); props.onChange(v); }}>
            {money(v)}
          </button>
        ))}
        <button type="button" className={`chip${!typing && props.value === 0 ? ' on' : ''}`} aria-pressed={props.value === 0} onClick={() => { setTyping(false); setError(null); props.onChange(0); }}>
          {tr('no cap', 'ohne Limit')}
        </button>
        <button type="button" className={`chip${typing || custom ? ' on' : ''}`} aria-pressed={typing || custom} onClick={() => { setTyping(true); setText(custom ? money(props.value).replace(' €', '') : ''); }}>
          {custom && !typing ? money(props.value) : tr('more …', 'höher …')}
        </button>
      </div>
      {typing && (
        <div className="cap-input">
          <input
            className="input"
            inputMode="decimal"
            autoFocus
            aria-label={tr('Highest stake in euros', 'Höchsteinsatz in Euro')}
            placeholder={next.split(', ')[0]}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && take()}
          />
          <button type="button" className="btn-secondary" onClick={take}>
            {tr('Use', 'Übernehmen')}
          </button>
        </div>
      )}
      {error ? (
        <span className="small" style={{ color: 'var(--warn)' }} role="alert">{error}</span>
      ) : (
        doublings > 0 && !typing && (
          <span className="muted small">
            {tr(`${money(props.stake)} doubled ${doublings}× = at most ${money(props.value)}.`, `${money(props.stake)} ${doublings}× verdoppelt = höchstens ${money(props.value)}.`)}
          </span>
        )
      )}
    </>
  );
}

/** Presses allowed – the highest stake counted in doublings (Sascha 15.10.2026: from 0,10 € to 1,60 € is 4× pressing).
 *  Both rows set the same limit; with a start stake it is stored as the highest stake. */
function PressPicker(props: { settings: Record<string, number | boolean | string>; onChange: (patch: Record<string, string>) => void }) {
  const stake = Number(props.settings.stake ?? 0);
  const cap = Number(props.settings.maxStake ?? 0);
  const now = stake > 0 ? (cap > 0 ? Math.round(Math.log2(cap / stake)) : 0) : Number(props.settings.maxPresses ?? 0);
  const n = Math.max(stake > 0 ? capChain(stake).length : 5, now);
  const pick = (k: number) =>
    stake > 0 ? props.onChange({ maxStake: k ? String(Math.round(stake * 2 ** k * 100) / 100) : '0', maxPresses: '0' }) : props.onChange({ maxPresses: String(k) });
  return (
    <div className="chip-set">
      {Array.from({ length: n }, (_, i) => i + 1).map((k) => (
        <button key={k} type="button" className={`chip${now === k ? ' on' : ''}`} aria-pressed={now === k} onClick={() => pick(k)}>
          {k}×
        </button>
      ))}
      <button type="button" className={`chip${now === 0 ? ' on' : ''}`} aria-pressed={now === 0} onClick={() => pick(0)}>
        {tr('any', 'beliebig')}
      </button>
    </div>
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
                {done ? <span className="drawer-hole-score">✓</span> : n > 0 ? <span className="drawer-hole-score">{n}/{g.players.length}</span> : null}
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
function ShareResult(props: { game: Game }) {
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
      <button type="button" className="btn-secondary share-btn" onClick={share}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12M7 8l5-5 5 5" />
          <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
        </svg>
        {tr('Share result', 'Ergebnis teilen')}
      </button>
      {done && <span className="muted small">{done}</span>}
    </>
  );
}

/** The tiles over the games list – as over the rounds list: played, in play, and the bin as a tile. */
function GameTiles(props: { games: Game[]; binOpen: boolean; onBin: () => void }) {
  const trash = loadGameTrash().length;
  return (
    <div className="tile-row">
      <div className="tile">
        <span className="tile-num">{props.games.filter((g) => g.finishedAt).length}</span>
        <span className="muted small">{tr('games played', 'Spiele gespielt')}</span>
      </div>
      <div className="tile">
        <span className="tile-num">{props.games.filter((g) => !g.finishedAt).length}</span>
        <span className="muted small">{tr('in play', 'laufen')}</span>
      </div>
      {trash > 0 && (
        <button type="button" className="tile" aria-pressed={props.binOpen} onClick={props.onBin}>
          <span className="tile-num">{trash}</span>
          <span className="muted small">{tr('deleted', 'gelöscht')}</span>
        </button>
      )}
    </div>
  );
}
