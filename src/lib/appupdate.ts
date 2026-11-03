// New versions without closing the app (Sascha 24.10.2026 on the course: "PW Caddie is still under the weather" – the
// version from the morning: the home-screen app on the iPhone stays in memory for days and never asks for a new one).
// Back in the foreground the app asks the server for a new version (at most every 5 minutes); once the new one has taken
// over, the page loads it the next time it goes to the background – unseen, the round stays where it is (it lives in
// the phone's storage, as after any restart).

const EVERY_MS = 5 * 60 * 1000;

export function watchForUpdates(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller; // the first install takes control too – that is no new version
  let fresh = false;
  let askedAt = Date.now();
  const openedAt = Date.now();
  const byLink = /^#(friend|join|round|pool)=/.test(location.hash); // read before the app clears the address
  sw.addEventListener('controllerchange', () => {
    if (!hadController) return;
    fresh = true;
    // just opened (a link from WhatsApp – an invitation, a round, a pool): at once onto the new version, nothing was
    // done yet (03.11.2026: Chris's invitation opened the version cached days before, which did not know it)
    if (byLink && Date.now() - openedAt < 20_000) location.reload();
    if (document.visibilityState === 'hidden') location.reload();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (fresh) location.reload();
      return;
    }
    if (Date.now() - askedAt < EVERY_MS) return;
    askedAt = Date.now();
    void sw
      .getRegistration()
      .then((r) => r?.update())
      .catch(() => undefined); // offline on the course: next time
  });
}
