import type { Round, TestEvent } from '../types';
import type { TrackPoint } from './track';
import type { SpeechReport } from './caddietalk';
import { tr } from './i18n';

// The round's test protocol (Sascha 30.10.2026, before the tournament: "check on the course whether the microphone, GPS
// and the read-aloud work"): what really happened, kept with the round – on the scorecard afterwards, in the export.

const MAX = 150;

export function addTestEvent(r: Round, what: TestEvent['what'], text?: string, t = Date.now()): Round {
  return { ...r, testLog: [...(r.testLog ?? []), { t, what, ...(text ? { text } : {}) }].slice(-MAX) };
}

/** Where the GPS track has no position for at least `minS` seconds (a fix is kept every 5 s at the latest, or 3 m). */
export function gpsGaps(track: TrackPoint[], minS = 30): { from: number; to: number }[] {
  const gaps: { from: number; to: number }[] = [];
  for (let k = 1; k < track.length; k++) if (track[k].t - track[k - 1].t >= minS * 1000) gaps.push({ from: track[k - 1].t, to: track[k].t });
  return gaps;
}

/** Per hole: the strokes and putts entered against the cracks the microphone heard – the shots off the green should match. */
export function soundRows(round: Round): { label: string; strokes: number | null; putts: number | null; cracks: number; loudest: number | null }[] {
  const me = round.players.find((p) => p.isMe) ?? round.players[0];
  const entries = me ? round.entries[me.id] ?? [] : [];
  return round.holes.map((h, k) => {
    const cracks = (round.soundShots ?? []).filter((x) => x.hole === k);
    return {
      label: h.label,
      strokes: entries[k]?.strokes ?? null,
      putts: entries[k]?.putts ?? null,
      cracks: cracks.length,
      loudest: cracks.length ? Math.round(Math.max(...cracks.map((x) => x.level)) * 100) : null,
    };
  });
}

/** One read-aloud as a line: did it start, how long it spoke, the voice, whether the phone let the page play sound. */
export function speechText(r: SpeechReport): string {
  const s = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', tr('.', ','))} s`;
  return [
    r.started ? tr('started ✓', 'gestartet ✓') : tr('did not start', 'nicht gestartet'),
    r.spokeMs != null ? tr(`spoke ${s(r.spokeMs)}`, `${s(r.spokeMs)} gesprochen`) : null,
    r.end === 'stopped' ? tr('stopped', 'abgebrochen') : r.end === 'silent' ? tr('gave up (silent)', 'aufgegeben (still)') : null,
    r.error ? `${tr('error', 'Fehler')}: ${r.error}` : null,
    `${tr('voice', 'Stimme')}: ${r.voice}`,
    `${r.voices} ${r.voices === 1 ? tr('voice', 'Stimme') : tr('voices', 'Stimmen')}`,
    r.retried ? tr('second try without a chosen voice', 'zweiter Versuch ohne feste Stimme') : null,
    r.audio === 'blocked' ? tr('sound blocked by the phone', 'Ton vom Handy blockiert') : r.audio === 'played' ? tr('sound allowed', 'Ton erlaubt') : null,
    r.session ? tr(`sound mode ${r.session}`, `Tonmodus ${r.session}`) : null,
    r.micPaused ? tr('microphone paused first', 'Mikrofon vorher pausiert') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
