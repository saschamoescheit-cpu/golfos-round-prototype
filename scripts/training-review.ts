// Review list of the Training content for Chris (golf pro): every topic with its key numbers, the faults and every
// drill with level, place, scoring and the targets by handicap – as a Markdown file to tick off and comment.
// Usage: npx vite-node scripts/training-review.ts [out.md]
import { writeFileSync } from 'node:fs';
import { useLangForTests } from '../src/lib/i18n';
import { CATEGORIES, DRILLS } from '../src/training/content';
import { GEAR } from '../src/training/content/gear';
import { PLANS } from '../src/training/content/plans';
import type { Drill } from '../src/training/types';

useLangForTests('de');
const out = process.argv[2] ?? 'training-pruefliste.md';
const level = ['', 'Einsteiger', 'Fortgeschritten', 'Könner'];
const place: Record<string, string> = { green: 'Puttinggrün', chipping: 'Chipping-Area', bunker: 'Übungsbunker', range: 'Range', course: 'Platz', home: 'zu Hause', gym: 'Fitness' };
const scoring = (d: Drill) => {
  const s = d.scoring;
  if (!s || s.kind === 'none') return '–';
  const unit = 'unit' in s && s.unit ? ` ${s.unit.de}` : '';
  return s.kind === 'made' ? `x von ${s.of}${unit}` : `${s.kind}${unit}`;
};
const targets = (d: Drill) => (d.targets ? `21+: ${d.targets.high} · 11–20: ${d.targets.mid} · 0–10: ${d.targets.low}${d.targets.tour != null ? ` · Tour: ${d.targets.tour}` : ''}` : '–');

const lines: string[] = [];
lines.push('# Training-Modul – Prüfliste für Chris', '');
lines.push(`Stand: ${new Date().toLocaleDateString('de-DE')} · ${CATEGORIES.length} Themen · ${DRILLS.length} Übungen · ${GEAR.length} Produkte · ${PLANS.length} Pläne`, '');
lines.push('Bitte je Übung ankreuzen: **✓ passt** · **✎ ändern** (mit Notiz) · **✕ streichen**. Besonders wichtig: die Zahlen unter „Gut zu wissen“ und die **Ziele nach Handicap** (geschätzte Richtwerte).', '');
lines.push('**Einfacher in der App:** Wissen → ganz unten „Inhalte prüfen“ → Prüfmodus einschalten. Dann steht unter jeder Übung, jedem Grundlagen-Abschnitt, Fehler, Plan und Video ✓ / ✎ / ✕ mit Notiz; „Liste teilen“ schickt alles nach Themen sortiert an Sascha.', '');
for (const c of CATEGORIES) {
  lines.push(`## ${c.name.de}`, '', c.intro.de, '');
  if (c.facts?.length) {
    lines.push('**Gut zu wissen (bitte Zahlen prüfen):**', '');
    for (const f of c.facts) lines.push(`- [ ] ${f.de}`);
    lines.push('');
  }
  lines.push('**Grundlagen (Abschnitte mit Bild, Übung und Video):**', '');
  for (const sec of c.sections) {
    const drill = sec.drill ? DRILLS.find((d) => d.id === sec.drill)?.name.de : undefined;
    const extra = [drill ? `Bild + Übung: ${drill}` : sec.sketch ? 'eigene Skizze' : '', sec.videos?.length ? `${sec.videos.length} Video(s)` : '', sec.metronome ? 'mit Metronom' : ''].filter(Boolean).join(' · ');
    lines.push(`- [ ] **${sec.title.de}**${extra ? ` (${extra})` : ''}${sec.fact ? ` – Merksatz: ${sec.fact.de}` : ''}`);
  }
  lines.push('');
  if (c.faults?.length) {
    lines.push('**Typische Fehler:**', '');
    for (const f of c.faults) lines.push(`- [ ] **${f.name.de}** – ${f.cause.de} → ${f.fix.de}`);
    lines.push('');
  }
  lines.push('| ✓ | Übung | Niveau | Ort | Min | Ergebnis | Ziele nach Hcp | Notiz |', '|---|---|---|---|---|---|---|---|');
  for (const d of DRILLS.filter((x) => x.cat === c.id)) lines.push(`| [ ] | **${d.name.de}** – ${d.goal.de} | ${level[d.level]} | ${place[d.place]} | ${d.minutes} | ${scoring(d)} | ${targets(d)}${d.metronome ? ' · mit Metronom' : ''} | |`);
  lines.push('');
}
// the 3D videos (18.10.2026): every movement and every fault pair with its steps and where it is shown – Chris checks
// posture, club positions and the ball flight
lines.push('## 3D-Videos (bitte Bewegung und Ballflug prüfen)', '');
lines.push('Die Schwünge sind von Hand aus Schlüsselhaltungen gebaut (neutrales Grundschwung-Modell). Bitte je Video: stimmen Haltung, Schaftpositionen, Treffmoment und Ballflug? Am besten in der App mit „Zeitlupe“ und den Ansichten Vorne · Hinten · Schräg · Oben ansehen.', '');
const { SWINGS, PAIRS } = await import('../src/training/anim3d/swings');
const used = new Map<string, string[]>();
const use = (video: string | undefined, where: string) => video && used.set(video, [...(used.get(video) ?? []), where]);
type WithMotion = { sketch?: { motion?: { video?: string } } };
for (const d of DRILLS) use((d as WithMotion).sketch?.motion?.video, `Übung „${d.name.de}“`);
for (const c of CATEGORIES) {
  for (const s of c.sections) use((s as WithMotion).sketch?.motion?.video, `${c.name.de} › Grundlagen „${s.title.de}“`);
  for (const f of c.faults ?? []) use((f as WithMotion).sketch?.motion?.video, `${c.name.de} › Fehler „${f.name.de}“`);
}
const steps = (sw: { keys: { label?: { de: string } }[] }) => sw.keys.flatMap((k) => (k.label ? [k.label.de] : [])).join(' → ');
lines.push('**Bewegungen:**', '');
for (const [id, sw] of Object.entries(SWINGS)) if (used.has(id)) lines.push(`- [ ] ${used.get(id)!.join('; ')} – Schritte: ${steps(sw)}`);
lines.push('', '**Fehler im Vergleich (links Fehler, rechts richtig):**', '');
for (const [id, p] of Object.entries(PAIRS)) if (used.has(id)) lines.push(`- [ ] ${used.get(id)!.join('; ')} – ${steps(p.fault)}`);
lines.push('', '**Fachlich korrigiert am 18.10. – bitte bestätigen:**', '');
lines.push('- [ ] „Tor von innen“: hinterer Tee 5 cm **außerhalb**, vorderer 5 cm **innerhalb** des Balls (vorher umgekehrt – dann lagen beide Tees auf der Bahn von innen und ein Schwung von außen traf keinen).');
lines.push('- [ ] „Schlägerhaube außerhalb des Balls“: Haube 10 cm außerhalb und 10 cm **hinter** dem Ball (vorher „vor“ – dort trifft sie nur eine Bahn nach außen, nicht den Schwung von außen).');
lines.push('- [ ] „Gefälle mit den Füßen fühlen“ (Grundlagen und Übung): „die Linie zwischen den Füßen, Blick **zum Loch**“ (vorher „Blick quer zur Linie“ – das widersprach sich; wie bei AimPoint spüren die Füße so das Seitengefälle).');
lines.push('');
lines.push('## Pläne', '');
for (const p of PLANS) lines.push(`- [ ] **${p.name.de}** – ${p.about.de}`);
lines.push('', '## Zubehör', '');
for (const g of GEAR) lines.push(`- [ ] **${typeof g.name === 'string' ? g.name : g.name.de}** (${typeof g.brand === 'string' ? g.brand : g.brand.de}, ca. ${g.price[0]}–${g.price[1]} €) – ${g.why.de}`);
writeFileSync(out, lines.join('\n'));
console.log(`${out}: ${lines.length} Zeilen`);
