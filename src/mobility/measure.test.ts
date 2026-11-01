import { describe, expect, it } from 'vitest';
import { facingOf, LIMITS, makeAnalyzer, missingPoints, nearSide, NOTE_CRAMP, NOTE_HEELS, NOTE_HELD, P, pickMainPerson, type Frame, type Lm } from './measure';
import { forearmBody, forearmScript, frames, frontBody, keys, put, reachBody, reachScript, script, SYNTH_H, SYNTH_W, tiltBody, tiltScript, wristBody, wristScript } from './synth';
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

describe('mobility analysers with the shaking of a real pose model', () => {
  // every point shakes (σ 0.4 % of the picture), 5 % of the pictures are lost, 2 % of the points are wild – 5 random runs
  // per test: the turns came out 15–20° (ended early on a shaking point at rest) or several degrees too high (the top of a
  // shaking width, acos near 0°) before 19.10.2026
  it('measures the turns close to the clean value', () => {
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    for (const kind of ['trunkRotation', 'pelvicRotation', 'neck'] as MetricKind[])
      for (const level of ['good', 'stiff'] as const) {
        const clean = run(kind, 'left', level).out!.value;
        for (let s = 1; s <= 5; s++) {
          seed = s * 7919;
          const a = makeAnalyzer(kind, 'left');
          for (const f of frames(script(kind, 'left', level), 30)) {
            if (rnd() < 0.05) continue;
            const lm = f.lm.map((p) => {
              const k = rnd() < 0.02 ? 8 : 1;
              return { ...p, x: p.x + gauss() * 0.004 * k, y: p.y + gauss() * 0.004 * k * (SYNTH_W / SYNTH_H) };
            });
            if (a.push({ ...f, lm }).phase === 'done') break;
          }
          const v = a.finish()?.value;
          expect(v, `${kind} ${level} run ${s}`).toBeDefined();
          expect(Math.abs(v! - clean), `${kind} ${level} run ${s}: ${v} against ${clean}`).toBeLessThanOrEqual(kind === 'trunkRotation' ? 5 : 7);
        }
      }
  });
});

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
    expect(out!.notes).toContainEqual(NOTE_CRAMP);
  });

  it('a pelvis that does not turn far enough is tried again with the shoulders held (the physio, 29.10.2026)', () => {
    expect(run('pelvicRotation', 'left', 'stiff').out!.notes).toContainEqual(NOTE_HELD);
    expect(run('pelvicRotation', 'left', 'good').out!.notes).not.toContainEqual(NOTE_HELD);
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

describe('who is the player', () => {
  // the TPI videos (31.10.2026): the player stands in the middle, small; a helper stands close to the phone at the edge of
  // the picture, larger and cut off by it
  const player = frontBody({}).map((p) => ({ ...p, x: 0.45 + (p.x - 0.5) * 0.45, y: 0.3 + p.y * 0.45 }));
  const helper: Lm[] = frontBody({}).map((p) => ({ ...p, x: 0.97 + (p.x - 0.5) * 0.9, y: -0.05 + p.y * 1.0 }));
  it('the whole person in the picture, not the larger one cut off at the edge', () => {
    expect(pickMainPerson([helper, player])).toBe(1);
    expect(pickMainPerson([player, helper])).toBe(0);
  });
  it('alone, or two whole people: the larger, more central one as before', () => {
    const far = frontBody({}).map((p) => ({ ...p, x: 0.8 + (p.x - 0.5) * 0.2, y: 0.4 + p.y * 0.2 }));
    expect(pickMainPerson([far, player])).toBe(1);
    expect(pickMainPerson([player])).toBe(0);
  });
});

describe('the criteria of each test', () => {
  it('every camera test names its criteria in both languages – all met for a mobile body, not all for a stiff one', () => {
    for (const [kind, side] of KINDS) {
      const good = run(kind, side, 'good').out!;
      const stiff = run(kind, side, 'stiff').out;
      expect(good.checks.length, kind).toBeGreaterThan(0);
      for (const c of good.checks) expect(c.label.en && c.label.de, `${kind} ${c.id}`).toBeTruthy();
      if (kind !== 'lowerQuarter') expect(good.checks.every((c) => c.ok), `${kind} good: ${good.checks.filter((c) => !c.ok).map((c) => c.id)}`).toBe(true);
      if (stiff) expect(stiff.checks.some((c) => !c.ok), `${kind} stiff`).toBe(true);
    }
  });
});

// ---------- the five tests measured by the camera from 01.11.2026 (own synthetic bodies – the QA player is in synth.ts) ----------
const W = SYNTH_W;
const H = SYNTH_H;
const runFrames = (kind: MetricKind, at: (t: number) => Lm[], ms: number, side: Side = 'left') => {
  const a = makeAnalyzer(kind, side);
  const cues: string[] = [];
  for (let t = 0; t <= ms; t += 50) {
    const l = a.push({ lm: at(t), w: W, h: H, t });
    if (l.cue) cues.push(l.cue);
    if (l.phase === 'done') break;
  }
  return { out: a.finish(), cues };
};

describe('forearm rotation (front view, both hands)', () => {
  it('about 85° each way passes, measured close to the true turn', () => {
    const { out, cues } = runFrames('forearm', forearmScript(85, 85), 16000);
    expect(cues[0]).toBe('go');
    expect(cues.at(-1)).toBe('done');
    expect(out!.grade).toBe('pass');
    expect(Math.abs(out!.value - 85)).toBeLessThanOrEqual(3);
    expect(out!.checks.every((c) => c.ok)).toBe(true);
  });
  it('both ways steep fails, one hand short is limited', () => {
    expect(runFrames('forearm', forearmScript(50, 45), 16000).out!.grade).toBe('fail');
    const one = runFrames('forearm', forearmScript(85, 85, 85, 45), 16000).out!;
    expect(one.grade).toBe('limited');
    expect(one.checks.find((c) => c.id === 'right')!.ok).toBe(false);
    expect(one.checks.find((c) => c.id === 'left')!.ok).toBe(true);
  });
  it('one way clearly less from a thumbs-up start is named', () => {
    const { out } = runFrames('forearm', forearmScript(85, 45, 85, 85), 16000);
    expect(out!.grade).toBe('limited');
    expect(out!.notes.some((n) => /does not turn up fully/.test(n.en))).toBe(true);
  });
  it('holding the palm down for long does not end the test before the palm turns up', () => {
    const at = (t: number) => {
      const k = keys([[0, 0], [1000, 0], [2000, -85], [6500, -85], [7500, 0], [8500, 85], [10000, 85]])(t);
      return forearmBody(k, k);
    };
    expect(runFrames('forearm', at, 16000).out!.grade).toBe('pass');
  });
  it('a thumb point running round the wrong way does not add a turn', () => {
    // the TPI video (01.11.2026): from palm down to palm up the thumb point ran round through "down"
    const at = (t: number) => {
      const lm = forearmScript(85, 85)(t);
      if (t > 4000 && t < 4600) for (const th of [21, 22]) lm[th] = { ...lm[th], y: lm[th].y + 40 / H };
      return lm;
    };
    expect(runFrames('forearm', at, 16000).out!.value).toBeLessThanOrEqual(95);
  });
  it('elbows leaving the sides are seen', () => {
    const at = (t: number) => {
      const k = keys([[0, 0], [1000, 0], [2000, -85], [3500, -85], [4500, 0], [5500, 85], [7000, 85], [8000, 0]])(t);
      return forearmBody(k, k, Math.abs(k) * 1.2);
    };
    const { out } = runFrames('forearm', at, 16000);
    expect(out!.checks.find((c) => c.id === 'elbows')!.ok).toBe(false);
    expect(out!.grade).toBe('limited');
  });
  it('the framing needs both hands', () => {
    const f: Frame = { lm: forearmBody(0, 0), w: W, h: H, t: 0 };
    expect(missingPoints('forearm', f)).toEqual([]);
    const cut = { ...f, lm: f.lm.map((l, i) => (i === 22 ? { ...l, v: 0.1 } : l)) };
    expect(missingPoints('forearm', cut)).toEqual([22]);
  });
});

describe('wrist hinge and wrist bend (side view)', () => {
  const g = LIMITS.wristHinge.gain;
  const gf = LIMITS.wristFlex.gain;
  it('hinge: about 25° up and 35° down passes, the value is both together', () => {
    const { out, cues } = runFrames('wristHinge', wristScript(25 / g, 35 / g), 22000);
    expect(cues[0]).toBe('go');
    expect(cues.at(-1)).toBe('done');
    expect(out!.grade).toBe('pass');
    expect(Math.abs(out!.value - 60)).toBeLessThanOrEqual(3);
    expect(out!.checks.every((c) => c.ok)).toBe(true);
  });
  it('hinge: one way clearly less is limited, both stiff fails (the self check pictures)', () => {
    const one = runFrames('wristHinge', wristScript(10 / g, 35 / g), 22000).out!;
    expect(one.grade).toBe('limited');
    expect(one.notes.some((n) => /up \(thumb side\) is clearly less/.test(n.en))).toBe(true);
    expect(runFrames('wristHinge', wristScript(8 / g, 12 / g), 22000).out!.grade).toBe('fail');
  });
  it('the same seen from the other side (the forearm pointing left in the picture)', () => {
    expect(runFrames('wristHinge', wristScript(25 / g, 35 / g, true), 22000).out!.grade).toBe('pass');
    expect(runFrames('wristHinge', wristScript(8 / g, 12 / g, true), 22000).out!.grade).toBe('fail');
  });
  it('bend: 65° each way passes, 70° / 35° limited, 35° / 30° fails', () => {
    const good = runFrames('wristFlex', wristScript(65 / gf, 65 / gf), 22000).out!;
    expect(good.grade).toBe('pass');
    expect(Math.abs(good.value - 65)).toBeLessThanOrEqual(3);
    const one = runFrames('wristFlex', wristScript(70 / gf, 35 / gf), 22000).out!;
    expect(one.grade).toBe('limited');
    expect(one.checks.find((c) => c.id === 'bothWays')!.ok).toBe(false);
    expect(runFrames('wristFlex', wristScript(35 / gf, 30 / gf), 22000).out!.grade).toBe('fail');
  });
  it('a long hold of the first way does not end the test', () => {
    const at = (t: number) => wristBody(keys([[0, 0], [1000, 0], [2000, 25 / g], [9000, 25 / g], [10000, 0], [11000, -35 / g], [13000, -35 / g]])(t));
    expect(runFrames('wristHinge', at, 22000).out!.grade).toBe('pass');
  });
  it('the framing needs the hand towards the phone', () => {
    const f: Frame = { lm: wristBody(0), w: W, h: H, t: 0 };
    expect(missingPoints('wristHinge', f)).toEqual([]);
    const cut = { ...f, lm: f.lm.map((l, i) => (i === P.lIdx ? { ...l, v: 0.1 } : l)) };
    expect(missingPoints('wristFlex', cut)).toContain(P.lIdx);
  });
});

describe('pelvic tilt (side view, golf posture)', () => {
  it('both ways, smooth, the chest still: pass', () => {
    const { out, cues } = runFrames('pelvicTilt', tiltScript(30, 30), 20000);
    expect(cues).toEqual(['go', 'done']);
    expect(out!.grade).toBe('pass');
    expect(out!.checks.every((c) => c.ok)).toBe(true);
  });
  it('shaking while flattening the back: limited, named (the physio, 29.10.2026)', () => {
    const { out } = runFrames('pelvicTilt', tiltScript(30, 30, { shake: 6 }), 20000);
    expect(out!.grade).toBe('limited');
    expect(out!.checks.find((c) => c.id === 'smooth')!.ok).toBe(false);
    expect(out!.notes.some((n) => /shakes/.test(n.en))).toBe(true);
  });
  it('one way only: limited – hardly at all: fail', () => {
    const one = runFrames('pelvicTilt', tiltScript(30, 0), 20000).out!;
    expect(one.grade).toBe('limited');
    expect(one.notes.some((n) => /Flattening the back does not work/.test(n.en))).toBe(true);
    expect(runFrames('pelvicTilt', tiltScript(1, 1), 20000).out!.grade).toBe('fail');
  });
  it('the chest moving along is seen', () => {
    const { out } = runFrames('pelvicTilt', tiltScript(30, 30, { chest: 50 }), 20000);
    expect(out!.checks.find((c) => c.id === 'chestStill')!.ok).toBe(false);
    expect(out!.grade).not.toBe('pass');
  });
  it('the tracking slipping to someone close by for a moment is no tilt and no moving chest', () => {
    // 0.3 s on another body: the shoulder 200 px off, the hip 150 px (the TPI video: the physio beside the player)
    const at = (t: number) => (t >= 4500 && t < 4800 ? tiltBody(150, 200) : tiltScript(30, 30)(t));
    const { out } = runFrames('pelvicTilt', at, 20000);
    expect(out!.grade).toBe('pass');
    expect(out!.checks.every((c) => c.ok)).toBe(true);
  });
  it('waits for a still golf posture before it starts – bending into it is no tilt', () => {
    // standing upright first (the shoulder above the hip), then bending forward into the posture
    const at = (t: number) => {
      const lm = tiltScript(30, 30)(Math.max(0, t - 2000));
      if (t < 2000) {
        const k = t / 2000;
        put(lm, P.lSh, [360 + 140 * k * k, 420 - 20 * (1 - k)]);
      }
      return lm;
    };
    expect(runFrames('pelvicTilt', at, 22000).out!.grade).toBe('pass');
  });
});

describe('lower quarter rotation (front view, on one leg)', () => {
  it('a full turn to one side only is not a pass – the goal is each direction', () => {
    const turn = keys([[0, 0], [1000, 0], [2500, 70], [4000, 70], [5500, 0]]);
    const { out } = runFrames('lowerQuarter', (t) => frontBody({ pelvis: turn(t), trunk: turn(t), lift: 'right' }), 13000);
    expect(out!.grade).toBe('limited');
    expect(out!.checks.filter((c) => c.ok)).toHaveLength(1);
    expect(out!.notes.some((n) => /Only one direction/.test(n.en))).toBe(true);
  });
});

describe('reach, roll and lift (kneeling, side view) – not checked on a video yet', () => {
  it('the arm to ear height passes, half way limited, not off the floor fails', () => {
    const good = runFrames('reachRollLift', reachScript(36), 13000);
    expect(good.cues).toEqual(['go', 'done']);
    expect(good.out!.grade).toBe('pass');
    expect(Math.abs(good.out!.value - 36)).toBeLessThanOrEqual(2);
    expect(runFrames('reachRollLift', reachScript(18), 13000).out!.grade).toBe('limited');
    expect(runFrames('reachRollLift', reachScript(4), 13000).out!.grade).toBe('fail');
  });
  it('a bent elbow is seen', () => {
    const { out } = runFrames('reachRollLift', reachScript(36, 50), 13000);
    expect(out!.checks.find((c) => c.id === 'elbow')!.ok).toBe(false);
    expect(out!.grade).toBe('limited');
  });
  it('the framing needs the arm and the hip', () => {
    expect(missingPoints('reachRollLift', { lm: reachBody(0), w: W, h: H, t: 0 })).toEqual([]);
  });
});

describe('the five new tests with the shaking of a real pose model', () => {
  // every point shakes (σ 0.25 % of the picture – the hand points are small: 2 px on a 14 px thumb line), 5 % of the
  // pictures are lost, 2 % of the points wild – 5 runs each: the grade of a clear pass and a clear fail must hold
  const cases: [MetricKind, (t: number) => Lm[], number, 'pass' | 'fail'][] = [
    ['forearm', forearmScript(88, 88), 16000, 'pass'],
    ['forearm', forearmScript(45, 40), 16000, 'fail'],
    ['wristHinge', wristScript(30 / LIMITS.wristHinge.gain, 40 / LIMITS.wristHinge.gain), 22000, 'pass'],
    ['wristHinge', wristScript(6 / LIMITS.wristHinge.gain, 8 / LIMITS.wristHinge.gain), 22000, 'fail'],
    ['wristFlex', wristScript(75 / LIMITS.wristFlex.gain, 75 / LIMITS.wristFlex.gain), 22000, 'pass'],
    ['wristFlex', wristScript(25 / LIMITS.wristFlex.gain, 25 / LIMITS.wristFlex.gain), 22000, 'fail'],
    ['pelvicTilt', tiltScript(40, 40), 20000, 'pass'],
    ['pelvicTilt', tiltScript(1, 1), 20000, 'fail'],
    ['reachRollLift', reachScript(40), 13000, 'pass'],
    ['reachRollLift', reachScript(3), 13000, 'fail'],
  ];
  for (const [kind, at, ms, want] of cases)
    it(`${kind}: a clear ${want} stays a ${want}`, () => {
      for (let s = 1; s <= 5; s++) {
        let seed = s * 7919;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
        const a = makeAnalyzer(kind, 'left');
        for (let t = 0; t <= ms; t += 33) {
          if (rnd() < 0.05) continue;
          const lm = at(t).map((p) => {
            const k = rnd() < 0.02 ? 8 : 1;
            return { ...p, x: p.x + gauss() * 0.0025 * k, y: p.y + gauss() * 0.0025 * k * (W / H) };
          });
          if (a.push({ lm, w: W, h: H, t }).phase === 'done') break;
        }
        const o = a.finish();
        expect(o?.grade, `${kind} run ${s}: ${JSON.stringify(o && { v: o.value, n: o.notes.map((n) => n.en) })}`).toBe(want);
      }
    });
});
