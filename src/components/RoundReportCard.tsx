import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Round } from '../types';
import { roundReport, sgText } from '../lib/roundreport';
import { roundSummary } from '../lib/summary';
import { GROUPS, SG_LABELS } from '../lib/sg';
import { tr } from '../lib/i18n';
import { toTraining } from './RoundSummaryCard';

// The round report after signing (Sascha 22.10.2026, round check): strokes gained per area against players of the same
// handicap and the last five rounds, the three most expensive holes and why, and the drill for the weakest area –
// taken into Training with one tap. Right after signing it stands on top of the scorecard, outlined in green.

export function RoundReportCard(props: { round: Round; history: Round[]; highlight?: boolean; onOpenTraining?: () => void }) {
  return (
    <Quiet>
      <ReportBody {...props} />
    </Quiet>
  );
}

function ReportBody(props: { round: Round; history: Round[]; highlight?: boolean; onOpenTraining?: () => void }) {
  const rep = useMemo(() => roundReport(props.round, props.history), [props.round, props.history]);
  const plan = useMemo(() => roundSummary(props.round, props.history)?.plan ?? [], [props.round, props.history]);
  const [taken, setTaken] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (props.highlight) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [props.highlight]);
  if (!rep) return null;
  const group = GROUPS.find((g) => g.id === rep.group)?.label ?? '';
  const max = Math.max(1, ...rep.areas.map((a) => Math.abs(a.round)));
  const drill = (rep.weakest && plan.find((d) => d.area === rep.weakest)) ?? plan[0] ?? null;
  return (
    <section ref={ref} className={`card stats-card airy round-report${props.highlight ? ' fresh' : ''}`} aria-label={tr('Your round report', 'Dein Rundenbericht')}>
      <h2>{tr('Your round report', 'Dein Rundenbericht')}</h2>
      <p className="muted small stats-sub">
        {tr(`From ${rep.holes} checked holes · against players with ${group}`, `Aus ${rep.holes} geprüften Löchern · gegen Spieler mit ${group}`)}
      </p>
      {/* strokes gained per area: a bar to the right is gained, to the left lost */}
      <div className="report-areas">
        {rep.areas.map((a) => (
          <div key={a.c} className="report-area">
            <span className="report-area-name">{a.label}</span>
            <span className="report-bar" aria-hidden="true">
              <i className={a.round >= 0 ? 'up' : 'down'} style={{ width: `${(Math.abs(a.round) / max) * 50}%` }} />
            </span>
            <span className={`report-area-value ${a.round >= 0 ? 'good-text' : 'bad-text'}`}>{sgText(a.round)}</span>
            {a.last5 != null && (
              <span className="muted small report-area-last">
                {tr(`last 5: ${sgText(a.last5)}`, `letzte 5: ${sgText(a.last5)}`)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="insight-row">
        <div className={`insight ${rep.total >= 0 ? 'good' : 'bad'}`}>
          <span className="insight-num">{tr(`${sgText(rep.total)} strokes`, `${sgText(rep.total)} Schläge`)}</span>
          <span className="insight-label">{tr(`in all against ${group}`, `insgesamt gegen ${group}`)}</span>
        </div>
      </div>
      {rep.costly.length > 0 && (
        <>
          <h3>{tr('The most expensive holes', 'Die teuersten Löcher')}</h3>
          <div className="insight-row">
            {rep.costly.map((c) => (
              <div key={c.hole} className="insight bad">
                <span className="insight-num">+{c.toPar}</span>
                <span className="insight-label">
                  {tr(`Hole ${c.hole}`, `Loch ${c.hole}`)} · {c.cause}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {drill && (
        <>
          <h3>{tr('Your training', 'Dein Training')}</h3>
          <div className="report-drill">
            <span className="eyebrow">
              {drill.area === 'strategy' ? tr('Course management', 'Platzstrategie') : SG_LABELS[drill.area]} · {drill.minutes} min
            </span>
            <strong>{drill.title}</strong>
            <span className="small">{drill.how}</span>
            <span className="muted small">
              {tr('Why: ', 'Warum: ')}
              {drill.why}
            </span>
          </div>
          {!taken ? (
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                const name = await toTraining(props.round, plan.map((d) => ({ area: d.area, minutes: d.minutes })));
                setTaken(name ?? '');
              }}
            >
              {tr('Take it into Training', 'Ins Training übernehmen')}
            </button>
          ) : (
            <>
              <span className="muted small">
                {taken ? tr(`Saved in Training as "${taken}" (Practice → My plans).`, `Im Training gespeichert als „${taken}“ (Üben → Meine Pläne).`) : tr('Training could not be opened.', 'Training ließ sich nicht öffnen.')}
              </span>
              {taken && props.onOpenTraining && (
                <button type="button" className="btn-secondary" onClick={props.onOpenTraining}>
                  {tr('Open Training', 'Training öffnen')}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

/** A problem in the report must never take the scorecard down – it just leaves the card out. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
