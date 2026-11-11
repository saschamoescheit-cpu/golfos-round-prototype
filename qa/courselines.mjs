// QA (Sascha 12.11.2026, night run: "the holes set up by hand on the server – for every GolfOS user on that course"):
// Sascha sets up a hole on a course on his phone (not in a shared round); Chris – another account, another day, no
// flight together – opens a round on the same course: his map has Sascha's hole, without setting it himself. A hole the
// course's own map has stays as it is; Chris's own line stays his.
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
// a course with its own map (bundled): its holes stay – a line from someone else does not replace them
const kept = await B.evaluate(async () => {
  const S = await import('/src/lib/storage.ts');
  await S.ensureGeometry('osm:relation/4039062');
  const before = JSON.stringify(S.loadGeometry('osm:relation/4039062').holes.find((h) => h.ref === '1')?.line);
  localStorage.setItem('golfos.communitylines.v1.osm:relation/4039062', JSON.stringify({ 'Main#1': [[0, 0], [1, 1]] }));
  const after = JSON.stringify(S.loadGeometry('osm:relation/4039062').holes.find((h) => h.ref === '1')?.line);
  return { before, after };
});
ok(kept.before === kept.after && kept.before !== '[[0,0],[1,1]]', 'Cypress (bundled): its hole 1 stays, nobody\'s line over it');
ok(chris.errs.length === 0, `no page errors ${chris.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
