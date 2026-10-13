// The caddie's plan for every hole of a course, as a Markdown page to check with local knowledge (feature 017).
// From the tee (and for par 4/5 from the planned landing spot): club, aim, the hole plan sentence, fairway width.
// Run: npx vite-node scripts/caddieplan-doc.ts <courseId> <playing handicap> <out.md>
import { writeFileSync } from 'node:fs';
import { SEED_COURSES } from '../src/data/seedCourses';
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { TEES } from '../src/data/tees';
import { holesFromTags } from '../src/lib/courses';
import { distanceM, holeMapData, lineLength } from '../src/lib/geo';
import { holeForTee } from '../src/lib/teeline';
import { caddieAdvice, teeAimFor } from '../src/lib/caddieplan';
import { DEFAULT_CARRY } from '../src/lib/caddie';
import { loadHoleNotes } from '../src/lib/holenotes';
import { setLang } from '../src/lib/i18n';

const [courseId, ph = '8', out = 'caddie-plan.md'] = process.argv.slice(2);
setLang('de');
const geo = SEED_GEOMETRY[courseId];
const seed = SEED_COURSES[courseId];
const tees = TEES[courseId];
const notes = loadHoleNotes(courseId);
const playing = Number(ph);
const lines: string[] = [];
lines.push(`# Caddie-Plan ${seed.name}`);
lines.push('');
lines.push(`> Erzeugt im Nachtlauf 13./14.10.2026 (Stand 01:50) aus der App-Logik (Feature 017 Lochstrategie, Dogleg-Regel, Fahnen-Strategie). Annahmen: **Spielvorgabe ${playing}** (18 Löcher – für eine 9-Loch-Runde trägst du die halbe ein, die App verdoppelt sie für den Caddie), Standard-Bag (Driver 200 m Carry, Holz 3 185, Holz 5 172, Hybrid 165, E4 160 … PW 115), Abschlag Gelb, windstill, 20 °C, Fahne in Grünmitte.`);
lines.push('> **Bitte prüfen:** Stimmt Schläger und Ziel mit dem, was du auf dem Loch spielst? Abweichungen gern direkt hier notieren – oder nach der Runde in der Nachbereitung („Würde ich anders spielen“).');
lines.push('');
for (const h of holesFromTags(seed.holeTags).filter((x) => x.par != null)) {
  let d = holeMapData(geo, h.loop, h.number);
  if (!d) continue;
  if (tees) d = holeForTee(d, courseId, h.ref, tees.tees.includes('Yellow') ? 'Yellow' : tees.tees[0], geo.tee) ?? d;
  const note = notes[h.ref] ?? {};
  const terrain = { slopes: geo.fairwaySlopes?.[h.ref], boundary: geo.boundary, trees: geo.trees };
  const teeAim = teeAimFor({ data: d, par: h.par!, pin: d.greenCenter, bag: DEFAULT_CARRY, conditions: null, tendency: new Map(), ...terrain, note, playing } as Parameters<typeof teeAimFor>[0]);
  const advise = (from: typeof d.tee, teeShot: boolean) =>
    caddieAdvice({ data: d!, par: h.par!, holeIndex: 0, holeCount: 18, from, teeShot, pin: d!.greenCenter, targets: teeAim ? [teeAim.pos] : [], teeAim, ...terrain, bag: DEFAULT_CARRY, conditions: null, tendency: new Map(), note, lieChoice: null, unit: 'm', playing });
  const t = advise(d.tee, true);
  const L = Math.round(lineLength(d.line));
  lines.push(`## ${h.ref} · Par ${h.par} · ${L} m${h.strokeIndex ? ` · Hcp ${h.strokeIndex}` : ''}`);
  lines.push(`- **Abschlag:** ${t.advice.club === 'Dr' ? 'Driver' : t.advice.club}${t.aim ? ' – ' + t.aim : ''}`);
  // the plan as the app shows it ("open on both sides" is left out next to an out-of-bounds warning)
  if (t.holePlan && t.lines.some((x) => x.text === t.holePlan)) lines.push(`- **Plan:** ${t.holePlan}`);
  const extra = t.lines.filter((x) => /Fairway .* breit|Aus |Wasser|Bäume/.test(x.text) && x.text !== t.aim && x.text !== t.holePlan).map((x) => x.text);
  if (extra.length) lines.push(`- ${extra.join(' · ')}`);
  if (h.par! >= 4 && teeAim) {
    const second = advise(teeAim.landing, false);
    const left = Math.round(distanceM(teeAim.landing, d.greenCenter));
    lines.push(`- **Zweiter Schlag** (aus ${left} m): ${second.advice.club}${second.advice.swing && second.advice.swing !== 'full' ? ' ' + second.advice.swing : ''} – ${second.aim ?? second.holePlan ?? '–'}`);
  }
  lines.push('- **Deine Einschätzung:** ');
  lines.push('');
}
writeFileSync(out, lines.join('\n'), 'utf-8');
console.log('written', out, lines.length, 'lines');
