import { useEffect, useRef, useState } from 'react';
import { getLang, tr } from '../lib/i18n';

// The built-in metronome (Sascha 16.10.2026: "rhythm is the most important thing for distance control – use it
// right in the app"). Two modes:
// - putting: two sounds alternate, "tick" (high) = end of the backswing, "tock" (low) = impact;
// - full swing (Tour Tempo, John Novosel): three sounds – start back, top, impact – in a 3 : 1 ratio, then a pause
//   to finish and set up again.
// The sounds are scheduled ahead on the audio clock, so the beat stays exact even when the page is busy.
// The tempo is a per-device preference (kept in localStorage); the screen stays on while it plays.

export type MetronomeMode = 'putt' | 'swing';

const KEY = 'golfos.training.bpm.v1';
const SWING_KEY = 'golfos.training.swingtempo.v1';
const MIN = 50;
const MAX = 110;
const PRESETS = [72, 76, 80, 84];
/** Tour Tempo in video frames at 30 per second: back / down – always 3 : 1. */
const SWING = [
  { id: '18/6', back: 0.6, down: 0.2, label: () => tr('fast', 'schnell') },
  { id: '21/7', back: 0.7, down: 7 / 30, label: () => tr('tour', 'Tour') },
  { id: '24/8', back: 0.8, down: 8 / 30, label: () => tr('medium', 'mittel') },
  { id: '27/9', back: 0.9, down: 0.3, label: () => tr('calm', 'ruhig') },
];
const PAUSE = 3; // seconds after impact to finish and set up for the next swing

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const keep = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode – the tempo is just not remembered */
  }
};
function loadBpm(): number {
  const n = Number(read(KEY));
  return n >= MIN && n <= MAX ? n : 76;
}
const loadSwing = () => SWING.find((s) => s.id === read(SWING_KEY)) ?? SWING[2];
const sec = (v: number) => (getLang() === 'de' ? v.toFixed(2).replace('.', ',') : v.toFixed(2));

type Sentinel = { release: () => Promise<void> };
type Pattern = { at: number[]; pitch: number[]; cycle: number };

export function Metronome(props: { compact?: boolean; mode?: MetronomeMode }) {
  const mode = props.mode ?? 'putt';
  const [bpm, setBpmState] = useState(loadBpm);
  const [swing, setSwingState] = useState(loadSwing);
  const [on, setOn] = useState(false);
  const [beat, setBeat] = useState<number | null>(null);
  const pattern = (): Pattern =>
    mode === 'swing'
      ? { at: [0, swing.back, swing.back + swing.down], pitch: [1100, 1500, 800], cycle: swing.back + swing.down + PAUSE }
      : { at: [0, 60 / bpm], pitch: [1500, 900], cycle: 120 / bpm };
  const patternRef = useRef(pattern());
  patternRef.current = pattern();
  const ctxRef = useRef<AudioContext | null>(null);

  // the audio has to be started in the tap itself (iPhone); without Web Audio the beat is only shown
  const [mute, setMute] = useState(false);
  const start = () => {
    try {
      // iPhone: play even when the ring/silent switch is on (Safari 17+)
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!ctxRef.current && Ctx) ctxRef.current = new Ctx();
      void ctxRef.current?.resume();
    } catch {
      ctxRef.current = null;
    }
    setMute(!ctxRef.current);
    setOn(true);
  };

  const setBpm = (n: number) => {
    const v = Math.max(MIN, Math.min(MAX, Math.round(n)));
    setBpmState(v);
    keep(KEY, String(v));
  };
  const setSwing = (s: (typeof SWING)[number]) => {
    setSwingState(s);
    keep(SWING_KEY, s.id);
  };

  // the scheduler: every 25 ms, plan the sounds of the next 120 ms on the audio clock (or the page clock)
  useEffect(() => {
    if (!on) return;
    const audio = ctxRef.current;
    const now = () => (audio ? audio.currentTime : performance.now() / 1000);
    let cycleStart = now() + 0.15;
    let i = 0;
    const timers = new Set<number>();
    const click = (at: number, pitch: number) => {
      if (!audio) return navigator.vibrate?.(pitch > 1200 ? 30 : 15);
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = pitch;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(pitch > 1200 ? 0.5 : 0.4, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      o.connect(g).connect(audio.destination);
      o.start(at);
      o.stop(at + 0.07);
    };
    const tickTimer = window.setInterval(() => {
      const p = patternRef.current;
      while (cycleStart + p.at[i] < now() + 0.12) {
        const at = cycleStart + p.at[i];
        const k = i;
        const pitch = p.pitch[k];
        if (audio) click(at, pitch);
        const id = window.setTimeout(() => {
          timers.delete(id);
          if (!audio) click(at, pitch);
          setBeat(k);
        }, Math.max(0, (at - now()) * 1000));
        timers.add(id);
        i++;
        if (i >= p.at.length) {
          i = 0;
          cycleStart += p.cycle;
        }
      }
    }, 25);
    return () => {
      window.clearInterval(tickTimer);
      timers.forEach((x) => window.clearTimeout(x));
      setBeat(null);
    };
  }, [on]);

  // keep the screen on while it plays; stop when the page goes to the background
  useEffect(() => {
    if (!on) return;
    const api = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
    let lock: Sentinel | null = null;
    let alive = true;
    api
      ?.request('screen')
      .then((l) => (alive ? (lock = l) : void l.release()))
      .catch(() => {});
    const onHide = () => document.visibilityState === 'hidden' && setOn(false);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onHide);
      void lock?.release().catch(() => {});
    };
  }, [on]);

  // close the audio when the metronome leaves the screen
  useEffect(
    () => () => {
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    },
    [],
  );

  const lights = mode === 'swing' ? 3 : 2;
  return (
    <section className={`card tr-metronome${props.compact ? ' compact' : ''}`} aria-label={mode === 'swing' ? tr('Swing tempo', 'Schwung-Tempo') : tr('Metronome', 'Metronom')}>
      <div className="tr-metro-head">
        <span className="eyebrow">{mode === 'swing' ? tr('Swing tempo 3 : 1', 'Schwung-Tempo 3 : 1') : tr('Metronome', 'Metronom')}</span>
        <span className="muted small">
          {mode === 'swing'
            ? tr('1st sound: start back · 2nd: top · 3rd: impact', '1. Ton: zurück · 2. Ton: oben · 3. Ton: Treffmoment')
            : tr('tick = top of the backswing · tock = impact', 'Tick = oben · Tack = Treffmoment')}
        </span>
        {on && mute && <span className="warn-text small">{tr('No sound on this device – follow the lights.', 'Kein Ton auf diesem Gerät – folge den Lichtern.')}</span>}
      </div>
      <div className="tr-metro-row">
        {mode === 'swing' ? (
          <span className="tr-metro-bpm swing" aria-live="polite">
            <strong>{swing.id}</strong>
            <span className="muted small">
              {tr('back', 'zurück')} {sec(swing.back)} s · {tr('down', 'runter')} {sec(swing.down)} s
            </span>
          </span>
        ) : (
          <>
            <button type="button" className="chip" aria-label={tr('slower', 'langsamer')} onClick={() => setBpm(bpm - 2)} disabled={bpm <= MIN}>
              −
            </button>
            <span className="tr-metro-bpm" aria-live="polite">
              <strong>{bpm}</strong>
              <span className="muted small">{tr('beats/min', 'Schläge/Min.')}</span>
            </span>
            <button type="button" className="chip" aria-label={tr('faster', 'schneller')} onClick={() => setBpm(bpm + 2)} disabled={bpm >= MAX}>
              +
            </button>
          </>
        )}
        <span className="tr-metro-lights" aria-hidden="true">
          {Array.from({ length: lights }, (_, k) => (
            <i key={k} className={`${beat === k ? 'on' : ''}${k === lights - 1 ? ' low' : ''}`} />
          ))}
        </span>
        <button type="button" className={on ? 'btn-secondary tr-metro-go' : 'btn-primary tr-metro-go'} aria-pressed={on} onClick={() => (on ? setOn(false) : start())}>
          {on ? tr('■ Stop', '■ Stopp') : tr('▶ Start', '▶ Start')}
        </button>
      </div>
      {mode === 'swing' ? (
        <div className="chip-set" role="group" aria-label={tr('Tempo', 'Tempo')}>
          {SWING.map((s) => (
            <button key={s.id} type="button" className={`chip${swing.id === s.id ? ' on' : ''}`} aria-pressed={swing.id === s.id} onClick={() => setSwing(s)}>
              {s.id} · {s.label()}
            </button>
          ))}
        </div>
      ) : (
        !props.compact && (
          <div className="chip-set" role="group" aria-label={tr('Tempo', 'Tempo')}>
            {PRESETS.map((p) => (
              <button key={p} type="button" className={`chip${bpm === p ? ' on' : ''}`} aria-pressed={bpm === p} onClick={() => setBpm(p)}>
                {p}
              </button>
            ))}
          </div>
        )
      )}
    </section>
  );
}
