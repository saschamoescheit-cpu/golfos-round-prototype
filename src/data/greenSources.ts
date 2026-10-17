// Where the green heights come from – the licences ask for the credit in the app (shown in the map's ⓘ).
// Hetzenhof: Datenlizenz Deutschland – Namensnennung 2.0 (LGL). Mallorca: IDEIB, Govern de les Illes Balears.
const LGL = 'Grünhöhen: © LGL, www.lgl-bw.de (dl-de/by-2-0)';
const IDEIB = 'Grünhöhen: IDEIB, Govern de les Illes Balears';
const USGS = 'Green heights: USGS 3D Elevation Program (3DEP)';

const BY_COURSE: Record<string, string> = {
  'osm:relation/1326323': LGL,
  // Florida (USA trip, 17.10.2026)
  'osm:relation/4039579': USGS,
  'osm:way/311994625': USGS,
  'osm:relation/4040123': USGS,
  'osm:relation/4039887': USGS,
};

/** Credit for the green heights of a course, or null when it has no green charts. */
export function greenSource(courseId: string, hasCharts: boolean): string | null {
  if (!hasCharts) return null;
  return BY_COURSE[courseId] ?? IDEIB; // all other courses with charts are on Mallorca
}
