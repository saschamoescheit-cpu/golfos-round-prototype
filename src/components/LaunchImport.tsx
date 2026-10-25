import { useRef, useState } from 'react';
import type { Club } from '../types';
import { clubCode, tr } from '../lib/i18n';
import { loadLaunch, parseLaunchCsv, saveLaunch, summarize, type LmClub, type LmData, type LmImport } from '../lib/launchmonitor';
import { Segmented } from './ui';

// Launch monitor data in "My bag" (Sascha 25.10.2026: "carry distances backed by measured launch monitor data"): a session
// exported as CSV (Trackman, Foresight, Garmin, Rapsodo, SkyTrak, FlightScope, Uneekor) – read, shown per club, and on
// "Übernehmen" the carries go into the bag and the spread is kept for the ellipse.

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15V4M7 9l5-5 5 5M5 15v4h14v-4" />
  </svg>
);

export function LaunchImport(props: {
  /** clubs in the bag and their carry now (metres) */
  bag: { club: Club; carry: number }[];
  unit: 'm' | 'yd';
  /** the measured carries of the bag's clubs, metres */
  onApply: (carries: { club: Club; carry: number }[]) => void;
}) {
  const [data, setData] = useState<LmData | null>(loadLaunch);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [unit, setUnit] = useState<'yd' | 'm' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const U = props.unit === 'yd' ? 1.09361 : 1;
  const show = (m: number) => `${Math.round(m * U)} ${props.unit === 'yd' ? 'yd' : 'm'}`;
  const parsed: LmImport | null = file ? parseLaunchCsv(file.text, unit ?? undefined) : null;
  const clubs: LmClub[] = parsed ? summarize(parsed.shots) : [];
  const inBag = (c: Club) => props.bag.some((b) => b.club === c);
  const now = (c: Club) => props.bag.find((b) => b.club === c)?.carry ?? null;

  const read = (f: File) => {
    setError(null);
    setUnit(null);
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result ?? '');
      const p = parseLaunchCsv(text);
      if (!p.shots.length) {
        setError(tr('No shots found – the file needs a club and a carry column (CSV export of the session).', 'Keine Schläge gefunden – die Datei braucht eine Spalte für den Schläger und eine für den Carry (CSV-Export der Sitzung).'));
        setFile(null);
      } else setFile({ name: f.name, text });
    };
    r.onerror = () => setError(tr('The file could not be read.', 'Die Datei ließ sich nicht lesen.'));
    r.readAsText(f);
  };
  const apply = () => {
    if (!parsed) return;
    const d: LmData = { importedAt: new Date().toISOString(), source: parsed.source, file: file!.name, clubs };
    saveLaunch(d);
    setData(d);
    props.onApply(clubs.filter((c) => inBag(c.club)).map((c) => ({ club: c.club, carry: c.carry })));
    setFile(null);
  };

  return (
    <section className="card stats-card launch-card" aria-label="Launch-Monitor">
      <h2>Launch-Monitor</h2>
      {data ? (
        <p className="muted small" style={{ margin: 0 }}>
          {data.source} · {new Date(data.importedAt).toLocaleDateString()} · {data.clubs.length} {tr('clubs', 'Schläger')}, {data.clubs.reduce((n, c) => n + c.shots, 0)} {tr('shots', 'Schläge')}
          {' · '}
          {tr('carries and spread from the measured shots', 'Carry und Streuung aus den gemessenen Schlägen')}
        </p>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {tr('Trackman, Foresight, Garmin R10, Rapsodo … – export the session as CSV and load it here.', 'Trackman, Foresight, Garmin R10, Rapsodo … – die Sitzung als CSV exportieren und hier laden.')}
        </p>
      )}
      <input ref={input} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} data-qa="launch-file" />
      <button type="button" className="btn-secondary launch-import" onClick={() => input.current?.click()}>
        <UploadIcon />
        {data ? tr('Import another session', 'Weitere Sitzung importieren') : tr('Import launch monitor data', 'Launch-Monitor-Daten importieren')}
      </button>
      {error && <p className="small bad-text" style={{ margin: 0 }}>{error}</p>}

      {parsed && file && (
        <div className="sheet-backdrop" onClick={() => setFile(null)}>
          <section className="sheet" role="dialog" aria-label={tr('Launch monitor data', 'Launch-Monitor-Daten')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>
                {parsed.source} · {parsed.shots.length} {tr('shots', 'Schläge')}
              </strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setFile(null)}>
                ✕
              </button>
            </div>
            <span className="muted small">{file.name}</span>
            {/* the unit: from the file, or the player says it */}
            {!parsed.unitSure && <span className="small good-text">{tr('The file names no unit – choose it:', 'Die Datei nennt keine Einheit – bitte wählen:')}</span>}
            <Segmented<'yd' | 'm'>
              label={tr('Distances in the file', 'Weiten in der Datei')}
              value={parsed.unit}
              onChange={(v) => v && setUnit(v)}
              options={[
                { value: 'yd', label: 'Yards' },
                { value: 'm', label: tr('Metres', 'Meter') },
              ]}
            />
            <div className="launch-table" role="table" aria-label={tr('Per club', 'Je Schläger')}>
              <span className="muted small" role="columnheader" />
              <span className="muted small" role="columnheader">{tr('shots', 'Schläge')}</span>
              <span className="muted small" role="columnheader">Carry</span>
              <span className="muted small" role="columnheader">{tr('so far', 'bisher')}</span>
              <span className="muted small" role="columnheader">{tr('spread', 'Streuung')}</span>
              {clubs.map((c) => (
                <div key={c.club} className={`launch-row${inBag(c.club) ? '' : ' off'}`} role="row">
                  <strong role="cell">{clubCode(c.club)}</strong>
                  <span role="cell">{c.shots}×</span>
                  <strong role="cell">{show(c.carry)}</strong>
                  <span role="cell" className="muted">{inBag(c.club) ? show(now(c.club)!) : tr('not in bag', 'nicht im Bag')}</span>
                  <span role="cell" className="muted small">
                    {c.side ? `↔ ±${Math.round(((c.side.hi - c.side.lo) / 2) * U)}` : ''}
                    {c.side ? ' · ' : ''}↕ ±{Math.round(((c.len.hi - c.len.lo) / 2) * U)}
                  </span>
                </div>
              ))}
            </div>
            {parsed.unknownClubs.length > 0 && (
              <span className="muted small">
                {tr('Not recognised: ', 'Nicht erkannt: ')}
                {parsed.unknownClubs.slice(0, 6).join(', ')}
              </span>
            )}
            <span className="muted small">
              {tr('Carry: the median of each club; clear mishits (under 60 %) left out. Spread: where 8 of 10 balls land.', 'Carry: der Median je Schläger, klare Fehlschläge (unter 60 %) ohne. Streuung: wo 8 von 10 Bällen landen.')}
            </span>
            <button type="button" className="btn-primary" onClick={apply}>
              {tr('Use', 'Übernehmen')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setFile(null)}>
              {tr('Cancel', 'Abbrechen')}
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
