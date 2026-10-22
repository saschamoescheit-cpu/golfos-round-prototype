// A new version went live while the app was open (Sascha 19.10.2026: "Fehler: error loading dynamically imported
// module … Swing3D-….js"; 22.10.2026 again with RoundReview-….js – "has to be fixed for good"): the open app asks for
// parts of the old version. The server keeps the old versions' files for 14 days (deploy.yml), so this is rare now.
// If it happens: a reload onto the new version; if the phone still opened the old version from its offline store, the
// second time the app's own files leave that store first (rounds, profile and the offline maps stay) and the new
// version comes from the server. Only a third failure within a minute shows the error screen (no reload loop).

const KEY = 'golfos.stalereload';

/** True for "the part of the app could not be loaded" in Safari, Chrome and Firefox. */
export function isStaleChunk(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e ?? '');
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk \d+ failed/i.test(m);
}

/** The reloads for a new version in the last minute. */
function recent(): { at: number; n: number } {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { at?: number; n?: number } | number | null;
    if (v && typeof v === 'object' && v.at && Date.now() - v.at < 60_000) return { at: v.at, n: v.n ?? 1 };
    return { at: 0, n: 0 };
  } catch {
    return { at: 0, n: 2 }; // without the guard no automatic reload (it could loop)
  }
}

/** True while a reload for a new version may still happen (else the error is real: no loop). */
export function mayReloadForNewVersion(): boolean {
  return recent().n < 2;
}

/** The app's own files out of the offline store (the old version), so the next load comes from the server. */
async function freshStart(): Promise<void> {
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => /precache/i.test(n)).map((n) => caches.delete(n)));
  } catch {
    /* no cache storage */
  }
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
  } catch {
    /* no service worker */
  }
}

/** Reloads onto the new version – the second time from the server; false when it may not (see above). */
export function reloadForNewVersion(): boolean {
  const r = recent();
  if (r.n >= 2) return false;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), n: r.n + 1 }));
  } catch {
    return false;
  }
  if (r.n === 0) location.reload();
  else void freshStart().finally(() => location.reload());
  return true;
}
