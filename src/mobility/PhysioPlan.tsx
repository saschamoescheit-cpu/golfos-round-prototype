import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { speak, stopSpeaking } from '../lib/caddietalk';
import { PlayActions } from '../components/PlayActions';
import { TopBar } from '../components/ui';
import { beep, fakeSpeed, speechMs, unlockAudio } from './CameraTest';
import {
  clock,
  dueToday,
  exerciseSec,
  faultLevel,
  logSession,
  parsePlan,
  removePhysio,
  retestDue,
  routineSec,
  runSteps,
  savePhysio,
  setSchedule,
  testOf,
  toScreening,
  unlogSession,
  weekCount,
  weeksOf,
  type Light,
  type PhysioEntry,
  type PhysioExercise,
  type PhysioPlan,
  type PhysioSchedule,
  type RunStep,
} from './physio';
import { loadScreenings, saveScreening } from './store';
import { TESTS } from './tests';

// "My physio plan" (Sascha 1.11.2026): what the physio's screening found, the swing characteristics that follow, the
// routine the physio put together – run step by step with the clock and a voice, every session confirmed in a diary;
// how often a week is the player's choice, a push reminds on the training days, after a month the tests again.

const DAYS = () => [tr('Mon', 'Mo'), tr('Tue', 'Di'), tr('Wed', 'Mi'), tr('Thu', 'Do'), tr('Fri', 'Fr'), tr('Sat', 'Sa'), tr('Sun', 'So')];
const dateText = (iso: string) => new Date(iso).toLocaleDateString(tr('en-GB', 'de-DE'), { day: 'numeric', month: 'short', year: 'numeric' });
const dayText = (iso: string) => new Date(iso).toLocaleDateString(tr('en-GB', 'de-DE'), { weekday: 'short', day: 'numeric', month: 'short' });
const LIGHT_NAME: Record<Light, () => string> = {
  red: () => tr('limited', 'eingeschränkt'),
  yellow: () => tr('partly', 'teilweise'),
  green: () => tr('good', 'gut'),
};
const LEVEL_NAME = { high: () => tr('High', 'Hoch'), moderate: () => tr('Moderate', 'Mittel'), low: () => tr('Low', 'Niedrig') };

/** "2 sets of 8 × 4 s, rest 15 s" – what the exercise asks, short */
export function dosageText(e: PhysioExercise): string {
  const same = e.sets.every((s) => s.reps === e.sets[0].reps && s.repSec === e.sets[0].repSec);
  const s0 = e.sets[0];
  const reps = (r: number, sec: number) => (r > 1 ? `${r} × ${sec} s` : tr(`${sec} s`, `${sec} s`));
  const body = same
    ? (e.sets.length > 1 ? tr(`${e.sets.length} sets of `, `${e.sets.length} Sätze à `) : '') + reps(s0.reps, s0.repSec)
    : e.sets.map((s) => reps(s.reps, s.repSec)).join(' · ');
  const rests = [...new Set(e.sets.map((s) => s.restSec).filter((x) => x > 1))];
  const rest = rests.length ? tr(`, rest ${rests.join('/')} s`, `, Pause ${rests.join('/')} s`) : '';
  return `${body}${rest}${e.perSide ? tr(', each side', ', je Seite') : ''}`;
}
/** said before an exercise: name, how, how much */
function introText(p: PhysioPlan, ex: number): string {
  const e = p.routine.exercises[ex];
  const n = p.routine.exercises.length;
  const head = ex === n - 1 ? tr(`Last one: ${e.name}.`, `Zum Schluss: ${e.name}.`) : tr(`Exercise ${ex + 1} of ${n}: ${e.name}.`, `Übung ${ex + 1} von ${n}: ${e.name}.`);
  const dose = dosageText(e).replace(/×/g, tr('times', 'mal')).replace(/ s\b/g, tr(' seconds', ' Sekunden'));
  const side = e.perSide ? tr(' Start with the right side.', ' Beginne mit der rechten Seite.') : '';
  return [head, ...e.steps, e.note ?? '', `${dose}.${side}`].filter(Boolean).join(' ');
}

// ---------- the card on the drills tab ----------

export function PhysioCard(props: { plan: PhysioPlan | undefined; onOpen: () => void; onRun: () => void; onImport: (p: PhysioPlan) => void }) {
  const p = props.plan;
  if (!p) return <PhysioImport onImport={props.onImport} compact />;
  const week = weekCount(p.log);
  const goal = p.schedule?.perWeek;
  const due = dueToday(p);
  return (
    <section className="card mob-physio-card">
      <div className="mob-physio-head">
        <span className="grow">
          <span className="eyebrow">{tr('My physio plan', 'Mein Physio-Plan')}</span>
          <strong>{p.routine.name}</strong>
          <span className="muted small">
            {tr(`${p.routine.exercises.length} exercises · ${Math.round(routineSec(p) / 60)} min`, `${p.routine.exercises.length} Übungen · ${Math.round(routineSec(p) / 60)} Min.`)}
            {' · '}
            {goal ? tr(`this week ${week} of ${goal}`, `diese Woche ${week} von ${goal}`) : tr(`this week ${week}×`, `diese Woche ${week}×`)}
          </span>
        </span>
        {due && <span className="mob-physio-due">{tr('Today', 'Heute dran')}</span>}
      </div>
      <div className="mob-physio-actions">
        <button type="button" className="btn-primary mob-physio-start" onClick={props.onRun}>
          {tr('Start the routine', 'Routine starten')}
        </button>
        <button type="button" className="btn-secondary mob-physio-open" onClick={props.onOpen}>
          {tr('Open', 'Öffnen')}
        </button>
      </div>
    </section>
  );
}

/** The file from the physio's results (made from the TPI app's report) – read, checked, kept in the account. */
export function PhysioImport(props: { onImport: (p: PhysioPlan) => void; compact?: boolean; replace?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const read = async (f: File) => {
    const p = parsePlan(await f.text());
    if ('error' in p) return setError(tr(`This file is no physio plan (${p.error}).`, `Diese Datei ist kein Physio-Plan (${p.error}).`));
    setError(null);
    props.onImport(p);
  };
  return (
    <section className={props.compact ? 'card mob-physio-import' : 'mob-physio-import'}>
      {props.compact && (
        <span className="muted small">
          {tr('Screened by a physio (e.g. TPI)? Import the plan – results, swing characteristics and your routine.', 'Beim Physio gescreent (z. B. TPI)? Importiere den Plan – Ergebnisse, Schwungmuster und deine Routine.')}
        </span>
      )}
      <button type="button" className="btn-secondary" onClick={() => input.current?.click()}>
        {props.replace ? tr('Import a new plan', 'Neuen Plan importieren') : tr('Import the physio plan', 'Physio-Plan importieren')}
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label={tr('Physio plan file', 'Datei des Physio-Plans')}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void read(f);
          e.target.value = '';
        }}
      />
      {error && (
        <span className="small mob-physio-error" role="alert">
          {error}
        </span>
      )}
    </section>
  );
}

/** Imports the plan: kept in the account, its results as a screening of the day of the physio's screen. */
export function importPlan(p: PhysioPlan): PhysioPlan {
  const s = toScreening(p);
  const plan = s ? { ...p, screening: s.id } : p;
  if (s) saveScreening(s);
  savePhysio(plan);
  return plan;
}

// ---------- the plan ----------

type Tab = 'routine' | 'diary' | 'results' | 'swing';

export function PhysioView(props: { plan: PhysioPlan; onBack: () => void; onRun: () => void; onRetest: () => void }) {
  const [tab, setTab] = useState<Tab>('routine');
  const [p, setP] = useState(props.plan);
  useEffect(() => setP(props.plan), [props.plan]);
  return (
    <main className="screen training mobility mob-physio">
      <TopBar title={tr('My physio plan', 'Mein Physio-Plan')} onBack={props.onBack} />
      <div className="segmented tr-tabs" role="tablist">
        {(
          [
            ['routine', tr('Routine', 'Routine')],
            ['diary', tr('Diary', 'Tagebuch')],
            ['results', tr('Results', 'Ergebnisse')],
            ['swing', tr('Swing', 'Schwung')],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'routine' && <RoutineTab p={p} onRun={props.onRun} onChange={setP} />}
      {tab === 'diary' && <DiaryTab p={p} onChange={setP} />}
      {tab === 'results' && <ResultsTab p={p} onRetest={props.onRetest} />}
      {tab === 'swing' && <SwingTab p={p} />}
      <section className="tr-block mob-physio-manage">
        <PhysioImport replace onImport={(n) => setP(importPlan({ ...n, schedule: p.schedule, log: p.log }))} />
        <button
          type="button"
          className="btn-secondary btn-danger"
          onClick={() => {
            if (!window.confirm(tr('Remove the physio plan from this account? The diary goes with it; the screening made from it stays.', 'Den Physio-Plan aus dem Konto entfernen? Das Tagebuch geht mit; das daraus gemachte Screening bleibt.'))) return;
            removePhysio(p.id);
            props.onBack();
          }}
        >
          {tr('Remove the plan', 'Plan entfernen')}
        </button>
      </section>
    </main>
  );
}

function RoutineTab(props: { p: PhysioPlan; onRun: () => void; onChange: (p: PhysioPlan) => void }) {
  const p = props.p;
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <section className="card mob-physio-sum">
        <strong>{p.routine.name}</strong>
        <span className="muted small">
          {tr(`${p.routine.exercises.length} exercises · ${clock(routineSec(p))} min · from ${p.source}`, `${p.routine.exercises.length} Übungen · ${clock(routineSec(p))} Min. · von ${p.source}`)}
        </span>
        <button type="button" className="btn-primary mob-physio-start" onClick={props.onRun}>
          {tr('Start the routine', 'Routine starten')}
        </button>
      </section>
      <ScheduleCard p={p} onChange={props.onChange} />
      <div className="list mob-physio-list" aria-label={tr('The exercises', 'Die Übungen')}>
        {p.routine.exercises.map((e, i) => (
          <div key={e.id} className="list-item mob-physio-ex">
            <button type="button" className="mob-physio-ex-head" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span className="mob-warmup-num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="grow">
                <span className="title">{e.name}</span>
                <span className="muted small">
                  {dosageText(e)} · {clock(exerciseSec(e))}
                </span>
              </span>
              <span aria-hidden="true">{open === i ? '▾' : '›'}</span>
            </button>
            {open === i && (
              <div className="mob-physio-ex-body">
                {e.note && <p className="small">{e.note}</p>}
                <ol className="small">
                  {e.steps.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ol>
                {e.equipment && (
                  <p className="small">
                    <b>{tr('You need: ', 'Du brauchst: ')}</b>
                    {e.equipment}
                  </p>
                )}
                <table className="mob-physio-sets small">
                  <thead>
                    <tr>
                      <th>{tr('Set', 'Satz')}</th>
                      <th>{tr('Reps', 'Wdh.')}</th>
                      <th>{tr('Time', 'Zeit')}</th>
                      <th>{tr('Rest', 'Pause')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.sets.map((s, j) => (
                      <tr key={j}>
                        <td>{j + 1}</td>
                        <td>{s.reps}</td>
                        <td>{clock(s.repSec)}</td>
                        <td>{clock(s.restSec)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {e.targets?.length ? (
                  <p className="muted small">
                    {tr('For: ', 'Für: ')}
                    {e.targets.map((id) => TESTS.find((x) => x.id === id)).filter(Boolean).map((x) => tr(x!.name.en, x!.name.de)).join(', ')}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/** How often a week, on which days, the reminder (Sascha 1.11.2026: "set myself how often a week – a push reminds"). */
function ScheduleCard(props: { p: PhysioPlan; onChange: (p: PhysioPlan) => void }) {
  const s: PhysioSchedule = props.p.schedule ?? { perWeek: 3, days: [], remind: null };
  const set = (next: Partial<PhysioSchedule>) => {
    const merged = { ...s, ...next };
    // chosen days set the count; a count with fewer days chosen keeps the days free
    if (next.days) merged.perWeek = next.days.length || merged.perWeek;
    props.onChange(setSchedule(props.p, merged));
  };
  return (
    <section className="card mob-physio-plan">
      <strong>{tr('How often a week', 'Wie oft pro Woche')}</strong>
      <div className="chip-row mob-physio-per" role="group" aria-label={tr('Sessions a week', 'Einheiten pro Woche')}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button key={n} type="button" aria-pressed={props.p.schedule?.perWeek === n} onClick={() => set({ perWeek: n, days: (s.days ?? []).length === n ? s.days : [] })}>
            {n === 7 ? tr('daily', 'täglich') : `${n}×`}
          </button>
        ))}
      </div>
      <span className="muted small">{tr('On fixed days (optional):', 'An festen Tagen (optional):')}</span>
      <div className="chip-row mob-physio-days" role="group" aria-label={tr('Training days', 'Trainingstage')}>
        {DAYS().map((d, i) => (
          <button
            key={d}
            type="button"
            aria-pressed={!!s.days?.includes(i)}
            onClick={() => set({ days: s.days?.includes(i) ? s.days.filter((x) => x !== i) : [...(s.days ?? []), i].sort() })}
          >
            {d}
          </button>
        ))}
      </div>
      <label className="mob-physio-remind">
        <span>{tr('Reminder on training days', 'Erinnerung an Trainingstagen')}</span>
        <input type="time" value={s.remind ?? ''} onChange={(e) => set({ remind: e.target.value || null })} aria-label={tr('Reminder time', 'Uhrzeit der Erinnerung')} />
      </label>
      <span className="muted small">
        {s.remind
          ? tr('A push at this time on a training day you have not trained yet (notifications on in the profile).', 'Eine Push-Mitteilung zu dieser Uhrzeit an einem Trainingstag, an dem du noch nicht trainiert hast (Mitteilungen im Profil einschalten).')
          : tr('No reminder.', 'Keine Erinnerung.')}
      </span>
    </section>
  );
}

function DiaryTab(props: { p: PhysioPlan; onChange: (p: PhysioPlan) => void }) {
  const p = props.p;
  const log = p.log ?? [];
  const goal = p.schedule?.perWeek ?? 0;
  const weeks = weeksOf(log);
  const max = Math.max(goal, ...weeks.map((w) => w.n), 1);
  const total = new Set(log.map((e) => new Date(e.at).toDateString())).size;
  return (
    <>
      <section className="card mob-physio-weeks">
        <strong>{tr(`${total} days trained`, `${total} Trainingstage`)}</strong>
        <span className="muted small">{goal ? tr(`Goal: ${goal} a week`, `Ziel: ${goal}× pro Woche`) : tr('No weekly goal set (Routine tab).', 'Kein Wochenziel gesetzt (Reiter Routine).')}</span>
        <div className="mob-physio-bars" role="img" aria-label={weeks.map((w) => `${dateText(w.from.toISOString())}: ${w.n}`).join(', ')}>
          {[...weeks].reverse().map((w) => (
            <span key={w.from.toISOString()} className={`mob-physio-bar${goal && w.n >= goal ? ' met' : ''}`}>
              <i style={{ height: `${Math.round((w.n / max) * 100)}%` }} />
              <small>{w.n}</small>
            </span>
          ))}
        </div>
        <span className="muted small">{tr('The last 8 weeks, this week right.', 'Die letzten 8 Wochen, diese Woche rechts.')}</span>
      </section>
      <button
        type="button"
        className="btn-secondary mob-physio-enter"
        onClick={() => props.onChange(logSession(p, { at: new Date().toISOString(), done: p.routine.exercises.length, of: p.routine.exercises.length, min: Math.round(routineSec(p) / 60), how: 'entered' }))}
      >
        {tr('Trained today without the app – enter it', 'Heute ohne App trainiert – eintragen')}
      </button>
      {log.length ? (
        <div className="list mob-physio-log">
          {log.map((e: PhysioEntry) => (
            <div key={e.id} className="list-item">
              <span className="grow">
                <span className="title">{dayText(e.at)}</span>
                <span className="muted small">
                  {tr(`${e.done} of ${e.of} exercises · ${e.min} min`, `${e.done} von ${e.of} Übungen · ${e.min} Min.`)}
                  {e.how === 'entered' ? tr(' · entered', ' · eingetragen') : ''}
                  {e.feel ? ` · ${FEEL[e.feel - 1]()}` : ''}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
              </span>
              <button type="button" className="icon-btn" aria-label={tr('Remove from the diary', 'Aus dem Tagebuch entfernen')} onClick={() => props.onChange(unlogSession(p, e.id))}>
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">{tr('No session yet – every routine you finish lands here.', 'Noch keine Einheit – jede Routine, die du beendest, landet hier.')}</p>
      )}
    </>
  );
}
const FEEL = [() => tr('very hard', 'sehr schwer'), () => tr('hard', 'schwer'), () => tr('all right', 'okay'), () => tr('easy', 'leicht'), () => tr('very easy', 'sehr leicht')];

function ResultsTab(props: { p: PhysioPlan; onRetest: () => void }) {
  const p = props.p;
  const own = loadScreenings().filter((s) => s.finishedAt && !s.from && s.finishedAt > p.screenedAt);
  const re = retestDue(p, own[0]?.finishedAt ?? null);
  const order: Light[] = ['red', 'yellow', 'green'];
  const tests = [...p.tests].sort((a, b) => order.indexOf(a.light) - order.indexOf(b.light));
  return (
    <>
      <section className="card mob-physio-sum">
        <strong>{p.source}</strong>
        <span className="muted small">
          {dateText(p.screenedAt)}
          {p.gfh != null ? tr(` · golf fitness handicap ${p.gfh}`, ` · Golf-Fitness-Handicap ${p.gfh}`) : ''}
        </span>
        <span className="small">{tr('Taken over as a screening: the day plans and the results of Agility use it.', 'Als Screening übernommen: die Tagespläne und Ergebnisse von Agility nutzen es.')}</span>
      </section>
      <section className={`card mob-physio-retest${re.due ? ' due' : ''}`}>
        <strong>{re.due ? tr('Time to test again', 'Zeit für den Nachtest') : tr('Test again', 'Nachtest')}</strong>
        <span className="muted small">
          {re.due
            ? tr(`${re.days} days and ${re.sessions} sessions since – test again and see what changed.`, `${re.days} Tage und ${re.sessions} Einheiten seitdem – teste erneut und sieh, was sich verändert hat.`)
            : tr(`After about 4 weeks and 8 sessions (now ${re.days} days, ${re.sessions} sessions). The result compares with the physio's.`, `Nach etwa 4 Wochen und 8 Einheiten (jetzt ${re.days} Tage, ${re.sessions} Einheiten). Das Ergebnis vergleicht mit dem des Physios.`)}
        </span>
        <button type="button" className={re.due ? 'btn-primary' : 'btn-secondary'} onClick={props.onRetest}>
          {tr('To the screening', 'Zum Screening')}
        </button>
      </section>
      <div className="list mob-physio-tests">
        {tests.map((x) => {
          const sided = x.left || x.right;
          return (
            <div key={x.name} className="list-item">
              <span className={`mob-light ${x.light}`} aria-hidden="true" />
              <span className="grow">
                <span className="title">{testName(x.name, testOf(x))}</span>
                <span className="muted small">
                  {sided ? `${tr('left', 'links')} ${LIGHT_NAME[x.left ?? x.light]()} · ${tr('right', 'rechts')} ${LIGHT_NAME[x.right ?? x.light]()}` : LIGHT_NAME[x.light]()}
                  {x.note ? ` · ${x.note}` : ''}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
const testName = (name: string, id: string | undefined) => {
  const def = id && TESTS.find((x) => x.id === id);
  return def ? tr(def.name.en, def.name.de) : name;
};

function SwingTab(props: { p: PhysioPlan }) {
  return (
    <>
      <p className="muted small mob-physio-swing-note">
        {tr('How likely these swing characteristics are, after the physio’s screen. Work on the body first – the routine is made for it.', 'Wie wahrscheinlich diese Schwungmuster nach dem Screening des Physios sind. Zuerst am Körper arbeiten – dafür ist die Routine gemacht.')}
      </p>
      <div className="list mob-physio-faults">
        {props.p.faults.map((f) => {
          const lv = faultLevel(f.pct);
          return (
            <div key={f.name} className="list-item mob-physio-fault">
              <span className="grow">
                <span className="title">{f.name}</span>
                <span className={`mob-physio-meter ${lv}`} aria-hidden="true">
                  <i style={{ width: `${f.pct}%` }} />
                </span>
              </span>
              <span className={`mob-physio-level ${lv}`}>
                {f.pct} % · {LEVEL_NAME[lv]()}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- the guided routine ----------

export function PhysioRun(props: { plan: PhysioPlan; onClose: (p: PhysioPlan) => void }) {
  const p = props.plan;
  const steps = useRef<RunStep[]>(runSteps(p)).current;
  const [stage, setStage] = useState<'run' | 'hold' | 'end'>('run');
  const [k, setK] = useState(0);
  const [left, setLeft] = useState(0);
  const [feel, setFeel] = useState<number | null>(null);
  const done = useRef<Set<number>>(new Set());
  const skipped = useRef<Set<number>>(new Set());
  const started = useRef(Date.now());
  const clockRef = useRef({ last: 0, left: 0 });

  const durOf = (st: RunStep) => (st.kind === 'intro' ? Math.max(6, speechMs(introText(p, st.ex)) / 1000) : st.sec);
  const enter = (i: number) => {
    if (i >= steps.length) {
      const last = p.routine.exercises.length - 1;
      if (!skipped.current.has(last)) done.current.add(last);
      finish(done.current.size === p.routine.exercises.length);
      return;
    }
    const st = steps[i];
    // the exercise before is done when its last step ended (not skipped)
    if (i > 0 && steps[i - 1].ex !== st.ex && !skipped.current.has(steps[i - 1].ex)) done.current.add(steps[i - 1].ex);
    clockRef.current = { last: performance.now(), left: durOf(st) };
    setLeft(clockRef.current.left);
    setK(i);
    if (st.kind === 'intro') speak(introText(p, st.ex));
    else if (st.kind === 'rep') {
      beep(st.rep === 0 ? 1180 : 880, 120);
      if (st.reps > 1 && st.sec >= 2) speak(String(st.rep + 1));
      else if (st.sec >= 10) speak(tr('Go.', 'Los.'));
    } else if (st.kind === 'rest') {
      beep(560, 160);
      if (st.sec >= 8) speak(tr(`Rest, ${st.sec} seconds.`, `Pause, ${st.sec} Sekunden.`));
    } else speak(tr('Other side.', 'Andere Seite.'));
  };
  const finish = (all: boolean) => {
    stopSpeaking();
    setStage('end');
    speak(all ? tr('Done – the whole routine. Well done.', 'Geschafft – die ganze Routine. Gut gemacht.') : tr('Finished.', 'Beendet.'));
  };

  useEffect(() => {
    unlockAudio();
    enter(0);
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the screen stays on while it runs
  useEffect(() => {
    if (stage !== 'run') return;
    let wake: { release: () => Promise<void> } | null = null;
    let off = false;
    (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request('screen')
      .then((w) => (off ? void w.release() : (wake = w)))
      .catch(() => {});
    return () => {
      off = true;
      void wake?.release();
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== 'run') return;
    clockRef.current.last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const c = clockRef.current;
      const before = c.left;
      c.left = Math.max(0, c.left - ((now - c.last) / 1000) * fakeSpeed());
      c.last = now;
      setLeft(c.left);
      const st = steps[k];
      // a long hold: three short beeps before its end
      if (st.kind === 'rep' && st.sec >= 10 && Math.ceil(before) !== Math.ceil(c.left) && Math.ceil(c.left) <= 3 && c.left > 0) beep(660, 80);
      if (c.left <= 0) {
        window.clearInterval(id);
        enter(k + 1);
      }
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, k]);

  const st = steps[Math.min(k, steps.length - 1)];
  const e = p.routine.exercises[st.ex];
  const nextEx = () => {
    const i = steps.findIndex((x, j) => j > k && x.ex !== st.ex);
    skipped.current.add(st.ex);
    stopSpeaking();
    if (i < 0) finish(false);
    else enter(i);
  };

  if (stage === 'end') {
    const n = done.current.size;
    const min = Math.max(1, Math.round((Date.now() - started.current) / 60000));
    const save = (log: boolean) => {
      stopSpeaking();
      props.onClose(log && n ? logSession(p, { at: new Date().toISOString(), done: n, of: p.routine.exercises.length, min, how: 'guided', ...(feel ? { feel } : {}) }) : p);
    };
    return (
      <main className="screen training mobility mob-physio-end">
        <TopBar title={p.routine.name} onBack={() => save(false)} />
        <section className="card">
          <strong>{n === p.routine.exercises.length ? tr('The whole routine – done', 'Die ganze Routine – geschafft') : tr(`${n} of ${p.routine.exercises.length} exercises`, `${n} von ${p.routine.exercises.length} Übungen`)}</strong>
          <span className="muted small">{tr(`About ${min} min.`, `Etwa ${min} Min.`)}</span>
        </section>
        {n > 0 && (
          <section className="tr-block">
            <strong>{tr('How did it feel?', 'Wie war es?')}</strong>
            <div className="chip-row mob-physio-feel" role="group" aria-label={tr('How it felt', 'Wie es sich anfühlte')}>
              {FEEL.map((f, i) => (
                <button key={i} type="button" aria-pressed={feel === i + 1} onClick={() => setFeel(i + 1)}>
                  {f()}
                </button>
              ))}
            </div>
          </section>
        )}
        <section className="tr-block mob-physio-save">
          {n > 0 && (
            <button type="button" className="btn-primary mob-physio-confirm" onClick={() => save(true)}>
              {tr('Confirm – into the diary', 'Bestätigen – ins Tagebuch')}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => save(false)}>
            {n > 0 ? tr('Do not enter it', 'Nicht eintragen') : tr('Close', 'Schließen')}
          </button>
        </section>
      </main>
    );
  }

  const progress = k / steps.length;
  const label =
    st.kind === 'intro'
      ? tr('Get ready', 'Vorbereiten')
      : st.kind === 'rest'
        ? tr('Rest', 'Pause')
        : st.kind === 'switch'
          ? tr('Other side', 'Andere Seite')
          : [st.sets > 1 ? tr(`Set ${st.set + 1}/${st.sets}`, `Satz ${st.set + 1}/${st.sets}`) : '', st.reps > 1 ? tr(`Rep ${st.rep + 1}/${st.reps}`, `Wdh. ${st.rep + 1}/${st.reps}`) : '', st.side ? (st.side === 1 ? tr('right', 'rechts') : tr('left', 'links')) : ''].filter(Boolean).join(' · ');
  return (
    <main className="screen mobility mob-run-camera mob-warmup-run mob-physio-run">
      <section className="mob-camera coach mob-warmup-player">
        <div className="mob-warmup-info mob-physio-info">
          <span className="muted small">{tr(`Exercise ${st.ex + 1} of ${p.routine.exercises.length}`, `Übung ${st.ex + 1} von ${p.routine.exercises.length}`)}</span>
          <strong className="mob-warmup-name">{e.name}</strong>
          <span className={`mob-physio-phase ${st.kind}`}>{label}</span>
          <span className="mob-live-value mob-warmup-clock mob-physio-clock" aria-live="off">
            {Math.ceil(left)} s
          </span>
          <span className="mob-hold" aria-hidden="true">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
          <span className="muted small">{dosageText(e)}</span>
          <ol className="mob-warmup-steps small">
            {e.steps.map((s, j) => (
              <li key={j}>{s}</li>
            ))}
          </ol>
          {stage === 'hold' && (
            <div className="mob-warmup-hold">
              <strong>{tr('Paused', 'Pausiert')}</strong>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  clockRef.current.last = performance.now();
                  setStage('run');
                }}
              >
                {tr('Continue', 'Weiter')}
              </button>
            </div>
          )}
        </div>
        {stage === 'run' && (
          <PlayActions
            className="mob-camera-actions"
            buttons={[
              { act: 'skip', label: tr('Skip', 'Überspringen'), aria: tr('Skip this exercise – on to the next', 'Diese Übung überspringen – weiter zur nächsten'), onClick: nextEx },
              {
                act: 'pause',
                label: tr('Pause', 'Pause'),
                onClick: () => {
                  stopSpeaking();
                  setStage('hold');
                },
              },
              { act: 'end', label: tr('Finish', 'Beenden'), aria: tr('Finish the routine', 'Routine beenden'), onClick: () => finish(false) },
            ]}
          />
        )}
        {stage === 'hold' && (
          <PlayActions className="mob-camera-actions" buttons={[{ act: 'end', label: tr('Finish', 'Beenden'), aria: tr('Finish the routine', 'Routine beenden'), onClick: () => finish(false) }]} />
        )}
      </section>
    </main>
  );
}
