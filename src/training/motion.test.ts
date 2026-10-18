import { describe, expect, it } from 'vitest';
import { at, blend, frameJoints, timeline } from './motion';
import { CATEGORIES, DRILLS } from './content';
import { DRILL_MOTIONS, FAULT_MOTIONS, SECTION_MOTIONS } from './content/motions';

// The animated figure (Sascha 17.10.2026): every movement belongs to a picture with a golfer, limbs keep their length
// between the poses, and a run starts and ends in a pose.

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('animated pictures', () => {
  it('every movement has its picture with a golfer', () => {
    for (const id of Object.keys(DRILL_MOTIONS)) {
      const d = DRILLS.find((x) => x.id === id);
      expect(d, id).toBeTruthy();
      // a 3D video alone (no drawn movement) also goes with a top view
      if (!DRILL_MOTIONS[id].frames.length) expect((d!.sketch?.view === 'side' || d!.sketch?.view === 'top') && !!d!.sketch.motion?.video, id).toBe(true);
      else expect(d!.sketch?.view === 'side' && d!.sketch.motion && d!.sketch.items.some((x) => x.k === 'figure'), id).toBe(true);
    }
    for (const [cat, list] of Object.entries(SECTION_MOTIONS)) {
      for (const title of Object.keys(list!)) {
        const s = CATEGORIES.find((c) => c.id === cat)?.sections.find((x) => x.title.en === title);
        // a 3D video alone also goes with a top view
        const m = list![title];
        if (!m.frames.length) expect((s?.sketch?.view === 'side' || s?.sketch?.view === 'top') && !!s.sketch.motion?.video, `${cat} › ${title}`).toBe(true);
        else expect(s?.sketch?.view === 'side' && !!s.sketch.motion, `${cat} › ${title}`).toBe(true);
      }
    }
  });

  it('every fault movement has its picture, both figures move', () => {
    for (const [cat, list] of Object.entries(FAULT_MOTIONS)) {
      for (const [name, m] of Object.entries(list!)) {
        const f = CATEGORIES.find((c) => c.id === cat)?.faults?.find((x) => x.name.en === name);
        // only a 3D video (no drawn movement): any picture can carry it
        if (!m.frames.length) {
          expect(!!m.video && (f?.sketch?.view === 'top' || f?.sketch?.view === 'side' || f?.sketch?.view === 'face') && !!f.sketch.motion, `${cat} › ${name}`).toBe(true);
          continue;
        }
        const figs = f?.sketch?.view === 'side' ? f.sketch.items.filter((x) => x.k === 'figure').length : 0;
        expect(f?.sketch?.view === 'side' && !!f.sketch.motion, `${cat} › ${name}`).toBe(true);
        expect(figs, `${cat} › ${name}`).toBeGreaterThan(Math.max(m.fig ?? 0, ...(m.with ?? []).map((w) => w.fig)));
      }
    }
  });

  it('arms, legs and club keep their length on the way between two poses', () => {
    const a = frameJoints({}, { pose: 'frontTop', t: 0 });
    const b = frameJoints({}, { pose: 'impact', t: 0 });
    for (const u of [0.25, 0.5, 0.75]) {
      const m = blend(a, b, u);
      for (const [x, y] of [['hands', 'leadElbow'], ['leadElbow', 'leadShoulder'], ['clubHead', 'hands'], ['leadKnee', 'leadHip']] as const) {
        const want = (dist(a[x], a[y]) + dist(b[x], b[y])) / 2;
        expect(Math.abs(dist(m[x], m[y]) - want) / want, `${x}–${y} at ${u}`).toBeLessThan(0.05);
      }
    }
  });

  it('a run starts at the first pose and ends at the last', () => {
    const m = DRILL_MOTIONS['tempo-321'];
    const tl = timeline({}, m);
    expect(at(tl, 0).j.hands).toEqual(tl.keys[0].j.hands);
    expect(at(tl, tl.total).j.hands).toEqual(tl.keys[tl.keys.length - 1].j.hands);
    // back in three counts, down in one: top → impact a third of address → top
    const k = Object.fromEntries(m.frames.map((f, i) => [f.pose, tl.keys[i].at]));
    const back = k.frontTop - (tl.keys[0].at + tl.keys[0].hold);
    const down = k.impact - (k.frontTop + (m.frames.find((f) => f.pose === 'frontTop')!.hold ?? 0));
    expect(back / down).toBeCloseTo(3, 1);
  });

  it('the putting pendulum swings the club towards the target and back', () => {
    const still = frameJoints({}, { pose: 'putt', t: 0 });
    const back = frameJoints({}, { pose: 'putt', rock: -9, t: 0 });
    const through = frameJoints({}, { pose: 'putt', rock: 9, t: 0 });
    expect(back.clubHead[0]).toBeLessThan(still.clubHead[0]);
    expect(through.clubHead[0]).toBeGreaterThan(still.clubHead[0]);
    // the body does not move
    expect(through.head).toEqual(still.head);
  });
});

describe('3D videos', () => {
  it('every 3D video named by a picture exists; its keys run forward in time; the club meets the ball', async () => {
    const { SWINGS, PAIRS } = await import('./anim3d/swings');
    const named = [...DRILLS.map((d) => d.sketch), ...CATEGORIES.flatMap((c) => c.sections.map((s) => s.sketch))].flatMap((s) => (s?.view === 'side' && s.motion?.video ? [s.motion.video] : []));
    expect(named.length).toBeGreaterThan(20);
    for (const v of named) expect(v in SWINGS || v in PAIRS, v).toBe(true);
    for (const [id, sw] of Object.entries(SWINGS)) {
      sw.keys.forEach((k, i) => i && expect(k.t, `${id} key ${i}`).toBeGreaterThan(sw.keys[i - 1].t));
      expect(sw.keys[0].club, `${id} starts at the ball`).toBe('ball');
      expect(sw.keys.some((k, i) => i > 1 && k.club === 'ball'), `${id} comes back to the ball`).toBe(true);
      if (sw.hit) expect(sw.keys.some((k) => k.t === sw.hit!.at && k.club === 'ball'), `${id}: the ball leaves at impact`).toBe(true);
    }
  });
});
