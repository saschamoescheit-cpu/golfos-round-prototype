import type { Category, CategoryId, Drill } from '../types';
import { putting, puttingDrills } from './putting';
import { greenreading, greenreadingDrills } from './greenreading';
import { chipping, chippingDrills } from './chipping';
import { pitching, pitchingDrills } from './pitching';
import { bunker, bunkerDrills } from './bunker';
import { slopes, slopesDrills } from './slopes';
import { trouble, troubleDrills } from './trouble';
import { irons, ironsDrills } from './irons';
import { woods, woodsDrills } from './woods';
import { driver, driverDrills } from './driver';
import { basics, basicsDrills } from './basics';
import { swing, swingDrills } from './swing';
import { ballflight, ballflightDrills } from './ballflight';
import { strategy, strategyDrills } from './strategy';
import { mental, mentalDrills } from './mental';
import { fitness, fitnessDrills } from './fitness';
import { practice, practiceDrills } from './practice';
import { SKETCHES } from './sketches';
import { moreDrills } from './more';
import { VIDEOS_DE } from './videos-de';
import { SECTION_MEDIA } from './section-media';
import { CHARTS } from './charts';
import { DRILL_VIDEOS } from './drill-videos';
import { DRILL_OWN_VIDEOS } from './drill-videos-own';
import { DRILL_ROUNDS, SECTION_ROUNDS } from './rounds-links';
import { FIGURE_SKETCHES, SECTION_DRILL_PICTURES, SECTION_FIGURE_SKETCHES } from './sketches-figures';
import { FAULT_SKETCHES } from './sketches-faults';

// All content of the Training module. Order of the categories = order in the library: the short game first
// (where most strokes are lost), then the long game, then the head and the body.

/** Distance-control drills that show the built-in metronome (Sascha 16.10.2026: rhythm is the key to length). */
export const METRONOME_DRILLS = ['metronome', 'ladder', 'lag-circle', 'four-tee', 'pelz-17', 'fringe', 'star-fringe', 'eyes-hole', 'eyes-closed', 'uphill-downhill', 'wellputt-lines', 'pressure-putt', 'three-speeds', 'stimp-test'];

/** Full-swing drills with the swing tempo 3 : 1 (Tour Tempo). */
export const SWING_TEMPO_DRILLS = ['tempo-321', 'feet-together-swing', 'driver-80', 'practice-swing-match'];

/** Drills without a measurable result at practice – planning, on-course tasks, judgement (Sascha 16.10.2026: "for
 * course management or fitness the result part makes little sense"). They show no result entry, evaluation or
 * targets; drills whose scoring is already "none" behave the same. */
export const NO_RESULT_DRILLS = ['safe-target', 'nine-hole-plan', 'bogey-plan', 'par3-middle', 'two-club-wind', 'seated-rotation', 'think-play-box', 'visualise', 'ten-second'];

const RAW_DRILLS = [
  ...puttingDrills,
  ...greenreadingDrills,
  ...chippingDrills,
  ...pitchingDrills,
  ...bunkerDrills,
  ...slopesDrills,
  ...troubleDrills,
  ...ironsDrills,
  ...woodsDrills,
  ...driverDrills,
  ...basicsDrills,
  ...swingDrills,
  ...ballflightDrills,
  ...strategyDrills,
  ...mentalDrills,
  ...fitnessDrills,
  ...practiceDrills,
  ...moreDrills,
] as Drill[];
const drillPicture = (id: string) => {
  const d = RAW_DRILLS.find((x) => x.id === id);
  return FIGURE_SKETCHES[id] ?? d?.sketch ?? SKETCHES[id];
};

export const CATEGORIES: Category[] = [putting, greenreading, chipping, pitching, bunker, slopes, trouble, irons, woods, driver, basics, swing, ballflight, strategy, mental, fitness, practice]
  .map((c) => (VIDEOS_DE[c.id] ? { ...c, videos: [...(c.videos ?? []), ...VIDEOS_DE[c.id]!] } : c))
  // a picture and, where there is one, a video for every section of the basics (Sascha 16.10.2026)
  .map((c) => ({ ...c, sections: c.sections.map((x, i) => ({ ...SECTION_MEDIA[c.id]?.[i], ...x })) }))
  // small charts of the key numbers (Sascha 16.10.2026: pictures with the text)
  .map((c) => (CHARTS[c.id] ? { ...c, charts: CHARTS[c.id] } : c))
  .map((c) => (SECTION_DRILL_PICTURES[c.id] ? { ...c, sections: c.sections.map((x) => (SECTION_DRILL_PICTURES[c.id]![x.title.en] ? { ...x, sketch: drillPicture(SECTION_DRILL_PICTURES[c.id]![x.title.en]) } : x)) } : c))
  .map((c) => (SECTION_FIGURE_SKETCHES[c.id] ? { ...c, sections: c.sections.map((x) => (SECTION_FIGURE_SKETCHES[c.id]![x.title.en] ? { ...x, sketch: SECTION_FIGURE_SKETCHES[c.id]![x.title.en] } : x)) } : c))
  // the picture of each fault: the fault next to the right way (Sascha 17.10.2026)
  .map((c) => (FAULT_SKETCHES[c.id] ? { ...c, faults: c.faults?.map((f) => (FAULT_SKETCHES[c.id]![f.name.en] ? { ...f, sketch: FAULT_SKETCHES[c.id]![f.name.en] } : f)) } : c))
  // the Rounds functions a section names, opened with a tap
  .map((c) => (SECTION_ROUNDS[c.id] ? { ...c, sections: c.sections.map((x) => (SECTION_ROUNDS[c.id]![x.title.en] ? { ...x, rounds: SECTION_ROUNDS[c.id]![x.title.en] } : x)) } : c));

const TOPIC_VIDEOS = new Map(CATEGORIES.flatMap((c) => c.videos ?? []).map((v) => [v.id, v]));

export const DRILLS: Drill[] = RAW_DRILLS
  .map((d) => (d.sketch || !SKETCHES[d.id] ? d : { ...d, sketch: SKETCHES[d.id] })) // every drill gets its own sketch
  // the sketches with a golfer, drawn again to show what the text describes (16./17.10.2026)
  .map((d) => (FIGURE_SKETCHES[d.id] ? { ...d, sketch: FIGURE_SKETCHES[d.id] } : d))
  .map((d) => (DRILL_ROUNDS[d.id] ? { ...d, rounds: DRILL_ROUNDS[d.id] } : d))
  .map((d) => (METRONOME_DRILLS.includes(d.id) ? { ...d, metronome: 'putt' as const } : SWING_TEMPO_DRILLS.includes(d.id) ? { ...d, metronome: 'swing' as const } : d))
  .map((d) => (NO_RESULT_DRILLS.includes(d.id) ? { ...d, scoring: { kind: 'none' as const }, targets: undefined } : d))
  // a video for every drill where one fits – the drill's own first, then the matching topic videos
  .map((d) => {
    const extra = [...(DRILL_OWN_VIDEOS[d.id] ?? []), ...(DRILL_VIDEOS[d.id] ?? []).map((id) => TOPIC_VIDEOS.get(id)).filter((v): v is NonNullable<typeof v> => !!v)];
    if (!extra.length) return d;
    const own = d.videos ?? [];
    return { ...d, videos: [...own, ...extra.filter((v) => !own.some((o) => o.id === v.id))] };
  });

export const catById = (id: CategoryId): Category | undefined => CATEGORIES.find((c) => c.id === id);
export const drillById = (id: string): Drill | undefined => DRILLS.find((d) => d.id === id);
/** Drills of a category: its own first, then those that also fit. */
export const drillsOf = (id: CategoryId): Drill[] => [...DRILLS.filter((d) => d.cat === id), ...DRILLS.filter((d) => d.cat !== id && d.also?.includes(id))];
