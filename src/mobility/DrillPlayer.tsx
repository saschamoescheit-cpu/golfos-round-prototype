import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { isSpeaking, speak, stopSpeaking } from '../lib/caddietalk';
import type { Drill } from '../training/types';
import { BONES, facingOf, type Frame, type Lm } from './measure';
import { detect, loadPose, resetTracking } from './pose';
import { CUES, CUE_SHORT, FormCheck, RepCounter, SELF_NAMED, SIGNALS, Signal, setsOf, signalValueText, type DrillCoach, type FormCue } from './drillcoach';
import type { DrillDone, DrillSet } from './sessions';
import type { Side } from './types';
import type { Clip } from './anim3d/scene';
import { beep, fakeLevel, fakeSpeed, isPhoneSlow, markPhoneSlow } from './CameraTest';

const Anim3D = lazy(() => import('./Anim3D'));

// One drill of the mobility pillar, led like a coach (Sascha 18.10.2026: "an app that leads a person through
// exercises and analyses and measures the mobility meanwhile"): the 3D golfer shows the drill, then the player does it
// in front of the phone – the app counts the reps (by what the camera sees, or in a tempo when it cannot see them),
// times the holds, measures how far the movement goes, says the side changes and goes on by itself. The camera of the
// session stays on; nothing is recorded or sent.

type Phase = 'starting' | 'demo' | 'frame' | 'count' | 'run' | 'rest' | 'result' | 'error';

/** the cues of a set in words, e.g. "Hints: 2 × heels up · 1 × arms forward" */
export function cueText(cues: Partial<Record<FormCue, number>>): string {
  const parts = (Object.entries(cues) as [FormCue, number][]).filter(([, n]) => n > 0).map(([c, n]) => `${n} × ${tr(CUE_SHORT[c].en, CUE_SHORT[c].de)}`);
  return parts.length ? `${tr('Hints', 'Hinweise')}: ${parts.join(' · ')}` : '';
}

const sideWord = (s: Side) => (s === 'left' ? tr('left side', 'linke Seite') : tr('right side', 'rechte Seite'));
const t = (x: { en: string; de: string }) => tr(x.en, x.de);
/** a name at the start of a line ("turn of the hips" → "Turn of the hips") */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The synthetic player for the QA (golfos.mobility.fake): the drill's movement in a loop – about 0.8 s a rep on the
 * clock even when the QA runs faster, so the camera sees enough pictures of every rep (a real one takes 2–4 s). */
async function fakeBody(plan: DrillCoach, side: Side | null, level: 'good' | 'stiff', speed: number) {
  const s = await import('./synth');
  const good = level === 'good';
  const P = 800 * speed;
  const k = (ms: number) => Math.sin((Math.PI * (ms % P)) / P);
  // QA: a player the camera does not see moving (golfos.mobility.fakeStill) – the app has to count along
  let still = false;
  try {
    still = localStorage.getItem('golfos.mobility.fakeStill') === '1';
  } catch {
    /* no storage */
  }
  return (ms: number): Lm[] => {
    const x = ms > 0 && !still ? k(ms) : 0;
    switch (plan.signal) {
      case 'turn':
        // stiff: the hips turn along
        return s.frontBody({ trunk: (good ? 50 : 32) * x, pelvis: good ? 0 : 18 * x });
      case 'hipTurn':
        // stiff: the chest turns along
        return s.frontBody({ pelvis: (good ? 35 : 22) * x, trunk: good ? 0 : 18 * x });
      case 'head':
        // stiff: the shoulders turn along
        return s.frontBody({ head: (good ? 70 : 45) * x, trunk: good ? 0 : 18 * x });
      case 'squat':
        // stiff: heels up, arms forward
        return s.squatBody(x, good ? 8 : -12, good ? 0 : 0.3, good ? 10 : 40);
      case 'reach':
        // stiff: knees bent
        return s.toeTouchBody(x, good ? -0.01 : 0.12, good ? 0 : 30);
      case 'shin':
        return s.squatBody(x * (good ? 0.7 : 0.45), 0);
      case 'hipExt':
        return s.bridgeBody('left', false, 0, x > 0.5);
      case 'arms':
        return s.latBody(80 + (good ? 85 : 55) * x);
      case 'oneLeg':
        return s.frontBody({ lift: ms > 0 ? (side === 'right' ? 'left' : 'right') : null });
      case 'shoulderEr':
        return s.frontBody({ er: (good ? 85 : 55) * x });
      case 'kneeOpen':
        return s.frontBody({ kneeOpen: (good ? 45 : 25) * x });
      case 'sideSwitch':
        // from one side to the other and back: the knees through the middle twice a "rep" of the loop
        return s.frontBody({ kneeShift: 0.2 * Math.cos(Math.PI * (ms > 0 && !still ? (ms % P) / P : 0)) });
      default:
        return s.frontBody({});
    }
  };
}

export function DrillPlayer(props: {
  drill: Drill;
  plan: DrillCoach;
  clip?: Clip;
  /** the camera of the session (opened with the start tap); null = the player opens its own */
  stream: MediaStream | null;
  /** said and shown first, e.g. "Drill 2 of 5: Knee to wall" */
  intro: string;
  /** the best value of the last time (the result shows the change) */
  previous?: number | null;
  onDone: (d: DrillDone) => void;
  onMenu: () => void;
  onSkip: () => void;
}) {
  const { plan } = props;
  const sets = setsOf(plan);
  const signal = plan.signal ? SIGNALS[plan.signal] : null;
  const holdMode = plan.hold != null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const phaseRef = useRef<Phase>('starting');
  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const [setIdx, setSetIdx] = useState(0);
  const [count, setCount] = useState(3);
  const [live, setLive] = useState<{ reps: number; held: number; value: number | null; best: number | null; progress: number; seen: boolean; missing: number; turned?: boolean; people?: number }>({ reps: 0, held: 0, value: null, best: null, progress: 0, seen: false, missing: 0 });
  const doneRef = useRef<DrillSet[]>([]);
  const [auto, setAuto] = useState<number | null>(null);
  // the form cue on screen (3 s): what the app just said
  const [cue, setCue] = useState<FormCue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ratio, setRatio] = useState('9 / 16');
  // the small 3D golfer and the body tracking share the phone: under 12 pictures a second the golfer goes (accuracy
  // first), for the rest of the visit – as in the screening
  const [demoOff, setDemoOff] = useState(isPhoneSlow);
  const [attempt, setAttempt] = useState(0);
  const fake = fakeLevel();
  const resultRef = useRef<DrillDone | null>(null);

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ownStream = true;
    let wake: { release: () => Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request('screen')
      .then((w) => (stopped ? void w.release() : (wake = w)))
      .catch(() => {});
    let landmarker: Awaited<ReturnType<typeof loadPose>> | null = null;
    let body: ((ms: number) => Lm[]) | null = null;
    const sp = fake ? fakeSpeed() : 1;
    const say = (text: string) => {
      if (!fake && text) speak(text);
    };
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(() => !stopped && fn(), fake ? Math.min(ms, 300) : ms));
    doneRef.current = [];

    // the set in play
    let k = 0;
    let sig: Signal | null = plan.signal ? new Signal(plan.signal) : null;
    // the form while the player does the drill: a cue like a coach (new for every set, set up in its countdown)
    let form: FormCheck | null = null;
    let cueUntil = 0;
    let counter: RepCounter | null = null;
    let reps = 0;
    let held = 0;
    let holdBest: number | null = null;
    let setT0 = 0;
    let lastT = 0;
    let onLeg = false;
    let spokeLeft = false;
    // the camera saw no rep (the angle, the light, too far): the app counts in the tempo from then on
    let paced = false;
    let pacedFrom = 0;
    let framedSince = -1;
    let frameT0 = 0;
    let lastHint = 0;
    let lastUi = 0;
    let lastDetect = 0;
    let rateT0 = performance.now();
    let rateN = 0;
    let fakeT0 = 0;

    const draw = (lm: Lm[] | null, w: number, h: number, framed: boolean) => {
      const c = canvasRef.current;
      if (!c) return;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const g = c.getContext('2d');
      if (!g) return;
      g.clearRect(0, 0, w, h);
      if (fake) {
        g.fillStyle = '#18222a';
        g.fillRect(0, 0, w, h);
      }
      if (!lm) return;
      const p = (i: number) => [lm[i].x * w, lm[i].y * h] as const;
      g.lineCap = 'round';
      for (const [a, b] of BONES) {
        if ((lm[a].v ?? 1) < 0.4 || (lm[b].v ?? 1) < 0.4) continue;
        g.strokeStyle = framed ? 'rgba(155,197,61,0.9)' : 'rgba(255,107,94,0.8)';
        g.lineWidth = 5 * (w / 720);
        const [x1, y1] = p(a);
        const [x2, y2] = p(b);
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
    };

    /** the body is there and turned the way the drill wants (floor drills: only the body) */
    const placed = (f: Frame | null): { framed: boolean; missing: number; turned: boolean } => {
      if (!f) return { framed: false, missing: 99, turned: true };
      const missing = sig ? sig.missing(f).length : [11, 12, 23, 24].filter((i) => (f.lm[i]?.v ?? 1) < 0.5).length;
      const turned = !!fake || plan.view === 'floor' || facingOf(f) === plan.view;
      return { framed: missing === 0 && turned, missing, turned };
    };

    const startCountdown = () => {
      go('count');
      form = plan.signal ? new FormCheck(plan.signal) : null;
      const side = sets[k];
      say(side ? (k === 0 || sets[k - 1] !== side ? tr(`The ${sideWord(side)}.`, `Die ${sideWord(side)}.`) : '') : '');
      const t0 = performance.now();
      const waitSpeech = () => {
        if (!fake && isSpeaking() && performance.now() - t0 < 6000) return later(waitSpeech, 150);
        let n = 3;
        setCount(n);
        beep(660);
        const step = () => {
          n--;
          if (n > 0) {
            setCount(n);
            beep(660);
            later(step, 1000);
          } else startSet();
        };
        later(step, 1000);
      };
      waitSpeech();
    };

    const startSet = () => {
      counter = signal ? new RepCounter(signal) : null;
      reps = 0;
      held = 0;
      holdBest = null;
      onLeg = false;
      spokeLeft = false;
      paced = false;
      pacedFrom = 0;
      setT0 = performance.now();
      lastT = setT0;
      fakeT0 = setT0;
      go('run');
      beep(1180, 180);
      say(holdMode ? (plan.signal === 'oneLeg' ? tr('Lift the foot – hold.', 'Fuß heben – halten.') : tr('Hold.', 'Halten.')) : tr('Go.', 'Los.'));
      setLive((x) => ({ ...x, reps: 0, held: 0, best: null, progress: 0 }));
    };

    const endSet = () => {
      if (phaseRef.current !== 'run') return;
      const side = sets[k];
      const best = plan.signal === 'oneLeg' ? Math.round(held / 100) / 10 : signal?.countOnly ? null : holdMode ? holdBest : (counter?.best ?? null);
      const s: DrillSet = { side, reps: holdMode ? 1 : reps, target: holdMode ? 1 : (plan.reps ?? 10), best: best != null ? Math.round(best * 10) / 10 : null, ...(holdMode ? { held: Math.round(held / 100) / 10 } : {}), ...(sig && !holdMode && !paced ? { seen: true } : {}), ...(form && Object.keys(form.counts).length ? { cues: { ...form.counts } } : {}) };
      setCue(null);
      cueUntil = 0;
      doneRef.current = [...doneRef.current, s];
      beep(1400, 240);
      k++;
      if (k < sets.length) {
        const next = sets[k];
        go('rest');
        setSetIdx(k);
        say(next && next !== side ? tr(`Good. Now the ${sideWord(next)}.`, `Gut. Jetzt die ${sideWord(next)}.`) : tr('Good. A short break – then again.', 'Gut. Kurze Pause – dann nochmal.'));
        if (next !== side) sig = plan.signal ? new Signal(plan.signal) : null;
        later(startCountdown, 6000);
        return;
      }
      finish();
    };

    const finish = () => {
      const d: DrillDone = { drill: props.drill.id, ...(plan.signal ? { signal: plan.signal } : {}), sets: doneRef.current, at: new Date().toISOString() };
      resultRef.current = d;
      go('result');
      stopped = true;
      cancelAnimationFrame(raf);
      if (ownStream) stream?.getTracks().forEach((x) => x.stop());
      const vals = d.sets.map((x) => x.best).filter((v): v is number => v != null);
      const best = vals.length && plan.signal ? (SIGNALS[plan.signal].better === 'up' ? Math.max(...vals) : Math.min(...vals)) : null;
      say(best != null && plan.signal ? `${tr('Done', 'Fertig')}. ${signalValueText(plan.signal, best, tr)}.` : tr('Done.', 'Fertig.'));
      setAuto(4);
    };

    const tick = () => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      if (now - lastDetect < 30) return;
      lastDetect = now;
      rateN++;
      if (now - rateT0 > 3000) {
        if (!fake && rateN / ((now - rateT0) / 1000) < 12 && (phaseRef.current === 'frame' || phaseRef.current === 'run')) {
          markPhoneSlow();
          setDemoOff(true);
        }
        rateT0 = now;
        rateN = 0;
      }
      let lm: Lm[] | null = null;
      let people = 0;
      let w = 720;
      let h = 1280;
      if (body) {
        lm = body(phaseRef.current === 'run' ? (now - fakeT0) * sp : 0);
        people = 1;
      } else {
        const v = videoRef.current;
        if (!v || v.readyState < 2 || !landmarker) return;
        w = v.videoWidth;
        h = v.videoHeight;
        const d = detect(landmarker, v);
        lm = d.lm;
        people = d.people;
      }
      const f: Frame | null = lm ? { lm, w, h, t: now } : null;
      const pl = placed(f);
      draw(lm, w, h, pl.framed || phaseRef.current === 'run');
      const ph = phaseRef.current;
      if (ph === 'frame') {
        if (pl.framed) {
          if (framedSince < 0) framedSince = now;
          if (now - framedSince > (fake ? 300 : 1000)) startCountdown();
        } else framedSince = -1;
        // never stuck: after 15 s with the body in the picture it starts anyway (floor drills seen from odd angles)
        if (phaseRef.current === 'frame' && f && now - frameT0 > 15000) startCountdown();
        if (phaseRef.current === 'frame' && now - lastHint > 7000 && now - frameT0 > 2500) {
          lastHint = now;
          if (f && pl.missing === 0 && !pl.turned) say(plan.view === 'side' ? tr('Turn side-on to the phone.', 'Dreh dich seitlich zum Handy.') : tr('Turn face-on to the phone.', 'Dreh dich frontal zum Handy.'));
          else if (f && pl.missing > 0) say(tr('Step back – the whole body in the picture.', 'Weiter zurück – der ganze Körper ins Bild.'));
        }
      }
      if (ph === 'count' && sig && f) sig.calibrate(f);
      if (ph === 'count' && form && f) form.calibrate(f);
      let value: number | null = null;
      if (ph === 'run') {
        const dt = now - lastT;
        lastT = now;
        const elapsed = (now - setT0) * sp;
        if (sig && f && !sig.calibrated) sig.calibrate(f);
        value = sig && f ? sig.value(f) : null;
        if (form && f) {
          if (!form.calibrated) form.calibrate(f);
          // (the synthetic player of the QA runs faster than the clock: its own time, so a fault lasts as long as in life)
          const cue = form.push(fake ? { ...f, t: (now - fakeT0) * sp } : f, value);
          if (cue) {
            say(t(CUES[cue]));
            setCue(cue);
            cueUntil = now + 3000;
          }
        }
        if (cueUntil && now > cueUntil) {
          cueUntil = 0;
          setCue(null);
        }
        if (holdMode) {
          const hold = (plan.hold ?? 20) * 1000;
          if (sig && plan.signal !== 'oneLeg') {
            held = elapsed;
            if (value != null && signal) holdBest = holdBest == null ? value : signal.better === 'up' ? Math.max(holdBest, value) : Math.min(holdBest, value);
          } else if (sig) {
            const up = value === 1;
            if (up) held += dt * sp;
            if (up !== onLeg) {
              onLeg = up;
              if (!up && held > 0 && held < hold) say(tr('Foot down – lift it again.', 'Fuß ab – nochmal heben.'));
            }
          } else held = elapsed;
          const left = hold - held;
          if (!spokeLeft && hold >= 20000 && left <= 10000) {
            spokeLeft = true;
            say(tr('Ten more seconds.', 'Noch zehn Sekunden.'));
          }
          if (held >= hold || elapsed > hold * 2.5 + 10000) endSet();
        } else {
          const target = plan.reps ?? 10;
          const tempo = (plan.tempo ?? 4) * 1000;
          if (counter && !paced) {
            if (counter.push(value)) {
              reps = counter.reps;
              beep(980, 90);
              if (reps < target) say(String(reps));
            }
            // not one rep seen after about two and a half: the app counts along in the tempo (it never stays at 0)
            if (counter.reps === 0 && elapsed > tempo * 2.5 + (fake ? 0 : 3000)) {
              paced = true;
              pacedFrom = elapsed;
              say(tr('I count along.', 'Ich zähle mit.'));
            }
            // never stuck: a set ends after the time it should take (and a bit) with the reps the camera saw
            // (the synthetic player of the QA takes 0.8 s a rep on the clock)
            if (elapsed > target * Math.max(tempo, fake ? 800 * sp : 0) * 1.6 + 6000) endSet();
          } else {
            // the app's count in the drill's tempo (the camera still measures how far it goes, where it can)
            if (counter) counter.push(value);
            const n = Math.min(target, Math.floor((elapsed - pacedFrom) / tempo));
            if (n > reps) {
              reps = n;
              beep(980, 90);
              if (reps < target) say(String(reps));
            }
          }
          if (reps >= target) endSet();
        }
      }
      if (now - lastUi > 100) {
        lastUi = now;
        setLive({ reps, held, value, best: plan.signal === 'oneLeg' ? held / 1000 : signal?.countOnly ? null : holdMode ? holdBest : (counter?.best ?? null), progress: holdMode ? Math.min(1, held / ((plan.hold ?? 20) * 1000)) : counter ? counter.progress(value) : Math.min(1, reps / (plan.reps ?? 10)), seen: !!f, missing: pl.missing, turned: pl.turned, people });
      }
    };

    (async () => {
      try {
        resetTracking();
        if (fake) {
          body = await fakeBody(plan, sets[0], fake, sp);
          if (sets.some((s, i) => i > 0 && s !== sets[0])) {
            const second = await fakeBody(plan, sets[sets.length - 1], fake, sp);
            const first = body;
            body = (ms) => (sets[Math.min(k, sets.length - 1)] === sets[0] ? first(ms) : second(ms));
          }
        } else {
          const shared = props.stream?.active ? props.stream : null;
          if (!shared && !navigator.mediaDevices?.getUserMedia) throw new Error('nocamera');
          const [s, l] = await Promise.all([shared ? Promise.resolve(shared) : navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false }), loadPose()]);
          stream = s;
          ownStream = !shared;
          landmarker = l;
          if (stopped) return;
          const v = videoRef.current!;
          v.srcObject = s;
          await v.play();
          if (v.videoWidth && v.videoHeight) setRatio(`${v.videoWidth} / ${v.videoHeight}`);
        }
        if (stopped) return;
        // the 3D golfer shows the drill, the app reads the steps (at 3 m the words are too small)
        go('demo');
        const clip = props.clip;
        const steps = [...new Set((clip?.keys ?? []).map((x) => (x.label ? tr(x.label.en, x.label.de) : '')).filter((x) => x && !/other|andere/i.test(x)))].slice(0, 3);
        const how = plan.hold ? tr(`Hold ${plan.hold} seconds`, `${plan.hold} Sekunden halten`) : tr(`${plan.reps} times`, `${plan.reps}-mal`);
        const sideNote = plan.sides ? tr(', each side', ', jede Seite') : '';
        say(`${props.intro}. ${tr('Watch.', 'Schau zu.')} ${(steps.length ? steps : [t(props.drill.steps[0])]).join('. ')}. ${how}${sideNote}.`);
        const t0 = performance.now();
        const loop = clip ? (clip.length ?? clip.keys[clip.keys.length - 1].t) * 1000 : 0;
        const toFrame = () => {
          if (!fake && isSpeaking() && performance.now() - t0 < 25000) return later(toFrame, 200);
          go('frame');
          frameT0 = performance.now();
          say(`${tr('Now you.', 'Jetzt du.')} ${t(plan.where)}`);
        };
        later(toFrame, fake ? 700 : Math.min(9000, Math.max(5000, loop)));
        raf = requestAnimationFrame(tick);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        setError(
          m === 'simd'
            ? tr('This phone cannot run the body tracking (iOS 16.4 or newer needed).', 'Dieses Handy kann die Körpererkennung nicht ausführen (iOS 16.4 oder neuer nötig).')
            : m === 'nocamera' || /NotAllowed|Permission|denied/i.test(m)
              ? tr('No access to the camera. Allow the camera for this page in the settings.', 'Kein Zugriff auf die Kamera. Erlaube die Kamera für diese Seite in den Einstellungen.')
              : tr('The camera could not start.', 'Die Kamera konnte nicht starten.') + ` (${m})`,
        );
        go('error');
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      timers.forEach((x) => window.clearTimeout(x));
      if (ownStream) stream?.getTracks().forEach((x) => x.stop());
      void wake?.release().catch(() => {});
      stopSpeaking();
    };
    // a new attempt starts the drill again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // the result saves itself after a few seconds – the player stays where they are
  useEffect(() => {
    if (auto == null || phase !== 'result') return;
    if (auto <= 0) {
      setAuto(null);
      if (resultRef.current) props.onDone(resultRef.current);
      return;
    }
    const id = window.setTimeout(() => setAuto((a) => (a == null ? null : a - 1)), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, phase]);

  const unit = (v: number | null) => (plan.signal ? signalValueText(plan.signal, v, tr) : '–');
  const side = sets[Math.min(setIdx, sets.length - 1)];
  const setNo = sets.slice(0, setIdx + 1).filter((s) => s === side).length;
  const perSide = sets.filter((s) => s === side).length;
  const setLabel = [side ? sideWord(side) : '', perSide > 1 ? tr(`set ${setNo} of ${perSide}`, `Satz ${setNo} von ${perSide}`) : ''].filter(Boolean).join(' · ');

  if (phase === 'error')
    return (
      <section className="card mob-error" role="alert">
        <strong>{tr('Camera', 'Kamera')}</strong>
        <p>{error}</p>
        <div className="sheet-actions">
          <button type="button" className="btn-primary" onClick={() => setAttempt((a) => a + 1)}>
            {tr('Try again', 'Nochmal versuchen')}
          </button>
          <button type="button" className="btn-secondary" onClick={props.onSkip}>
            {tr('Skip the drill', 'Übung überspringen')}
          </button>
        </div>
      </section>
    );

  if (phase === 'result' && resultRef.current) {
    const r = resultRef.current;
    const vals = r.sets.map((x) => x.best).filter((v): v is number => v != null);
    const best = vals.length && plan.signal ? (SIGNALS[plan.signal].better === 'up' ? Math.max(...vals) : Math.min(...vals)) : null;
    const change = best != null && props.previous != null && plan.signal ? Math.round((best - props.previous) * 10) / 10 : null;
    const better = change != null && plan.signal ? (SIGNALS[plan.signal].better === 'up' ? change > 0 : change < 0) : false;
    return (
      <section className="mob-result coach mob-drill-result" aria-live="polite">
        <div className="card mob-outcome">
          <span className="eyebrow">{props.intro}</span>
          <strong className="mob-drill-done">{tr('Done', 'Fertig')}</strong>
          <div className="list">
            {r.sets.map((x, i) => (
              <div key={i} className="list-item mob-set-row">
                <span className="grow">
                  <span className="title">{[x.side ? sideWord(x.side) : tr('Set', 'Satz'), r.sets.filter((y) => y.side === x.side).length > 1 ? String(r.sets.slice(0, i + 1).filter((y) => y.side === x.side).length) : ''].filter(Boolean).join(' ')}</span>
                  <span className="muted small">{x.held != null ? tr(`${x.held} s held`, `${String(x.held).replace('.', ',')} s gehalten`) : tr(`${x.reps} of ${x.target} reps${x.seen ? ' (seen by the camera)' : ''}`, `${x.reps} von ${x.target} Wiederholungen${x.seen ? ' (von der Kamera gezählt)' : ''}`)}</span>
                  {/* the value under the count (a long one like "thighs 12° above parallel" squeezed the text beside it) */}
                  {x.best != null && plan.signal && plan.signal !== 'oneLeg' && <strong className="small mob-set-best">{unit(x.best)}</strong>}
                  {x.cues && <span className="small mob-cue-note">{cueText(x.cues)}</span>}
                </span>
              </div>
            ))}
          </div>
          {best != null && plan.signal && (
            <span className="small">
              {SELF_NAMED.includes(plan.signal) ? null : `${cap(t(SIGNALS[plan.signal].name))}: `}<strong>{unit(best)}</strong>
              {change != null && Math.abs(change) >= (SIGNALS[plan.signal].unit === '°' ? 3 : 1) && <span className={better ? ' good-text' : ' muted'}> · {tr(`${change > 0 ? '+' : '−'}${Math.abs(change)} since last time`, `${change > 0 ? '+' : '−'}${String(Math.abs(change)).replace('.', ',')} seit letztem Mal`)}</span>}
            </span>
          )}
        </div>
        <div className="sticky-cta">
          <button
            type="button"
            className="btn-primary mob-drill-next"
            onClick={() => {
              setAuto(null);
              props.onDone(r);
            }}
          >
            {tr('Next', 'Weiter')}
            {auto != null ? ` (${auto})` : ''}
          </button>
          <div className="mob-pills">
            {auto != null && (
              <button type="button" className="chip" onClick={() => setAuto(null)}>
                {tr('Wait', 'Anhalten')}
              </button>
            )}
            <button
              type="button"
              className="chip"
              onClick={() => {
                setAuto(null);
                resultRef.current = null;
                setSetIdx(0);
                setAttempt((a) => a + 1);
              }}
            >
              {tr('Repeat', 'Wiederholen')}
            </button>
            <button
              type="button"
              className="chip mob-pain-chip"
              onClick={() => {
                setAuto(null);
                props.onDone({ ...r, pain: true });
              }}
            >
              {tr('It hurt', 'Hat wehgetan')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const target = plan.reps ?? 10;
  const status =
    phase === 'starting'
      ? tr('Starting the camera …', 'Kamera startet …')
      : phase === 'demo'
        ? tr('Watch', 'Schau zu')
        : phase === 'frame'
          ? !live.seen
            ? tr('Step into the picture', 'Stell dich ins Bild')
            : live.missing
              ? tr('Step back – the whole body in the picture', 'Weiter zurück – der ganze Körper ins Bild')
              : live.turned === false
                ? plan.view === 'side'
                  ? tr('Turn side-on to the phone', 'Dreh dich seitlich zum Handy')
                  : tr('Turn face-on to the phone', 'Dreh dich frontal zum Handy')
                : tr('Get ready …', 'Bereit machen …')
          : phase === 'count'
            ? String(count)
            : phase === 'rest'
              ? side !== sets[Math.max(0, setIdx - 1)]
                ? tr('Other side', 'Andere Seite')
                : tr('Short break', 'Kurze Pause')
              : null;

  return (
    <section className="mob-camera coach mob-drill-player">
      <div className="mob-stage-wrap">
        {props.clip && (phase === 'demo' || (!demoOff && (phase === 'frame' || phase === 'count' || phase === 'run' || phase === 'rest'))) && (
          <div className={`mob-demo${phase === 'demo' ? ' big' : ''}`}>
            <Suspense fallback={null}>
              <Anim3D clip={props.clip} compact />
            </Suspense>
          </div>
        )}
        <div className={`mob-stage${!fake ? ' mirror' : ''}`} style={{ aspectRatio: ratio }}>
          {!fake && <video ref={videoRef} playsInline muted />}
          <canvas ref={canvasRef} aria-hidden="true" />
          {status && <div className={`mob-status${phase === 'count' ? ' big' : ''}`}>{status}</div>}
          {phase === 'run' && (
            <div className="mob-live mob-drill-live">
              <span className="mob-live-value">{holdMode ? `${Math.floor(live.held / 1000)} / ${plan.hold} s` : `${live.reps} / ${target}`}</span>
              {plan.signal && plan.signal !== 'oneLeg' && live.best != null && (
                <span className="small">
                  {tr('best', 'bester')} {unit(live.best)}
                </span>
              )}
              <span className="mob-hold" aria-hidden="true">
                <i style={{ width: `${Math.round(live.progress * 100)}%` }} />
              </span>
            </div>
          )}
          {phase === 'run' && cue && <div className="mob-cue" role="status">{t(CUES[cue])}</div>}
          {(live.people ?? 0) > 1 && <div className="mob-people">{tr('Several people in the picture – please step in alone', 'Mehrere Personen im Bild – bitte allein ins Bild')}</div>}
          <div className="mob-side-tag">{phase === 'demo' ? props.intro : [t(props.drill.name), setLabel].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="mob-camera-actions">
        <button type="button" className="btn-secondary" onClick={props.onSkip}>
          {tr('Skip', 'Überspringen')}
        </button>
        <button type="button" className="btn-secondary mob-coach-pause" onClick={props.onMenu}>
          {tr('Pause', 'Pause')}
        </button>
      </div>
    </section>
  );
}
