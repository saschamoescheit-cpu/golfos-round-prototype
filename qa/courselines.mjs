// QA (Sascha 12.11.2026, night run: "the holes set up by hand on the server – for every GolfOS user on that course"):
// Sascha sets up a hole on a course on his phone (not in a shared round); Chris – another account, another day, no
// flight together – opens a round on the same course: his map has Sascha's hole, without setting it himself. A hole the
// course's own map has: the line goes over it too (16.11.2026), with the green drawn round; Chris's own line stays his.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/courselines.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const sim = sharedServer(b, url);
const A = (await sim.phone('Sascha')).p;
const chris = await sim.phone('Chris');
const B = chris.p;

const CID = 'test:community';
const L5 = [[9.6831, 48.7801], [9.6852, 48.7815]];
const L6 = [[9.6861, 48.7821], [9.6873, 48.7836]];
// Sascha's phone sets 5A and 6A by hand (as the hole set-up's "Speichern" tells the server)
const sent = await A.evaluate(async ({ cid, l5, l6 }) => {
  const S = await import('/src/lib/storage.ts');
  const C = await import('/src/lib/courselines.ts');
  S.saveHoleLine(cid, 'A', 5, l5);
  return [await C.shareCourseLine(cid, 'A', 5, l5), await C.shareCourseLine(cid, 'A', 6, l6)];
}, { cid: CID, l5: L5, l6: L6 });
ok(sent.every(Boolean) && sim.courseLines.length === 2, `server: two holes of the course (${sim.courseLines.length})`);
// Chris has his own 6A already
const mine6 = [[9.6862, 48.7822], [9.6874, 48.7837]];
await B.evaluate(({ cid, l }) => import('/src/lib/storage.ts').then((S) => S.saveHoleLine(cid, 'A', 6, l)), { cid: CID, l: mine6 });
const got = await B.evaluate(async (cid) => {
  const C = await import('/src/lib/courselines.ts');
  const S = await import('/src/lib/storage.ts');
  const changed = await C.fetchCourseLines(cid);
  const g = S.loadGeometry(cid);
  const at = (ref) => g.holes.find((h) => h.ref === ref)?.line ?? null;
  return { changed, h5: at('5A'), h6: at('6A') };
}, CID);
ok(got.changed && JSON.stringify(got.h5) === JSON.stringify(L5), `Chris's phone: Sascha's 5A on his map (${JSON.stringify(got.h5)})`);
ok(JSON.stringify(got.h6) === JSON.stringify(mine6), "Chris's own 6A stays his");
// since 16.11.2026 (Sascha, Legends: "Ich habe Legends aktualisiert, aber bei Chris hat es sich nicht aktualisiert" → "Gilt
// für alle"): over a course with its own map too, with the green drawn round; "Platzkarte" takes it away for Chris alone
const CY = 'osm:relation/4039062';
const LC = [[-81.53, 28.36], [-81.531, 28.362]];
const GC = [[-81.5312, 28.3621], [-81.5308, 28.3621], [-81.5308, 28.3618], [-81.5312, 28.3618], [-81.5312, 28.3621]];
await A.evaluate(({ cid, l, g }) => import('/src/lib/courselines.ts').then((C) => C.shareCourseLine(cid, 'Main', 1, l, g)), { cid: CY, l: LC, g: GC });
const over = await B.evaluate(async ({ cid, g }) => {
  const S = await import('/src/lib/storage.ts');
  const C = await import('/src/lib/courselines.ts');
  await S.ensureGeometry(cid);
  const map1 = JSON.stringify(S.loadGeometry(cid).holes.find((h) => h.ref === '1')?.line);
  await C.fetchCourseLines(cid);
  const geo = S.loadGeometry(cid);
  const h1 = geo.holes.find((h) => h.ref === '1');
  const r = { map1, after: JSON.stringify(h1?.line), par: h1?.par ?? null, green: JSON.stringify(geo.green[0]) === JSON.stringify(g), own: S.hasOwnHoleLine(cid, 'Main', 1) };
  S.removeHoleLine(cid, 'Main', 1); // "Platzkarte" on Chris's phone
  r.back = JSON.stringify(S.loadGeometry(cid).holes.find((h) => h.ref === '1')?.line);
  return r;
}, { cid: CY, g: GC });
ok(over.after === JSON.stringify(LC) && over.after !== over.map1, `Cypress (own map): Sascha's hole 1 over the map on Chris's phone`);
ok(over.par != null, `…with the map's par (${over.par})`);
ok(over.green, '…and the green Sascha drew round, first among the greens');
ok(over.own, '…"Platzkarte" offered for it');
ok(over.back === over.map1, '"Platzkarte" on the phone of Chris: the course map again for him');
ok(chris.errs.length === 0, `no page errors ${chris.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
