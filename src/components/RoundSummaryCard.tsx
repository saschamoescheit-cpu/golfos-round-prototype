import { Component, useMemo, useState, type ReactNode } from 'react';
import { SpeakerIcon, useSpeaking } from './SpeakerIcon';
import type { Round } from '../types';
import { roundSummary } from '../lib/summary';
import { SG_LABELS } from '../lib/sg';
import { toggleSpeak } from '../lib/caddietalk';
import { getLang, tr } from '../lib/i18n';

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
  const talking = useSpeaking();
  const read = () => toggleSpeak([s.headline, ...s.lines.map((l) => l.text), s.nextRound ?? ''].join(' '));
  const [taken, setTaken] = useState<string | null>(null);
  return (
    <section className="card stats-card round-summary">
      <div className="row">
        <h2>{tr('Your round summary', 'Dein Rundenfazit')}</h2>
        <button type="button" className="icon-btn" aria-label={tr('Read aloud or stop', 'Vorlesen oder stoppen')} aria-pressed={talking} onClick={read}>
          <SpeakerIcon />
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
          {/* the player decides (Sascha 16.10.2026): the week's plan as an own plan in Training */}
          <button
            type="button"
            className="btn-secondary"
            disabled={taken != null}
            onClick={async () => {
              const name = await toTraining(props.round, s.plan.map((d) => ({ area: d.area, minutes: d.minutes })));
              setTaken(name ? tr(`Saved in Training as "${name}" (Practice → My plans).`, `Im Training gespeichert als „${name}“ (Üben → Meine Pläne).`) : tr('Training could not be opened.', 'Training ließ sich nicht öffnen.'));
            }}
          >
            {taken ? tr('In Training ✓', 'Im Training ✓') : tr('Take it into Training', 'Ins Training übernehmen')}
          </button>
          {taken && <span className="muted small">{taken}</span>}
        </>
      )}
      {s.nextRound && <p className="next-round">{s.nextRound}</p>}
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

/** The week's plan as an own plan in the Training module: per weak area the matching drills (Training loads only
 *  now – it is not part of the round screens). Returns the plan's name. */
async function toTraining(round: Round, plan: { area: string; minutes: number }[]): Promise<string | null> {
  try {
    const [{ DRILLS }, store] = await Promise.all([import('../training/content'), import('../training/store')]);
    const cat: Record<string, string> = { tee: 'driver', long: 'woods', approach: 'irons', around: 'chipping', putting: 'putting', strategy: 'strategy' };
    const items: { drill: string; minutes: number }[] = [];
    for (const d of plan) {
      const pick = DRILLS.filter((x) => x.cat === cat[d.area] && !items.some((i) => i.drill === x.id)).slice(0, 2);
      for (const x of pick) items.push({ drill: x.id, minutes: Math.max(5, Math.round(d.minutes / pick.length)) });
    }
    if (!items.length) return null;
    const date = new Date(round.createdAt).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined, { day: '2-digit', month: '2-digit' });
    const name = tr(`After the round ${date} · ${round.courseName}`, `Nach der Runde ${date} · ${round.courseName}`);
    store.saveOwnPlan({ id: store.trainingId(), name, items, createdAt: new Date().toISOString() });
    return name;
  } catch {
    return null;
  }
}
