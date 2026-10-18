// Shot detection by sound – a test (Sascha 18.10.2026: "can the shot not be detected by the sound of the strike?").
// The strike is a very short, hard crack: a steep rise far above the background, bright (many zero crossings) and
// gone again within ~150 ms. Nothing is recorded: only the moment and the loudness are kept. A web app hears only
// while the page is open and the screen on – the test is for the cart, the hand or the driving range (spec 004).

export interface Impact {
  t: number; // ms since 1970
  level: number; // peak 0…1
}

export const IMPACT = {
  minPeak: 0.2, // full scale = 1
  rise: 12, // block energy ≥ 12 × the background
  minZcr: 0.06, // zero crossings per sample – a crack is bright, a thump or a voice less so
  decayMs: 150, // the energy falls to an eighth within this time
  decayTo: 1 / 8,
  deadMs: 1500, // one shot – the echo and the ball landing nearby are not a second one
  bgAlpha: 0.05, // how fast the background follows
};

/** The detector on blocks of samples – pure, so it can be tested without a microphone. */
export class ImpactCore {
  private bg = 1e-6;
  private pending: { t: number; e: number; level: number } | null = null;
  private last = -Infinity;

  feed(block: Float32Array, now: number): Impact | null {
    let peak = 0;
    let sum = 0;
    let zc = 0;
    for (let k = 0; k < block.length; k++) {
      const v = block[k];
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v * v;
      if (k > 0 && (v >= 0) !== (block[k - 1] >= 0)) zc++;
    }
    const e = sum / block.length;
    const zcr = zc / block.length;
    // a sound that is still loud after 150 ms is no strike (a voice, a cart): it becomes the background, so it does not
    // set off again while it lasts
    if (this.pending && now - this.pending.t > IMPACT.decayMs) {
      this.bg = Math.max(this.bg, this.pending.e, e);
      this.pending = null;
    }
    if (this.pending) {
      // a crack across two blocks: its loud part may come in the second one – measure the decay from the loudest
      if (e > this.pending.e) {
        // its loudest part must be bright too: a click followed by a dull, loud sound is a voice or a thump
        if (zcr < IMPACT.minZcr) {
          this.bg = Math.max(this.bg, e);
          this.pending = null;
          return null;
        }
        this.pending.e = e;
        this.pending.level = Math.max(this.pending.level, peak);
        return null;
      }
      if (e <= this.pending.e * IMPACT.decayTo) {
        const hit = { t: this.pending.t, level: Math.round(this.pending.level * 100) / 100 };
        this.pending = null;
        this.last = hit.t;
        return hit;
      }
      return null;
    }
    if (now - this.last > IMPACT.deadMs && peak >= IMPACT.minPeak && e >= IMPACT.rise * this.bg && zcr >= IMPACT.minZcr) {
      this.pending = { t: now, e, level: peak };
      return null;
    }
    this.bg += IMPACT.bgAlpha * (e - this.bg);
    if (this.bg < 1e-7) this.bg = 1e-7;
    return null;
  }
}

/** Listening with the microphone: raw sound (no echo cancelling, no noise suppression), blocks of 1024 samples. */
export async function listen(onImpact: (i: Impact) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(1024, 1, 1);
  const core = new ImpactCore();
  // time from the samples, not the clock: the blocks may arrive in bursts, the sound itself keeps exact time
  const t0 = Date.now();
  let samples = 0;
  proc.onaudioprocess = (ev) => {
    const block = ev.inputBuffer.getChannelData(0);
    const hit = core.feed(block, t0 + (samples * 1000) / ctx.sampleRate);
    samples += block.length;
    if (hit) onImpact(hit);
  };
  src.connect(proc);
  proc.connect(ctx.destination); // Safari runs the processor only when it is connected
  // keep the screen on while listening – the web app hears nothing once it is locked
  let lock: { release: () => Promise<void> } | null = null;
  try {
    lock = await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null;
  } catch {
    lock = null;
  }
  return () => {
    proc.disconnect();
    src.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    void lock?.release().catch(() => {});
  };
}

const KEY = 'golfos.soundtest.v1';
/** The test switch in the profile (Golf → "Shot by sound (test)"). */
export function soundTestOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
export function setSoundTest(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}
