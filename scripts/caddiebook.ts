// Caddie book of a course (Sascha 15.10.2026: "the 2D view of Hetzenhof with all the caddie's advice, and a field
// for what matters to me on each hole – so we can tune the caddie"): per hole the caddie's advice from the tee and for
// the next shot(s) in calm weather, with the standard carries, plus the course book's facts. In German.
// Run: npx tsx scripts/caddiebook.ts <course id> [tee] > out.json
import { setLang } from '../src/lib/i18n';
import { SEED_COURSES } from '../src/data/seedCourses';
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { holesFromTags } from '../src/lib/courses';
import { distanceM, holeMapData, lineLength } from '../src/lib/geo';
import { holeForTee } from '../src/lib/teeline';
import { caddieAdvice, teeAimFor } from '../src/lib/caddieplan';
import { DEFAULT_CARRY } from '../src/lib/caddie';
import { withPartials } from '../src/lib/partials';
import { holeBook } from '../src/lib/holebook';
import { clubCode } from '../src/lib/i18n';
import type { LngLat } from '../src/types';

setLang('de');
const [courseId = 'osm:relation/1326323', tee = 'Yellow'] = process.argv.slice(2);
const seed = SEED_COURSES[courseId];
const geo = SEED_GEOMETRY[courseId];
const bag = withPartials(DEFAULT_CARRY);
const holes = holesFromTags(seed.holeTags).filter((h) => h.par != null && h.loop.length === 1);
const out = holes.map((h, k) => {
  const data = holeForTee(holeMapData(geo, h.loop, h.number), courseId, h.ref, tee, geo.tee);
  if (!data) return { hole: h.ref, par: h.par, missing: true };
  const terrain = { slopes: geo.fairwaySlopes?.[h.ref], boundary: geo.boundary, trees: geo.trees };
  const common = { data, par: h.par!, holeIndex: k, holeCount: 18, pin: data.greenCenter, ...terrain, bag, conditions: null, tendency: new Map(), note: {}, style: 'normal' as const, favourite: 90, lieChoice: null, unit: 'm' as const, playing: null };
  const shots: { from: string; club: string; distance: number; playsLike: number; target: string; lines: { text: string; tone?: string }[]; alt: string | null }[] = [];
  let from: LngLat = data.tee;
  for (let n = 0; n < (h.par! >= 5 ? 3 : h.par! >= 4 ? 2 : 1); n++) {
    const teeShot = n === 0;
    const teeAim = teeShot ? teeAimFor({ ...common }) : null;
    const cad = caddieAdvice({ ...common, from, teeShot, targets: teeAim ? [teeAim.pos] : [], teeAim });
    shots.push({
      from: teeShot ? 'Abschlag' : `${Math.round(distanceM(from, data.greenCenter))} m vor dem Grün`,
      club: clubCode(cad.advice.club),
      distance: Math.round(cad.pl.distance),
      playsLike: Math.round(cad.pl.playsLike),
      target: cad.apName,
      lines: cad.lines.map((l) => ({ text: l.text, ...(l.tone ? { tone: l.tone } : {}) })),
      alt: cad.alt,
    });
    if (distanceM(cad.ap.landing, data.greenCenter) < 30) break; // on (or by) the green
    from = cad.ap.landing;
  }
  const book = holeBook({ data, slopes: geo.fairwaySlopes?.[h.ref], greenSlope: geo.greenSlopes?.[h.ref], grid: null, unit: 'm' });
  return { hole: h.ref, par: h.par, length: Math.round(lineLength(data.line)), hcp: h.strokeIndex?.[0] ?? null, shots, book };
});
console.log(JSON.stringify(out));
