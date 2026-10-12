import { useMemo, useState } from 'react';
import type { Round } from '../types';
import { analyse, areaName, focusAreas, pct, practicePlan, type Rate } from '../lib/stats';
import { Segmented, TopBar } from '../components/ui';
import { SgCard } from '../components/SgCard';
import { PlayedHcpStats } from '../components/PlayedHcp';
import { groupForHandicap, roundsSg } from '../lib/sg';
import { clubDispersion } from '../lib/dispersion';
import { clubCode, dec, tr } from '../lib/i18n';

// Feature 005: the player's analysis across finished rounds – key figures, tendencies, club distances
// and the focus areas that later feed the training plans (GOL-27).

type Range = 5 | 10 | 0;

export function Stats(props: { rounds: Round[]; onBack: () => void }) {
  const [range, setRange] = useState<Range>(5);
  const finished = useMemo(
    () => props.rounds.filter((r) => r.finishedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [props.rounds],
  );
  const picked = range ? finished.slice(0, range) : finished;
  const a = useMemo(() => analyse(picked), [picked]);
  const f = focusAreas(a);
  const sg = useMemo(() => roundsSg(picked), [picked]);
  const tend = useMemo(() => new Map(clubDispersion(picked).map((d) => [d.club, d])), [picked]);
  const fmtPar = (v: number | null) => (v == null ? '–' : v > 0 ? `+${v}` : String(v));

  return (
    <main className="screen">
      <TopBar title={tr('Your stats', 'Deine Statistik')} onBack={props.onBack} />
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
          <p className="muted small" style={{ margin: 0 }}>
            {tr(`${a.rounds} ${a.rounds === 1 ? 'round' : 'rounds'} · ${a.holes} holes · values per 18 holes`, `${a.rounds} ${a.rounds === 1 ? 'Runde' : 'Runden'} · ${a.holes} Löcher · Werte je 18 Löcher`)}
          </p>
          <section className="totals card">
            <Big value={dec(fmtPar(a.toParPer18))} label={tr('To par', 'Zu Par')} />
            <Big value={dec(a.stablefordPer18 ?? '–')} label="Stableford" />
            <Big value={dec(a.puttsPer18 ?? '–')} label="Putts" />
          </section>

          <PlayedHcpStats rounds={finished} />

          {sg && <SgCard title="Strokes gained" values={sg.per18} shots={sg.shotsPer18} holes={sg.holes} defaultGroup={groupForHandicap(a.handicap)} />}

          {f && f.focus.length > 0 && (
            <section className="card stats-card">
              <h2>{tr('Where you lose strokes', 'Wo du Schläge verlierst')}</h2>
              <p className="muted small" style={{ margin: 0 }}>
                {tr(`Compared with players of ${f.target} (you: ${f.band}). Your practice plan below starts here.`, `Verglichen mit Spielern mit ${f.target} (du: ${f.band}). Dein Trainingsplan unten setzt hier an.`)}
              </p>
              <ol className="focus-list">
                {f.focus.map((x) => (
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
                  <li key={d.area} style={{ display: 'block' }}>
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

          <section className="card stats-card">
            <h2>{tr('Off the tee', 'Vom Abschlag')}</h2>
            <TeeBar left={a.missLeft} hit={a.fairways} right={a.missRight} />
          </section>

          <section className="card stats-card">
            <h2>{tr('Approach & short game', 'Annäherung & kurzes Spiel')}</h2>
            <div className="stat-grid">
              <RateStat label={tr('Greens in regulation', 'Grüns in Regulation')} r={a.gir} />
              <RateStat label="Scrambling" r={a.scrambling} hint={tr('par or better after missing the green', 'Par oder besser nach verfehltem Grün')} />
              <RateStat label={tr('Sand saves', 'Sand Saves')} r={a.sandSaves} />
              <div className="stat">
                <div className="num">{dec(a.penaltiesPer18 ?? '–')}</div>
                <div className="muted small">{tr('Penalty strokes', 'Strafschläge')}</div>
              </div>
            </div>
          </section>

          <section className="card stats-card">
            <h2>Putting</h2>
            <div className="stat-grid">
              <div className="stat">
                <div className="num">{dec(a.puttsPerGir ?? '–')}</div>
                <div className="muted small">{tr('Putts per green hit', 'Putts je getroffenem Grün')}</div>
              </div>
              <RateStat label={tr('1-putts', '1-Putts')} r={a.onePutts} />
              <RateStat label={tr('3-putts', '3-Putts')} r={a.threePutts} />
            </div>
            {a.puttsByFirstPutt.some((b) => b.holes > 0) && (
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>{tr('First putt', 'Erster Putt')}</th>
                    <th>Putts</th>
                    <th>{tr('Holes', 'Löcher')}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.puttsByFirstPutt.map((b) => (
                    <tr key={b.label}>
                      <td>{dec(b.label)}</td>
                      <td>{dec(b.avgPutts ?? '–')}</td>
                      <td className="muted">{b.holes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card stats-card">
            <h2>{tr('Scoring', 'Ergebnisse')}</h2>
            <div className="mix-bar" role="img" aria-label={tr('Score mix', 'Ergebnis-Mix')}>
              {(
                [
                  ['eaglePlus', 'Eagle+', '#5ec2ff'],
                  ['birdie', 'Birdie', '#9bc53d'],
                  ['par', 'Par', '#e8edf0'],
                  ['bogey', 'Bogey', '#f6d48a'],
                  ['doublePlus', tr('Double+', 'Doppel+'), '#ff6b5e'],
                ] as const
              ).map(([k, label, color]) =>
                a.scoreMix[k] > 0 ? (
                  <span key={k} style={{ flexGrow: a.scoreMix[k], background: color }} title={`${label} ${a.scoreMix[k]}%`}>
                    {a.scoreMix[k] >= 8 ? `${label} ${a.scoreMix[k]}%` : ''}
                  </span>
                ) : null,
              )}
            </div>
            <div className="stat-grid three">
              {([3, 4, 5] as const).map((p) => (
                <div className="stat" key={p}>
                  <div className="num">{a.byPar[p] == null ? '–' : dec(`${a.byPar[p]! > 0 ? '+' : ''}${a.byPar[p]!.toFixed(1)}`)}</div>
                  <div className="muted small">{tr(`Par ${p} average`, `Par ${p} Schnitt`)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card stats-card">
            <h2>{tr('Your club distances', 'Deine Schlägerweiten')}</h2>
            {a.clubs.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                {tr(
                  'Track rounds in “Detailed” mode to learn your distances. From 3 shots per club they replace the standard values in club suggestions.',
                  'Erfasse Runden im Modus „Detailliert“, um deine Weiten zu lernen. Ab 3 Schlägen je Schläger ersetzen sie die Standardwerte in den Empfehlungen.',
                )}
              </p>
            ) : (
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>{tr('Club', 'Schläger')}</th>
                    <th>{tr('Typical', 'Typisch')}</th>
                    <th>{tr('Range', 'Spanne')}</th>
                    <th>{tr('Tendency', 'Tendenz')}</th>
                    <th>{tr('Shots', 'Schläge')}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.clubs.map((c) => (
                    <tr key={c.club}>
                      <td>
                        <strong>{clubCode(c.club)}</strong>
                      </td>
                      <td>{c.median} m</td>
                      <td className="muted">
                        {c.min}–{c.max} m
                      </td>
                      <td>{tendencyText(tend.get(c.club))}</td>
                      <td className="muted">{c.shots}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
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

function RateStat(props: { label: string; r: Rate; hint?: string }) {
  const p = pct(props.r);
  return (
    <div className="stat">
      <div className="num">{p == null ? '–' : `${p}%`}</div>
      <div className="muted small">
        {props.label} · {props.r.n}/{props.r.of}
      </div>
      {props.hint && <div className="muted small">{props.hint}</div>}
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
