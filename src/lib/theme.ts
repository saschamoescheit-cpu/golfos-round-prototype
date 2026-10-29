// Sun mode: light panels with black type for bright sunshine on the course (dark screens are hard to read at noon).
// The choice is kept on the device (and synced to the others) and applied before the first paint.

const KEY = 'golfos.sun.v1';

export function isSun(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function applyTheme(sun = isSun()): void {
  if (typeof document === 'undefined') return;
  if (sun) document.documentElement.dataset.theme = 'sun';
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sun ? '#f4f6f2' : '#0e1418');
}

export function setSun(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked – still switch for this visit */
  }
  applyTheme(on);
}

// synced with the other devices (29.10.2026): switched on another device, it shows here once the sync brings it
if (typeof window !== 'undefined') window.addEventListener('golfos:pulled', () => applyTheme());
