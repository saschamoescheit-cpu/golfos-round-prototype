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
  /** The tees the course's map knows (OSM golf=tee + tee=yellow …), the app's names ("Yellow", "58"). */
  teeColours?: string[];
  /** Details for the drawn hole (2D, Sascha 14.10.2026), from OSM: single trees, tree rows and hedges, paths, rough. */
  treePoints?: LngLat[];
  treeRows?: LngLat[][];
  paths?: LngLat[][];
  rough?: Ring[];
  /** Tree and bush crowns read from the aerial image (scripts/canopy.py) – OSM has only part of the trees. */
  canopy?: Ring[];
  /** Fairway areas per hole read from the aerial image (scripts/fairways.py) – for drawing the 2D view only. */
  fairwayAuto?: Record<string, Ring[]>;
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
  /** The course area (west, south, east, north) – to fetch the map again when its copy is gone. */
  bbox?: [number, number, number, number];
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

/** Tee shot on par 4/5: fairway hit, missed left or right, or out of bounds ('ob', a miss with a penalty stroke). */
export type FairwayResult = 'left' | 'hit' | 'right' | 'ob';

// ---- Detailed tracking (feature 003) ----
/** 'semirough': the first cut next to the fairway (Sascha 18.10.2026) – between fairway and rough. */
/** 'fringe': the collar around the green (Vorgrün, Sascha 18.10.2026). */
export type Lie = 'tee' | 'fairway' | 'semirough' | 'rough' | 'fringe' | 'bunker' | 'recovery';
/** How the shot was played (feature 007): full swing, punch (low, under trees), pitch, chip, bunker shot. */
export type ShotKind = 'full' | 'punch' | 'pitch' | 'chip' | 'bunker';
/** 'Hy' is the 4-hybrid (shown as "4H"; the name stays for older rounds). Full list: lib/clubs.ts. */
export type Club = 'Dr' | '3W' | '4W' | '5W' | '7W' | '9W' | '2H' | '3H' | 'Hy' | '5H' | '6H' | '2i' | '3i' | '4i' | '5i' | '6i' | '7i' | '8i' | '9i' | 'PW' | 'GW' | 'SW' | 'LW' | 'Pt'; // 'Pt': the putter from off the green – the Texas wedge (Sascha 18.10.2026), not in the bag's distances
/** Penalty after a shot: water (drop near where it went in), out of bounds and lost ball (stroke and distance),
 *  unplayable (Rule 19: drop or again – Sascha 22.10.2026). */
export type PenaltyKind = 'water' | 'ob' | 'lost' | 'unplayable';
/** How the shot was struck (Sascha 22.10.2026: the bag learns from good strikes; misses per club). */
export type Strike = 'good' | 'fat' | 'thin' | 'slice' | 'hook' | 'shank';
/** What the shot was meant to do – a layup is no missed green. */
export type Intent = 'attack' | 'layup' | 'recovery';
/** The stance: flat, uphill, downhill, ball above / below the feet. */
export type SlopeLie = 'flat' | 'up' | 'down' | 'above' | 'below';
export interface Shot {
  pos: LngLat | null; // where the shot was hit from (GPS or tapped); null when entered without position
  lie: Lie;
  club: Club | null;
  penalty: boolean; // ball in water / out of bounds after this shot: +1 stroke
  penaltyKind?: PenaltyKind; // what the penalty was for (missing on older rounds: unknown)
  missPos?: LngLat | null; // where the ball went into the water / out of bounds (for the miss statistics)
  /** water, then played again from the same spot (stroke and distance) instead of a drop (Sascha 22.10.2026) */
  replay?: boolean;
  /** the ball played again was a provisional ball (out of bounds / lost off the tee) */
  provisional?: boolean;
  strike?: Strike;
  intent?: Intent;
  slope?: SlopeLie;
  kind?: ShotKind; // missing = suggested from lie and distance
  review?: boolean; // detected automatically from the GPS track – the player should check it
  byHand?: boolean; // noted by hand on the course ("shot here") – drawn as the hand circle with its club (20.10.2026)
}
export interface DetailEntry {
  shots: Shot[]; // all shots before the green (putts are counted separately)
  onGreen: LngLat | null; // where the ball came to rest on the green (first putt position)
  pin: LngLat | null; // pin position when the ball was marked on the green
  holedOut: boolean; // holed from off the green (chip-in, hole in one): no putts
  /** the shots are the ones noted by hand on the course ("shot here"), not the GPS detection (Sascha 18.10.2026) */
  fromHand?: boolean;
}

export interface HoleEntry {
  strokes: number | null; // null = not yet entered
  pickedUp: boolean;
  // Detail values – only recorded for the main player.
  putts: number | null;
  fairway: FairwayResult | null;
  penalties: number;
  greensideBunker: boolean;
  /** Shots from the sand on this hole (score entry as in Hole19); greensideBunker follows from it. */
  sandShots?: number;
  upAndDown: boolean | null;
  /** Detailed tracking: shots of the hole. Absent = quick tracking for this hole. */
  detail?: DetailEntry;
  /** Putts placed on the course (putt editor after the hole): the pin and where the ball lay before each putt. */
  puttsAt?: { pin: LngLat; balls: LngLat[] };
  /** Weather when the player was on the hole (GOL-26). */
  weather?: { tempC: number; windKmh: number; windFromDeg: number };
  /** The player confirmed the hole in the round check ("Loch passt", Sascha 22.10.2026). */
  checked?: boolean;
  /** How the first putt missed, told after the round when the putts were not placed on the green. */
  firstPuttMiss?: { length: 'short' | 'long' | null; line: 'left' | 'right' | null };
}

export interface Player {
  id: string;
  name: string;
  playingHandicap: number | null; // Spielvorgabe; null = gross only
  isMe: boolean;
  tee?: string; // the tee this player plays from (Sascha 21.10.2026: a flight with players from other tees)
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
  /** Planning the round (with preview): the targets and clubs set per hole are saved as the course's round plan. */
  planning?: boolean;
  /** Rebuilt from its GPS track after it was lost on the phone (lib/restore.ts) – holes and score to check. */
  restored?: boolean;
  /**
   * Quick or detailed tracking, chosen after the round (Sascha 14.10.2026 – the GPS track is recorded anyway):
   * 'score' = only a digital scorecard, no round check; 'full' or missing = the shots are checked after the round.
   */
  capture?: 'score' | 'full';
  /** Tournament, social or practice round (chosen before the round); missing = social. */
  kind?: 'tournament' | 'social' | 'training';
  /** When the player signed the scorecard (Sascha 16.10.2026) – only signed rounds count in statistics. */
  signedAt?: string | null;
  /** Test mode: where the player said his ball lay, by hand on the course – the truth for the shot detection. */
  manualShots?: { hole: number; pos: LngLat; t: number; acc: number; /** moved on the map to the exact spot */ placed?: boolean }[];
  /** Test (Sascha 18.10.2026): the cracks the microphone heard – when, where, how loud; kept apart from the detection */
  soundShots?: { hole: number; pos: LngLat; t: number; level: number; acc: number }[];
  /** Game mode and scoring (as in Hole19); missing = everyone for himself, stroke play gross. */
  format?: { mode: 'single' | 'match' | 'fourball' | 'scramble' | 'foursome'; scoring: 'stroke' | 'net' | 'stableford'; matchplay?: boolean; allowance?: number };
}
