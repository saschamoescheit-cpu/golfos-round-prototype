// Switching modules quickly (Sascha 12.11.2026: "a burger menu or so, to switch modules faster" – he chose the sheet
// from below, mock-up A): the module button top left in every module opens this sheet – the same module cards as the
// start page, with what is to do on each, the current one green; a tap goes there, where one was last (each module
// keeps its place). The sheet lives once beside the app and opens on the event "golfos:module-sheet" (with what the
// cards say); a pick goes back as "golfos:pick-module".
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../lib/i18n';
import type { AppModule } from '../lib/gamestore';
import { ModuleCardList, type ModuleCardInfo } from '../screens/Home';

type Open = { current: AppModule | null; info: ModuleCardInfo };

export const openModuleSheet = (current: AppModule | null, info: ModuleCardInfo): void => {
  window.dispatchEvent(new CustomEvent<Open>('golfos:module-sheet', { detail: { current, info } }));
};

/** Mounted once beside the app. */
export function ModuleSheetHost() {
  const [open, setOpen] = useState<Open | null>(null);
  useEffect(() => {
    const on = (e: Event) => setOpen((e as CustomEvent<Open>).detail);
    window.addEventListener('golfos:module-sheet', on);
    return () => window.removeEventListener('golfos:module-sheet', on);
  }, []);
  if (!open) return null;
  // the module one is in too: its card does what it says, as on the start page (a paused session, the rounds to sign)
  const pick = (m: AppModule) => {
    setOpen(null);
    window.dispatchEvent(new CustomEvent<AppModule>('golfos:pick-module', { detail: m }));
  };
  return createPortal(
    <div className="sheet-backdrop" onClick={() => setOpen(null)}>
      <section className="sheet module-sheet" role="dialog" aria-label={tr('Switch module', 'Modul wechseln')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Switch module', 'Modul wechseln')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setOpen(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="module-sheet-list">
          <ModuleCardList {...open.info} current={open.current} onPick={pick} />
        </div>
      </section>
    </div>,
    document.body,
  );
}

/** The module pill top left in every module (Sascha 12.11.2026: "Modul-Pille oben links"): the module's name between the
 *  grid and a chevron – a tap opens the module sheet. The name keeps the class "module-tag". */
export function ModulePill(props: { name: string; onClick: () => void }) {
  return (
    <button type="button" className="module-switch module-pill" onClick={props.onClick} aria-label={tr(`Switch module – now ${props.name}`, `Modul wechseln – jetzt ${props.name}`)}>
      <svg className="module-pill-grid" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
        <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
        <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
      </svg>
      <span className="module-tag">{props.name}</span>
      <svg className="module-pill-down" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}
