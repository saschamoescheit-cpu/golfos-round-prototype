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

// All content of the Training module. Order of the categories = order in the library: the short game first
// (where most strokes are lost), then the long game, then the head and the body.

/** Distance-control drills that show the built-in metronome (Sascha 16.10.2026: rhythm is the key to length). */
export const METRONOME_DRILLS = ['metronome', 'ladder', 'lag-circle', 'four-tee', 'pelz-17', 'fringe', 'star-fringe', 'eyes-hole', 'eyes-closed', 'uphill-downhill', 'wellputt-lines', 'pressure-putt', 'three-speeds', 'stimp-test'];

export const CATEGORIES: Category[] = [putting, greenreading, chipping, pitching, bunker, slopes, trouble, irons, woods, driver, basics, swing, ballflight, strategy, mental, fitness, practice]
  .map((c) => (VIDEOS_DE[c.id] ? { ...c, videos: [...(c.videos ?? []), ...VIDEOS_DE[c.id]!] } : c))
  // a picture and, where there is one, a video for every section of the basics (Sascha 16.10.2026)
  .map((c) => ({ ...c, sections: c.sections.map((x, i) => ({ ...SECTION_MEDIA[c.id]?.[i], ...x })) }));

export const DRILLS: Drill[] = ([
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
] as Drill[])
  .map((d) => (d.sketch || !SKETCHES[d.id] ? d : { ...d, sketch: SKETCHES[d.id] })) // every drill gets its own sketch
  .map((d) => (METRONOME_DRILLS.includes(d.id) ? { ...d, metronome: true } : d));

export const catById = (id: CategoryId): Category | undefined => CATEGORIES.find((c) => c.id === id);
export const drillById = (id: string): Drill | undefined => DRILLS.find((d) => d.id === id);
/** Drills of a category: its own first, then those that also fit. */
export const drillsOf = (id: CategoryId): Drill[] => [...DRILLS.filter((d) => d.cat === id), ...DRILLS.filter((d) => d.cat !== id && d.also?.includes(id))];
