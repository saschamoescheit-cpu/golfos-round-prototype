import { useMemo, useState } from 'react';
import type { Round } from '../types';
import { analyse, areaName, focusAreas, pct, practicePlan, type Rate } from '../lib/stats';
import { Segmented } from '../components/ui';
import { SgCard } from '../components/SgCard';
import { CoursesCard } from '../components/HistoryCards';
import { groupForHandicap, roundsSg } from '../lib/sg';
import { clubDispersion } from '../lib/dispersion';
import { clubCode, dec, tr } from '../lib/i18n';
import { statRounds, unsignedRounds } from '../lib/signing';
import { profileIndex } from '../lib/profile';

// Feature 005: the player's analysis across finished rounds – key figures, tendencies, club distances
// and the focus areas that later feed the training plans (GOL-27).

type Range = 5 | 10 | 0;

type Section = 'overview' | 'tee' | 'green' | 'putting' | 'clubs' | 'courses';

export function Stats(props: { rounds: Round[]; onOpenCourse: (courseName: string) => void; onToSign?: () => void }) {
  const [range, setRange] = useState<Range>(5);
  const [section, setSection] = useState<Section>('overview');
  const finished = useMemo(
    () => statRounds(props.rounds).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [props.rounds],
  );
  const picked = range ? finished.slice(0, range) : finished;
  // the length the player plays (Sascha 16.10.2026: "9-hole rounds should not be doubled to make an 18-hole round"):
  // mostly 9 holes → the values per 9 holes
  const base = picked.length && picked.filter((r) => r.holes.length <= 9).length * 2 > picked.length ? 9 : 18;
  const per = (v: number | null): number | null => (v == null ? null : Math.round(((v * base) / 18) * 10) / 10);
  const half = (s: string) => s.replace(/\d+(?:[.,]\d+)?/, (m) => String(Math.round((parseFloat(m.replace(',', '.')) / 2) * 10) / 10));
  const perBase = <T extends { metric: string; yours: string; target: string }>(x: T): T =>
    base === 9 && /per round|pro Runde/.test(x.metric) ? { ...x, metric: x.metric.replace('per round', 'per 9 holes').replace('pro Runde', 'je 9 Löcher'), yours: half(x.yours), target: half(x.target) } : x;
  const a = useMemo(() => analyse(picked), [picked]);
  const f = focusAreas(a);
  const sg = useMemo(() => roundsSg(picked), [picked]);
  const tend = useMemo(() => new Map(clubDispersion(picked).map((d) => [d.club, d])), [picked]);
  const fmtPar = (v: number | null) => (v == null ? '–' : v > 0 ? `+${v}` : String(v));
  const drive = a.clubs.find((c) => c.club === 'Dr');
  const longest = Math.max(1, ...a.clubs.map((x) => x.max));
  const sections: { id: Section; label: string }[] = [
    { id: 'overview', label: tr('Overview', 'Überblick') },
    { id: 'tee', label: tr('Tee', 'Abschlag') },
    { id: 'green', label: tr('Greens & short game', 'Grün & kurzes Spiel') },
    { id: 'putting', label: 'Putten' },
    { id: 'clubs', label: tr('Clubs', 'Schläger') },
    { id: 'courses', label: tr('Courses', 'Plätze') },
  ];

  return (
    <>
      <h1 className="tab-title">{tr('Stats', 'Statistik')}</h1>
      {/* only signed rounds count (Sascha 16.10.2026) – say how many still wait for the signature */}
      {unsignedRounds(props.rounds).length > 0 && (
        // a tap: the rounds to sign, filtered (Sascha 17.10.2026)
        <button type="button" className="notice notice-link" onClick={props.onToSign}>
          <span className="grow">
            {tr(
              `${unsignedRounds(props.rounds).length} finished ${unsignedRounds(props.rounds).length === 1 ? 'round is' : 'rounds are'} not signed yet – they count once you sign them.`,
              `${unsignedRounds(props.rounds).length} beendete ${unsignedRounds(props.rounds).length === 1 ? 'Runde ist' : 'Runden sind'} noch nicht signiert – sie zählen, sobald du sie signierst.`,
            )}
          </span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      <Segmented<Range>
        label={tr('Rounds', 'Runden')}
        value={range}
        onChange={(v) => v != null && setRange(v)}
        options={[
          { value: 5, label: tr('Last 5', 'Letzte 5') },
          { value: 10, label: tr('Last 10', 'Letzte 10') },
          { value: 0, label: tr('All', 'Alle') },
        ]}
      />
      {a.holes === 0 ? (
        <p className="muted">{tr('Finish a round to see your stats.', 'Beende eine Runde, um deine Statistik zu sehen.')}</p>
      ) : (
        <>
          <div className="chip-row section-chips" role="group" aria-label={tr('Topic', 'Thema')}>
            {sections.map((x) => (
              <button key={x.id} type="button" aria-pressed={section === x.id} onClick={() => setSection(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {tr(`${a.rounds} ${a.rounds === 1 ? 'round' : 'rounds'} · ${a.holes} holes · values per ${base} holes`, `${a.rounds} ${a.rounds === 1 ? 'Runde' : 'Runden'} · ${a.holes} Löcher · Werte je ${base} Löcher`)}
          </p>

          {section === 'overview' && (
            <>
              <section className="totals card">
                <Big value={dec(fmtPar(per(a.toParPer18)))} label={tr('To par', 'Zu Par')} />
                <Big value={dec(per(a.stablefordPer18) ?? '–')} label="Stableford" />
                <Big value={dec(per(a.puttsPer18) ?? '–')} label="Putts" />
              </section>
              <section className="card stats-card">
                <h2>{tr('Your key figures', 'Deine Kennzahlen')}</h2>
                <div className="ring-row">
                  <Ring label="Fairways" r={a.fairways} />
                  <Ring label={tr('Greens', 'Grüns')} r={a.gir} />
                  <Ring label="Scrambling" r={a.scrambling} />
                </div>
              </section>

              {sg ? (
                <SgCard title="Strokes gained" values={sg.per18} shots={sg.shotsPer18} holes={sg.holes} base={base} defaultGroup={groupForHandicap(profileIndex() ?? a.handicap)} />
              ) : (
                <p className="muted small" style={{ margin: 0 }}>
                  {tr('Check the shots of a round (“Check shots”) to see where you gain and lose strokes.', 'Prüfe die Schläge einer Runde („Schläge prüfen“), dann siehst du, wo du Schläge gewinnst und verlierst.')}
                </p>
              )}

              {f && f.focus.length > 0 && (
                <section className="card stats-card">
                  <h2>{tr('Where you lose strokes', 'Wo du Schläge verlierst')}</h2>
                  <p className="muted small" style={{ margin: 0 }}>
                    {tr(`Compared with players of ${f.target} (you: ${f.band}).`, `Verglichen mit Spielern mit ${f.target} (du: ${f.band}).`)}
                  </p>
                  <ol className="focus-list">
                    {f.focus.map(perBase).map((x) => (
                      <li key={x.metric}>
                        <span className="grow">
                          <span className="focus-area">{areaName(x.area)}</span>
                          {x.metric}
                        </span>
                        <span>
                          <strong className="bad-text">{dec(x.yours)}</strong> <span className="muted">→ {dec(x.target)}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {f && f.focus.length > 0 && (
                <section className="card stats-card">
                  <h2>{tr('Practice plan', 'Trainingsplan')}</h2>
                  <p className="muted small" style={{ margin: 0 }}>
                    {tr(`About ${practicePlan(f.focus).reduce((t, d) => t + d.minutes, 0)} minutes, built from the areas above.`, `Etwa ${practicePlan(f.focus).reduce((t, d) => t + d.minutes, 0)} Minuten, aus den Bereichen oben.`)}
                  </p>
                  <ol className="focus-list">
                    {practicePlan(f.focus).map((d) => (
                      <li key={d.area} className="drill" style={{ display: 'block' }}>
                        <span className="focus-area">
                          {areaName(d.area)} · {d.minutes} min
                        </span>
                        <strong>{d.title}</strong>
                        <span className="muted small" style={{ display: 'block' }}>
                          {d.how}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}

          {section === 'tee' && (
            <>
              <section className="card stats-card">
                <h2>{tr('Off the tee', 'Vom Abschlag')}</h2>
                <TeeBar left={a.missLeft} hit={a.fairways} right={a.missRight} />
              </section>
              <div className="tile-row">
                <div className="tile">
                  <span className="tile-num">{drive ? `${drive.median} m` : '–'}</span>
                  <span className="muted small">{tr('Typical drive', 'Typischer Drive')}</span>
                </div>
                <div className="tile">
                  <span className="tile-num">{drive ? `${drive.max} m` : '–'}</span>
                  <span className="muted small">{tr('Longest drive', 'Längster Drive')}</span>
                </div>
                <div className="tile">
                  <span className="tile-num">{dec(per(a.penaltiesPer18) ?? '–')}</span>
                  <span className="muted small">{tr('Penalties', 'Strafschläge')}</span>
                </div>
              </div>
              {!drive && (
                <p className="muted small" style={{ margin: 0 }}>
                  {tr('Drive lengths come from checked shots with the driver (from 3 shots).', 'Drive-Längen kommen aus geprüften Schlägen mit dem Driver (ab 3 Schlägen).')}
                </p>
              )}
            </>
          )}

          {section === 'green' && (
            <>
              <section className="card stats-card">
                <h2>{tr('Approach & short game', 'Annäherung & kurzes Spiel')}</h2>
                <div className="ring-row">
                  <Ring label="GIR" r={a.gir} />
                  <Ring label="Scrambling" r={a.scrambling} />
                  <Ring label={tr('Sand saves', 'Sand Saves')} r={a.sandSaves} />
                </div>
              </section>
              <section className="card stats-card">
                <h2>{tr('Results by par', 'Ergebnis nach Par')}</h2>
                <ParBars byPar={a.byPar} />
              </section>
            </>
          )}

          {section === 'putting' && (
            <>
              <div className="tile-row">
                <div className="tile">
                  <span className="tile-num">{dec(per(a.puttsPer18) ?? '–')}</span>
                  <span className="muted small">{tr('Putts per round', 'Putts je Runde')}</span>
                </div>
                <div className="tile">
                  <span className="tile-num">{dec(a.puttsPerGir ?? '–')}</span>
                  <span className="muted small">{tr('Putts per green hit', 'Putts je getroffenem Grün')}</span>
                </div>
              </div>
              <section className="card stats-card">
                <h2>Putting</h2>
                <div className="ring-row two">
                  <Ring label={tr('1-putts', '1-Putts')} r={a.onePutts} />
                  <Ring label={tr('3-putts', '3-Putts')} r={a.threePutts} bad />
                </div>
              </section>
              {a.puttsByFirstPutt.some((b) => b.holes > 0) && (
                <section className="card stats-card">
                  <h2>{tr('Putts by length of the first putt', 'Putts nach Länge des ersten Putts')}</h2>
                  <div className="hbars">
                    {a.puttsByFirstPutt.map((b) => (
                      <div key={b.label} className="hbar">
                        <span className="hbar-label">{dec(b.label)}</span>
                        <span className="hbar-track">{b.avgPutts != null && <span className="hbar-fill" style={{ width: `${Math.min(100, (b.avgPutts / 3) * 100)}%` }} />}</span>
                        <span className="hbar-value">
                          {dec(b.avgPutts ?? '–')} <span className="muted small">({b.holes})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="muted small" style={{ margin: 0 }}>
                    {tr('Average putts per hole; in brackets the number of holes.', 'Durchschnittliche Putts je Loch; in Klammern die Zahl der Löcher.')}
                  </p>
                </section>
              )}
            </>
          )}

          {section === 'clubs' && (
            <section className="card stats-card">
              <h2>{tr('Your club distances', 'Deine Schlägerweiten')}</h2>
              {a.clubs.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>
                  {tr(
                    'Check the shots of your rounds after playing (“Check shots”) to learn your distances. From 3 shots per club they replace the standard values in club suggestions.',
                    'Prüfe nach der Runde deine Schläge („Schläge prüfen“), dann lernt die App deine Weiten. Ab 3 Schlägen je Schläger ersetzen sie die Standardwerte in den Empfehlungen.',
                  )}
                </p>
              ) : (
                <>
                  <div className="hbars">
                    {a.clubs.map((c) => (
                      <div key={c.club} className="hbar gap-row">
                        <strong className="hbar-label">{clubCode(c.club)}</strong>
                        <span className="hbar-track">
                          <span className="gap-range" style={{ left: `${(c.min / longest) * 100}%`, width: `${Math.max(1, ((c.max - c.min) / longest) * 100)}%` }} />
                          <span className="gap-median" style={{ left: `${(c.median / longest) * 100}%` }} />
                        </span>
                        <span className="hbar-value">
                          {c.median} m
                          <span className="muted small" style={{ display: 'block' }}>
                            {tendencyText(tend.get(c.club))}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="muted small" style={{ margin: 0 }}>
                    {tr('Line: typical length · band: shortest to longest shot · below the length: where your approaches end up.', 'Strich: typische Länge · Band: kürzester bis längster Schlag · unter der Länge: wo deine Annäherungen landen.')}
                  </p>
                </>
              )}
            </section>
          )}

          {section === 'courses' && <CoursesCard rounds={finished} onOpen={props.onOpenCourse} />}
        </>
      )}
    </>
  );
}

function Big(props: { value: string | number; label: string }) {
  return (
    <div>
      <div className="num">{props.value}</div>
      <div className="muted small">{props.label}</div>
    </div>
  );
}

/** A ring for a rate (fairways, greens …): the share in the middle, n of m below. */
function Ring(props: { label: string; r: Rate; bad?: boolean }) {
  const p = pct(props.r);
  const c = 2 * Math.PI * 26;
  return (
    <div className="ring" role="img" aria-label={`${props.label}: ${p == null ? '–' : `${p}%`} (${props.r.n}/${props.r.of})`}>
      <svg viewBox="0 0 64 64" width="76" height="76" aria-hidden="true">
        <circle cx="32" cy="32" r="26" className="ring-track" />
        {p != null && p > 0 && <circle cx="32" cy="32" r="26" className={`ring-fill${props.bad ? ' bad' : ''}`} strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 32 32)" />}
        <text x="32" y="37" textAnchor="middle" className="ring-text">
          {p == null ? '–' : `${p}%`}
        </text>
      </svg>
      <span className="small">{props.label}</span>
      <span className="muted small">
        {props.r.n}/{props.r.of}
      </span>
    </div>
  );
}

/** Average over par on par 3, 4 and 5 as bars (0 = par). */
function ParBars(props: { byPar: Record<3 | 4 | 5, number | null> }) {
  const max = Math.max(1, ...([3, 4, 5] as const).map((p) => Math.abs(props.byPar[p] ?? 0)));
  return (
    <div className="hbars">
      {([3, 4, 5] as const).map((p) => {
        const v = props.byPar[p];
        return (
          <div key={p} className="hbar">
            <span className="hbar-label">Par {p}</span>
            <span className="hbar-track">{v != null && <span className={`hbar-fill${v > 0 ? ' over' : ''}`} style={{ width: `${Math.max(2, (Math.abs(v) / max) * 100)}%` }} />}</span>
            <span className="hbar-value">{v == null ? '–' : dec(`${v > 0 ? '+' : ''}${v.toFixed(1)}`)}</span>
          </div>
        );
      })}
      <p className="muted small" style={{ margin: 0 }}>
        {tr('Strokes over par per hole on average.', 'Schläge über Par je Loch im Schnitt.')}
      </p>
    </div>
  );
}

function TeeBar(props: { left: Rate; hit: Rate; right: Rate }) {
  const l = pct(props.left) ?? 0;
  const h = pct(props.hit) ?? 0;
  const r = pct(props.right) ?? 0;
  if (!props.hit.of) return <p className="muted small" style={{ margin: 0 }}>{tr('No fairway data yet.', 'Noch keine Fairway-Daten.')}</p>;
  return (
    <>
      <div className="tee-bar" role="img" aria-label={tr(`Fairway: ${l}% left, ${h}% hit, ${r}% right`, `Fairway: ${l}% links, ${h}% getroffen, ${r}% rechts`)}>
        <span className="miss" style={{ flexGrow: l || 0.001 }}>{l >= 10 ? `← ${l}%` : ''}</span>
        <span className="hit" style={{ flexGrow: h || 0.001 }}>{h >= 10 ? `${h}%` : ''}</span>
        <span className="miss" style={{ flexGrow: r || 0.001 }}>{r >= 10 ? `${r}% →` : ''}</span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {tr('Fairways hit', 'Fairways getroffen')} {props.hit.n}/{props.hit.of}
        {l !== r && tr(` · you miss more often ${l > r ? 'left' : 'right'}`, ` · du verfehlst öfter ${l > r ? 'links' : 'rechts'}`)}
      </p>
    </>
  );
}

/** e.g. "8 m R · 5 m short" from the approach shots with this club. */
function tendencyText(d: { shots: number; sideMean: number; lengthMean: number } | undefined): string {
  if (!d || d.shots < 3) return '–';
  const side = Math.abs(d.sideMean) >= 3 ? `${Math.abs(d.sideMean)} m ${d.sideMean > 0 ? 'R' : 'L'}` : tr('straight', 'gerade');
  const len = Math.abs(d.lengthMean) >= 5 ? ` · ${Math.abs(d.lengthMean)} m ${d.lengthMean > 0 ? tr('long', 'lang') : tr('short', 'kurz')}` : '';
  return side + len;
}
