import type { Round } from '../types';
import type { TrackPoint } from './track';
import type { CaddieLog } from './caddielog';

// One round as a file for the analysis (Sascha 16.10.2026: "Runde exportieren – ich lege die Datei in die
// Dropbox"): everything needed to replay the shot detection – the round as checked by the player (scores, shots,
// putts, his corrections), the whole GPS track, what the caddie said, and what the detection finds right now.

export interface RoundExport {
  kind: 'golfos-round-export';
  version: 1;
  exportedAt: string;
  app: string; // build time of the app
  round: Round;
  track: TrackPoint[];
  caddieLog: CaddieLog;
  /** the detection run again on export: per hole the shots it finds (null: no track for the hole) */
  detectedNow: ({ shots: { pos: [number, number] | null; club: string | null }[]; onGreen: [number, number] | null } | null)[];
  device: { userAgent: string; screen: string };
}

export function buildExport(o: Omit<RoundExport, 'kind' | 'version' | 'exportedAt' | 'device'>): RoundExport {
  return {
    kind: 'golfos-round-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...o,
    device: { userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '', screen: typeof screen !== 'undefined' ? `${screen.width}×${screen.height}` : '' },
  };
}

export function exportFileName(r: Round): string {
  const day = r.createdAt.slice(0, 10);
  const course = r.courseName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase();
  return `golfos-runde-${day}-${course}.json`;
}

/** iPhone: the share sheet (Dropbox, Files, mail); elsewhere a download. */
export async function shareExport(data: RoundExport, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = typeof File !== 'undefined' ? new File([blob], name, { type: 'application/json' }) : null;
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (file && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // sharing refused: a download instead
    }
  }
  // a data link (WebKit refuses a blob link here "due to access control checks")
  const a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'downloaded';
}
