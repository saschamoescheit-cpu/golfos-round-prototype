import type { ReactNode } from 'react';
import { tr } from '../lib/i18n';
import { loadFriends, type Friend } from '../lib/friends';
import { Friends } from '../components/Friends';
import { MENU_ICONS, MenuBar } from '../components/TabBar';
import { TopTools } from '../components/TopTools';
import { PausedIcon } from '../components/PausedIcon';

// The start page of GolfOS (Sascha 15.10.2026): the two modules, the friends you play with and your profile – with a
// menu at the bottom like inside the modules. The profile is the same everywhere.

export type HomeTab = 'start' | 'friends' | 'profile';

export function Home(props: {
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
      {props.tab === 'start' && <ModuleCards roundOpen={props.roundOpen} gameOpen={props.gameOpen} gamesToConfirm={props.gamesToConfirm ?? 0} betsRunning={props.betsRunning ?? []} tours={props.tours} trainingOpen={props.trainingOpen} mobilityOpen={props.mobilityOpen} mobilityToday={props.mobilityToday} toCheck={props.toCheck} onPick={props.onPick} />}
      {props.tab === 'friends' && <Friends onSignIn={() => props.onTab('profile')} />}
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

function ModuleCards(props: { roundOpen: boolean; gameOpen: boolean; gamesToConfirm: number; betsRunning: string[]; tours?: { today: string[]; planned: number }; trainingOpen: boolean; mobilityOpen?: boolean; mobilityToday?: 'paused' | 'done' | 'today'; toCheck: number; onPick: (m: 'rounds' | 'games' | 'tournaments' | 'training' | 'mobility') => void }) {
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
      <button type="button" className="module-card" onClick={() => props.onPick('rounds')}>
        <span className="module-icon" aria-hidden="true">
          {props.toCheck > 0 && <i className="tabbar-dot module-dot" />}
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 21V3l11 4-11 4" />
            <ellipse cx="12" cy="21" rx="8" ry="1.6" />
          </svg>
        </span>
        <span className="grow">
          <strong>Rounds</strong>
          {/* only what is still to do: the rounds to check & sign – a paused round is no task here (Sascha 18.10.2026) */}
          {props.toCheck > 0 && (
            <span className="small module-todo">
              {props.toCheck === 1 ? tr('1 round to check & sign', '1 Runde prüfen & signieren') : tr(`${props.toCheck} rounds to check & sign`, `${props.toCheck} Runden prüfen & signieren`)}
            </span>
          )}
        </span>
        <span aria-hidden="true">›</span>
      </button>
      <button type="button" className="module-card" onClick={() => props.onPick('games')}>
        <span className="module-icon" aria-hidden="true">
          {props.gamesToConfirm > 0 && <i className="tabbar-dot module-dot" />}
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
          {props.gamesToConfirm > 0 && (
            <span className="small module-todo">
              {props.gamesToConfirm === 1 ? tr('1 result to confirm', '1 Ergebnis bestätigen') : tr(`${props.gamesToConfirm} results to confirm`, `${props.gamesToConfirm} Ergebnisse bestätigen`)}
            </span>
          )}
          {/* the bets running (Sascha 01.11.2026: "show in Games when bets are running") – as Training's paused session */}
          {props.betsRunning.length > 0 && (
            <span className="small module-live">
              {props.betsRunning.length === 1 ? tr(`Bets running: ${props.betsRunning[0]}`, `Wetten laufen: ${props.betsRunning[0]}`) : tr(`${props.betsRunning.length} pools of bets running`, `${props.betsRunning.length} Wett-Pools laufen`)}
            </span>
          )}
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {/* the tournaments a module of their own, below Games & Bets (Sascha 03.11.2026) – planned here, played in Rounds */}
      <button type="button" className="module-card" onClick={() => props.onPick('tournaments')}>
        <span className="module-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
            <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4" />
            <path d="M12 14v3M8.5 20h7M9.5 17h5v3h-5z" />
          </svg>
        </span>
        <span className="grow">
          <strong>Tournaments</strong>
          {props.tours && props.tours.today.length > 0 && (
            <span className="small module-live">
              {props.tours.today.length === 1 ? tr(`Today: ${props.tours.today[0]}`, `Heute: ${props.tours.today[0]}`) : tr(`${props.tours.today.length} tournaments today`, `${props.tours.today.length} Turniere heute`)}
            </span>
          )}
          {props.tours && !props.tours.today.length && props.tours.planned > 0 && (
            <span className="small muted">{props.tours.planned === 1 ? tr('1 tournament planned', '1 Turnier geplant') : tr(`${props.tours.planned} tournaments planned`, `${props.tours.planned} Turniere geplant`)}</span>
          )}
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {/* the third module (Sascha 15.10.2026): the golf knowledge base for practice */}
      <button type="button" className="module-card" onClick={() => props.onPick('training')}>
        <span className="module-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8.5" />
            <circle cx="12" cy="12" r="4.5" />
            <circle cx="12" cy="12" r="0.8" fill="currentColor" />
          </svg>
        </span>
        <span className="grow">
          <strong>Training</strong>
          {props.trainingOpen && (
            <span className="small module-live">
              {tr('A session is paused', 'Eine Einheit ist pausiert')}
              <PausedMark />
            </span>
          )}
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {/* the fourth module "Agility" (Sascha 17.10.2026): the mobility screen with the camera – what the body allows the swing */}
      <button type="button" className="module-card" onClick={() => props.onPick('mobility')}>
        <span className="module-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="4.2" r="2" />
            <path d="M12 6.8v6.2M12 13l-4.2 7.5M12 13l4.2 7.5M5 8.6l7 1.6 7-3.4" />
          </svg>
        </span>
        <span className="grow">
          <strong>Agility</strong>
          {props.mobilityOpen && (
            <span className="small module-live">
              {tr('A screening is paused', 'Ein Screening ist pausiert')}
              <PausedMark />
            </span>
          )}
          {/* the training of the day (Sascha 18.10.2026: the app leads through the drills) – one look at the start */}
          {!props.mobilityOpen && props.mobilityToday && (
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
      </div>
    </>
  );
}

/** The people you play with – Rounds and Games offer them when setting up. */
/** Friends not yet in the flight, as chips to add with one tap (round and game setup). */
export function FriendChips(props: { taken: string[]; onAdd: (f: Friend) => void }) {
  const free = loadFriends().filter((f) => f.name.trim() && !props.taken.some((n) => n.trim().toLowerCase() === f.name.trim().toLowerCase()));
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
