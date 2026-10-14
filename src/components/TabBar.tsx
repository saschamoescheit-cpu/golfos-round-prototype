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
    <nav className="tabbar" aria-label={tr('Menu', 'Menü')}>
      {(['play', 'rounds', 'record', 'stats', 'profile'] as Tab[]).map((t) => (
        <button key={t} type="button" aria-current={props.tab === t ? 'page' : undefined} onClick={() => props.onTab(t)}>
          <span className="tabbar-icon">
            {ICONS[t]}
            {props.dots?.[t] && <i className="tabbar-dot" aria-label={tr('new', 'neu')} />}
          </span>
          {tabLabel(t)}
        </button>
      ))}
    </nav>
  );
}
