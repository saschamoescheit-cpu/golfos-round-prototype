import { describe, expect, it } from 'vitest';
import type { Round } from '../types';
import type { TrackPoint } from './track';
import { addTestEvent, gpsGaps, soundRows, speechText } from './testlog';
import type { SpeechReport } from './caddietalk';

const round = (): Round =>
  ({
    id: 'r1',
    holes: [{ label: '1' }, { label: '2' }, { label: '3' }],
    players: [{ id: 'me', name: 'Sascha', isMe: true }],
    entries: {
      me: [
        { strokes: 5, putts: 2 },
        { strokes: 4, putts: null },
        { strokes: null, putts: null },
      ],
    },
    soundShots: [
      { hole: 0, pos: [0, 0], t: 1, level: 0.42, acc: 4 },
      { hole: 0, pos: [0, 0], t: 2, level: 0.81, acc: 4 },
      { hole: 0, pos: [0, 0], t: 3, level: 0.3, acc: 4 },
      { hole: 1, pos: [0, 0], t: 4, level: 0.5, acc: 4 },
    ],
  }) as unknown as Round;

describe('test protocol', () => {
  it('keeps the last 150 lines, in order', () => {
    let r = round();
    for (let k = 0; k < 160; k++) r = addTestEvent(r, 'mic-stalled', String(k), k);
    expect(r.testLog).toHaveLength(150);
    expect(r.testLog![0]).toEqual({ t: 10, what: 'mic-stalled', text: '10' });
    expect(addTestEvent(round(), 'pocket-on', undefined, 5).testLog).toEqual([{ t: 5, what: 'pocket-on' }]);
  });

  it('finds the GPS gaps of 30 s and more', () => {
    const pts = [0, 5, 10, 45, 50, 49 + 120].map((s) => ({ t: s * 1000, p: [0, 0], acc: 5 }) as TrackPoint);
    expect(gpsGaps(pts)).toEqual([
      { from: 10000, to: 45000 },
      { from: 50000, to: 169000 },
    ]);
    expect(gpsGaps(pts.slice(0, 3))).toEqual([]);
  });

  it('per hole: strokes, putts, cracks and the loudest', () => {
    expect(soundRows(round())).toEqual([
      { label: '1', strokes: 5, putts: 2, cracks: 3, loudest: 81 },
      { label: '2', strokes: 4, putts: null, cracks: 1, loudest: 50 },
      { label: '3', strokes: null, putts: null, cracks: 0, loudest: null },
    ]);
  });

  it('a read-aloud as a line: started, how long, the voice, the sound', () => {
    const rep: SpeechReport = { voices: 41, voice: 'Anna (de-DE)', started: true, error: null, retried: false, micPaused: true, at: 0, spokeMs: 3240, end: 'end', audio: 'played', session: 'playback' };
    const de = speechText(rep);
    expect(de).toContain('started ✓');
    expect(de).toContain('spoke 3.2 s');
    expect(de).toContain('voice: Anna (de-DE)');
    expect(de).toContain('sound allowed');
    expect(de).toContain('sound mode playback');
    expect(speechText({ ...rep, started: false, spokeMs: null, end: 'silent', audio: 'blocked', retried: true })).toMatch(/did not start · gave up \(silent\).*second try.*sound blocked/);
  });
});
