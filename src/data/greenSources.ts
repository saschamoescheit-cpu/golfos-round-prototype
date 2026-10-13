// Where the green heights come from – the licences ask for the credit in the app (shown in the map's ⓘ).
// Hetzenhof: Datenlizenz Deutschland – Namensnennung 2.0 (LGL). Mallorca: IDEIB, Govern de les Illes Balears.
const LGL = 'Grünhöhen: © LGL, www.lgl-bw.de (dl-de/by-2-0)';
const IDEIB = 'Grünhöhen: IDEIB, Govern de les Illes Balears';

const BY_COURSE: Record<string, string> = { 'osm:relation/1326323': LGL };

/** Credit for the green heights of a course, or null when it has no green charts. */
export function greenSource(courseId: string, hasCharts: boolean): string | null {
  if (!hasCharts) return null;
  return BY_COURSE[courseId] ?? IDEIB; // all other courses with charts are on Mallorca
}
