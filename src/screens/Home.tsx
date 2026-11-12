import { useState, type ReactNode } from 'react';
import { RoundSettleCards } from '../components/RoundSettle';
import { tr } from '../lib/i18n';
import { loadFriends, type Friend } from '../lib/friends';
import { Friends } from '../components/Friends';
import { MENU_ICONS, MenuBar } from '../components/TabBar';
import { TopTools } from '../components/TopTools';
import { PausedIcon } from '../components/PausedIcon';
import { AddRow } from '../components/Settings';

// The start page of GolfOS (Sascha 15.10.2026): the two modules, the friends you play with and your profile – with a
// menu at the bottom like inside the modules. The profile is the same everywhere.

export type HomeTab = 'start' | 'friends' | 'profile';

export function Home(props: {
  running?: RunningItem[];
  onRunning?: (r: RunningItem) => void;
  tab: HomeTab;
  onTab: (t: HomeTab) => void;
  roundOpen: boolean;
  gameOpen: boolean;
  /** finished games whose result is not confirmed yet – the task shown on the Games card, as on Rounds */
  gamesToConfirm?: number;
  betsRunning?: string[]; // the names of the pools of bets running
  tours?: { today: string[]; planned: number }; // the tournaments of today (names) and how many are planned after it
  toCheck: number; // finished rounds to check & sign (the same number as the rounds tile)
  profileDot: boolean; // carries to take over into the bag
  trainingOpen: boolean; // a practice session is paused
  onPick: (m: 'rounds' | 'games' | 'tournaments' | 'training' | 'mobility') => void;
  profile: ReactNode;
  mobilityOpen?: boolean; // a screening is paused
  mobilityToday?: 'paused' | 'done' | 'today'; // the guided training of the day
}) {
  return (
    <main className={`screen with-tabs${props.tab === 'start' ? ' module-chooser' : ''}`}>
      {props.tab === 'start' && <ModuleCards roundOpen={props.roundOpen} gameOpen={props.gameOpen} gamesToConfirm={props.gamesToConfirm ?? 0} betsRunning={props.betsRunning ?? []} tours={props.tours} trainingOpen={props.trainingOpen} mobilityOpen={props.mobilityOpen} mobilityToday={props.mobilityToday} toCheck={props.toCheck} onPick={props.onPick} running={props.running} onRunning={props.onRunning} />}
      {props.tab === 'friends' && <Friends float onSignIn={() => props.onTab('profile')} />}
      {props.tab === 'profile' && props.profile}
      <MenuBar
        items={[
          { id: 'start' as HomeTab, label: 'Start', icon: MENU_ICONS.home },
          { id: 'friends' as HomeTab, label: tr('Friends', 'Freunde'), icon: MENU_ICONS.friends },
          { id: 'profile' as HomeTab, label: tr('Profile', 'Profil'), icon: MENU_ICONS.profile, dot: props.profileDot },
        ]}
        current={props.tab}
        onPick={(t) => {
          props.onTab(t);
          window.scrollTo(0, 0);
        }}
      />
    </main>
  );
}

/** the pause mark of a paused round or session – the shared green circle with two bars (Rounds, Sascha 17.10.2026) */
function PausedMark() {
  return (
    <span className="paused-mark">
      <PausedIcon size={16} />
    </span>
  );
}

/** what the module cards say (the same on the start page and in the module sheet) */
export type ModuleCardInfo = { roundOpen: boolean; gameOpen: boolean; gamesToConfirm: number; betsRunning: string[]; tours?: { today: string[]; planned: number }; trainingOpen: boolean; mobilityOpen?: boolean; mobilityToday?: 'paused' | 'done' | 'today'; toCheck: number };
export type ModulePick = 'rounds' | 'games' | 'tournaments' | 'training' | 'mobility';
/** one thing to do now, for the card "Jetzt dran" on the start page (Sascha 12.11.2026 "Läuft gerade"; 11.11.2026 design
 *  round 2: green frame, renamed, every row a direct way there – the module cards no longer repeat it) */
export type RunningItem = { key: string; kind: 'round' | 'tour' | 'pool' | 'sign' | 'confirm' | 'training' | 'mobility'; title: string; line: string; value?: string; good?: boolean };

const RUN_ICONS: Record<RunningItem['kind'], JSX.Element> = {
  round: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.8 8.6v6.8M14.2 8.6v6.8" />
    </svg>
  ),
  tour: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
    </svg>
  ),
  pool: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3z" />
      <path d="M14 4v12" />
    </svg>
  ),
  sign: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15.5 4.5l4 4L9 19l-5 1 1-5z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  ),
  confirm: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="18" height="12" rx="3" />
      <path d="M8 11v4M6 13h4" />
      <circle cx="15.5" cy="12" r="1" />
      <circle cx="17.5" cy="14.5" r="1" />
    </svg>
  ),
  training: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </svg>
  ),
  mobility: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="4.2" r="2" />
      <path d="M12 6.8v6.2M12 13l-4.2 7.5M12 13l4.2 7.5M5 8.6l7 1.6 7-3.4" />
    </svg>
  ),
};

/** "Jetzt dran": each thing running or to do now in one row – a tap goes there */
function RunningCard(props: { items: RunningItem[]; onOpen: (r: RunningItem) => void }) {
  if (!props.items.length) return null;
  return (
    <section className="card running-card" aria-label={tr('Running now', 'Läuft gerade')}>
      <span className="eyebrow">{tr('Running now', 'Läuft gerade')}</span>
      {props.items.map((r) => (
        <button key={r.key} type="button" className="running-row" onClick={() => props.onOpen(r)}>
          <span className="running-icon">{RUN_ICONS[r.kind]}</span>
          <span className="grow">
            <strong>{r.title}</strong>
            <span className="muted small">{r.line}</span>
          </span>
          {r.value && <strong className={`running-value${r.good ? ' good-text' : ''}`}>{r.value}</strong>}
          <span className="muted" aria-hidden="true">
            ›
          </span>
        </button>
      ))}
    </section>
  );
}

function ModuleCards(props: ModuleCardInfo & { onPick: (m: ModulePick) => void; running?: RunningItem[]; onRunning?: (r: RunningItem) => void }) {
  return (
    <>
      {/* GOLFOS only top left, the claim small below it (Sascha 02.11.2026: "saves a lot of room") – the claim the
          same in both languages (15.10.2026) */}
      <div className="topbar">
        <span className="brand-stack">
          <span className="brand">
            GOLF<span>OS</span>
          </span>
          <span className="muted brand-claim">unlock every part of your golf game</span>
        </span>
        <TopTools />
      </div>
      <div className="home-hero">
        {/* each round of the bets settled (Sascha 09.11.2026) – above "Läuft gerade" with its own title (12.11.2026: "Der Bereich
            sollte über Läuft gerade platziert werden") */}
        <RoundSettleCards />
        {props.running && props.onRunning && <RunningCard items={props.running} onOpen={props.onRunning} />}
        <ModuleCardList {...props} describe />
      </div>
    </>
  );
}

/** the five module cards – in the module sheet with what is to do on each (Sascha 12.11.2026: mock-up A, the sheet from
 *  below), `current` the module one is in; on the start page (`describe`) only a quiet line what each module is – what
 *  is to do stands once in "Jetzt dran" above (Sascha 11.11.2026, design round 2: "not twice") */
export function ModuleCardList(props: ModuleCardInfo & { current?: ModulePick | null; onPick: (m: ModulePick) => void; describe?: boolean }) {
  const desc = (en: string, de: string) => (props.describe ? <span className="small muted module-desc">{tr(en, de)}</span> : null);
  const todo = !props.describe;
  return (
    <>
      <button type="button" className={`module-card${props.current === 'rounds' ? ' on' : ''}`} aria-current={props.current === 'rounds' ? 'true' : undefined} onClick={() => props.onPick('rounds')}>
        <span className="module-icon" aria-hidden="true">
          {todo && props.toCheck > 0 && <i className="tabbar-dot module-dot" />}
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 21V3l11 4-11 4" />
            <ellipse cx="12" cy="21" rx="8" ry="1.6" />
          </svg>
        </span>
        <span className="grow">
          <strong>Rounds</strong>
          {/* only what is still to do: the rounds to check & sign – a paused round is no task here (Sascha 18.10.2026) */}
          {desc('Play and review rounds', 'Runden spielen und auswerten')}
          {todo && props.toCheck > 0 && (
            <span className="small module-todo">
              {props.toCheck === 1 ? tr('1 round to check & sign', '1 Runde prüfen & signieren') : tr(`${props.toCheck} rounds to check & sign`, `${props.toCheck} Runden prüfen & signieren`)}
            </span>
          )}
        </span>
        <span aria-hidden="true">›</span>
      </button>
      <button type="button" className={`module-card${props.current === 'games' ? ' on' : ''}`} aria-current={props.current === 'games' ? 'true' : undefined} onClick={() => props.onPick('games')}>
        <span className="module-icon" aria-hidden="true">
          {todo && props.gamesToConfirm > 0 && <i className="tabbar-dot module-dot" />}
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="7" width="18" height="12" rx="3" />
            <path d="M8 11v4M6 13h4" />
            <circle cx="15.5" cy="12" r="1" />
            <circle cx="17.5" cy="14.5" r="1" />
          </svg>
        </span>
        <span className="grow">
          {/* "Games & Bets" (Sascha 03.11.2026: clearer that games and bets are together here) */}
          <strong>Games &amp; Bets</strong>
          {/* as on Rounds: only what is still to do – the results to confirm; a paused game is no task here (Sascha 25.10.2026) */}
          {desc('Games and bets with friends', 'Spiele und Wetten mit Freunden')}
          {todo && props.gamesToConfirm > 0 && (
            <span className="small module-todo">
              {props.gamesToConfirm === 1 ? tr('1 result to confirm', '1 Ergebnis bestätigen') : tr(`${props.gamesToConfirm} results to confirm`, `${props.gamesToConfirm} Ergebnisse bestätigen`)}
            </span>
          )}
          {/* the bets running (Sascha 01.11.2026: "show in Games when bets are running") – as Training's paused session */}
          {todo && props.betsRunning.length > 0 && (
            <span className="small module-live">
              {props.betsRunning.length === 1 ? tr(`Bets running: ${props.betsRunning[0]}`, `Wetten laufen: ${props.betsRunning[0]}`) : tr(`${props.betsRunning.length} pools of bets running`, `${props.betsRunning.length} Wett-Pools laufen`)}
            </span>
          )}
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {/* the tournaments a module of their own, below Games & Bets (Sascha 03.11.2026) – planned here, played in Rounds */}
      <button type="button" className={`module-card${props.current === 'tournaments' ? ' on' : ''}`} aria-current={props.current === 'tournaments' ? 'true' : undefined} onClick={() => props.onPick('tournaments')}>
        <span className="module-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
            <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4" />
            <path d="M12 14v3M8.5 20h7M9.5 17h5v3h-5z" />
          </svg>
        </span>
        <span className="grow">
          <strong>Tournaments</strong>
          {desc('Plan tournaments and series', 'Turniere und Serien planen')}
          {todo && props.tours && props.tours.today.length > 0 && (
            <span className="small module-live">
              {props.tours.today.length === 1 ? tr(`Today: ${props.tours.today[0]}`, `Heute: ${props.tours.today[0]}`) : tr(`${props.tours.today.length} tournaments today`, `${props.tours.today.length} Turniere heute`)}
            </span>
          )}
          {todo && props.tours && !props.tours.today.length && props.tours.planned > 0 && (
            <span className="small module-live">{props.tours.planned === 1 ? tr('1 tournament planned', '1 Turnier geplant') : tr(`${props.tours.planned} tournaments planned`, `${props.tours.planned} Turniere geplant`)}</span>
          )}
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {/* the third module (Sascha 15.10.2026): the golf knowledge base for practice */}
      <button type="button" className={`module-card${props.current === 'training' ? ' on' : ''}`} aria-current={props.current === 'training' ? 'true' : undefined} onClick={() => props.onPick('training')}>
        <span className="module-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8.5" />
            <circle cx="12" cy="12" r="4.5" />
            <circle cx="12" cy="12" r="0.8" fill="currentColor" />
          </svg>
        </span>
        <span className="grow">
          <strong>Training (Beta)</strong>
          {desc('Training and practice plans', 'Training und Übungspläne')}
          {todo && props.trainingOpen && (
            <span className="small module-live">
              {tr('A session is paused', 'Eine Einheit ist pausiert')}
              <PausedMark />
            </span>
          )}
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {/* the fourth module "Agility" (Sascha 17.10.2026): the mobility screen with the camera – what the body allows the swing */}
      <button type="button" className={`module-card${props.current === 'mobility' ? ' on' : ''}`} aria-current={props.current === 'mobility' ? 'true' : undefined} onClick={() => props.onPick('mobility')}>
        <span className="module-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="4.2" r="2" />
            <path d="M12 6.8v6.2M12 13l-4.2 7.5M12 13l4.2 7.5M5 8.6l7 1.6 7-3.4" />
          </svg>
        </span>
        <span className="grow">
          <strong>Agility (Beta)</strong>
          {desc('Screening and exercises', 'Screening und Übungen')}
          {todo && props.mobilityOpen && (
            <span className="small module-live">
              {tr('A screening is paused', 'Ein Screening ist pausiert')}
              <PausedMark />
            </span>
          )}
          {/* the training of the day (Sascha 18.10.2026: the app leads through the drills) – one look at the start */}
          {todo && !props.mobilityOpen && props.mobilityToday && (
            <span className={`small${props.mobilityToday === 'done' ? ' muted' : ' module-live'}`}>
              {props.mobilityToday === 'paused' ? (
                <>
                  {tr('A training is paused', 'Ein Training ist pausiert')}
                  <PausedMark />
                </>
              ) : props.mobilityToday === 'done' ? (
                tr('Training done today', 'Training heute erledigt')
              ) : (
                tr('Your training today is waiting', 'Dein Training heute wartet')
              )}
            </span>
          )}
        </span>
        <span aria-hidden="true">›</span>
      </button>
    </>
  );
}

/** The people you play with – Rounds and Games offer them when setting up. */
/** Friends not yet in the flight, as chips to add with one tap (round and game setup). */
export function FriendChips(props: { taken: string[]; onAdd: (f: Friend) => void }) {
  const [linking, setLinking] = useState(false);
  const all = loadFriends();
  const free = all.filter((f) => f.name.trim() && !props.taken.some((n) => n.trim().toLowerCase() === f.name.trim().toLowerCase()));
  // no friends yet (night 10./11.11.2026: "nothing shows how to add one"): link them right here – the setup stays; a row
  // "Freunde · verknüpfen ›" as every other choice of a setup, its sheet titled "Freunde" (Facelift 11.11.2026, r11)
  if (!all.length)
    return (
      <div className="friend-chips">
        {/* as "Spieler hinzufügen", with two people for its sign (Sascha 13.11.2026) */}
        <AddRow label={tr('Add friends', 'Freunde hinzufügen')} icon="friends" onClick={() => setLinking(true)} />
        {linking && (
          <div className="sheet-backdrop" onClick={() => setLinking(false)}>
            <section className="sheet friends-sheet" role="dialog" aria-label={tr('Friends', 'Freunde')} onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <strong>{tr('Friends', 'Freunde')}</strong>
                <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setLinking(false)}>
                  ✕
                </button>
              </div>
              <Friends onSignIn={() => setLinking(false)} />
            </section>
          </div>
        )}
      </div>
    );
  if (!free.length) return null;
  return (
    <div className="friend-chips">
      <span className="muted small">{tr('Friends', 'Freunde')}</span>
      <div className="chip-set">
        {free.map((f) => (
          <button key={f.id} type="button" className="chip" onClick={() => props.onAdd(f)}>
            + {f.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Handicap index as typed → rounded playing handicap (plus handicap negative), as a start value. */
export const roughPlaying = (hcp: string): string => {
  const t = hcp.trim().replace(',', '.');
  const n = Number(t.replace('+', ''));
  return t === '' || !Number.isFinite(n) ? '' : String(Math.round(t.startsWith('+') ? -n : n));
};
