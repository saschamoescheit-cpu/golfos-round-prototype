import type { ReactNode } from 'react';
import { tr } from '../lib/i18n';

// The menu at the bottom (Sascha 14.10.2026, order as in BeBrassie): play, rounds, my golf, stats, profile.

export type Tab = 'play' | 'rounds' | 'record' | 'stats' | 'profile';

const icon = (d: ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const ICONS: Record<Tab, ReactNode> = {
  // flag on the green
  play: icon(
    <>
      <path d="M8 21V3l9 4-9 4" />
      <ellipse cx="9" cy="21" rx="6" ry="1.2" />
    </>,
  ),
  // scorecard
  rounds: icon(
    <>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>,
  ),
  // trophy
  record: icon(
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" />
    </>,
  ),
  // bars
  stats: icon(<path d="M5 20V11M10 20V5M15 20v-7M20 20V8" />),
  // person
  profile: icon(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.2-4 4.2-6 8-6s6.8 2 8 6" />
    </>,
  ),
};

export const tabLabel = (t: Tab): string =>
  ({
    play: tr('Play', 'Spielen'),
    rounds: tr('Rounds', 'Runden'),
    record: tr('My golf', 'Mein Golf'),
    stats: tr('Stats', 'Statistik'),
    profile: tr('Profile', 'Profil'),
  })[t];

export function TabBar(props: { tab: Tab; onTab: (t: Tab) => void; dots?: Partial<Record<Tab, boolean>> }) {
  return (
    <MenuBar
      items={(['play', 'rounds', 'record', 'stats', 'profile'] as Tab[]).map((t) => ({ id: t, label: tabLabel(t), icon: ICONS[t], dot: props.dots?.[t] }))}
      current={props.tab}
      onPick={props.onTab}
    />
  );
}

/** The menu at the bottom – also on the start page and in Games (Sascha 15.10.2026). */
export function MenuBar<T extends string>(props: { items: { id: T; label: string; icon: ReactNode; dot?: boolean }[]; current: T; onPick: (t: T) => void }) {
  return (
    <nav className="tabbar" aria-label={tr('Menu', 'Menü')}>
      {props.items.map((it) => (
        <button key={it.id} type="button" aria-current={props.current === it.id ? 'page' : undefined} onClick={() => props.onPick(it.id)}>
          <span className="tabbar-icon">
            {it.icon}
            {it.dot && <i className="tabbar-dot" aria-label={tr('new', 'neu')} />}
          </span>
          {it.label}
        </button>
      ))}
    </nav>
  );
}

/** Icons of the other menus. */
export const MENU_ICONS = {
  profile: ICONS.profile,
  play: ICONS.play,
  list: ICONS.rounds,
  // house
  home: icon(<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />),
  // two people
  friends: icon(
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.5 20c.9-3.4 3.4-5.2 6.5-5.2s5.6 1.8 6.5 5.2" />
      <circle cx="17" cy="9" r="2.7" />
      <path d="M16.5 14.8c2.5.2 4.2 1.8 5 4.6" />
    </>,
  ),
  // controller
  game: icon(
    <>
      <rect x="2.5" y="7" width="19" height="11" rx="3.5" />
      <path d="M7.5 10.5v4M5.5 12.5h4" />
      <circle cx="15.5" cy="11.5" r="0.6" fill="currentColor" />
      <circle cx="18" cy="14" r="0.6" fill="currentColor" />
    </>,
  ),
  // coins (balance)
  balance: icon(
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="2.8" />
      <path d="M5 6.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5M5 11.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5" />
    </>,
  ),
  // open book (rules)
  rules: icon(
    <>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" />
      <path d="M12 6.5v13" />
    </>,
  ),
};
