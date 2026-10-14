// Domain model of the round-tracking prototype. Golf terms: see feature.md, part B.

export type CourseSource = 'osm' | 'opengolfapi';

/** [longitude, latitude] – GeoJSON order. */
export type LngLat = [number, number];
export type Ring = LngLat[];

/** Course map data from OpenStreetMap. Hole lines run from the tee to the pin (doglegs included). */
export interface CourseGeometry {
  holes: { ref: string; par?: string | null; handicap?: string | null; line: LngLat[] }[];
  green: Ring[];
  tee: Ring[];
  bunker: Ring[];
  fairway: Ring[];
  water: Ring[];
  /** Main slope per green (by hole ref): % and compass direction the green falls to. Approximation. */
  greenSlopes?: Record<string, { pct: number; downDeg: number }>;
  /** Woods and scrub (OSM natural=wood|scrub, landuse=forest) – trees that block shots. */
  trees?: Ring[];
  /** Outline of the golf course (OSM leisure=golf_course) – beyond it is usually out of bounds. */
  boundary?: Ring[];
  /** Every 10 m along each hole (by ref): [metres from the tee, cross slope % (+ = right side higher, ball rolls left), height m]. */
  fairwaySlopes?: Record<string, [number, number, number?][]>;
}

/** One hole as delivered by the course database (before a round is set up). */
export interface CourseHole {
  /** Original label from the data source, e.g. "4A" or "12". */
  ref: string;
  /** Loop the hole belongs to ("A", "B", "Main" …). */
  loop: string;
  /** Hole number within its loop (1–9 or 1–18). */
  number: number;
  par: number | null;
  /** Stroke index candidates. 27-hole courses store "11/12": [11, 12]. */
  strokeIndex: number[];
}

export interface Course {
  id: string; // "osm:relation/123" or "oga:<uuid>"
  source: CourseSource;
  name: string;
  lat: number;
  lon: number;
  holes: CourseHole[];
  /** Loops in display order, each with its holes sorted by number. */
  loops: string[];
}

export interface CourseSummary {
  id: string;
  source: CourseSource;
  name: string;
  lat: number;
  lon: number;
  distanceKm?: number;
  /** Area of the course [minLon, minLat, maxLon, maxLat]; used to load the holes from the OSM API. */
  bbox?: [number, number, number, number];
  place?: string;
}

/** A hole as played in a concrete round (loop order resolved). */
export interface RoundHole {
  index: number; // 0-based position in the round
  label: string; // shown to the player, e.g. "4A"
  loop: string;
  number: number;
  par: number;
  strokeIndex: number;
}

export type FairwayResult = 'left' | 'hit' | 'right';

// ---- Detailed tracking (feature 003) ----
export type Lie = 'tee' | 'fairway' | 'rough' | 'bunker' | 'recovery';
/** How the shot was played (feature 007): full swing, punch (low, under trees), pitch, chip, bunker shot. */
export type ShotKind = 'full' | 'punch' | 'pitch' | 'chip' | 'bunker';
/** 'Hy' is the 4-hybrid (shown as "4H"; the name stays for older rounds). Full list: lib/clubs.ts. */
export type Club = 'Dr' | '3W' | '4W' | '5W' | '7W' | '9W' | '2H' | '3H' | 'Hy' | '5H' | '6H' | '2i' | '3i' | '4i' | '5i' | '6i' | '7i' | '8i' | '9i' | 'PW' | 'GW' | 'SW' | 'LW';
/** Penalty after a shot: water (drop near where it went in) or out of bounds (stroke and distance). */
export type PenaltyKind = 'water' | 'ob';
export interface Shot {
  pos: LngLat | null; // where the shot was hit from (GPS or tapped); null when entered without position
  lie: Lie;
  club: Club | null;
  penalty: boolean; // ball in water / out of bounds after this shot: +1 stroke
  penaltyKind?: PenaltyKind; // what the penalty was for (missing on older rounds: unknown)
  missPos?: LngLat | null; // where the ball went into the water / out of bounds (for the miss statistics)
  kind?: ShotKind; // missing = suggested from lie and distance
  review?: boolean; // detected automatically from the GPS track – the player should check it
}
export interface DetailEntry {
  shots: Shot[]; // all shots before the green (putts are counted separately)
  onGreen: LngLat | null; // where the ball came to rest on the green (first putt position)
  pin: LngLat | null; // pin position when the ball was marked on the green
  holedOut: boolean; // holed from off the green (chip-in, hole in one): no putts
}

export interface HoleEntry {
  strokes: number | null; // null = not yet entered
  pickedUp: boolean;
  // Detail values – only recorded for the main player.
  putts: number | null;
  fairway: FairwayResult | null;
  penalties: number;
  greensideBunker: boolean;
  upAndDown: boolean | null;
  /** Detailed tracking: shots of the hole. Absent = quick tracking for this hole. */
  detail?: DetailEntry;
  /** Putts placed on the course (putt editor after the hole): the pin and where the ball lay before each putt. */
  puttsAt?: { pin: LngLat; balls: LngLat[] };
  /** Weather when the player was on the hole (GOL-26). */
  weather?: { tempC: number; windKmh: number; windFromDeg: number };
}

export interface Player {
  id: string;
  name: string;
  playingHandicap: number | null; // Spielvorgabe; null = gross only
  isMe: boolean;
}

export type CaptureMode = 'quick' | 'detail';

export interface Round {
  id: string;
  createdAt: string; // ISO
  finishedAt: string | null;
  courseId: string;
  courseName: string;
  loopOrder: string[];
  holes: RoundHole[];
  mode: CaptureMode;
  players: Player[];
  /** entries[playerId][holeIndex] */
  entries: Record<string, HoleEntry[]>;
  currentHole: number;
  /** Tee colour the player plays from (when the course has tee data). */
  tee?: string;
  /** Course rating and slope the player entered or corrected (else the bundled values for the tee are used). */
  rating?: { cr: number; slope: number };
  /** Course preview from the sofa: browse the holes, nothing is saved. */
  preview?: boolean;
  /** Game mode and scoring (as in Hole19); missing = everyone for himself, stroke play gross. */
  format?: { mode: 'single' | 'match' | 'fourball' | 'scramble' | 'foursome'; scoring: 'stroke' | 'net' | 'stableford'; matchplay?: boolean; allowance?: number };
}
