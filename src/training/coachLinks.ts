import { shotsForDrills } from './content';
// Coach → Training (prepared 16.10.2026): for every fault of the Coach module's catalogue
// (coach-prototype/src/coach/faults/catalog.json, the same ids) the Training drills that work on it, best first.
// When the swing analysis finds a fault, the app can offer exactly these drills. To be checked by Chris. (17.11.2026: the
// drills Chris took out in part 2 replaced by ones he kept)

/** the shot that belongs to a fault the coach found (night run 15./16.11.2026) – through the drills it names */
export const coachShots = (fault: string, max = 2) => shotsForDrills(COACH_FAULT_DRILLS[fault] ?? [], max);

export const COACH_FAULT_DRILLS: Record<string, string[]> = {
  early_extension: ['glute-bridge', 'hip-9090', 'below-feet-stay'],
  head_sway: ['feet-together-swing', 'cross-arms-turn', 'slow-motion'],
  head_lift: ['tee-after-ball', 'line-drill-irons', 'towel-behind'],
  head_dip: ['feet-together-swing', 'slow-motion', 'mirror-setup-full'],
  hip_sway: ['cross-arms-turn', 'feet-together-swing', 'slow-motion'],
  reverse_pivot: ['step-drill', 'impact-bag', 'cross-arms-turn'],
  weight_back: ['step-drill', 'towel-behind', 'trail-toe', 'impact-bag'],
  over_the_top: ['headcover-outside', 'step-drill', 'split-grip'],
  chicken_wing: ['split-grip', 'towel-arms', 'l-to-l', 'hold-finish'],
  short_shoulder_turn: ['open-books', 'seated-rotation', 'cross-arms-turn'],
  casting: ['pause-top', 'impact-bag', 'l-to-l'],
  tempo_fast: ['pause-top', 'feet-together-swing', 'slow-motion'],
  tempo_slow: ['practice-swing-match', 'feet-together-swing'],
  shaft_flat_backswing9: ['slow-motion', 'l-to-l'],
  shaft_steep_backswing9: ['slow-motion', 'l-to-l'],
  shaft_steep_downswing9: ['headcover-outside', 'step-drill', 'split-grip'],
  shaft_flat_downswing9: ['hook-gate', 'hold-finish', 'cross-arms-turn'],
  bent_lead_arm: ['lead-arm-only', 'l-to-l', 'towel-arms'],
  flying_elbow: ['towel-arms', 'slow-motion', 'l-to-l'],
  setup_upright: ['mirror-setup-full', 'alignment-station'],
  setup_crouched: ['mirror-setup-full', 'alignment-station'],
  flip_at_impact: ['impact-bag', 'tee-after-ball', 'towel-behind', 'stick-lead-arm'],
  chip_weight_back: ['trail-toe', 'chip-line', 'stick-lead-arm'],
  chip_scoop: ['stick-lead-arm', 'lead-hand-chip', 'chip-line'],
  chip_backswing_long: ['hold-finish-chip', 'landing-ring'],
  pitch_backswing_long: ['nine-to-three', 'clock-matrix'],
  short_game_tempo: ['nine-to-three', 'feet-together-pitch', 'hold-finish-chip'],
  bunker_short_backswing: ['bunker-ladder', 'line-in-sand', 'dollar-bill'], // splash-no-ball: out (Chris 15.11.2026)
  putt_head_movement: ['mirror-setup', 'eyes-closed', 'one-hand'],
  putt_body_movement: ['mirror-setup', 'tiger-gate', 'metronome'],
  putt_wrist_break: ['one-hand', 'tiger-gate', 'mirror-setup'], // sweetspot-gate: out (Chris 15.11.2026)
  putt_tempo: ['metronome', 'ladder', 'eyes-closed'],
};
