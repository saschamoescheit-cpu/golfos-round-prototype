import type { CategoryId } from '../types';

// Where a drill or a basics section names a function of GolfOS Rounds, a tap opens it (Sascha 16.10.2026: "why is it
// not linked from here?"). Mein Bag and the caddie settings open over Training (back returns here); the other targets
// switch to the Rounds module on that screen.

export type RoundsTarget = 'bag' | 'caddie' | 'stats' | 'rounds' | 'course';

export const DRILL_ROUNDS: Record<string, RoundsTarget[]> = {
  'green-map-compare': ['course'],
  'clock-matrix': ['bag'],
  gapping: ['bag'],
  'favourite-distance': ['bag'],
  'safe-target': ['caddie'],
  'nine-hole-plan': ['course'],
  'stats-round': ['stats'],
  'round-journal': ['rounds'],
  'range-round': ['course'],
  'two-club-wind': ['caddie'],
  'process-score': ['rounds'],
};

/** By topic and the English title of the section (stable when sections are added). */
export const SECTION_ROUNDS: Partial<Record<CategoryId, Record<string, RoundsTarget[]>>> = {
  greenreading: { 'GolfOS green slope': ['course'] },
  pitching: { 'Your wedge chart': ['bag'] },
  trouble: { Wind: ['caddie'] },
  irons: { 'Know your distances': ['bag', 'caddie'] },
  strategy: { 'Know your pattern': ['stats'], 'Your personal par': ['rounds'], 'Use the GolfOS caddie': ['caddie', 'course'] },
  practice: { 'Use your data': ['stats'] },
};
