import { Component, useMemo, type ReactNode } from 'react';
import type { Round } from '../types';
import { roundSummary } from '../lib/summary';
import { SG_LABELS } from '../lib/sg';
import { toggleSpeak } from '../lib/caddietalk';
import { tr } from '../lib/i18n';

// Feature 014: the round summary on the scorecard of a finished round – what happened, why, and the practice plan.

export function RoundSummaryCard(props: { round: Round; history: Round[] }) {
  return (
    <Quiet>
      <SummaryBody {...props} />
    </Quiet>
  );
}

function SummaryBody(props: { round: Round; history: Round[] }) {
  const s = useMemo(() => roundSummary(props.round, props.history), [props.round, props.history]);
  if (!s) return null;
  const minutes = s.plan.reduce((t, d) => t + d.minutes, 0);
  const read = () => toggleSpeak([s.headline, ...s.lines.map((l) => l.text), s.nextRound ?? ''].join(' '));
  return (
    <section className="card stats-card round-summary">
      <div className="row">
        <h2>{tr('Your round summary', 'Dein Rundenfazit')}</h2>
        <button type="button" className="icon-btn" aria-label={tr('Read aloud or stop', 'Vorlesen oder stoppen')} onClick={read}>
          🔊
        </button>
      </div>
      <p className="headline">{s.headline}</p>
      <ul className="summary-lines">
        {s.lines.map((l, k) => (
          <li key={k} className={l.tone}>
            {l.text}
          </li>
        ))}
      </ul>
      {s.plan.length > 0 && (
        <>
          <h3>{tr(`Practice plan for this week · about ${minutes} min`, `Trainingsplan für diese Woche · etwa ${minutes} min`)}</h3>
          <ol className="focus-list">
            {s.plan.map((d, k) => (
              <li key={k} className="drill" style={{ display: 'block' }}>
                <span className="focus-area">
                  {d.area === 'strategy' ? tr('Course management', 'Platzstrategie') : SG_LABELS[d.area]} · {d.minutes} min
                </span>
                <strong>{d.title}</strong>
                <span className="small" style={{ display: 'block' }}>{d.how}</span>
                <span className="muted small" style={{ display: 'block' }}>
                  {tr('Why: ', 'Warum: ')}
                  {d.why}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      {s.nextRound && <p className="next-round">{s.nextRound}</p>}
      <p className="muted small" style={{ margin: 0 }}>
        {tr('Worked out from your shots and strokes gained. Drills are placeholders until our pro adds his own.', 'Aus deinen Schlägen und Strokes Gained berechnet. Die Übungen sind Platzhalter, bis unser Pro seine eigenen einträgt.')}
      </p>
    </section>
  );
}

/** A problem in the summary must never take the scorecard down – it just leaves the card out. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
