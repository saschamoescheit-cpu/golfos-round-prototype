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
export type Club = 'Dr' | '3W' | '5W' | 'Hy' | '4i' | '5i' | '6i' | '7i' | '8i' | '9i' | 'PW' | 'GW' | 'SW' | 'LW';
export interface Shot {
  pos: LngLat | null; // where the shot was hit from (GPS or tapped); null when entered without position
  lie: Lie;
  club: Club | null;
  penalty: boolean; // ball in water / out of bounds after this shot: +1 stroke
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
  /** Course preview from the sofa: browse the holes, nothing is saved. */
  preview?: boolean;
}
