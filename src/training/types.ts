import type { Chart } from './content/charts';
import type { GolferOptions, GolferPose, JointName } from './Golfer';
import type { RoundsTarget } from './content/rounds-links';

// The "Training" module (Sascha 15.10.2026): a golf knowledge base for practice – categories (putting, chipping,
// slopes …) with the basics, the typical faults, drills with a sketch, explainer videos and practice gear.
// Every text sits next to its translation ({ en, de }) like tr(en, de) elsewhere in the app.
// Content marked review: true is researched from the sources named with it and waits for Chris (golf pro).

/** A text in both languages. */
export interface L {
  en: string;
  de: string;
}
/** Shorthand for content files: L('English', 'Deutsch'). */
export const L = (en: string, de: string): L => ({ en, de });

export type CategoryId =
  | 'putting'
  | 'greenreading'
  | 'chipping'
  | 'pitching'
  | 'bunker'
  | 'slopes'
  | 'trouble'
  | 'irons'
  | 'woods'
  | 'driver'
  | 'basics'
  | 'swing'
  | 'ballflight'
  | 'strategy'
  | 'mental'
  | 'fitness'
  | 'practice';

export type Level = 1 | 2 | 3; // 1 beginner · 2 intermediate · 3 advanced

/** Where a drill is done. */
export type Place = 'green' | 'chipping' | 'bunker' | 'range' | 'course' | 'home' | 'gym';

/** A block of the basics of a category. */
export interface Section {
  title: L;
  /** paragraphs */
  text?: L[];
  /** bullet points */
  points?: L[];
  /** a key figure or rule of thumb, shown highlighted */
  fact?: L;
  sketch?: Sketch;
  /** the drill that shows it (its sketch when the section has none, and a link) */
  drill?: string;
  /** YouTube ids from the topic videos that explain it */
  videos?: string[];
  /** shows the built-in metronome: putting beat or swing tempo 3 : 1 */
  metronome?: 'putt' | 'swing';
  /** functions of GolfOS Rounds the section names */
  rounds?: RoundsTarget[];
}

/** A typical fault: what the player sees – why – what helps, with drills that fix it. */
export interface Fault {
  name: L;
  looks: L;
  cause: L;
  fix: L;
  drills?: string[];
}

export interface Category {
  id: CategoryId;
  name: L;
  short: L; // one line for the list
  intro: L; // why it matters
  /** key numbers from statistics and tour data */
  facts?: L[];
  sections: Section[];
  faults?: Fault[];
  /** small charts of the key numbers (content/charts.ts) */
  charts?: Chart[];
  videos?: Video[];
  sources?: Source[];
  /** related categories */
  see?: CategoryId[];
}

/** How a drill result is entered and compared. */
export type Scoring =
  | { kind: 'made'; of: number; unit?: L } // e.g. 14 of 16 holed – higher is better
  | { kind: 'points'; max?: number; unit?: L } // game points – higher is better
  | { kind: 'streak'; unit?: L } // longest streak / station reached – higher is better
  | { kind: 'strokes'; par?: number; unit?: L } // strokes for the game – lower is better
  | { kind: 'meters'; unit?: L; lower?: boolean } // e.g. average distance to the target – lower is better when lower
  | { kind: 'none' }; // just done

/** Targets by handicap: what is good for a player of that level (approximate, review by Chris). */
export interface Targets {
  high: number; // hcp 21+
  mid: number; // hcp 11–20
  low: number; // hcp 0–10
  tour?: number;
}

export interface Drill {
  id: string;
  cat: CategoryId;
  /** further categories the drill fits */
  also?: CategoryId[];
  name: L;
  /** what the drill trains, one line */
  goal: L;
  level: Level;
  minutes: number;
  place: Place;
  balls?: number;
  /** what you need: gear ids from the shop or plain items */
  needs?: (string | L)[];
  setup: L;
  steps: L[];
  scoring?: Scoring;
  targets?: Targets;
  /** what to watch, the feel */
  tips?: L[];
  /** easier / harder variants */
  easier?: L;
  harder?: L;
  /** who made it known, e.g. "Tiger Woods" */
  origin?: L;
  sketch?: Sketch;
  /** the built-in metronome: putting beat (distance control) or swing tempo 3 : 1 */
  metronome?: 'putt' | 'swing';
  /** functions of GolfOS Rounds the drill uses – opened with a tap (content/rounds-links.ts) */
  rounds?: RoundsTarget[];
  videos?: Video[];
  sources?: Source[];
  review?: boolean;
}

/** A YouTube explainer video – loaded only on tap (privacy). */
export interface Video {
  id: string; // YouTube id
  title: string;
  channel: string;
  lang: 'en' | 'de';
  /** start second */
  start?: number;
}

export interface Source {
  label: string;
  url: string;
}

export type GearKind = 'putting' | 'shortgame' | 'swing' | 'alignment' | 'speed' | 'tech' | 'home' | 'fitness' | 'balls' | 'books';

export interface Gear {
  id: string;
  name: string;
  brand: string | L;
  kind: GearKind;
  cats: CategoryId[];
  what: L; // what it is
  why: L; // what it helps with
  /** price range in euro, approximate (October 2026) */
  price: [number, number];
  url: string; // manufacturer page (empty: no link)
  /** manufacturer picture, linked not copied (Sascha 15.10.2026); the real app shows the partner's picture */
  image?: string;
  /** later: partner (affiliate) link, filled by the product team */
  affiliateUrl?: string;
  /** a do-it-yourself alternative */
  diy?: L;
}

/** A ready-made practice plan: drills one after the other with minutes. */
export interface Plan {
  id: string;
  name: L;
  about: L;
  level: Level | 0; // 0 = everyone
  focus: CategoryId[];
  items: { drill: string; minutes: number }[];
  /** for weekly plans: the day it belongs to */
  week?: { day: L; items: { drill: string; minutes: number }[] }[];
}

// ---------- sketches: a small drawing language, rendered as SVG ----------

/** A point in meters: x to the right, y up the page (towards the target). */
export type P = [number, number];

export type SketchItem =
  | { k: 'green'; x: number; y: number; w: number; h: number; round?: boolean } // putting surface
  | { k: 'fringe'; x: number; y: number; w: number; h: number; round?: boolean }
  | { k: 'fairway'; x: number; y: number; w: number; h: number; round?: boolean }
  | { k: 'rough'; x: number; y: number; w: number; h: number }
  | { k: 'sand'; x: number; y: number; w: number; h: number; round?: boolean }
  | { k: 'water'; x: number; y: number; w: number; h: number; round?: boolean }
  | { k: 'mat'; x: number; y: number; w: number; h: number } // putting or hitting mat
  | { k: 'hole'; at: P; flag?: boolean }
  | { k: 'ball'; at: P; n?: string | number | L; ghost?: boolean }
  | { k: 'tee'; at: P }
  | { k: 'coin'; at: P }
  | { k: 'stick'; from: P; to: P } // alignment stick
  | { k: 'string'; from: P; to: P } // chalk line / string
  | { k: 'ring'; at: P; r: number; label?: string | L; fill?: boolean } // target circle, hula hoop
  | { k: 'zone'; x: number; y: number; w: number; h: number; label?: string | L } // landing zone
  | { k: 'towel'; x: number; y: number; w: number; h: number }
  | { k: 'path'; pts: P[]; style?: 'roll' | 'flight' | 'aim' | 'club'; arrow?: boolean } // ball path, aim line
  | { k: 'player'; at: P; face?: 'up' | 'right' | 'left' } // the player seen from above (feet)
  | { k: 'club'; at: P; angle?: number } // a club lying on the ground
  | { k: 'putter'; at: P } // putter head behind the ball (face square to the line up the page)
  | { k: 'slope'; at: P; dir: number; label?: string | L } // downhill arrow (degrees, 0 = up the page)
  | { k: 'text'; at: P; t: L | string; size?: number; anchor?: 'start' | 'middle' | 'end' }
  | { k: 'dim'; from: P; to: P; t: L | string }; // dimension line with text

/** Golfer poses for side views; the fitness poses are drawn from joint points (see Sketch.tsx). */
export type Pose = GolferPose;

/** Side view (slopes, ball flight, posture). */
export type SideItem =
  | { k: 'ground'; pts: P[]; sand?: boolean }
  | ({ k: 'figure'; at: P; tilt?: number; pose?: Pose } & Omit<GolferOptions, 'pose'>) // front = seen from the front, target to the right
  /** a label that points at a joint of a figure (the first figure unless fig is given) – the detail the text is about */
  | { k: 'callout'; on: JointName; t: L | string; at: P; fig?: number }
  | { k: 'ball'; at: P }
  | { k: 'flight'; pts: P[]; dashed?: boolean }
  | { k: 'flag'; at: P }
  | { k: 'arrow'; from: P; to: P }
  | { k: 'text'; at: P; t: L | string; size?: number; anchor?: 'start' | 'middle' | 'end' }
  | { k: 'line'; from: P; to: P; dashed?: boolean; stick?: boolean } // stick = an alignment stick (orange, thicker)

export type Sketch =
  | { view: 'top'; w: number; h: number; items: SketchItem[]; caption?: L }
  | { view: 'side'; w: number; h: number; items: SideItem[]; caption?: L }
  | { view: 'face'; marks: { x: number; y: number; n?: L | string }[]; caption?: L }; // club face, impact marks (-1..1)
