import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';

// The built-in putting metronome (Sascha 16.10.2026: "rhythm is the most important thing for distance control – use
// it right in the app"). Two sounds alternate: "tick" (high) = end of the backswing, "tock" (low) = impact.
// The clicks are scheduled ahead on the audio clock, so the beat stays exact even when the page is busy.
// The tempo is a per-device preference (kept in localStorage); the screen stays on while it plays.

const KEY = 'golfos.training.bpm.v1';
const MIN = 50;
const MAX = 110;
const PRESETS = [72, 76, 80, 84];

function loadBpm(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return n >= MIN && n <= MAX ? n : 76;
  } catch {
    return 76;
  }
}
function saveBpm(n: number): void {
  try {
    localStorage.setItem(KEY, String(n));
  } catch {
    /* private mode – the tempo is just not remembered */
  }
}

type Sentinel = { release: () => Promise<void> };

export function Metronome(props: { compact?: boolean }) {
  const [bpm, setBpmState] = useState(loadBpm);
  const [on, setOn] = useState(false);
  const [beat, setBeat] = useState<0 | 1 | null>(null);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
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
    saveBpm(v);
  };

  // the scheduler: every 25 ms, plan the beats of the next 120 ms on the audio clock (or the page clock)
  useEffect(() => {
    if (!on) return;
    const audio = ctxRef.current;
    const now = () => (audio ? audio.currentTime : performance.now() / 1000);
    let next = now() + 0.1;
    let n = 0;
    const timers = new Set<number>();
    const click = (at: number, high: boolean) => {
      if (!audio) return navigator.vibrate?.(high ? 30 : 15);
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = high ? 1500 : 900;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(high ? 0.5 : 0.4, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      o.connect(g).connect(audio.destination);
      o.start(at);
      o.stop(at + 0.07);
    };
    const tickTimer = window.setInterval(() => {
      while (next < now() + 0.12) {
        const high = n % 2 === 0;
        const at = next;
        const wait = Math.max(0, (at - now()) * 1000);
        if (audio) click(at, high);
        const id = window.setTimeout(() => {
          timers.delete(id);
          if (!audio) click(at, high);
          setBeat(high ? 0 : 1);
        }, wait);
        timers.add(id);
        next += 60 / bpmRef.current;
        n++;
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

  return (
    <section className={`card tr-metronome${props.compact ? ' compact' : ''}`} aria-label={tr('Metronome', 'Metronom')}>
      <div className="tr-metro-head">
        <span className="eyebrow">{tr('Metronome', 'Metronom')}</span>
        <span className="muted small">{tr('tick = top of the backswing · tock = impact', 'Tick = oben · Tack = Treffmoment')}</span>
        {on && mute && <span className="warn-text small">{tr('No sound on this device – follow the lights.', 'Kein Ton auf diesem Gerät – folge den Lichtern.')}</span>}
      </div>
      <div className="tr-metro-row">
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
        <span className="tr-metro-lights" aria-hidden="true">
          <i className={beat === 0 ? 'on' : ''} />
          <i className={beat === 1 ? 'on low' : 'low'} />
        </span>
        <button type="button" className={on ? 'btn-secondary tr-metro-go' : 'btn-primary tr-metro-go'} aria-pressed={on} onClick={() => (on ? setOn(false) : start())}>
          {on ? tr('■ Stop', '■ Stopp') : tr('▶ Start', '▶ Start')}
        </button>
      </div>
      {!props.compact && (
        <div className="chip-set" role="group" aria-label={tr('Tempo', 'Tempo')}>
          {PRESETS.map((p) => (
            <button key={p} type="button" className={`chip${bpm === p ? ' on' : ''}`} aria-pressed={bpm === p} onClick={() => setBpm(p)}>
              {p}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
