import type { Round, TestEvent } from '../types';
import { loadTrack } from '../lib/track';
import { gpsGaps, soundRows } from '../lib/testlog';
import { getLang, tr } from '../lib/i18n';

// The test protocol on the scorecard (Sascha 30.10.2026, for the tournament: "check on the course whether it works"):
// strokes against the cracks the microphone heard per hole, the GPS gaps, and what the microphone, pocket mode, the
// app and the read-aloud did – with the time, as the phone reported it. Only for a round with test data.

const WHAT: Record<TestEvent['what'], () => string> = {
  'mic-on': () => tr('Microphone', 'Mikrofon'),
  'mic-stalled': () => tr('Microphone interrupted', 'Mikrofon unterbrochen'),
  'mic-restart': () => tr('Microphone', 'Mikrofon'),
  'mic-failed': () => tr('Microphone restart failed', 'Mikrofon-Neustart fehlgeschlagen'),
  'pocket-on': () => tr('Pocket mode on', 'Taschenmodus an'),
  'pocket-off': () => tr('Pocket mode off', 'Taschenmodus aus'),
  'app-hidden': () => tr('App in the background (other app or locked)', 'App im Hintergrund (andere App oder gesperrt)'),
  'app-back': () => tr('App in front again', 'App wieder vorne'),
  speech: () => tr('Read aloud', 'Vorlesen'),
};
const BAD = new Set<string>(['mic-stalled', 'mic-failed', 'app-hidden', 'gps-gap']);
const SPEECH_BAD = /did not start|nicht gestartet|gave up|aufgegeben|blocked|blockiert|error|Fehler/;

export function TestLogCard(props: { round: Round }) {
  const { round } = props;
  const log = round.testLog ?? [];
  const sounds = round.soundShots ?? [];
  if (!log.length && !sounds.length) return null;
  const de = getLang() === 'de';
  const time = (t: number) => new Date(t).toLocaleTimeString(de ? 'de-DE' : undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dur = (ms: number) => {
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
  };
  const track = loadTrack(round.id);
  const gaps = gpsGaps(track);
  const rows = soundRows(round).filter((r) => r.strokes != null || r.cracks > 0);
  const sum = (f: (r: (typeof rows)[number]) => number | null) => rows.reduce((a, r) => a + (f(r) ?? 0), 0);
  const withPutts = rows.filter((r) => r.strokes != null && r.putts != null);
  // the microphone's gaps: each "interrupted" up to the next "on"
  const stalls = log.filter((e) => e.what === 'mic-stalled');
  const stalledMs = stalls.reduce((a, e) => {
    const back = log.find((x) => x.t > e.t && x.what === 'mic-on');
    return a + ((back?.t ?? e.t) - e.t);
  }, 0);
  const micUsed = log.some((e) => e.what.startsWith('mic-')) || sounds.length > 0;
  const lines = [
    ...log.map((e) => ({ t: e.t, kind: e.what as string, title: WHAT[e.what]?.() ?? e.what, text: e.text })),
    ...gaps.map((g) => ({ t: g.from, kind: 'gps-gap', title: tr(`GPS: no position for ${dur(g.to - g.from)}`, `GPS: ${dur(g.to - g.from)} keine Position`), text: undefined as string | undefined })),
  ].sort((a, b) => a.t - b.t);

  return (
    <section className="card testlog" aria-label={tr('Test protocol', 'Testprotokoll')}>
      <strong>{tr('Test protocol', 'Testprotokoll')}</strong>
      <span className="muted small">{tr('What the microphone, GPS, pocket mode and the read-aloud really did on the course.', 'Was Mikrofon, GPS, Taschenmodus und Vorlesen auf dem Platz wirklich gemacht haben.')}</span>

      {sounds.length > 0 && rows.length > 0 && (
        <table className="testlog-table">
          <thead>
            <tr>
              <th>{tr('Hole', 'Loch')}</th>
              <th>{tr('Strokes', 'Schläge')}</th>
              <th>Putts</th>
              <th>{tr('Cracks', 'Knalle')}</th>
              <th>{tr('Loudest', 'Lautester')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.strokes ?? '–'}</td>
                <td>{r.putts ?? '–'}</td>
                <td>{r.cracks}</td>
                <td>{r.loudest ?? '–'}</td>
              </tr>
            ))}
            <tr className="testlog-sum">
              <td>{tr('Total', 'Summe')}</td>
              <td>{rows.some((r) => r.strokes != null) ? sum((r) => r.strokes) : '–'}</td>
              <td>{withPutts.length ? sum((r) => r.putts) : '–'}</td>
              <td>{sum((r) => r.cracks)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
      {sounds.length > 0 && withPutts.length > 0 && (
        <span className="small">
          {tr(
            `Shots off the green (strokes − putts): ${withPutts.reduce((a, r) => a + r.strokes! - r.putts!, 0)} · cracks heard on these holes: ${withPutts.reduce((a, r) => a + r.cracks, 0)} – more cracks: partners' shots counted too; fewer: the pocket muffles.`,
            `Schläge ohne Putts: ${withPutts.reduce((a, r) => a + r.strokes! - r.putts!, 0)} · gehörte Knalle auf diesen Löchern: ${withPutts.reduce((a, r) => a + r.cracks, 0)} – mehr Knalle: Mitspieler mitgezählt; weniger: die Tasche dämpft.`,
          )}
        </span>
      )}

      <ul className="testlog-summary">
        {micUsed && (
          <li className={stalls.length ? 'bad' : undefined}>
            {stalls.length
              ? tr(`Microphone: interrupted ${stalls.length}×, ${dur(stalledMs)} in all`, `Mikrofon: ${stalls.length}× unterbrochen, insgesamt ${dur(stalledMs)}`)
              : tr('Microphone: listening throughout ✓', 'Mikrofon: durchgehend an ✓')}
          </li>
        )}
        <li className={gaps.length ? 'bad' : undefined}>
          {gaps.length
            ? tr(`GPS: ${track.length} points · ${gaps.length} gaps over 30 s, the longest ${dur(Math.max(...gaps.map((g) => g.to - g.from)))}`, `GPS: ${track.length} Punkte · ${gaps.length} Lücken über 30 s, die längste ${dur(Math.max(...gaps.map((g) => g.to - g.from)))}`)
            : tr(`GPS: ${track.length} points · no gap over 30 s ✓`, `GPS: ${track.length} Punkte · keine Lücke über 30 s ✓`)}
        </li>
      </ul>

      {lines.length > 0 && (
        <ol className="testlog-lines">
          {lines.map((l, k) => (
            <li key={k} className={BAD.has(l.kind) || (l.kind === 'speech' && SPEECH_BAD.test(l.text ?? '')) ? 'bad' : undefined}>
              <span className="testlog-time">{time(l.t)}</span>
              <span>
                {l.title}
                {l.text ? <span className="muted"> – {l.text}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
