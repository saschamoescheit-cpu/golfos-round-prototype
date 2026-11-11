// The floating actions bottom right (Sascha 12.11.2026, mock-up "Neu starten": "C with the floating button, but looking
// like A"; the pencil "also bottom right, floating – the same in the whole app"): a round green "+" for something new
// on a list page (a round, a game, a bet, a tournament, a payment, a friend) and the page's pencil (change the pool,
// the tournament, the bag, the own plan) – the pencil small above the "+" when a page has both. Rendered beside the
// screen (fixed), above the menu bar when there is one. A row's own pencil stays at the row.
import { createPortal } from 'react-dom';

export type FloatAction = { label: string; onClick: () => void; disabled?: boolean };

const Plus = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Pen = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
);

const Tick = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/** save: a page being changed saved with the round green tick at the same place (Sascha 11.11.2026: "Speicher-Buttons
 *  sollten auch schweben als Button") – the bag, a tournament changed, the own plan; a sheet keeps its own ✓ up top. */
export function FloatActions(props: { plus?: FloatAction | null; pen?: FloatAction | null; save?: FloatAction | null }) {
  if (!props.plus && !props.pen && !props.save) return null;
  return createPortal(
    <div className="fab-stack">
      {props.save && (
        <button type="button" className="fab fab-save" aria-label={props.save.label} title={props.save.label} disabled={props.save.disabled} onClick={props.save.onClick}>
          <Tick />
        </button>
      )}
      {props.pen && (
        <button type="button" className={`fab fab-pen${props.plus ? ' small' : ''}`} aria-label={props.pen.label} title={props.pen.label} onClick={props.pen.onClick}>
          <Pen />
        </button>
      )}
      {props.plus && (
        <button type="button" className="fab fab-plus" aria-label={props.plus.label} title={props.plus.label} onClick={props.plus.onClick}>
          <Plus />
        </button>
      )}
    </div>,
    document.body,
  );
}
