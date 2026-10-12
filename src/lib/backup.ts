import { tr } from './i18n';
// Backup of everything the app keeps on the device (rounds, hole set-ups, course corrections, settings).
// iPhone: Safari and the home-screen app have separate storage – a backup moves the data between them.

const PREFIX = 'golfos.';
const SKIP = ['golfos.geo.v1.', 'golfos.offline.v1.']; // course map caches: reloaded from the internet

export interface Backup {
  app: 'golfos-rounds';
  version: 1;
  createdAt: string;
  data: Record<string, string>;
}

export function createBackup(): Backup {
  const data: Record<string, string> = {};
  for (let k = 0; k < localStorage.length; k++) {
    const key = localStorage.key(k)!;
    if (key.startsWith(PREFIX) && !SKIP.some((s) => key.startsWith(s))) data[key] = localStorage.getItem(key)!;
  }
  return { app: 'golfos-rounds', version: 1, createdAt: new Date().toISOString(), data };
}

/** Restores a backup. Rounds are merged by id (rounds on this device win); everything else is taken from the backup if missing here. */
export function restoreBackup(b: Backup): { rounds: number } {
  if (b?.app !== 'golfos-rounds' || typeof b.data !== 'object') throw new Error(tr('This is not a GolfOS backup file.', 'Das ist keine GolfOS-Sicherung.'));
  let added = 0;
  for (const [key, value] of Object.entries(b.data)) {
    if (key === 'golfos.rounds.v1') {
      const here: { id: string }[] = JSON.parse(localStorage.getItem(key) ?? '[]');
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new Error(tr('The rounds in this backup are damaged.', 'Die Runden in dieser Sicherung sind beschädigt.'));
      }
      // Only complete rounds: an id, holes, players with "me", and one entry per hole for every player.
      const theirs = (Array.isArray(parsed) ? parsed : []).filter(
        (r): r is { id: string } =>
          r != null && typeof r.id === 'string' && Array.isArray(r.holes) && r.holes.length > 0 && Array.isArray(r.players) && r.players.some((p: { isMe?: boolean }) => p?.isMe) &&
          r.entries != null && r.players.every((p: { id: string }) => Array.isArray(r.entries[p.id]) && r.entries[p.id].length === r.holes.length),
      );
      const ids = new Set(here.map((r) => r.id));
      const merged = [...here, ...theirs.filter((r) => !ids.has(r.id))];
      added = merged.length - here.length;
      localStorage.setItem(key, JSON.stringify(merged));
    } else if (localStorage.getItem(key) == null) {
      localStorage.setItem(key, value);
    }
  }
  return { rounds: added };
}

/** Hands the backup to the iPhone share sheet (save to Files, AirDrop, mail) or downloads it. */
export async function shareBackup(): Promise<void> {
  const b = createBackup();
  const name = `golfos-backup-${b.createdAt.slice(0, 10)}.json`;
  const file = new File([JSON.stringify(b)], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: tr('GolfOS backup', 'GolfOS-Sicherung') });
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
