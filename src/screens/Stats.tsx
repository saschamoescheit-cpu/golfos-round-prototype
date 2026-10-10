import { useMemo, useState } from 'react';
import type { Round } from '../types';
import { analyse, focusAreas, pct, type Rate } from '../lib/stats';
import { Segmented, TopBar } from '../components/ui';

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
  const fmtPar = (v: number | null) => (v == null ? '–' : v > 0 ? `+${v}` : String(v));

  return (
    <main className="screen">
      <TopBar title="Your stats" onBack={props.onBack} />
      <Segmented<Range>
        label="Rounds"
        value={range}
        onChange={(v) => v != null && setRange(v)}
        options={[
          { value: 5, label: 'Last 5' },
          { value: 10, label: 'Last 10' },
          { value: 0, label: 'All' },
        ]}
      />
      {a.holes === 0 ? (
        <p className="muted">Finish a round to see your stats.</p>
      ) : (
        <>
          <p className="muted small" style={{ margin: 0 }}>
            {a.rounds} {a.rounds === 1 ? 'round' : 'rounds'} · {a.holes} holes · values per 18 holes
          </p>
          <section className="totals card">
            <Big value={fmtPar(a.toParPer18)} label="To par" />
            <Big value={a.stablefordPer18 ?? '–'} label="Stableford" />
            <Big value={a.puttsPer18 ?? '–'} label="Putts" />
          </section>

          {f && f.focus.length > 0 && (
            <section className="card stats-card">
              <h2>Where you lose strokes</h2>
              <p className="muted small" style={{ margin: 0 }}>
                Compared with players of {f.target} (you: {f.band}). Your training plan will focus on these areas.
              </p>
              <ol className="focus-list">
                {f.focus.map((x) => (
                  <li key={x.metric}>
                    <span className="grow">
                      <span className="focus-area">{x.area}</span>
                      {x.metric}
                    </span>
                    <span>
                      <strong className="bad-text">{x.yours}</strong> <span className="muted">→ {x.target}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="card stats-card">
            <h2>Off the tee</h2>
            <TeeBar left={a.missLeft} hit={a.fairways} right={a.missRight} />
          </section>

          <section className="card stats-card">
            <h2>Approach &amp; short game</h2>
            <div className="stat-grid">
              <RateStat label="Greens in regulation" r={a.gir} />
              <RateStat label="Scrambling" r={a.scrambling} hint="par or better after missing the green" />
              <RateStat label="Sand saves" r={a.sandSaves} />
              <div className="stat">
                <div className="num">{a.penaltiesPer18 ?? '–'}</div>
                <div className="muted small">Penalty strokes</div>
              </div>
            </div>
          </section>

          <section className="card stats-card">
            <h2>Putting</h2>
            <div className="stat-grid">
              <div className="stat">
                <div className="num">{a.puttsPerGir ?? '–'}</div>
                <div className="muted small">Putts per green hit</div>
              </div>
              <RateStat label="1-putts" r={a.onePutts} />
              <RateStat label="3-putts" r={a.threePutts} />
            </div>
            {a.puttsByFirstPutt.some((b) => b.holes > 0) && (
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>First putt</th>
                    <th>Putts</th>
                    <th>Holes</th>
                  </tr>
                </thead>
                <tbody>
                  {a.puttsByFirstPutt.map((b) => (
                    <tr key={b.label}>
                      <td>{b.label}</td>
                      <td>{b.avgPutts ?? '–'}</td>
                      <td className="muted">{b.holes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card stats-card">
            <h2>Scoring</h2>
            <div className="mix-bar" role="img" aria-label="Score mix">
              {(
                [
                  ['eaglePlus', 'Eagle+', '#5ec2ff'],
                  ['birdie', 'Birdie', '#9bc53d'],
                  ['par', 'Par', '#e8edf0'],
                  ['bogey', 'Bogey', '#f6d48a'],
                  ['doublePlus', 'Double+', '#ff6b5e'],
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
                  <div className="num">{a.byPar[p] == null ? '–' : `${a.byPar[p]! > 0 ? '+' : ''}${a.byPar[p]!.toFixed(1)}`}</div>
                  <div className="muted small">Par {p} average</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card stats-card">
            <h2>Your club distances</h2>
            {a.clubs.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                Track rounds in “Detailed” mode to learn your distances. From 3 shots per club they replace the standard values in club suggestions.
              </p>
            ) : (
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>Club</th>
                    <th>Typical</th>
                    <th>Range</th>
                    <th>Shots</th>
                  </tr>
                </thead>
                <tbody>
                  {a.clubs.map((c) => (
                    <tr key={c.club}>
                      <td>
                        <strong>{c.club}</strong>
                      </td>
                      <td>{c.median} m</td>
                      <td className="muted">
                        {c.min}–{c.max} m
                      </td>
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
  if (!props.hit.of) return <p className="muted small" style={{ margin: 0 }}>No fairway data yet.</p>;
  return (
    <>
      <div className="tee-bar" role="img" aria-label={`Fairway: ${l}% left, ${h}% hit, ${r}% right`}>
        <span className="miss" style={{ flexGrow: l || 0.001 }}>{l >= 10 ? `← ${l}%` : ''}</span>
        <span className="hit" style={{ flexGrow: h || 0.001 }}>{h >= 10 ? `${h}%` : ''}</span>
        <span className="miss" style={{ flexGrow: r || 0.001 }}>{r >= 10 ? `${r}% →` : ''}</span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Fairways hit {props.hit.n}/{props.hit.of}
        {l !== r && ` · you miss more often ${l > r ? 'left' : 'right'}`}
      </p>
    </>
  );
}
