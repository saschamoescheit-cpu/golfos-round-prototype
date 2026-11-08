// QA: course maps looked at before fill what Safari keeps in localStorage (about 5 MB per site; one map from
// OpenStreetMap takes 0.2–0.4 MB). Since 08.11.2026 (Eric, Moritz, Sascha: "storage full" right after opening the app)
// the maps and GPS tracks live in the big store (IndexedDB): 14 maps of 0.4 MB are kept without trouble, nothing has to
// make room, a new course and a new round are saved, the old round and its track stay. A course whose map copy went
// fetches the map again (night check 22.10.2026).
// Usage: node qa/storagefull.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|photon\.komoot\.io|lgl-bw\.de|www\.wms\.nrw\.de|api\.openstreetmap\.org|owsproxy\.lgl-bw\.de)\/\S* due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); }); // tile fetches and the service worker script cut off by the reload (WebKit under test, as in outages)
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const OLD = { id: 'old1', courseId: 'osm:way/1', courseName: 'Alter Platz', createdAt: '2026-09-01T10:00:00.000Z', finishedAt: '2026-09-01T14:00:00.000Z', holes: [], entries: {}, players: [] };
await p.goto(url);
// the app started (the big store opened before it draws)
await p.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0);
await p.evaluate((OLD) => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([OLD]));
  localStorage.setItem('golfos.track.v1.old1', JSON.stringify(Array.from({ length: 3000 }, (_, k) => [1790000000000 + k * 5000, 7.123456, 51.123456, 5])));
}, OLD);
// a dozen course maps looked at before – the storage full to the brim
const filled = await p.evaluate(() => {
  try {
    for (let k = 0; k < 14; k++) localStorage.setItem(`golfos.geo.v1.osm:way/9${k}`, JSON.stringify({ holes: [], green: [], pad: 'x'.repeat(400000) }));
  } catch {
    // full (an app without room-making)
  }
  // to the brim: smaller maps into the last gap (an app without room-making stops at the first that does not fit)
  for (const [from, size] of [[20, 40000], [60, 2000]]) {
    try {
      for (let k = 0; k < 20; k++) localStorage.setItem(`golfos.geo.v1.osm:way/9${from + k}`, JSON.stringify({ pad: 'x'.repeat(size) }));
    } catch {
      // full
    }
  }
  let n = 0;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    keys.push(k);
    n += localStorage.getItem(k).length;
  }
  return { n, maps: keys.filter((k) => k.startsWith('golfos.geo.v1.')).length };
});
// more than localStorage holds – all of it there (the big store)
ok(filled.n > 5000000 && filled.maps === 54, `6 MB of old maps kept – more than localStorage holds (${(filled.n / 1e6).toFixed(2)} million characters, ${filled.maps} maps)`);
// 6.5 MB written in one go: a moment for the database (maps come one by one on a phone; the track written just before
// survives even an instant reload – checked below)
await p.waitForTimeout(3000);
await p.reload();
await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Frielinghausen');
await p.waitForTimeout(3000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 45000 });
// the keys by key() – the maps in the big store are listed there (not by Object.keys)
const keysOf = () => p.evaluate(() => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)));
const geoOf = async () => (await keysOf()).filter((k) => k.startsWith('golfos.geo.v1.') && !/osm:way\/9\d+$/.test(k));
const fr = await geoOf();
ok(fr.length === 1, `the new course's map saved (${fr.join(', ') || 'none'})`);
await p.getByRole('button', { name: 'Runde starten' }).click();
await p.waitForTimeout(4000);
await p.reload();
await p.waitForTimeout(1500);
const kept = await p.evaluate(() => ({
  rounds: JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]').map((r) => r.courseName),
  track: JSON.parse(localStorage.getItem('golfos.track.v1.old1') ?? '[]').length,
  dummies: Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k) => /osm:way\/9\d+$/.test(k)).length,
}));
ok(kept.rounds.length === 2 && /Frielinghausen/.test(kept.rounds[0]), `the new round saved, the old one kept (${kept.rounds.join(' · ')})`);
ok(kept.track === 3000, `the old round's GPS track untouched (${kept.track} points)`);
ok(kept.dummies === filled.maps, `nothing had to make room – the old maps all kept (${kept.dummies} of ${filled.maps})`);
// a course whose map copy went: the map comes again when the course is picked
if (fr[0]) await p.evaluate((k) => localStorage.removeItem(k), fr[0]);
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  rs[0].finishedAt = new Date().toISOString(); // the round over – its course is not protected any more
  const me = rs[0].players.find((x) => x.isMe).id;
  rs[0].entries[me][0].strokes = 5; // one hole played, so the round shows in the list
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.goto(url);
await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Neue Runde' }).click();
// from "played last" – the usual way back to a course, and without the course search
await p.locator('button.list-item', { hasText: 'Frielinghausen' }).first().click();
await p.waitForTimeout(1000);
await p.getByText('Runde starten').waitFor({ timeout: 45000 });
ok((await geoOf()).length === 1, 'the map copy gone: fetched again when the course is picked');
// a finished round looked at later, its course map gone: the map comes again in "Schläge prüfen"
await p.evaluate((k) => localStorage.removeItem(k), (await geoOf())[0]);
await p.evaluate(() => { sessionStorage.clear(); sessionStorage.setItem('golfos.module', 'rounds'); });
await p.goto(url);
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Frielinghausen/ }).first().click();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
for (let k = 0; k < 30 && (await geoOf()).length === 0; k++) await p.waitForTimeout(500);
ok((await geoOf()).length === 1, 'a round looked at later: its course map fetched again');
ok((await p.getByText(/Speicher (auf dem Handy|der App) (ist )?voll/).count()) === 0, 'no "storage full" note');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
