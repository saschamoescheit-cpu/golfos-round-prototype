import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tr } from '../lib/i18n';

// Swiped away as a mail (Sascha 02.11.2026: "delete by wiping it away as with e-mails, then a bin comes – in the whole
// app"): swiped left a little the red bin shows and a tap on it deletes; all the way across it deletes at once. What is
// deleted goes into the bin as before, with "Undo". Only a clear sideways move counts (touch-action pan-y, 10 px, more
// across than down) – a tap still opens the row, a crooked scroll deletes nothing; iOS keeps the screen's left edge for
// going back. The row's own delete (its screen, the paused round's bin) stays for the keyboard and VoiceOver.

const SHOWN = 84; // the bin's width when it stays open
const START = 10; // px across before the row follows the finger
const EDGE = 24; // px of the screen's left edge left to iOS

let seq = 0;

export function SwipeRow(props: {
  children: ReactNode;
  /** what is deleted, for the bin's label: "Delete <label>" */
  label: string;
  /** false: the row could not be deleted (no network …) – it slides back */
  onDelete: () => void | boolean | Promise<void | boolean>;
  className?: string;
}) {
  const [id] = useState(() => ++seq);
  const [off, setOffState] = useState(0);
  // the offset as the finger left it – the events read it before React has drawn it
  const at = useRef(0);
  const setOff = (x: number) => {
    at.current = x;
    setOffState(x);
  };
  const [dragging, setDragging] = useState(false);
  const front = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; from: number; axis: 'x' | 'y' | null; pointer: number } | null>(null);
  const swallow = useRef(false); // the click after a swipe (or the tap closing an open row) opens nothing
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    // one row open at a time, as in Mail
    const other = (e: Event) => {
      if ((e as CustomEvent<number>).detail === id) return;
      at.current = 0;
      setOffState(0);
    };
    window.addEventListener('golfos:swipe', other);
    return () => {
      alive.current = false;
      window.removeEventListener('golfos:swipe', other);
    };
  }, [id]);

  const width = () => front.current?.offsetWidth ?? 320;
  const remove = async () => {
    setOff(-width());
    await new Promise((r) => setTimeout(r, 180));
    try {
      await props.onDelete();
    } catch {
      /* not deleted */
    }
    // still here (not deleted – no network, not the host's): back in place
    if (alive.current) setOff(0);
  };

  const end = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d?.axis) return; // a tap: it opens the row
    swallow.current = true; // a drag either way is no tap
    if (d.axis === 'y') return;
    if (-at.current > width() * 0.55) void remove();
    else if (-at.current > SHOWN / 2) {
      setOff(-SHOWN);
      window.dispatchEvent(new CustomEvent('golfos:swipe', { detail: id }));
    } else setOff(0);
  };

  return (
    <div className="swipe">
      {off < 0 && (
        <button type="button" className="swipe-bin" tabIndex={-1} aria-label={tr(`Delete ${props.label}`, `${props.label} löschen`)} onClick={() => void remove()}>
          <span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
            </svg>
            <span className="swipe-bin-text">{tr('Delete', 'Löschen')}</span>
          </span>
        </button>
      )}
      <div
        ref={front}
        className={`swipe-front${dragging ? ' dragging' : ''}${props.className ? ` ${props.className}` : ''}`}
        style={off ? { transform: `translateX(${off}px)` } : undefined}
        onPointerDown={(e) => {
          swallow.current = false; // a swipe that brought no click of its own swallows no later tap
          if (e.button !== 0 || e.clientX < EDGE) return;
          drag.current = { x: e.clientX, y: e.clientY, from: at.current, axis: null, pointer: e.pointerId };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.pointer !== e.pointerId) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (d.axis == null) {
            if (Math.abs(dx) > START && Math.abs(dx) > Math.abs(dy)) {
              d.axis = 'x';
              setDragging(true);
              try {
                front.current?.setPointerCapture(e.pointerId);
              } catch {
                /* the pointer gone already */
              }
            } else if (Math.abs(dy) > START) d.axis = 'y';
          }
          if (d.axis === 'x') setOff(Math.max(-width(), Math.min(0, d.from + dx)));
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onClickCapture={(e) => {
          // a swipe's own click opens nothing; a tap on an open row closes it and opens nothing either
          const swiped = swallow.current;
          swallow.current = false;
          if (!swiped && at.current === 0) return;
          e.preventDefault();
          e.stopPropagation();
          if (!swiped) setOff(0);
        }}
      >
        {props.children}
      </div>
    </div>
  );
}
