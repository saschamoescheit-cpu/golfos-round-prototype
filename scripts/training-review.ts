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
lines.push('## Pläne', '');
for (const p of PLANS) lines.push(`- [ ] **${p.name.de}** – ${p.about.de}`);
lines.push('', '## Zubehör', '');
for (const g of GEAR) lines.push(`- [ ] **${typeof g.name === 'string' ? g.name : g.name.de}** (${typeof g.brand === 'string' ? g.brand : g.brand.de}, ca. ${g.price[0]}–${g.price[1]} €) – ${g.why.de}`);
writeFileSync(out, lines.join('\n'));
console.log(`${out}: ${lines.length} Zeilen`);
