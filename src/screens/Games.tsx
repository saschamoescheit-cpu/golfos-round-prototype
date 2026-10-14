import { useMemo, useState, type ReactNode } from 'react';
import type { Course } from '../types';
import { tr } from '../lib/i18n';
import { buildRoundHoles, loopOptions } from '../lib/loops';
import { fullName, loadProfile } from '../lib/profile';
import { newId } from '../lib/storage';
import { FORMS, money, teamsOf, allowanceOf, canPress, fitsPlayers, formDef, formatEuro, holesPlayed, playersText, sidesOf, stakeNow, standingOf, strokesOn, transfers, type FormDef, type FormId, type Game, type GameHole, type HoleExtra } from '../lib/gameforms';
import { deleteGame, loadGames, saveGame } from '../lib/gamestore';
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
  const me = { id: 'me', name: fullName(p) || tr('Me', 'Ich'), hcp: p.hcpIndex ? String(parseHcp(p.hcpIndex) ?? '') : '' };
  return withWhs({ form, course: null, optionId: '', players: [me, { id: newId(), name: '', hcp: '' }], settings: defaults(formDef(form)) });
}

export function GamesApp(props: { onModules: () => void; profile: ReactNode; profileDot?: boolean; tab?: GamesTab; onTabChange?: (t: GamesTab) => void }) {
  const [games, setGames] = useState<Game[]>(loadGames);
  const running = games.filter((g) => !g.finishedAt);
  const [view, setView] = useState<View>(() => (running[0] && !props.tab ? { name: 'play', game: running[0] } : { name: 'tab', tab: props.tab ?? 'play' }));
  const store = (g: Game) => {
    saveGame(g);
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
            deleteGame(view.game.id);
            setGames(loadGames());
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
}) {
  const running = props.games.filter((g) => !g.finishedAt);
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
          <p className="muted" style={{ margin: 0 }}>
            {tr('Side games among friends – skins, Nassau, wolf and more, with the standing and who pays whom.', 'Spiele unter Freunden – Skins, Nassau, Wolf und mehr, mit Zwischenstand und Abrechnung.')}
          </p>
          {running.length > 0 && <GameList games={running} onOpen={props.onOpen} title={tr('In play', 'Läuft gerade')} />}
          <button type="button" className="btn-primary" onClick={() => props.onNew()}>
            {tr('New game', 'Neues Spiel')}
          </button>
        </>
      )}
      {props.tab === 'games' && (
        <>
          <h1 className="tab-title">{tr('Games', 'Spiele')}</h1>
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
  const vs = new Map<string, { name: string; games: number; money: number }>();
  for (const g of done) {
    const me = g.players[0];
    const st = standingOf(g);
    const lead = winnerOf(st.rows) ? st.rows[0].id : null;
    if (lead === me.id || lead === 'A') wins++;
    money += st.money?.[me.id] ?? 0;
    const pays = st.money ? transfers(st.money) : [];
    for (const p of g.players.slice(1)) {
      const key = p.name.trim().toLowerCase();
      const row = vs.get(key) ?? { name: p.name, games: 0, money: 0 };
      row.games++;
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
                      {r.name} <span className="muted small">· {r.games} {r.games === 1 ? tr('game', 'Spiel') : tr('games', 'Spiele')}</span>
                    </span>
                    <strong className={cls(r.money)}>{formatEuro(r.money)}</strong>
                  </li>
                ))}
            </ul>
            <span className="muted small">{tr('Money between you and each player, from the settlements (you are player 1).', 'Geld zwischen dir und dem Mitspieler, aus den Abrechnungen (du bist Spieler 1).')}</span>
          </section>
        </>
      )}
    </>
  );
}

function FormRules(props: { form: FormDef }) {
  return (
    <ul className="game-rules">
      {props.form.rules().map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
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
            <span className="settings-value">{d.course?.name ?? tr('Without course data', 'Ohne Platzdaten')}</span>
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
            {s.key === 'allowance' && whs && (
              <span className="muted small">
                {tr(`WHS recommendation for ${f.name()} with ${n} players: ${whs} %`, `WHS-Empfehlung für ${f.name()} mit ${n} Spielern: ${whs} %`)}
              </span>
            )}
            {s.type === 'stake' && (
              <div className="chip-set">
                {STAKES.map((v) => (
                  <button key={v} type="button" className={`chip${d.settings[s.key] === v ? ' on' : ''}`} aria-pressed={d.settings[s.key] === v} onClick={() => set({ settings: { ...d.settings, [s.key]: v } })}>
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
      <button type="button" className="btn-primary" onClick={start} disabled={!fits}>
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

function GamePlay(props: { game: Game; onChange: (g: Game) => void; onBack: () => void; onFinish: (g: Game) => void }) {
  const g = props.game;
  const f = formDef(g.form);
  const i = g.current;
  const hole = g.holes[i];
  const x: HoleExtra = g.extra[i] ?? {};
  const st = standingOf(g);
  const last = i === g.holes.length - 1;
  const [confirm, setConfirm] = useState(false);

  const setScore = (pid: string, v: number | null) => props.onChange({ ...g, scores: { ...g.scores, [pid]: g.scores[pid].map((s, k) => (k === i ? v : s)) } });
  const setExtra = (patch: Partial<HoleExtra>) => props.onChange({ ...g, extra: g.extra.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
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
        onBack={props.onBack}
        backLabel={tr('Games', 'Spiele')}
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
      <div className="game-nav">
        <button type="button" className="btn-secondary" onClick={() => go(i - 1)} disabled={i === 0}>
          ‹ {tr('Back', 'Zurück')}
        </button>
        {last ? (
          <button type="button" className="btn-primary" onClick={() => setConfirm(true)}>
            {tr('Finish game', 'Spiel beenden')}
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => go(i + 1)}>
            {tr('Next hole', 'Nächstes Loch')} ›
          </button>
        )}
      </div>
      {!last && (
        <button type="button" className="link-btn muted small" onClick={() => setConfirm(true)}>
          {tr('Finish the game now', 'Spiel jetzt beenden')}
        </button>
      )}
      {confirm && (
        <div className="sheet-backdrop" onClick={() => setConfirm(false)}>
          <section className="sheet" role="dialog" aria-label={tr('Finish game', 'Spiel beenden')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('Finish game?', 'Spiel beenden?')}</strong>
            </div>
            <span className="muted">
              {tr(`${holesPlayed(g)} of ${g.holes.length} holes complete. Holes without all scores do not count.`, `${holesPlayed(g)} von ${g.holes.length} Löchern vollständig. Löcher ohne alle Scores zählen nicht.`)}
              {st.status ? ` ${st.status}` : ''}
            </span>
            <div className="sheet-actions">
              <button type="button" className="btn-primary" onClick={() => props.onFinish(g)}>
                {tr('Finish & settle', 'Beenden & abrechnen')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setConfirm(false)}>
                {tr('Back to the game', 'Zurück zum Spiel')}
              </button>
            </div>
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
  const cap = Number(g.settings.maxStake ?? 0);
  return (
    <section className="card game-extra" aria-label="Press">
      <span className="stepper-label">
        {tr('Stake now', 'Einsatz jetzt')}: {euroText(stakeNow(g))}
        <span className="muted small">
          {' '}
          · {presses.length}× {tr('pressed', 'gepresst')}
          {cap > 0 ? ` · max ${euroText(cap)}` : ''}
        </span>
      </span>
      {here ? (
        <button type="button" className="chip" onClick={() => props.onChange({ ...g, presses: presses.filter((x) => x !== here) })}>
          {tr(`Take back the press of ${st.rows.find((r) => r.id === here.by)?.name ?? ''}`, `Press von ${st.rows.find((r) => r.id === here.by)?.name ?? ''} zurücknehmen`)}
        </button>
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
      <span className="eyebrow">{props.final ? tr('Result', 'Ergebnis') : tr('Standing', 'Zwischenstand')}</span>
      {st.status && <span className="small game-status">{st.status}</span>}
      <span className="muted small">
        {allowanceOf(g) ? tr(`Handicap ${allowanceOf(g)} %`, `Vorgabe ${allowanceOf(g)} %`) : tr('Gross, without handicap', 'Brutto, ohne Vorgabe')}
        {Number(g.settings.stake ?? 0) > 0 ? ` · ${tr('stake', 'Einsatz')} ${euroText(stakeNow(g))}` : ''}
        {Number(g.settings.maxLoss ?? 0) > 0 ? ` · ${tr('loss limit', 'Verlustgrenze')} ${money(Number(g.settings.maxLoss))}` : ''}
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
  const [ask, setAsk] = useState(false);
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
      <button type="button" className="btn-secondary" onClick={props.onReopen}>
        {tr('Correct scores', 'Scores korrigieren')}
      </button>
      {ask ? (
        <div className="sheet-actions">
          <button type="button" className="btn-secondary btn-danger" onClick={props.onDelete}>
            {tr('Yes, delete the game', 'Ja, Spiel löschen')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setAsk(false)}>
            {tr('Keep it', 'Behalten')}
          </button>
        </div>
      ) : (
        <button type="button" className="link-btn muted small" onClick={() => setAsk(true)}>
          {tr('Delete game', 'Spiel löschen')}
        </button>
      )}
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
