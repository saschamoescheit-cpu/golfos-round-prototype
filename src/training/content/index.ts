import { chris2Drills } from './chris2';
import type { Category, CategoryId, Drill, Motion, Section, TopicShot, ShotPart, Sketch, Video } from '../types';
import { highlow, lob, lowpoint, spin } from './topics-new';
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
import { MOBILITY_DRILL_VIDEOS, mobilityDrills } from './mobility';
import { VIDEOS_DE } from './videos-de';
import { DRILL_MOTIONS, FAULT_MOTIONS, SECTION_MOTIONS } from './motions';
import { SECTION_MEDIA } from './section-media';
import { CHARTS } from './charts';
import { DRILL_VIDEOS } from './drill-videos';
import { DRILL_OWN_VIDEOS } from './drill-videos-own';
import { DRILL_ROUNDS, SECTION_ROUNDS } from './rounds-links';
import { FIGURE_SKETCHES, SECTION_DRILL_PICTURES, SECTION_FIGURE_SKETCHES } from './sketches-figures';
import { FAULT_SKETCHES } from './sketches-faults';
import { SHOTS } from './shots';
import { RETIRED_DRILLS, RETIRED_SHOTS } from './retired';

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
  ...mobilityDrills, // corrective drills of the mobility screen (17.10.2026)
  ...chris2Drills, // Chris' review part 2 (16.11.2026): two drills for the gaps
] as Drill[];
/** a side picture with its movement */
function withMotion<T extends { sketch?: Sketch }>(x: T, motion?: Motion): T {
  // drawn movements need the side view (no 3D in Training since 17.11.2026)
  return motion && x.sketch?.view === 'side' && motion.frames.length ? { ...x, sketch: { ...x.sketch, motion } } : x;
}
const drillPicture = (id: string) => {
  const d = RAW_DRILLS.find((x) => x.id === id);
  return FIGURE_SKETCHES[id] ?? d?.sketch ?? SKETCHES[id];
};

// the topics in the library; lob, spin, high & low and the low point are new as shots (Sascha 15.11.2026)
const BUILT: Category[] = [putting, greenreading, chipping, pitching, lob, spin, bunker, slopes, trouble, highlow, lowpoint, irons, woods, driver, basics, swing, ballflight, strategy, mental, fitness, practice]
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
  .map((c) => (SECTION_ROUNDS[c.id] ? { ...c, sections: c.sections.map((x) => (SECTION_ROUNDS[c.id]![x.title.en] ? { ...x, rounds: SECTION_ROUNDS[c.id]![x.title.en] } : x)) } : c))
  // the picture moves: a play button shows the movement (Sascha 17.10.2026)
  .map((c) => (SECTION_MOTIONS[c.id] ? { ...c, sections: c.sections.map((x) => withMotion(x, SECTION_MOTIONS[c.id]![x.title.en])) } : c))
  .map((c) => (FAULT_MOTIONS[c.id] ? { ...c, faults: c.faults?.map((f) => withMotion(f, FAULT_MOTIONS[c.id]![f.name.en])) } : c));

export const CATEGORIES: Category[] = BUILT
  // the topic as shots (Sascha 15.11.2026): a tab that names a section shows that section's picture with its movement;
  // the sections that moved into the shots leave the basics
  .map((c) => {
    const sh = SHOTS[c.id];
    if (!sh) return c;
    // "Title" = a section of this topic, "topic/Title" = of another topic (lob and spin show pictures of pitching)
    const find = (ref: string) => {
      const [cat, title] = ref.includes('/') ? ref.split('/') : [c.id, ref];
      return BUILT.find((x) => x.id === cat)?.sections.find((s) => s.title.en === title);
    };
    const pic = <T extends ShotPart>(p: T): T => (p.sketch ? p : p.section ? { ...p, sketch: find(p.section)?.sketch } : p.drillPic ? { ...p, sketch: drillPicture(p.drillPic) } : p);
    const absorbs = sh.absorbs ?? [];
    return {
      ...c,
      // what our pro took out does not show (content/retired.ts)
      shots: sh.shots.filter((s) => !RETIRED_SHOTS.includes(s.id)).map((s) => ({ ...s, drills: s.drills?.filter((d) => !RETIRED_DRILLS.includes(d)), setup: pic(s.setup), move: pic(s.move), watch: pic(s.watch) })),
      lieChart: sh.lie,
      sections: c.sections.filter((s) => !absorbs.includes(s.title.en)),
      absorbed: c.sections.filter((s) => absorbs.includes(s.title.en)),
    };
  });

/** The shots that use these drills, the most shared first (night run 15./16.11.2026: a fault, an advice from the
 *  rounds or a coach fault leads to its shot). Ties keep the library order. */
export const shotsForDrills = (ids: string[], max = 2): { cat: Category; shot: TopicShot }[] => {
  const all = CATEGORIES.flatMap((cat) => (cat.shots ?? []).map((shot) => ({ cat, shot, n: (shot.drills ?? []).filter((d) => ids.includes(d)).length })));
  return all
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map(({ cat, shot }) => ({ cat, shot }));
};
/** the shots a drill belongs to */
export const shotsOfDrill = (id: string): { cat: Category; shot: TopicShot }[] => CATEGORIES.flatMap((cat) => (cat.shots ?? []).filter((s) => s.drills?.includes(id)).map((shot) => ({ cat, shot })));

/** a section of a topic by its English title – also one whose content moved into the shots */
export const sectionOf = (c: Category, title: string): Section | undefined => [...c.sections, ...(c.absorbed ?? [])].find((s) => s.title.en === title);
/** a shot and its topic */
export const shotById = (id: string): { cat: Category; shot: TopicShot } | undefined => {
  for (const cat of CATEGORIES) {
    const shot = cat.shots?.find((s) => s.id === id);
    if (shot) return { cat, shot };
  }
  return undefined;
};

const TOPIC_VIDEOS = new Map(CATEGORIES.flatMap((c) => c.videos ?? []).map((v) => [v.id, v]));
/** a checked video anywhere in the library – a topic's or one found for a drill */
export const videoById = (id: string): Video | undefined => TOPIC_VIDEOS.get(id) ?? Object.values(DRILL_OWN_VIDEOS).flat().find((v) => v.id === id);
/** the topics whose shots use a drill (it shows in those topics too) */
const SHOT_TOPICS = new Map<string, CategoryId[]>();
for (const c of CATEGORIES) for (const s of c.shots ?? []) for (const d of s.drills ?? []) SHOT_TOPICS.set(d, [...new Set([...(SHOT_TOPICS.get(d) ?? []), c.id])]);

const ALL_DRILLS: Drill[] = RAW_DRILLS
  .map((d) => (d.sketch || !SKETCHES[d.id] ? d : { ...d, sketch: SKETCHES[d.id] })) // every drill gets its own sketch
  // the sketches with a golfer, drawn again to show what the text describes (16./17.10.2026)
  .map((d) => (FIGURE_SKETCHES[d.id] ? { ...d, sketch: FIGURE_SKETCHES[d.id] } : d))
  .map((d) => withMotion(d, DRILL_MOTIONS[d.id]))
  .map((d) => (DRILL_ROUNDS[d.id] ? { ...d, rounds: DRILL_ROUNDS[d.id] } : d))
  .map((d) => (METRONOME_DRILLS.includes(d.id) ? { ...d, metronome: 'putt' as const } : SWING_TEMPO_DRILLS.includes(d.id) ? { ...d, metronome: 'swing' as const } : d))
  .map((d) => (NO_RESULT_DRILLS.includes(d.id) ? { ...d, scoring: { kind: 'none' as const }, targets: undefined } : d))
  // a drill a shot of another topic uses shows in that topic too (the new topics are built from existing drills)
  .map((d) => {
    const more = (SHOT_TOPICS.get(d.id) ?? []).filter((x) => x !== d.cat && !d.also?.includes(x));
    return more.length ? { ...d, also: [...(d.also ?? []), ...more] } : d;
  })
  // a video for every drill where one fits – the drill's own first, then the matching topic videos
  .map((d) => {
    const all = [...(DRILL_OWN_VIDEOS[d.id] ?? []), ...(DRILL_VIDEOS[d.id] ?? []).map((id) => TOPIC_VIDEOS.get(id)).filter((v): v is NonNullable<typeof v> => !!v), ...(MOBILITY_DRILL_VIDEOS[d.id] ?? [])];
    const extra = all.filter((v, i) => all.findIndex((x) => x.id === v.id) === i);
    if (!extra.length) return d;
    const own = d.videos ?? [];
    return { ...d, videos: [...own, ...extra.filter((v) => !own.some((o) => o.id === v.id))] };
  });

/** The drills of the library – without the ones our pro took out (content/retired.ts). */
export const DRILLS: Drill[] = ALL_DRILLS.filter((d) => !RETIRED_DRILLS.includes(d.id));

export const catById = (id: CategoryId): Category | undefined => CATEGORIES.find((c) => c.id === id);
export const drillById = (id: string): Drill | undefined => DRILLS.find((d) => d.id === id);
/** also a drill our pro took out – for what the player already logged, a started session or an old link */
export const anyDrillById = (id: string): Drill | undefined => ALL_DRILLS.find((d) => d.id === id);
/** Drills of a category: its own first, then those that also fit. */
export const drillsOf = (id: CategoryId): Drill[] => [...DRILLS.filter((d) => d.cat === id), ...DRILLS.filter((d) => d.cat !== id && d.also?.includes(id))];
