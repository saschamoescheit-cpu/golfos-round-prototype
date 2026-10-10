// Domain model of the round-tracking prototype. Golf terms: see feature.md, part B.

export type CourseSource = 'osm' | 'opengolfapi';

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

export interface HoleEntry {
  strokes: number | null; // null = not yet entered
  pickedUp: boolean;
  // Detail values – only recorded for the main player.
  putts: number | null;
  fairway: FairwayResult | null;
  penalties: number;
  greensideBunker: boolean;
  upAndDown: boolean | null;
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
}
