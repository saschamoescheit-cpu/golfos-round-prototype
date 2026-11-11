import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../lib/i18n';

/** The one confirmation of the app – deleting, ending, dissolving, in every module the same as "Runde abbrechen und
 *  löschen?" in Rounds (Sascha 11.11.2026, Facelift-Abnahme W9/T8/P4: "Passt"): a sheet head with its title and ✕, one line
 *  what happens, the red-outlined action, "Zurück". Never a red-filled button, never "Abbrechen" beside it. */
export function ConfirmSheet(props: {
  title: string;
  /** what happens – one or two sentences */
  text?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  /** a destructive action (red outline) – the default; false for e.g. "Beenden & abrechnen" (green) */
  danger?: boolean;
  busy?: boolean;
  children?: ReactNode;
}) {
  const danger = props.danger ?? true;
  return createPortal(
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet confirm-sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.title}</strong>
          <span className="sheet-head-acts">
            <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
              ✕
            </button>
          </span>
        </div>
        {props.text && <span className="muted">{props.text}</span>}
        {props.children}
        <div className="sheet-actions">
          <button type="button" className={danger ? 'btn-secondary btn-danger' : 'btn-primary'} disabled={props.busy} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
          <button type="button" className="btn-secondary" onClick={props.onClose}>
            {tr('Back', 'Zurück')}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
