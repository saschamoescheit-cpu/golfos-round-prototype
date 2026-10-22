import { useMemo, useState, type ReactNode } from 'react';
import type { Round, Strike } from '../types';
import { analyse, areaName, focusAreas, pct, practicePlan, type Rate } from '../lib/stats';
import { Segmented } from '../components/ui';
import { SgCard } from '../components/SgCard';
import { CoursesCard } from '../components/HistoryCards';
import { comparisonGroup, roundsSg } from '../lib/sg';
import { clubDispersion } from '../lib/dispersion';
import { clubCode, dec, tr } from '../lib/i18n';
import { statRounds, unsignedRounds } from '../lib/signing';
import { clubReports, corridorText } from '../lib/clubstats';
import { approachBands, puttMisses } from '../lib/approachstats';
import { lineOfStored } from '../lib/holelines';
import { strikeName } from '../lib/shotfacts';
import { profileIndex } from '../lib/profile';
import { teeStats } from '../lib/teestats';
import { clubName } from '../lib/caddie';

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
  // per club: good strikes, misses, corridor; approaches by distance; how the putts miss (Sascha 22.10.2026)
  const reports = useMemo(() => clubReports(picked, lineOfStored()), [picked]);
  const bands = useMemo(() => approachBands(picked).filter((b) => b.shots > 0), [picked]);
  const misses = useMemo(() => puttMisses(picked), [picked]);
  const waiting = unsignedRounds(props.rounds);
  const week = 7 * 24 * 3600 * 1000;
  const old = waiting.filter((r) => Date.now() - new Date(r.finishedAt ?? r.createdAt).getTime() > week).length;
  const fmtPar = (v: number | null) => (v == null ? '–' : v > 0 ? `+${v}` : String(v));
  const drive = a.clubs.find((c) => c.club === 'Dr');
  const tee = useMemo(() => teeStats(picked), [picked]);
  const sgn = (n: number | null) => (n == null ? '–' : `${n > 0 ? '+' : ''}${dec(n.toFixed(1))}`);
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
      {waiting.length > 0 && (
        // a tap: the rounds to sign, filtered (Sascha 17.10.2026); waiting a week: said so (Sascha 22.10.2026)
        <button type="button" className="notice notice-link" onClick={props.onToSign}>
          <span className="grow">
            {tr(
              `${waiting.length} finished ${waiting.length === 1 ? 'round is' : 'rounds are'} not signed yet – they count once you sign them.`,
              `${waiting.length} beendete ${waiting.length === 1 ? 'Runde ist noch nicht signiert – sie zählt' : 'Runden sind noch nicht signiert – sie zählen'}, sobald du sie signierst.`,
            )}
            {old > 0 && (
              <span style={{ display: 'block' }}>
                {tr(`${old === waiting.length ? (old === 1 ? 'It has' : 'They have') : `${old} of them have`} been waiting for more than a week.`, `${old === waiting.length ? (old === 1 ? 'Sie wartet' : 'Sie warten') : `${old} davon warten`} schon über eine Woche.`)}
              </span>
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
            {/* what the numbers rest on (Sascha 22.10.2026: "aus 6 geprüften Runden · 2 warten noch") */}
            {tr(`From ${a.rounds} checked ${a.rounds === 1 ? 'round' : 'rounds'}`, `Aus ${a.rounds} geprüften ${a.rounds === 1 ? 'Runde' : 'Runden'}`)}
            {waiting.length ? tr(` · ${waiting.length} still waiting`, ` · ${waiting.length} ${waiting.length === 1 ? 'wartet' : 'warten'} noch`) : ''}
            {tr(` · ${a.holes} holes · values per ${base} holes`, ` · ${a.holes} Löcher · Werte je ${base} Löcher`)}
          </p>

          {section === 'overview' && (
            <>
              <section className="totals card">
                <Big value={dec(fmtPar(per(a.toParPer18)))} label={tr('To par', 'Zu Par')} />
                <Big value={dec(per(a.stablefordPer18) ?? '–')} label="Stableford" />
                <Big value={dec(per(a.puttsPer18) ?? '–')} label="Putts" />
              </section>
              <section className="card stats-card airy">
                <h2>{tr('Your key figures', 'Deine Kennzahlen')}</h2>
                <div className="ring-row">
                  <Ring label="Fairways" r={a.fairways} />
                  <Ring label={tr('Greens', 'Grüns')} r={a.gir} />
                  <Ring label="Scrambling" r={a.scrambling} />
                </div>
              </section>

              {sg ? (
                <SgCard title="Strokes gained" values={sg.per18} shots={sg.shotsPer18} holes={sg.holes} base={base} defaultGroup={comparisonGroup(profileIndex() ?? a.handicap)} />
              ) : (
                <p className="muted small" style={{ margin: 0 }}>
                  {tr('Check the shots of a round (“Check shots”) to see where you gain and lose strokes.', 'Prüfe die Schläge einer Runde („Schläge prüfen“), dann siehst du, wo du Schläge gewinnst und verlierst.')}
                </p>
              )}

              {f && f.focus.length > 0 && (
                <section className="card stats-card airy">
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
                <section className="card stats-card airy">
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
              <section className="card stats-card airy">
                <h2>{tr('Off the tee', 'Vom Abschlag')}</h2>
                {/* the findings as tiles above the rings (Sascha 22.10.2026: "the text hints more visual, as tiles") */}
                {a.fairways.of > 0 && <TeeInsights left={a.missLeft} hit={a.fairways} right={a.missRight} lies={a.missLies} />}
                <TeeBar left={a.missLeft} hit={a.fairways} right={a.missRight} />
              </section>
              {/* by the club off the tee (Sascha 21.10.2026: "more visual elements and analyses") */}
              {tee.byClub.length > 0 && (
                <section className="card stats-card airy">
                  {/* the heading, its source right below (Sascha 22.10.2026) */}
                  <h2>{tr('Fairway hits off the tee', 'Fairway-Treffer vom Tee')}</h2>
                  <p className="muted small stats-sub">{tr('From your checked tee shots on par 4 and 5', 'Aus deinen geprüften Abschlägen auf Par 4 und 5')}</p>
                  <div className="tee-clubs">
                    {tee.byClub.map((c) => {
                      return (
                        <div key={c.club} className="tee-club-row">
                          <h3 className="tee-club-name">{clubName(c.club)}</h3>
                          <div className="insight-row">
                            <Insight num={String(c.n)} label={tr('tee shots', 'Abschläge')} />
                            {c.left + c.right > 0 && <Insight {...tendency(c.left, c.right)} />}
                            {c.ob > 0 && <Insight num={`${c.ob}×`} label={tr('out of bounds', 'ins Aus')} tone="bad" />}
                          </div>
                          <div className="ring-row">
                            <Ring label={tr('← missed left', '← links verfehlt')} r={{ n: c.left, of: c.n }} miss />
                            <Ring label="Fairway" r={{ n: c.hit, of: c.n }} />
                            <Ring label={tr('missed right →', 'rechts verfehlt →')} r={{ n: c.right, of: c.n }} miss />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
              {/* what a missed fairway costs: strokes over par on the hole after a hit or missed tee shot */}
              {tee.cost.nHit + tee.cost.nMissed > 0 && (
                <section className="card stats-card airy">
                  <h2>{tr('What a missed fairway costs', 'Was ein verfehltes Fairway kostet')}</h2>
                  {tee.cost.hit != null && tee.cost.missed != null && (
                    <div className="insight-row">
                      {tee.cost.missed > tee.cost.hit ? (
                        <Insight wide num={tr(`+${dec((tee.cost.missed - tee.cost.hit).toFixed(1))} strokes`, `+${dec((tee.cost.missed - tee.cost.hit).toFixed(1))} Schläge`)} label={tr('a missed fairway costs you on average', 'kostet dich ein verfehltes Fairway im Schnitt')} tone="bad" />
                      ) : (
                        <Insight wide num={tr('nothing', 'nichts')} label={tr('a missed fairway costs you so far – your second shots save it', 'kostet dich ein verfehltes Fairway bisher – deine zweiten Schläge retten es')} tone="good" />
                      )}
                    </div>
                  )}
                  <div className="tile-row">
                    <div className="tile">
                      <span className="tile-num">{sgn(tee.cost.hit)}</span>
                      <span className="muted small">{tr(`fairway hit (${tee.cost.nHit})`, `Fairway getroffen (${tee.cost.nHit})`)}</span>
                    </div>
                    <div className="tile">
                      <span className="tile-num">{sgn(tee.cost.missed)}</span>
                      <span className="muted small">{tr(`missed (${tee.cost.nMissed})`, `verfehlt (${tee.cost.nMissed})`)}</span>
                    </div>
                    {tee.cost.nOb > 0 && (
                      <div className="tile">
                        <span className="tile-num">{sgn(tee.cost.ob)}</span>
                        <span className="muted small">{tr(`out of bounds (${tee.cost.nOb})`, `Aus (${tee.cost.nOb})`)}</span>
                      </div>
                    )}
                  </div>
                  <p className="muted small" style={{ margin: 0 }}>{tr('Average over par on the hole, par 4 and 5', 'Ø über Par am Loch, Par 4 und 5')}</p>
                </section>
              )}
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
              <section className="card stats-card airy">
                <h2>{tr('Approach & short game', 'Annäherung & kurzes Spiel')}</h2>
                <div className="ring-row">
                  <Ring label="GIR" r={a.gir} />
                  <Ring label="Scrambling" r={a.scrambling} />
                  <Ring label={tr('Sand saves', 'Sand Saves')} r={a.sandSaves} />
                </div>
                {/* from the checked shots: the fringe and the putter from off the green (Sascha 18.10.2026) */}
                {(a.shortGame.fromFringe > 0 || a.shortGame.texas > 0) && (
                  <p className="muted small" style={{ margin: 0 }}>
                    {[
                      a.shortGame.fromFringe ? tr(`${a.shortGame.fromFringe} shots from the fringe`, `${a.shortGame.fromFringe} Schläge vom Vorgrün`) : null,
                      a.shortGame.texas ? tr(`${a.shortGame.texas}× putter from off the green (Texas wedge)`, `${a.shortGame.texas}× Putter von außerhalb (Texas Wedge)`) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </section>
              {bands.length > 0 && (
                <section className="card stats-card airy">
                  <h2>{tr('Approach by distance', 'Annäherung nach Entfernung')}</h2>
                  <p className="muted small stats-sub">{tr('Greens hit and how close to the pin, from your checked shots – a layup does not count', 'Grüns getroffen und wie nah an der Fahne, aus deinen geprüften Schlägen – Vorlegen zählt nicht')}</p>
                  <div className="hbars">
                    {bands.map((b) => (
                      <div key={b.label} className="hbar band-row">
                        <span className="hbar-label">{b.label}</span>
                        <span className="hbar-track">
                          <span className="hbar-fill" style={{ width: `${Math.round((b.greens / b.shots) * 100)}%` }} />
                        </span>
                        <span className="hbar-value">
                          {Math.round((b.greens / b.shots) * 100)} %
                          <span className="muted small" style={{ display: 'block' }}>
                            {b.avgProximity != null ? tr(`⌀ ${dec(b.avgProximity)} m`, `⌀ ${dec(b.avgProximity)} m`) : '–'} · {b.greens}/{b.shots}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section className="card stats-card airy">
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
              <section className="card stats-card airy">
                <h2>Putting</h2>
                <div className="ring-row two">
                  <Ring label={tr('1-putts', '1-Putts')} r={a.onePutts} />
                  <Ring label={tr('3-putts', '3-Putts')} r={a.threePutts} bad />
                </div>
              </section>
              {misses.missed >= 3 && (
                <section className="card stats-card airy">
                  <h2>{tr('How your putts miss', 'Wie deine Putts verfehlen')}</h2>
                  <p className="muted small stats-sub">{tr(`From ${misses.missed} missed putts`, `Aus ${misses.missed} verfehlten Putts`)}</p>
                  <div className="ring-row">
                    <Ring label={tr('short', 'zu kurz')} r={{ n: misses.short, of: misses.short + misses.long }} miss />
                    <Ring label={tr('long', 'zu lang')} r={{ n: misses.long, of: misses.short + misses.long }} miss />
                    <Ring label={tr('on line', 'auf Linie')} r={{ n: misses.missed - misses.left - misses.right, of: misses.missed }} />
                  </div>
                  <div className="insight-row">
                    <Insight num={`${misses.left}×`} label={tr('missed left', 'links vorbei')} />
                    <Insight num={`${misses.right}×`} label={tr('missed right', 'rechts vorbei')} />
                  </div>
                </section>
              )}
              {a.puttsByFirstPutt.some((b) => b.holes > 0) && (
                <section className="card stats-card airy">
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
            <section className="card stats-card airy">
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
                    {tr('Line: typical length from good strikes, in calm air at 20 °C · band: shortest to longest shot · below the length: where your approaches end up.', 'Strich: typische Länge aus guten Treffern, auf Windstille und 20 °C umgerechnet · Band: kürzester bis längster Schlag · unter der Länge: wo deine Annäherungen landen.')}
                  </p>
                </>
              )}
            </section>
          )}
          {section === 'clubs' && reports.some((c) => c.rated > 0 || c.corridor) && (
            // how each club is struck and where its balls end (Sascha 22.10.2026: the misses and the corridor)
            <section className="card stats-card airy">
              <h2>{tr('Strikes and corridor per club', 'Treffer und Korridor je Schläger')}</h2>
              <p className="muted small stats-sub">{tr('Corridor: 80 % of your balls end in it, measured from the target line', 'Korridor: 80 % deiner Bälle landen darin, gemessen an der Ziellinie')}</p>
              <div className="tee-clubs">
                {reports
                  .filter((c) => c.rated > 0 || c.corridor)
                  .map((c) => {
                    const top = Object.entries(c.misses).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))[0];
                    return (
                      <div key={c.club} className="tee-club-row">
                        <h3 className="tee-club-name">{clubName(c.club)}</h3>
                        <div className="insight-row">
                          {c.rated > 0 && <Insight num={`${Math.round((c.good / c.rated) * 100)} %`} label={tr(`good strikes (${c.good} of ${c.rated})`, `gute Treffer (${c.good} von ${c.rated})`)} tone={c.good / c.rated >= 0.6 ? 'good' : undefined} />}
                          {top && <Insight num={strikeName(top[0] as Strike)} label={tr(`most frequent miss (${top[1]}×)`, `häufigster Fehlschlag (${top[1]}×)`)} tone="bad" />}
                          {c.corridor && <Insight wide num={corridorText(c.corridor, tr)} label={tr(`corridor from ${c.corridor.shots} shots`, `Korridor aus ${c.corridor.shots} Schlägen`)} />}
                        </div>
                      </div>
                    );
                  })}
              </div>
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
function Ring(props: { label: string; r: Rate; bad?: boolean; miss?: boolean }) {
  const p = pct(props.r);
  const c = 2 * Math.PI * 26;
  return (
    <div className="ring" role="img" aria-label={`${props.label}: ${p == null ? '–' : `${p}%`} (${props.r.n}/${props.r.of})`}>
      <svg viewBox="0 0 64 64" width="76" height="76" aria-hidden="true">
        <circle cx="32" cy="32" r="26" className="ring-track" />
        {p != null && p > 0 && <circle cx="32" cy="32" r="26" className={`ring-fill${props.bad ? ' bad' : props.miss ? ' miss' : ''}`} strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 32 32)" />}
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
      <div className="ring-row" aria-label={tr(`Fairway: ${l}% left, ${h}% hit, ${r}% right`, `Fairway: ${l} % links, ${h} % getroffen, ${r} % rechts`)}>
        <Ring label={tr('← missed left', '← links verfehlt')} r={props.left} miss />
        <Ring label="Fairway" r={props.hit} />
        <Ring label={tr('missed right →', 'rechts verfehlt →')} r={props.right} miss />
      </div>
    </>
  );
}

/** One finding as a tile: the number big, what it means below (Sascha 22.10.2026). */
function Insight(props: { num: ReactNode; label: string; tone?: 'good' | 'bad'; wide?: boolean }) {
  return (
    <div className={['insight', props.tone ?? '', props.wide ? 'wide' : ''].filter(Boolean).join(' ')}>
      <span className="insight-num">{props.num}</span>
      <span className="insight-label">{props.label}</span>
    </div>
  );
}

/** Which side the misses go: an arrow, the words below. */
function tendency(left: number, right: number): { num: string; label: string } {
  if (left === right) return { num: '← →', label: tr('missed left as often as right', 'links wie rechts verfehlt') };
  return left > right ? { num: '←', label: tr('missed more often left', 'öfter links verfehlt') } : { num: '→', label: tr('missed more often right', 'öfter rechts verfehlt') };
}

/** Off the tee in three tiles: fairways hit, which side the misses go, where they end up. */
function TeeInsights(props: { left: Rate; hit: Rate; right: Rate; lies: { semirough: number; rough: number; bunker: number; other: number } }) {
  const l = props.left.n;
  const r = props.right.n;
  const lies = [
    { n: props.lies.rough, name: 'Rough' },
    { n: props.lies.semirough, name: 'Semi Rough' },
    { n: props.lies.bunker, name: 'Bunker' },
    { n: props.lies.other, name: tr('elsewhere', 'woanders') },
  ]
    .filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n);
  return (
    <div className="insight-row">
      <Insight num={`${props.hit.n}/${props.hit.of}`} label={tr('fairways hit', 'Fairways getroffen')} tone="good" />
      {l + r > 0 && <Insight {...tendency(l, r)} />}
      {lies.length > 0 && (
        <Insight
          num={`${lies[0].n}×`}
          label={tr(`missed into ${lies[0].name}`, `verfehlt im ${lies[0].name}`) + (lies.length > 1 ? tr(` · plus ${lies.slice(1).map((x) => `${x.n}× ${x.name}`).join(', ')}`, ` · dazu ${lies.slice(1).map((x) => `${x.n}× ${x.name}`).join(', ')}`) : '')}
        />
      )}
    </div>
  );
}

/** e.g. "8 m R · 5 m short" from the approach shots with this club. */
function tendencyText(d: { shots: number; sideMean: number; lengthMean: number } | undefined): string {
  if (!d || d.shots < 3) return '–';
  const side = Math.abs(d.sideMean) >= 3 ? `${Math.abs(d.sideMean)} m ${d.sideMean > 0 ? 'R' : 'L'}` : tr('straight', 'gerade');
  const len = Math.abs(d.lengthMean) >= 5 ? ` · ${Math.abs(d.lengthMean)} m ${d.lengthMean > 0 ? tr('long', 'lang') : tr('short', 'kurz')}` : '';
  return side + len;
}
