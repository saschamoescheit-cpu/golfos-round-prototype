// The switch for the realistic golfer (23.10.2026, for Sascha to judge first) – in a module of its own, without three.js,
// so the Agility module can read it on its start page and load the body there already.

/** on with ?real3d=1, off with ?real3d=0 – the same switch as Training's swing videos (localStorage golfos.real3d) */
export function wantRealistic(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('real3d');
    if (q === '1') localStorage.setItem('golfos.real3d', '1');
    if (q === '0') localStorage.removeItem('golfos.real3d');
    return localStorage.getItem('golfos.real3d') === '1';
  } catch {
    return false;
  }
}

let asked = false;
/** With the realistic golfer on: load its body while the player is still on a page without a 3D video (≈ 1.8 MB, once)
 * – the first video then starts with it instead of the old figure for a second or more (on a phone over the mobile
 * network more: the download). When the browser is idle, so it does not hold up the page that is opening. */
export function preloadRealisticBody(): void {
  if (asked || !wantRealistic()) return;
  asked = true;
  const go = () =>
    void import('./rigSkin')
      .then((m) => m.loadRealisticBody())
      // (for the checks: the body is there before the first video)
      .then(() => (document.documentElement.dataset.real3d = 'loaded'))
      .catch(() => (asked = false));
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2000 });
  else setTimeout(go, 300);
}
