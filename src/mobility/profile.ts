import { L } from '../training/types';
import { LIMITS } from './measure';
import type { Area, Measurement, MetricKind, TestDef, TestId, TestResult } from './types';

// Measuring, not grading (Sascha 18.10.2026 00:40): "It is not about whether someone passes a test – it is about how
// mobile the player is, the values saved and shown, without a grade. From the analysis ask for the player's goal
// (e.g. the handicap), define a pillar 'mobility' from it, give drills for the different areas to train at home, and
// repeat the analysis later to see how the values changed."
//
// Every value sits on a neutral scale (little … a lot of movement). The goal (a handicap to reach, what matters most)
// gives each test a value to aim for; the pillar puts the areas in order of the gap. Grades stay inside (the swing
// patterns use them) but are not shown.

/** The scale of a measured value: lo = little movement, hi = a lot (for the toe touch and the 90/90 smaller is more). */
export const SCALE: Record<MetricKind, { lo: number; hi: number }> = {
  trunkRotation: { lo: 0, hi: 70 },
  pelvicRotation: { lo: 0, hi: 50 },
  lowerQuarter: { lo: 0, hi: 90 },
  neck: { lo: 0, hi: 90 },
  balance: { lo: 0, hi: 30 },
  bridge: { lo: 0, hi: 10 },
  lat: { lo: 90, hi: 180 },
  shoulder9090: { lo: 60, hi: 0 },
  squat: { lo: -40, hi: 20 },
  toeTouch: { lo: 30, hi: 0 },
};

/** Where a value sits on its scale, 0 … 1. */
export function position(kind: MetricKind, v: number): number {
  const s = SCALE[kind];
  return Math.max(0, Math.min(1, (v - s.lo) / (s.hi - s.lo)));
}

/** A self check has no number: the picture chosen sits low, in the middle or high. */
const SELF_POS = { fail: 0.2, limited: 0.55, pass: 0.9 } as const;

/** The position of one measurement (null: it hurt – no value). */
export function measurePos(test: TestDef, m: Measurement): number | null {
  if (m.pain) return null;
  if (m.source === 'camera' && m.value != null && test.metric) return position(test.metric, m.value);
  return SELF_POS[m.grade];
}

/** A test's position: the side with less movement counts. */
export function testPos(test: TestDef, r: TestResult | undefined): number | null {
  if (!r) return null;
  const ps = [r.both, r.left, r.right].filter((m): m is Measurement => !!m).map((m) => measurePos(test, m)).filter((p): p is number => p != null);
  return ps.length ? Math.min(...ps) : null;
}

// ---------- the goal ----------
export type Focus = 'length' | 'consistency' | 'painfree' | 'keep';
export const FOCUS_NAMES: Record<Focus, L> = {
  length: L('More length', 'Mehr Länge'),
  consistency: L('More consistent', 'Konstanter treffen'),
  painfree: L('Play without aches', 'Ohne Beschwerden spielen'),
  keep: L('Stay mobile', 'Beweglich bleiben'),
};
export interface MobilityGoal {
  id: 'goal';
  /** the handicap to reach (0 = scratch) */
  hcp: number;
  focus: Focus[];
  at: string;
}
const GOAL_KEY = 'golfos.mobility.goal.v1';
export function loadGoal(): MobilityGoal | null {
  try {
    const list = JSON.parse(localStorage.getItem(GOAL_KEY) ?? '[]') as MobilityGoal[];
    return list[0] ?? null;
  } catch {
    return null;
  }
}
export function saveGoal(g: MobilityGoal): void {
  localStorage.setItem(GOAL_KEY, JSON.stringify([g]));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('golfos:mobility-changed'));
}
export const GOAL_STEPS = [36, 28, 20, 15, 10, 5, 0];

/**
 * The value to aim for on the scale: the golf value (TPI where published, REVIEW Chris) for a low handicap, a little
 * less for a higher one – a 20 handicapper does not need a tour player's turn. REVIEW(golf) – Chris.
 */
export const GOAL_FACTOR = (hcp: number): number => (hcp <= 5 ? 1 : hcp <= 12 ? 0.92 : hcp <= 20 ? 0.85 : 0.78);

/** The golf value of each camera test on its scale (what a mobile golfer reaches). */
const GOLF_VALUE: Record<MetricKind, number> = {
  trunkRotation: LIMITS.trunk.pass,
  pelvicRotation: LIMITS.pelvis.pass,
  lowerQuarter: LIMITS.lowerQuarter.pass,
  neck: LIMITS.neck.pass,
  balance: LIMITS.balance.pass,
  bridge: LIMITS.bridge.hold,
  lat: LIMITS.lat.pass,
  shoulder9090: LIMITS.shoulder.pass,
  squat: LIMITS.squat.depth,
  toeTouch: LIMITS.toeTouch.pass,
};

/** The position to aim for in a test, for the goal. */
export function targetPos(test: TestDef, goal: MobilityGoal | null): number {
  const golf = test.metric ? position(test.metric, GOLF_VALUE[test.metric]) : SELF_POS.pass;
  return golf * GOAL_FACTOR(goal?.hcp ?? 10);
}

/** The value to aim for in the test's unit (camera tests), for the text "aim for 41°". */
export function targetValue(test: TestDef, goal: MobilityGoal | null): number | null {
  if (!test.metric) return null;
  const s = SCALE[test.metric];
  return Math.round(s.lo + targetPos(test, goal) * (s.hi - s.lo));
}

// ---------- the pillar ----------
/** How much an area matters for the swing, and for what the player wants (REVIEW(golf) – Chris). */
const AREA_WEIGHT: Record<Area, number> = { hips: 1.3, spine: 1.3, shoulders: 1.1, stability: 1.1, legs: 1, neck: 0.9, wrists: 0.8 };
const FOCUS_BOOST: Record<Focus, Partial<Record<Area, number>>> = {
  length: { hips: 1.25, spine: 1.25, shoulders: 1.15, stability: 1.1 },
  consistency: { stability: 1.25, legs: 1.15, hips: 1.1 },
  painfree: { spine: 1.25, hips: 1.15, neck: 1.15, shoulders: 1.1 },
  keep: {},
};

export interface AreaState {
  area: Area;
  /** the tests done in it */
  tests: TestId[];
  /** where the area stands and where it should, 0 … 1 */
  now: number;
  target: number;
  /** how far from the target, weighted by what matters (0 = there) */
  gap: number;
  /** among the areas to work on first */
  focus: boolean;
}

/** The pillar: the areas with their state, the ones to work on first on top. */
export function pillar(tests: TestDef[], results: Partial<Record<TestId, TestResult>>, goal: MobilityGoal | null): AreaState[] {
  const areas = [...new Set(tests.map((x) => x.area))];
  const out: AreaState[] = [];
  for (const area of areas) {
    const done = tests.filter((x) => x.area === area && testPos(x, results[x.id]) != null);
    if (!done.length) continue;
    const now = done.reduce((s, x) => s + testPos(x, results[x.id])!, 0) / done.length;
    const target = done.reduce((s, x) => s + targetPos(x, goal), 0) / done.length;
    const boost = (goal?.focus ?? []).reduce((b, f) => b * (FOCUS_BOOST[f][area] ?? 1), 1);
    const gap = Math.max(0, target - now) * AREA_WEIGHT[area] * boost;
    out.push({ area, tests: done.map((x) => x.id), now, target, gap, focus: false });
  }
  out.sort((a, b) => b.gap - a.gap);
  // the three with the biggest gap (and a real one) come first
  out.forEach((a, i) => (a.focus = i < 3 && a.gap > 0.04));
  return out;
}
