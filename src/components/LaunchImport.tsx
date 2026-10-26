import { useRef, useState } from 'react';
import type { Club } from '../types';
import { clubCode, getLang, tr } from '../lib/i18n';
import { clubName } from '../lib/caddie';
import { loadLaunch, measuredAtOf, mergeLaunch, parseLaunchCsv, proposeNew, saveLaunch, summarize, type LmClub, type LmData, type LmImport, type LmSession } from '../lib/launchmonitor';
import { Segmented } from './ui';

// Launch monitor data in "My bag" (Sascha 25.10.2026: "carry distances backed by measured launch monitor data"): a session
// exported as CSV – Garmin R10, Trackman, Foresight to begin with (Sascha 26.10.2026) – read, shown per club, and on
// "Übernehmen" the carries go into the bag as measured (1:1), the spread is kept for the ellipse and the session for its
// own page. Sessions add up; a club measured before is replaced only as the player chooses (the newer proposed), a club
// not in the bag can be added. Clubs not in the file stay as the player entered them.

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15V4M7 9l5-5 5 5M5 15v4h14v-4" />
  </svg>
);

export function LaunchImport(props: {
  /** clubs in the bag and their carry now (metres) */
  bag: { club: Club; carry: number }[];
  unit: 'm' | 'yd';
  /** the measured carries going into the bag, metres – "add" for a club not in the bag yet */
  onApply: (carries: { club: Club; carry: number; add?: boolean }[]) => void;
  onOpenSession: (id: string) => void;
}) {
  const [data, setData] = useState<LmData | null>(loadLaunch);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [unit, setUnit] = useState<'yd' | 'm' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // per club: keep the earlier measurement instead of the new one; add a club that is not in the bag
  const [keepOld, setKeepOld] = useState<Club[]>([]);
  const [noAdd, setNoAdd] = useState<Club[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const locale = getLang() === 'de' ? 'de-DE' : 'en-US';
  const U = props.unit === 'yd' ? 1.09361 : 1;
  const show = (m: number) => `${Math.round(m * U)} ${props.unit === 'yd' ? 'yd' : 'm'}`;
  const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(locale) : tr('no date', 'ohne Datum'));
  const parsed: LmImport | null = file ? parseLaunchCsv(file.text, unit ?? undefined) : null;
  const clubs: LmClub[] = parsed ? summarize(parsed.shots) : [];
  const measuredAt = parsed ? measuredAtOf(parsed.shots) : null;
  const inBag = (c: Club) => props.bag.some((b) => b.club === c);
  const now = (c: Club) => props.bag.find((b) => b.club === c)?.carry ?? null;
  const before = (c: Club) => data?.clubs.find((x) => x.club === c) ?? null;
  const sessions = [...(data?.sessions ?? [])].sort((a, b) => (b.measuredAt ?? b.importedAt).localeCompare(a.measuredAt ?? a.importedAt));

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
        return;
      }
      // the proposal per club measured before: the newer measurement
      const m = measuredAtOf(p.shots);
      setKeepOld(summarize(p.shots).filter((c) => before(c.club) && !proposeNew(before(c.club)!, m)).map((c) => c.club));
      setNoAdd([]);
      setFile({ name: f.name, text });
    };
    r.onerror = () => setError(tr('The file could not be read.', 'Die Datei ließ sich nicht lesen.'));
    r.readAsText(f);
  };
  const apply = () => {
    if (!parsed || !file) return;
    const importedAt = new Date().toISOString();
    const session: LmSession = { id: `lm-${Date.now().toString(36)}`, source: parsed.source, file: file.name, importedAt, measuredAt, shots: parsed.shots };
    const d = mergeLaunch(data, session, clubs, keepOld);
    saveLaunch(d);
    setData(d);
    props.onApply(
      clubs
        .filter((c) => !keepOld.includes(c.club) && (inBag(c.club) || !noAdd.includes(c.club)))
        .map((c) => ({ club: c.club, carry: c.carry, add: !inBag(c.club) || undefined })),
    );
    setFile(null);
  };
  const toggle = (list: Club[], set: (x: Club[]) => void, c: Club) => set(list.includes(c) ? list.filter((x) => x !== c) : [...list, c]);
  const twice = clubs.filter((c) => before(c.club));
  const missing = clubs.filter((c) => !inBag(c.club));

  return (
    <section className="card stats-card launch-card" aria-label="Launch-Monitor">
      <h2>Launch-Monitor</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {tr('Garmin R10, Trackman, Foresight – export the session as CSV and load it here. The carries go into the bag as measured.', 'Garmin R10, Trackman, Foresight – die Sitzung als CSV exportieren und hier laden. Die Weiten kommen so in den Bag, wie gemessen.')}
      </p>
      {sessions.length > 0 ? (
        <div className="launch-sessions" role="list" aria-label={tr('Sessions', 'Sitzungen')}>
          {sessions.map((s) => (
            <button key={s.id} type="button" role="listitem" className="list-item" onClick={() => props.onOpenSession(s.id)}>
              <span>
                <strong>{s.source}</strong>
                <span className="muted small">
                  {' · '}
                  {day(s.measuredAt)} · {tr(`${s.shots.length} shots`, `${s.shots.length} Schläge`)}
                </span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      ) : (
        data && (
          <p className="muted small" style={{ margin: 0 }}>
            {data.source} · {day(data.importedAt)} · {data.clubs.length} {tr('clubs', 'Schläger')}, {data.clubs.reduce((n, c) => n + c.shots, 0)} {tr('shots', 'Schläge')}
          </p>
        )
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
            <span className="muted small">
              {file.name} · {measuredAt ? tr(`measured ${day(measuredAt)}`, `gemessen am ${day(measuredAt)}`) : tr('no date in the file', 'ohne Datum in der Datei')}
            </span>
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
                <div key={c.club} className={`launch-row${inBag(c.club) || !noAdd.includes(c.club) ? '' : ' off'}`} role="row">
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
            {(twice.length > 0 || missing.length > 0) && (
              <div className="launch-choices">
                {/* measured before: the newer proposed, the player chooses (Sascha 26.10.2026) */}
                {twice.map((c) => {
                  const old = before(c.club)!;
                  const keep = keepOld.includes(c.club);
                  return (
                    <div key={c.club} className="launch-choice" role="group" aria-label={tr(`${clubName(c.club)} measured before`, `${clubName(c.club)} schon gemessen`)}>
                      <span className="small">
                        {tr(`${clubName(c.club)} was measured before (${day(old.measuredAt)}).`, `${clubName(c.club)} wurde schon gemessen (${day(old.measuredAt)}).`)}
                        {proposeNew(old, measuredAt) ? tr(' This session is newer.', ' Diese Sitzung ist neuer.') : tr(' This session is older.', ' Diese Sitzung ist älter.')}
                      </span>
                      <div className="chip-row">
                        <button type="button" aria-pressed={!keep} onClick={() => keep && toggle(keepOld, setKeepOld, c.club)}>
                          {tr(`New ${show(c.carry)}`, `Neu ${show(c.carry)}`)}
                        </button>
                        <button type="button" aria-pressed={keep} onClick={() => !keep && toggle(keepOld, setKeepOld, c.club)}>
                          {tr(`Keep ${show(old.carry)}`, `Bisher ${show(old.carry)}`)}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {/* a club the file names but the bag has not: "if it says iron 4, it was an iron 4" (Sascha 26.10.2026) */}
                {missing
                  .filter((c) => !keepOld.includes(c.club))
                  .map((c) => (
                    <div key={c.club} className="launch-choice">
                      <button type="button" className="drawer-row" role="switch" aria-checked={!noAdd.includes(c.club)} onClick={() => toggle(noAdd, setNoAdd, c.club)}>
                        <span className="switch-label">
                          <span>{tr(`Add ${clubName(c.club)} to the bag`, `${clubName(c.club)} zum Bag hinzufügen`)}</span>
                          <span className="muted small">{tr(`not in your bag yet · ${show(c.carry)}`, `noch nicht in deinem Bag · ${show(c.carry)}`)}</span>
                        </span>
                        <span className={`drawer-switch${noAdd.includes(c.club) ? '' : ' on'}`} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
            {parsed.unknownClubs.length > 0 && (
              <span className="muted small">
                {tr('Not recognised: ', 'Nicht erkannt: ')}
                {parsed.unknownClubs.slice(0, 6).join(', ')}
              </span>
            )}
            <span className="muted small">
              {tr('Carry: the median of each club as measured; clear mishits (under 60 %) left out. Spread: where 8 of 10 balls land. Clubs not in the file stay as they are.', 'Carry: der Median je Schläger, wie gemessen; klare Fehlschläge (unter 60 %) ohne. Streuung: wo 8 von 10 Bällen landen. Schläger, die nicht in der Datei stehen, bleiben, wie sie sind.')}
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
