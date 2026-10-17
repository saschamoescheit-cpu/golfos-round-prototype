import { useState, type ReactNode } from 'react';
import { tr } from '../lib/i18n';
import { loadFriends, saveFriends, type Friend } from '../lib/friends';
import { newId } from '../lib/storage';
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
  toCheck: number; // finished rounds whose shots are not checked yet
  profileDot: boolean; // carries to take over into the bag
  trainingOpen: boolean; // a practice session is paused
  onPick: (m: 'rounds' | 'games' | 'training' | 'mobility') => void;
  profile: ReactNode;
  mobilityOpen?: boolean; // a screening is paused
}) {
  return (
    <main className={`screen with-tabs${props.tab === 'start' ? ' module-chooser' : ''}`}>
      {props.tab === 'start' && <ModuleCards roundOpen={props.roundOpen} gameOpen={props.gameOpen} trainingOpen={props.trainingOpen} mobilityOpen={props.mobilityOpen} toCheck={props.toCheck} onPick={props.onPick} />}
      {props.tab === 'friends' && <Friends />}
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

function ModuleCards(props: { roundOpen: boolean; gameOpen: boolean; trainingOpen: boolean; mobilityOpen?: boolean; toCheck: number; onPick: (m: 'rounds' | 'games' | 'training' | 'mobility') => void }) {
  return (
    <>
      <div className="topbar">
        <span className="brand">
          GOLF<span>OS</span>
        </span>
        <TopTools />
      </div>
      <div className="home-hero">
      <div className="brand module-brand">
        GOLF<span>OS</span>
      </div>
      {/* the GolfOS claim (Sascha 15.10.2026), the same in both languages */}
      <p className="muted module-claim">unlock every part of your golf game</p>
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
          {props.roundOpen && (
            <span className="small module-live">
              {tr('A round is paused', 'Eine Runde ist pausiert')}
              <PausedMark />
            </span>
          )}
          {props.toCheck > 0 && (
            <span className="small module-todo">
              {props.toCheck === 1 ? tr('1 round: check your shots', '1 Runde: Schläge prüfen') : tr(`${props.toCheck} rounds: check your shots`, `${props.toCheck} Runden: Schläge prüfen`)}
            </span>
          )}
        </span>
        <span aria-hidden="true">›</span>
      </button>
      <button type="button" className="module-card" onClick={() => props.onPick('games')}>
        <span className="module-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="7" width="18" height="12" rx="3" />
            <path d="M8 11v4M6 13h4" />
            <circle cx="15.5" cy="12" r="1" />
            <circle cx="17.5" cy="14.5" r="1" />
          </svg>
        </span>
        <span className="grow">
          <strong>Games</strong>
          {props.gameOpen && <span className="small module-live">{tr('A game is in play', 'Ein Spiel läuft')}</span>}
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
      {/* the fourth module (Sascha 17.10.2026): the mobility screen with the camera – what the body allows the swing */}
      <button type="button" className="module-card" onClick={() => props.onPick('mobility')}>
        <span className="module-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="4.2" r="2" />
            <path d="M12 6.8v6.2M12 13l-4.2 7.5M12 13l4.2 7.5M5 8.6l7 1.6 7-3.4" />
          </svg>
        </span>
        <span className="grow">
          <strong>{tr('Mobility screen', 'Beweglichkeits-Screening')}</strong>
          {props.mobilityOpen && (
            <span className="small module-live">
              {tr('A screening is paused', 'Ein Screening ist pausiert')}
              <PausedMark />
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
function Friends() {
  const [list, setList] = useState<Friend[]>(loadFriends);
  const store = (next: Friend[]) => {
    setList(next);
    saveFriends(next.filter((f) => f.name.trim() || f.hcp.trim()));
  };
  const set = (id: string, patch: Partial<Friend>) => store(list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  return (
    <>
      <h1 className="tab-title">{tr('Friends', 'Freunde')}</h1>
      {list.map((f) => (
        <div key={f.id} className="card game-player-row">
          <div className="field">
            <label htmlFor={`fname-${f.id}`}>Name</label>
            <input id={`fname-${f.id}`} className="input" value={f.name} onChange={(e) => set(f.id, { name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`fhcp-${f.id}`}>Handicap</label>
            <input id={`fhcp-${f.id}`} className="input" inputMode="decimal" value={f.hcp} onChange={(e) => set(f.id, { hcp: e.target.value })} />
          </div>
          <button type="button" className="icon-btn" aria-label={tr(`Remove ${f.name || 'friend'}`, `${f.name || 'Freund'} entfernen`)} onClick={() => store(list.filter((x) => x.id !== f.id))} style={{ marginBottom: 3 }}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => setList([...list, { id: newId(), name: '', hcp: '' }])}>
        {tr('+ Add friend', '+ Freund hinzufügen')}
      </button>
    </>
  );
}

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
