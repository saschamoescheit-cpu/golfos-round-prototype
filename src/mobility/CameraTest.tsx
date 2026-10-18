import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { isSpeaking, speak, stopSpeaking } from '../lib/caddietalk';
import { BONES, facingOf, makeAnalyzer, missingPoints, valueText, type Analyzer, type Cue, type Frame, type Lm, type Outcome } from './measure';
import { detect, loadPose, resetTracking } from './pose';
import type { Grade, Measurement, MetricKind, Side, TestDef } from './types';
import type { Clip } from './anim3d/scene';
import { loadGoal, position, targetPos, targetValue } from './profile';

const Anim3D = lazy(() => import('./Anim3D'));

/**
 * The trainer mode (Sascha 17.10.2026: "set the phone up once, tap once – the app shows each exercise in the selfie
 * camera, analyses in real time and leads me through the next ones"): one camera stream for the whole session, the 3D
 * golfer shows the test first, then the camera waits until the player stands right (face-on or side-on) and measures.
 */
export interface Coach {
  /** the camera of the session (opened once with the start tap); null = the test opens its own */
  stream: MediaStream | null;
  /** said and shown first, e.g. "Test 2 of 6: Single-leg balance" */
  intro: string;
  /** the test shown by the 3D golfer */
  demo?: Clip;
  /** pause (the menu of the session) and skip this test */
  onMenu: () => void;
  onSkip: () => void;
}

/** Once the tracking was too slow with the small golfer on, it stays off for the rest of the session (this phone). */
let phoneSlow = false;

/** Where to stand, in words – said after the demo. */
function placeText(test: TestDef): string {
  if (test.metric === 'bridge') return tr('Lie on your back side-on to the phone, the whole body in the picture.', 'Leg dich seitlich zum Handy auf den Rücken, der ganze Körper im Bild.');
  if (test.metric === 'trunkRotation') return tr('Sit face-on to the phone on a chair.', 'Setz dich frontal zum Handy auf einen Stuhl.');
  return test.view === 'side' ? tr('Stand side-on to the phone, the whole body in the picture.', 'Stell dich seitlich zum Handy, der ganze Körper im Bild.') : tr('Stand face-on to the phone, the whole body in the picture.', 'Stell dich frontal zum Handy, der ganze Körper im Bild.');
}

// A camera test (Sascha 17.10.2026: "the user sees the exercise on the phone, copies it, and the app analyses the
// mobility"). The phone stands 2–3 m away, so the app talks: it says when the whole body is in the picture, counts
// down, says what to do and when it is done. The skeleton over the video shows what the camera sees; the lines the
// test measures are drawn in green. Nothing is recorded or sent – the pictures stay in the phone's memory.

type Phase = 'starting' | 'demo' | 'frame' | 'count' | 'run' | 'result' | 'error';

let audio: AudioContext | null = null;
let silence: HTMLAudioElement | null = null;
/** 50 ms of silence (8 kHz, 8 bit, mono WAV) as a data: address */
const SILENCE = (() => {
  const n = 400;
  const b = new Uint8Array(44 + n);
  const v = new DataView(b.buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, n, true);
  b.fill(128, 44);
  return 'data:audio/wav;base64,' + btoa(String.fromCharCode(...b));
})();
/** Call in the tap that starts the camera: iOS only plays sound after a tap. */
export function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
    // an empty utterance unlocks speech on iOS
    const s = window.speechSynthesis;
    if (s) s.speak(new SpeechSynthesisUtterance(' '));
    // a moment of silence through an <audio> element, played in the tap: the iPhone then plays the page like a media
    // app – the voice and the beeps are heard with the ring switch on silent (as the caddie in Rounds does)
    silence ??= new Audio(SILENCE);
    silence.currentTime = 0;
    void silence.play().catch(() => undefined);
  } catch {
    /* no sound – the screen still shows everything */
  }
}
function beep(freq = 880, ms = 130): void {
  try {
    if (!audio) return;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.18;
    o.connect(g);
    g.connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  } catch {
    /* no sound */
  }
}

/** What the player has to do in this test on this side – said before the countdown. */
export function sideText(kind: MetricKind, side: Side | null): string {
  const l = side === 'left';
  const dir = l ? tr('to the left', 'nach links') : tr('to the right', 'nach rechts');
  const leg = l ? tr('left leg', 'linken Bein') : tr('right leg', 'rechten Bein');
  switch (kind) {
    case 'trunkRotation':
      return tr(`Turn the chest ${dir}.`, `Brust ${dir} drehen.`);
    case 'neck':
      return tr(`Turn the head ${dir}.`, `Kopf ${dir} drehen.`);
    case 'balance':
      return tr(`Stand on the ${leg}.`, `Auf dem ${leg} stehen.`);
    case 'lowerQuarter':
      return tr(`All your weight on the ${leg}.`, `Das ganze Gewicht auf dem ${leg}.`);
    case 'bridge':
      return l ? tr('Stretch the left leg.', 'Das linke Bein strecken.') : tr('Stretch the right leg.', 'Das rechte Bein strecken.');
    case 'shoulder9090':
      return l ? tr('The left arm towards the phone.', 'Der linke Arm zum Handy.') : tr('The right arm towards the phone.', 'Der rechte Arm zum Handy.');
    case 'squat':
      return tr('Arms straight up overhead.', 'Arme gestreckt über den Kopf.');
    case 'toeTouch':
      return tr('Feet together, knees straight.', 'Füße zusammen, Knie gestreckt.');
    case 'pelvicRotation':
      return tr('Golf posture, arms crossed.', 'Golfhaltung, Arme verschränkt.');
    case 'lat':
      return tr('Back to the wall, arms straight forward.', 'Rücken an die Wand, Arme gestreckt nach vorn.');
  }
}

const CUE_TEXT = (kind: MetricKind, cue: Cue): string | null => {
  if (cue === 'done') return tr('Done.', 'Fertig.');
  if (cue === 'eyes') return tr('Eyes closed.', 'Augen zu.');
  if (cue === 'hold') return tr('Hold.', 'Halten.');
  if (cue === 'otherLeg') return tr('The other leg, please.', 'Bitte das andere Bein.');
  switch (kind) {
    case 'trunkRotation':
    case 'neck':
      return tr('Now turn – and back.', 'Jetzt drehen – und zurück.');
    case 'pelvicRotation':
      return tr('Now turn the hips, left and right.', 'Jetzt die Hüfte drehen, links und rechts.');
    case 'lowerQuarter':
      return tr('Now turn, both ways.', 'Jetzt drehen, zu beiden Seiten.');
    case 'squat':
      return tr('Now squat down deep.', 'Jetzt tief in die Hocke.');
    case 'toeTouch':
      return tr('Now reach for the toes.', 'Jetzt zu den Zehen.');
    case 'lat':
      return tr('Now raise the arms.', 'Jetzt die Arme heben.');
    case 'shoulder9090':
      return tr('Now turn the forearm back.', 'Jetzt den Unterarm nach hinten drehen.');
    default:
      return null;
  }
};

/** Seconds until a result is saved by itself (the player does not have to walk to the phone). */
const AUTO_SAVE_S = 6;

/** A test with calibration first (the player stands still facing the phone, then moves). */
const CALIBRATES: MetricKind[] = ['trunkRotation', 'pelvicRotation', 'lowerQuarter', 'neck'];

const fakeLevel = (): 'good' | 'stiff' | null => {
  try {
    const v = localStorage.getItem('golfos.mobility.fake');
    return v === 'good' || v === 'stiff' ? v : null;
  } catch {
    return null;
  }
};
/** QA: a synthetic player or a photo instead of the camera – the trainer mode then opens no camera itself */
export const isFakeCamera = (): boolean => !!(fakeLevel() || fakeImage());

const fakeImage = (): string | null => {
  try {
    return localStorage.getItem('golfos.mobility.fakeImage');
  } catch {
    return null;
  }
};
const fakeSpeed = (): number => {
  try {
    return Number(localStorage.getItem('golfos.mobility.fakeSpeed')) || 1;
  } catch {
    return 1;
  }
};

export function gradeName(g: Grade): string {
  return g === 'pass' ? tr('Passed', 'Bestanden') : g === 'limited' ? tr('Limited', 'Eingeschränkt') : tr('Not passed', 'Nicht bestanden');
}

/** The change since last time in words, and whether it is better (lower is better for the toe touch and the 90/90). */
function sinceText(kind: MetricKind, now: number, before: Measurement): { text: string; better: boolean | null } {
  const d = Math.round((now - (before.value ?? 0)) * 10) / 10;
  const lowerBetter = kind === 'toeTouch' || kind === 'shoulder9090';
  const unit = kind === 'toeTouch' ? ' cm' : kind === 'balance' || kind === 'bridge' ? ' s' : '°';
  const date = new Date(before.at).toLocaleDateString(tr('en-GB', 'de-DE'), { day: 'numeric', month: 'short' });
  const was = valueText(kind, before.value, tr);
  if (Math.abs(d) < (unit === '°' ? 3 : 1)) return { text: tr(`As on ${date} (${was})`, `Wie am ${date} (${was})`), better: null };
  const n = `${d > 0 ? '+' : '−'}${String(Math.abs(d)).replace('.', tr('.', ','))}${unit}`;
  return { text: tr(`${n} since ${date} (${was})`, `${n} seit ${date} (${was})`), better: lowerBetter ? d < 0 : d > 0 };
}

export function CameraTest(props: { test: TestDef; side: Side | null; previous?: Measurement; variant?: 'handsBehind'; coach?: Coach; onResult: (m: Measurement) => void; onSelf: () => void; onCancel: () => void }) {
  const kind = props.test.metric!;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shotRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [count, setCount] = useState(3);
  const [live, setLive] = useState<{ value: number | null; best: number | null; hold?: number; missing: number; seen: boolean; calibrating?: boolean; people?: number; turned?: boolean }>({ value: null, best: null, missing: 0, seen: false });
  const [outcome, setOutcome] = useState<Outcome | null | undefined>(undefined);
  const finishRef = useRef<(() => void) | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [attempt, setAttempt] = useState(0);
  // hands-free (17./18.10.2026): the result is said aloud and saved after a few seconds – the player stays in position
  const [auto, setAuto] = useState<number | null>(null);
  const [ratio, setRatio] = useState('9 / 16');
  const [demoOff, setDemoOff] = useState(phoneSlow);
  const fake = fakeLevel();

  const phaseRef = useRef<Phase>('starting');
  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    // the session's camera stays on between the tests; only a stream the test opened itself is stopped
    let ownStream = true;
    // the player stands 2–3 m away for minutes: the screen must not lock meanwhile (Safari 16.4+)
    let wake: { release: () => Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request('screen')
      .then((w) => (stopped ? void w.release() : (wake = w)))
      .catch(() => {});
    let analyzer: Analyzer | null = null;
    let framedSince = -1;
    let lastUi = 0;
    let lastDetect = 0;
    let lastShot = 0;
    let lastBest: number | null = null;
    let spokenSec = -1;
    let fakeT0 = 0;
    let fakeScript: { ms: number; at: (t: number) => Lm[] } | null = null;
    let finished = false;
    const speed = fakeSpeed();
    const sideParam = props.side ?? 'left';
    const say = (text: string | null) => {
      if (text && !fake) speak(text);
    };

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
      if (stillCanvas) g.drawImage(stillCanvas, 0, 0, w, h);
      if (!lm) return;
      const focus = new Set((analyzer?.focus() ?? []).map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
      const p = (i: number) => [lm[i].x * w, lm[i].y * h] as const;
      g.lineCap = 'round';
      for (const [a, b] of BONES) {
        if ((lm[a].v ?? 1) < 0.4 || (lm[b].v ?? 1) < 0.4) continue;
        const on = focus.has(`${Math.min(a, b)}-${Math.max(a, b)}`);
        g.strokeStyle = on ? '#9bc53d' : framed ? 'rgba(255,255,255,0.75)' : 'rgba(255,107,94,0.8)';
        g.lineWidth = (on ? 9 : 4) * (w / 720);
        const [x1, y1] = p(a);
        const [x2, y2] = p(b);
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
      g.fillStyle = '#ffffff';
      for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
        if ((lm[i].v ?? 1) < 0.4) continue;
        const [x, y] = p(i);
        g.beginPath();
        g.arc(x, y, 5 * (w / 720), 0, Math.PI * 2);
        g.fill();
      }
    };

    /** the picture of the best moment: the video with the skeleton (for the result) */
    const takeShot = () => {
      const c = canvasRef.current;
      const vEl = videoRef.current;
      if (!c) return;
      const s = (shotRef.current ??= document.createElement('canvas'));
      const k = Math.min(1, 480 / c.width);
      s.width = Math.round(c.width * k);
      s.height = Math.round(c.height * k);
      const g = s.getContext('2d');
      if (!g) return;
      g.save();
      if (facing === 'user' && !fake) {
        g.translate(s.width, 0);
        g.scale(-1, 1);
      }
      if (!fake && vEl && vEl.readyState >= 2) g.drawImage(vEl, 0, 0, s.width, s.height);
      g.drawImage(c, 0, 0, s.width, s.height);
      g.restore();
    };

    const finish = () => {
      if (stopped || finished) return;
      finished = true;
      const out = analyzer?.finish() ?? null;
      setOutcome(out);
      if (shotRef.current && out) setShot(shotRef.current.toDataURL('image/jpeg', 0.8));
      go('result');
      if (out) {
        // the value, no grade (Sascha 18.10.2026: measuring, not grading)
        say(`${valueText(kind, out.value, tr)}.`);
        setAuto(props.coach ? 4 : AUTO_SAVE_S);
      } else say(tr('Not recognised. Please try again.', 'Nicht erkannt. Bitte nochmal.'));
      // the camera goes off with the result (a new attempt starts it again)
      stopped = true;
      cancelAnimationFrame(raf);
      if (ownStream) stream?.getTracks().forEach((t) => t.stop());
    };
    finishRef.current = finish;

    const tick = () => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      // about 30 pictures a second are plenty – the phone stays cool and the screen smooth
      if (performance.now() - lastDetect < 30) return;
      lastDetect = performance.now();
      // trainer mode: the small 3D golfer and the body tracking share the phone – if tracking drops under 12 pictures a
      // second, the golfer goes away while measuring (accuracy first)
      rateN++;
      if (lastDetect - rateT0 > 3000) {
        if (props.coach && !fake && !stillCanvas && rateN / ((lastDetect - rateT0) / 1000) < 12 && (phaseRef.current === 'frame' || phaseRef.current === 'run')) {
          phoneSlow = true;
          setDemoOff(true);
        }
        rateT0 = lastDetect;
        rateN = 0;
      }
      let lm: Lm[] | null = null;
      let people = lm ? 1 : 0;
      let w = 720;
      let h = 1280;
      const now = performance.now();
      if (fakeScript) {
        const t = (now - fakeT0) * speed;
        lm = fakeScript.at(Math.min(t, fakeScript.ms));
      } else if (stillCanvas) {
        // QA: a photo instead of the camera (golfos.mobility.fakeImage) – the real pose model on a real person
        if (!landmarker) return;
        w = stillCanvas.width;
        h = stillCanvas.height;
        const d = detect(landmarker, stillCanvas);
        lm = d.lm;
        people = d.people;
      } else {
        const v = videoRef.current;
        if (!v || v.readyState < 2 || !landmarker) return;
        w = v.videoWidth;
        h = v.videoHeight;
        const d = detect(landmarker, v);
        lm = d.lm;
        people = d.people;
      }
      const t = fakeScript ? (now - fakeT0) * speed : now;
      const f: Frame | null = lm ? { lm, w, h, t } : null;
      const missing = f ? missingPoints(kind, f).length : 99;
      const want = kind === 'bridge' ? null : (props.test.view ?? null);
      const facingNow = f ? facingOf(f) : null;
      const turned = !want || facingNow === want;
      const framed = !!f && missing === 0 && turned;
      draw(lm, w, h, framed || phaseRef.current === 'run');
      const ph = phaseRef.current;
      if (ph === 'frame') {
        if (framed) {
          if (framedSince < 0) framedSince = now;
          if (now - framedSince > (fake ? 300 : 1000)) startCountdown();
        } else framedSince = -1;
        // spoken help, at most every 7 s: turn the right way, or step back
        const wrong = !!f && missing === 0 && !turned;
        wrongSince = wrong ? (wrongSince < 0 ? now : wrongSince) : -1;
        missSince = f && missing > 0 ? (missSince < 0 ? now : missSince) : -1;
        if (now - lastHint > 7000) {
          if (wrongSince >= 0 && now - wrongSince > 1500) {
            lastHint = now;
            say(want === 'side' ? tr('Turn side-on to the phone.', 'Dreh dich seitlich zum Handy.') : tr('Turn face-on to the phone.', 'Dreh dich frontal zum Handy.'));
          } else if (missSince >= 0 && now - missSince > 5000) {
            lastHint = now;
            say(tr('Step back – the whole body in the picture.', 'Weiter zurück – der ganze Körper ins Bild.'));
          }
        }
      }
      if (ph === 'run' && f && analyzer) {
        const l = analyzer.push(f);
        if (l.cue) say(l.cue === 'go' && CALIBRATES.includes(kind) ? CUE_TEXT(kind, 'go') : l.cue === 'go' ? null : CUE_TEXT(kind, l.cue));
        if (l.cue === 'go' || l.cue === 'eyes' || l.cue === 'hold') beep(l.cue === 'go' ? 1180 : 760, 180);
        // the seconds of a hold, every 5 s
        if (l.phase === 'hold' && l.value != null) {
          const sec = Math.floor(l.value);
          if (sec > 0 && sec % 5 === 0 && sec !== spokenSec) {
            spokenSec = sec;
            say(String(sec));
          }
        }
        if (l.best != null && l.best !== lastBest && now - lastShot > 250) {
          lastBest = l.best;
          lastShot = now;
          takeShot();
        }
        if (now - lastUi > 100 || l.phase === 'done') {
          lastUi = now;
          setLive({ value: l.value, best: l.best, hold: l.hold, missing, seen: true, calibrating: l.phase === 'calibrate', people });
        }
        if (l.phase === 'done') {
          beep(1400, 260);
          window.setTimeout(finish, 600);
          go('result');
          phaseRef.current = 'result';
        }
      } else if (now - lastUi > 150 && ph !== 'result') {
        lastUi = now;
        setLive((x) => ({ ...x, missing, seen: !!f, people, turned }));
      }
      if (fakeScript && (now - fakeT0) * speed > fakeScript.ms + 500 && phaseRef.current === 'run') finish();
    };

    let countTimer = 0;
    let rateT0 = performance.now();
    let rateN = 0;
    let demoTimer = 0;
    let wrongSince = -1;
    let missSince = -1;
    let lastHint = 0;
    const startCountdown = () => {
      go('count');
      analyzer = makeAnalyzer(kind, sideParam, { noArms: props.variant === 'handsBehind' });
      const instruction = `${props.variant === 'handsBehind' ? tr('Hands behind the head.', 'Hände hinter den Kopf.') : sideText(kind, props.side)} ${CALIBRATES.includes(kind) ? tr('Look at the phone and hold still.', 'Schau zum Handy und halte still.') : ''}`;
      say(instruction);
      // wait for the sentence (max 6 s), then 3 – 2 – 1
      const t0 = performance.now();
      const waitSpeech = () => {
        if (stopped) return;
        if (!fake && isSpeaking() && performance.now() - t0 < 6000) {
          countTimer = window.setTimeout(waitSpeech, 150);
          return;
        }
        let n = 3;
        setCount(n);
        beep(660);
        const step = () => {
          if (stopped) return;
          n--;
          if (n > 0) {
            setCount(n);
            beep(660);
            countTimer = window.setTimeout(step, fake ? 100 : 1000);
          } else {
            if (fakeScript) fakeT0 = performance.now();
            go('run');
            if (!CALIBRATES.includes(kind)) {
              say(CUE_TEXT(kind, 'go') ?? tr('Go.', 'Los.'));
              beep(1180, 180);
            }
          }
        };
        countTimer = window.setTimeout(step, fake ? 100 : 1000);
      };
      waitSpeech();
    };

    let landmarker: Awaited<ReturnType<typeof loadPose>> | null = null;
    let stillCanvas: HTMLCanvasElement | null = null;
    let stillImage: string | null = null;
    void stillImage;
    (async () => {
      try {
        resetTracking();
        const still = fakeImage();
        if (still) {
          const img = new Image();
          img.src = still;
          await img.decode();
          stillCanvas = document.createElement('canvas');
          stillCanvas.width = img.naturalWidth;
          stillCanvas.height = img.naturalHeight;
          stillCanvas.getContext('2d')!.drawImage(img, 0, 0);
          landmarker = await loadPose();
          stillImage = still;
        } else if (fake) {
          const { script } = await import('./synth');
          fakeScript = script(kind, sideParam, fake);
          fakeT0 = performance.now();
        } else {
          const shared = props.coach?.stream?.active ? props.coach.stream : null;
          if (!shared && !navigator.mediaDevices?.getUserMedia) throw new Error('nocamera');
          const [s, l] = await Promise.all([shared ? Promise.resolve(shared) : navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false }), loadPose()]);
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
        if (props.coach) {
          // the 3D golfer shows the test first (about one loop), then: "Now you" and where to stand
          go('demo');
          const clip = props.coach.demo;
          // what the golfer does, read out while it shows it – at 3 m the words in the picture are too small (the steps
          // of the clip, up to three, not the "then the other side" ones)
          const steps = [...new Set((clip?.keys ?? []).map((x) => (x.label ? tr(x.label.en, x.label.de) : '')).filter((x) => x && !/other|andere/i.test(x) && !(props.side && /\b(left|right|links|rechts|linke|rechte|linken|rechten)\b/i.test(x))))].slice(0, 3);
          say(`${props.coach.intro}. ${tr('Watch.', 'Schau zu.')} ${steps.join('. ')}`);
          const t0 = performance.now();
          const loop = clip ? (clip.length ?? clip.keys[clip.keys.length - 1].t) * 1000 : 0;
          const toFrame = () => {
            if (stopped) return;
            if (!fake && isSpeaking() && performance.now() - t0 < 20000) {
              demoTimer = window.setTimeout(toFrame, 200);
              return;
            }
            go('frame');
            say(`${tr('Now you.', 'Jetzt du.')} ${placeText(props.test)}`);
          };
          demoTimer = window.setTimeout(toFrame, fake ? 700 : Math.min(8000, Math.max(4500, loop)));
        } else {
          go('frame');
          say(tr('Step back until your whole body is in the picture.', 'Geh so weit zurück, bis dein ganzer Körper im Bild ist.'));
        }
        raf = requestAnimationFrame(tick);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        setError(
          m === 'simd'
            ? tr('This phone cannot run the body tracking (iOS 16.4 or newer needed).', 'Dieses Handy kann die Körpererkennung nicht ausführen (iOS 16.4 oder neuer nötig).')
            : m === 'nocamera' || /NotAllowed|Permission|denied/i.test(m)
              ? tr('No access to the camera. Allow the camera for this page in the settings, or judge the test yourself.', 'Kein Zugriff auf die Kamera. Erlaube die Kamera für diese Seite in den Einstellungen oder schätze den Test selbst ein.')
              : tr('The camera could not start.', 'Die Kamera konnte nicht starten.') + ` (${m})`,
        );
        go('error');
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(countTimer);
      window.clearTimeout(demoTimer);
      if (ownStream) stream?.getTracks().forEach((t) => t.stop());
      void wake?.release().catch(() => {});
      stopSpeaking();
    };
    // a new attempt or the other camera starts again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, facing]);

  const retry = () => {
    setAuto(null);
    setOutcome(undefined);
    setShot(null);
    setLive({ value: null, best: null, missing: 0, seen: false });
    shotRef.current = null;
    go('starting');
    setAttempt((a) => a + 1);
  };

  const save = (o: Outcome) => props.onResult({ value: o.value, grade: o.grade, source: 'camera', notes: o.notes.length ? o.notes : undefined, at: new Date().toISOString() });
  useEffect(() => {
    if (auto == null || !outcome) return;
    if (auto <= 0) {
      setAuto(null);
      save(outcome);
      return;
    }
    const t = window.setTimeout(() => setAuto((a) => (a == null ? null : a - 1)), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, outcome]);

  const unit = (v: number | null) => (v == null ? '–' : kind === 'toeTouch' ? `${Math.max(0, Math.round(v))} cm` : kind === 'balance' || kind === 'bridge' ? `${v.toFixed(1).replace('.', tr('.', ','))} s` : `${Math.round(v)}°`);

  if (phase === 'error')
    return (
      <section className="card mob-error" role="alert">
        <strong>{tr('Camera', 'Kamera')}</strong>
        <p>{error}</p>
        <div className="sheet-actions">
          <button type="button" className="btn-primary" onClick={props.onSelf}>
            {tr('Judge it myself', 'Selbst einschätzen')}
          </button>
          <button type="button" className="btn-secondary" onClick={retry}>
            {tr('Try again', 'Nochmal versuchen')}
          </button>
          <button type="button" className="btn-secondary" onClick={props.onCancel}>
            {tr('Back', 'Zurück')}
          </button>
        </div>
      </section>
    );

  if (phase === 'result' && outcome !== undefined) {
    const done = outcome;
    return (
      <section className={`mob-result${props.coach ? ' coach' : ''}`} aria-live="polite">
        {!done ? (
          <div className="card">
            <strong>{tr('The movement was not recognised', 'Die Bewegung wurde nicht erkannt')}</strong>
            <p className="muted">{tr('Stand so that the whole body is in the picture and move a little slower.', 'Stell dich so, dass der ganze Körper im Bild ist, und beweg dich etwas langsamer.')}</p>
          </div>
        ) : (
          <div className={`card mob-outcome ${done.grade}`}>
            {shot && <img className="mob-shot" src={shot} alt={tr('Your best moment with the measured lines', 'Dein bester Moment mit den gemessenen Linien')} />}
            <div className="mob-outcome-head">
              <span className="grow">
                <strong className="mob-value">{valueText(kind, done.value, tr)}</strong>
                {done.value != null && (
                  <span className="mob-levelbar" role="img" aria-label={tr('on the scale from little to a lot of movement', 'auf der Skala von wenig bis viel Bewegung')}>
                    <i style={{ width: `${Math.max(4, position(kind, done.value) * 100)}%` }} />
                    <b style={{ left: `${targetPos(props.test, loadGoal()) * 100}%` }} />
                  </span>
                )}
                <span className="small muted">
                  {tr('Your goal asks for about', 'Dein Ziel braucht etwa')} {valueText(kind, targetValue(props.test, loadGoal()), tr)}
                </span>
              </span>
            </div>
            {props.previous && kind && done.value != null && (() => {
              const since = sinceText(kind, done.value, props.previous);
              return <span className={`small mob-since${since.better ? ' better' : ''}`}>{since.text}</span>;
            })()}
            {done.notes.length > 0 && (
              <ul className="mob-notes">
                {done.notes.map((n, i) => (
                  <li key={i}>{n[trLang()]}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="sticky-cta">
          {done ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setAuto(null);
                save(done);
              }}
            >
              {tr('Save and continue', 'Speichern und weiter')}
              {auto != null ? ` (${auto})` : ''}
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={retry}>
              {tr('Try again', 'Nochmal versuchen')}
            </button>
          )}
          <div className="mob-pills">
            {auto != null && (
              <button type="button" className="chip" onClick={() => setAuto(null)}>
                {tr('Wait', 'Anhalten')}
              </button>
            )}
            {done && (
              <button type="button" className="chip" onClick={retry}>
                {tr('Repeat', 'Wiederholen')}
              </button>
            )}
            <button
              type="button"
              className="chip"
              onClick={() => {
                setAuto(null);
                props.onSelf();
              }}
            >
              {tr('Judge it myself', 'Selbst einschätzen')}
            </button>
            <button
              type="button"
              className="chip mob-pain-chip"
              onClick={() => {
                setAuto(null);
                props.onResult({ value: done ? done.value : null, grade: 'fail', source: done ? 'camera' : 'self', pain: true, at: new Date().toISOString() });
              }}
            >
              {tr('It hurt', 'Hat wehgetan')}
            </button>
          </div>
        </div>
      </section>
    );
  }

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
              ? props.test.view === 'side'
                ? tr('Turn side-on to the phone', 'Dreh dich seitlich zum Handy')
                : tr('Turn face-on to the phone', 'Dreh dich frontal zum Handy')
              : tr('Hold still …', 'Still halten …')
        : phase === 'count'
          ? String(count)
          : phase === 'result'
            ? tr('Done', 'Fertig')
            : phase === 'run' && live.calibrating
              ? tr('Hold still …', 'Still halten …')
              : phase === 'run' && live.value == null && (kind === 'balance' || kind === 'bridge')
                ? kind === 'balance'
                  ? tr('Lift the knee', 'Knie heben')
                  : tr('Lift the hips, stretch the leg', 'Hüfte heben, Bein strecken')
                : null;

  return (
    <section className={`mob-camera${props.coach ? ' coach' : ''}`}>
      <div className="mob-stage-wrap">
      {props.coach?.demo && (phase === 'demo' || (!demoOff && (phase === 'frame' || phase === 'count' || phase === 'run'))) && (
        <div className={`mob-demo${phase === 'demo' ? ' big' : ''}`}>
          <Suspense fallback={null}>
            <Anim3D clip={props.coach.demo} compact />
          </Suspense>
        </div>
      )}
      <div className={`mob-stage${facing === 'user' && !fake && !fakeImage() ? ' mirror' : ''}`} style={{ aspectRatio: ratio }}>
        {!fake && <video ref={videoRef} playsInline muted />}
        <canvas ref={canvasRef} aria-hidden="true" />
        {status && <div className={`mob-status${phase === 'count' ? ' big' : ''}`}>{status}</div>}
        {phase === 'run' && live.value != null && (
          <div className="mob-live">
            <span className="mob-live-value">{unit(live.value)}</span>
            {live.best != null && kind !== 'balance' && kind !== 'bridge' && (
              <span className="small">
                {tr('best', 'bester')} {unit(live.best)}
              </span>
            )}
            {live.hold != null && (
              <span className="mob-hold" aria-hidden="true">
                <i style={{ width: `${Math.min(100, Math.round(live.hold * 100))}%` }} />
              </span>
            )}
          </div>
        )}
        {(live.people ?? 0) > 1 && <div className="mob-people">{tr('Several people in the picture – please step in alone', 'Mehrere Personen im Bild – bitte allein ins Bild')}</div>}
        <div className="mob-side-tag">{props.variant === 'handsBehind' ? tr('Retest: hands behind the head', 'Nachtest: Hände hinter dem Kopf') : props.coach && phase === 'demo' ? props.coach.intro : props.side ? sideText(kind, props.side) : props.test.name[trLang()]}</div>
      </div>
      </div>
      {phase !== 'run' && !props.coach && <p className="muted small mob-private">{tr('The picture stays on your phone – nothing is recorded or sent.', 'Das Bild bleibt auf deinem Handy – nichts wird aufgenommen oder gesendet.')}</p>}
      {props.coach ? (
        <div className="mob-camera-actions">
          {phase === 'run' ? (
            <button type="button" className="btn-primary" onClick={() => finishRef.current?.()}>
              {tr('Done', 'Fertig')}
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={props.coach.onSkip}>
              {tr('Skip', 'Überspringen')}
            </button>
          )}
          <button type="button" className="btn-secondary mob-coach-pause" onClick={props.coach.onMenu}>
            {tr('Pause', 'Pause')}
          </button>
        </div>
      ) : (
      <div className="mob-camera-actions">
        {phase === 'run' ? (
          <button type="button" className="btn-primary" onClick={() => finishRef.current?.()}>
            {tr('Done', 'Fertig')}
          </button>
        ) : (
          !fake && (
            <button type="button" className="btn-secondary" onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}>
              {facing === 'user' ? tr('Use the back camera', 'Rückkamera nutzen') : tr('Use the front camera', 'Frontkamera nutzen')}
            </button>
          )
        )}
        <button type="button" className="btn-secondary" onClick={props.onCancel}>
          {tr('Cancel', 'Abbrechen')}
        </button>
      </div>
      )}
    </section>
  );
}

function trLang(): 'en' | 'de' {
  return tr('en', 'de') as 'en' | 'de';
}
