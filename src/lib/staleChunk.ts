// A new version went live while the app was open (Sascha 19.10.2026: "Fehler: error loading dynamically imported
// module … Swing3D-….js" – several deploys a day): the open app still asks for the parts of the old version, which are
// gone. A reload fetches the new version – once; if it happens again right after, the error screen shows as before.

const KEY = 'golfos.stalereload';

/** True for "the part of the app could not be loaded" in Safari, Chrome and Firefox. */
export function isStaleChunk(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e ?? '');
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk \d+ failed/i.test(m);
}

/** True when no reload for a new version happened in the last minute (else the error is real: no loop). */
export function mayReloadForNewVersion(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) >= 60_000;
  } catch {
    return false; // without the guard no automatic reload (it could loop)
  }
}

/** Reloads once to the new version; false when it may not (see above). */
export function reloadForNewVersion(): boolean {
  if (!mayReloadForNewVersion()) return false;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}
