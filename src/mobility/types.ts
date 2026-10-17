import type { ReactNode } from 'react';
import type { L, Sketch, Video } from '../training/types';

// The mobility screen (Sascha 17.10.2026): the player copies a test shown on the phone, the camera measures it, and
// from the results the app foresees the swing patterns and misses the body allows. Modelled on the golf screen of the
// Titleist Performance Institute (body–swing connection) – the name "TPI" is protected, so the module is called
// "Agility" (Sascha 17.10.2026: first "Beweglichkeits-Screening", then "Nenne das Modul Agility"), in both languages like
// Rounds, Games and Training. Limits marked REVIEW(golf) wait for Chris.

/** The player's own sides (not the screen's). */
export type Side = 'left' | 'right';

/** pass = ✓ green · limited = – neutral · fail = ✕ red (no yellow in the app). */
export type Grade = 'pass' | 'limited' | 'fail';

/** Where the phone looks at the player. */
export type CameraView = 'front' | 'side';

/** Body areas the tests belong to (the result is grouped by them). */
export type Area = 'hips' | 'spine' | 'shoulders' | 'stability' | 'legs' | 'neck' | 'wrists';

/** What the camera measures – one analyser each (measure.ts). */
export type MetricKind = 'squat' | 'toeTouch' | 'trunkRotation' | 'pelvicRotation' | 'lowerQuarter' | 'balance' | 'bridge' | 'lat' | 'shoulder9090' | 'neck';

export type TestId =
  | 'deep-squat'
  | 'toe-touch'
  | 'seated-rotation'
  | 'pelvic-rotation'
  | 'single-leg'
  | 'bridge'
  | 'lat'
  | 'shoulder-9090'
  | 'lower-quarter'
  | 'neck'
  | 'pelvic-tilt'
  | 'reach-roll-lift'
  | 'forearm'
  | 'wrist-hinge'
  | 'wrist-flex';

/** A choice in a self check: the picture that looks like the player. */
export interface SelfOption {
  grade: Grade;
  label: L;
  picture: () => ReactNode;
}

export interface TestDef {
  id: TestId;
  name: L;
  area: Area;
  /** what the test tells about the swing, one line */
  why: L;
  /** measured on each side (left and right) */
  sides: boolean;
  /** camera = measured from the video; self = the player picks the picture that looks like them */
  mode: 'camera' | 'self';
  view?: CameraView;
  metric?: MetricKind;
  /** part of the quick check */
  quick: boolean;
  /** where the phone goes and the starting position, one line */
  setup: L;
  /** what to do, 2–3 short steps (also read out) */
  steps: L[];
  /** the goal in words, e.g. "45° or more per side" */
  target: L;
  /** the test position (with the detail that matters) */
  sketch: Sketch;
  /** self checks: the pictures to choose from */
  options?: SelfOption[];
  /** corrective drills (Training drill ids): mobility first, then stability */
  drills: string[];
  /** a video of the test */
  video: Video;
  /** what you need */
  needs?: L;
}

/** One measured or chosen result. */
export interface Measurement {
  /** the measured value in the unit of the metric (°, s, cm) – null for a self check */
  value: number | null;
  grade: Grade;
  source: 'camera' | 'self';
  /** checks that did not hold (e.g. "the heels come up") – English/German */
  notes?: L[];
  at: string;
}

export interface TestResult {
  /** sided tests */
  left?: Measurement;
  right?: Measurement;
  /** tests without sides */
  both?: Measurement;
}

export interface Screening {
  id: string;
  /** quick = 6 camera tests · full = all 15 · single = one test done on its own */
  kind: 'quick' | 'full' | 'single';
  tests: TestId[];
  createdAt: string;
  finishedAt: string | null;
  /** index of the test in play */
  current: number;
  /** right- or left-handed when screened (lead/trail sides) */
  hand: 'right' | 'left';
  results: Partial<Record<TestId, TestResult>>;
  /** tests the player skipped */
  skipped?: TestId[];
}
