// Back by a swipe (Sascha 10.11.2026: "beside the arrow for back, swipe to get one level back"): from the left edge of
// the screen to the right, as everywhere on the iPhone – an open sheet closes first, else the screen's back arrow is
// tapped. Starting away from the edge it is no back swipe: the map, the rows that swipe to delete, the scrolling stay
// as they are.

const EDGE = 28; // px from the left edge where a back swipe begins
const MIN = 70; // px to the right

/** What a back swipe does: the topmost open sheet closed – else the back arrow of the screen. True when something did. */
export function swipeBack(doc: Document = document): boolean {
  const closers = doc.querySelectorAll<HTMLElement>('[role="dialog"] .sheet-head .icon-btn');
  const top = closers[closers.length - 1];
  if (top) {
    top.click();
    return true;
  }
  const back = doc.querySelector<HTMLElement>('.topbar > button.icon-btn:first-child');
  if (back) {
    back.click();
    return true;
  }
  return false;
}

/** Listens for the swipe from the left edge – once, at the start of the app. */
export function installSwipeBack(): void {
  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  let on = false;
  addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches?.[0];
      on = !!t && e.touches.length === 1 && t.clientX <= EDGE;
      if (!on || !t) return;
      x0 = t.clientX;
      y0 = t.clientY;
      t0 = Date.now();
    },
    { passive: true },
  );
  addEventListener(
    'touchend',
    (e) => {
      if (!on) return;
      on = false;
      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - x0;
      const dy = Math.abs(t.clientY - y0);
      if (dx >= MIN && dy < dx * 0.6 && Date.now() - t0 < 900) swipeBack();
    },
    { passive: true },
  );
}
