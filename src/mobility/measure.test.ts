import { describe, expect, it } from 'vitest';
import { facingOf, LIMITS, makeAnalyzer, missingPoints, nearSide, NOTE_HEELS, type Frame } from './measure';
import { frames, frontBody, script, SYNTH_H, SYNTH_W } from './synth';
import type { MetricKind, Side } from './types';

const run = (kind: MetricKind, side: Side, level: 'good' | 'stiff') => {
  const a = makeAnalyzer(kind, side);
  const cues: string[] = [];
  for (const f of frames(script(kind, side, level))) {
    const live = a.push(f);
    if (live.cue) cues.push(live.cue);
  }
  return { out: a.finish(), cues };
};

const KINDS: [MetricKind, Side][] = [
  ['trunkRotation', 'left'],
  ['trunkRotation', 'right'],
  ['pelvicRotation', 'left'],
  ['lowerQuarter', 'left'],
  ['lowerQuarter', 'right'],
  ['neck', 'left'],
  ['neck', 'right'],
  ['balance', 'left'],
  ['balance', 'right'],
  ['squat', 'left'],
  ['toeTouch', 'left'],
  ['bridge', 'left'],
  ['bridge', 'right'],
  ['lat', 'left'],
  ['shoulder9090', 'left'],
];

describe('mobility analysers', () => {
  for (const [kind, side] of KINDS) {
    it(`${kind} (${side}): a mobile player passes`, () => {
      const { out, cues } = run(kind, side, 'good');
      expect(out, kind).not.toBeNull();
      expect(out!.grade, `${kind} ${JSON.stringify(out)}`).toBe('pass');
      expect(cues.at(-1)).toBe('done');
    });
    it(`${kind} (${side}): a stiff player does not pass`, () => {
      const { out } = run(kind, side, 'stiff');
      expect(out, kind).not.toBeNull();
      expect(out!.grade, `${kind} ${JSON.stringify(out)}`).not.toBe('pass');
    });
  }

  it('measures the trunk turn in degrees from the shoulder width', () => {
    const { out } = run('trunkRotation', 'left', 'good');
    expect(out!.value).toBeGreaterThanOrEqual(50);
    expect(out!.value).toBeLessThanOrEqual(54);
  });

  it('measures the head turn close to the true angle', () => {
    const { out } = run('neck', 'right', 'good');
    expect(Math.abs(out!.value - 76)).toBeLessThanOrEqual(3);
  });

  it('times the balance until the foot comes down', () => {
    const { out } = run('balance', 'left', 'stiff');
    expect(out!.value).toBeGreaterThan(10);
    expect(out!.value).toBeLessThan(14);
    expect(out!.grade).toBe('limited');
    const good = run('balance', 'left', 'good').out!;
    expect(good.value).toBe(LIMITS.balance.pass);
  });

  it('names what failed in the squat', () => {
    const { out } = run('squat', 'left', 'stiff');
    expect(out!.grade).toBe('fail');
    const de = out!.notes.map((n) => n.de);
    expect(de).toContain('Die Hüfte bleibt über Kniehöhe');
    expect(de).toContain('Die Fersen heben ab');
    expect(de).toContain('Die Arme kippen nach vorn');
  });

  it('gives the toe touch gap in cm', () => {
    const { out } = run('toeTouch', 'left', 'stiff');
    expect(out!.value).toBeGreaterThanOrEqual(11);
    expect(out!.value).toBeLessThanOrEqual(13);
  });

  it('sees the pelvis sink in the bridge', () => {
    const { out } = run('bridge', 'right', 'stiff');
    expect(out!.grade).toBe('fail');
    expect(out!.notes.some((n) => n.en.startsWith('The pelvis sinks'))).toBe(true);
  });

  it('the bridge finds the stretched leg even when left and right are swapped', () => {
    const a = makeAnalyzer('bridge', 'right');
    let out;
    for (const f of frames(script('bridge', 'left', 'good'))) a.push(f);
    out = a.finish();
    expect(out?.grade).toBe('pass');
  });

  it('says so when the player stands on the wrong leg', () => {
    const a = makeAnalyzer('balance', 'left'); // asked to stand on the left …
    const cues: string[] = [];
    for (const f of frames(script('balance', 'right', 'good'))) {
      // … but stands on the right
      const l = a.push(f);
      if (l.cue) cues.push(l.cue);
    }
    expect(cues).toContain('otherLeg');
  });

  it('the squat retest with the hands behind the head ignores the arms, the heels still count', () => {
    const run = (noArms: boolean) => {
      const a = makeAnalyzer('squat', 'left', { noArms });
      for (const f of frames(script('squat', 'left', 'stiff'))) a.push(f);
      return a.finish()!;
    };
    const full = run(false);
    const retest = run(true);
    expect(full.notes.some((n) => /arms/.test(n.en))).toBe(true);
    expect(retest.notes.some((n) => /arms/.test(n.en))).toBe(false);
    expect(retest.notes.some((n) => n.en === NOTE_HEELS.en)).toBe(true);
  });

  it('knows whether the player stands face-on or side-on to the phone (trainer mode)', () => {
    const first = (kind: MetricKind) => frames(script(kind, 'left', 'good'))[0];
    expect(facingOf(first('trunkRotation'))).toBe('front');
    expect(facingOf(first('pelvicRotation'))).toBe('front');
    expect(facingOf(first('balance'))).toBe('front');
    expect(facingOf(first('squat'))).toBe('side');
    expect(facingOf(first('toeTouch'))).toBe('side');
    expect(facingOf(first('lat'))).toBe('side');
  });

  it('returns no result when the movement was never seen', () => {
    const a = makeAnalyzer('squat');
    for (let t = 0; t < 16000; t += 50) a.push({ lm: frontBody({}), w: SYNTH_W, h: SYNTH_H, t });
    expect(a.finish()).toBeNull();
  });

  it('checks the framing: everything needed must be in the picture', () => {
    const f: Frame = { lm: frontBody({}), w: SYNTH_W, h: SYNTH_H, t: 0 };
    expect(missingPoints('trunkRotation', f)).toEqual([]);
    const cut = { ...f, lm: f.lm.map((l, i) => (i === 27 || i === 28 ? { ...l, y: 1.05 } : l)) };
    expect(missingPoints('balance', cut)).toEqual([27, 28]);
    expect(missingPoints('trunkRotation', cut)).toEqual([]);
  });

  it('keeps a lying player inside the picture', () => {
    const f: Frame = { lm: script('bridge', 'left', 'good').at(5000), w: SYNTH_W, h: SYNTH_H, t: 0 };
    expect(missingPoints('bridge', f)).toEqual([]);
  });

  it('finds the side of the body towards the camera', () => {
    expect(nearSide({ lm: script('squat', 'left', 'good').at(0), w: SYNTH_W, h: SYNTH_H, t: 0 })).toBe('left');
  });
});
