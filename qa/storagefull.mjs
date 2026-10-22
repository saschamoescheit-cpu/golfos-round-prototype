// QA: the phone's storage is full of course maps looked at before (Safari: about 5 MB per site; one map from
// OpenStreetMap takes 0.2–0.4 MB). A new course and a new round must still be saved – old map copies make room, the
// rounds and GPS tracks stay. A course whose map copy went fetches the map again (night check 22.10.2026).
// Usage: node qa/storagefull.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|photon\.komoot\.io|lgl-bw\.de|www\.wms\.nrw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); }); // tile fetches cut off by the reload (WebKit under test)
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const OLD = { id: 'old1', courseId: 'osm:way/1', courseName: 'Alter Platz', createdAt: '2026-09-01T10:00:00.000Z', finishedAt: '2026-09-01T14:00:00.000Z', holes: [], entries: {}, players: [] };
await p.goto(url);
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
  for (let i = 0; i < localStorage.length; i++) n += localStorage.getItem(localStorage.key(i)).length;
  return { n, maps: Object.keys(localStorage).filter((k) => k.startsWith('golfos.geo.v1.')).length };
});
ok(filled.n > 5000000, `storage full (${(filled.n / 1e6).toFixed(2)} million characters, ${filled.maps} old maps)`);
await p.reload();
await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Frielinghausen');
await p.waitForTimeout(3000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 45000 });
const geoOf = () => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('golfos.geo.v1.') && !/osm:way\/9\d+$/.test(k)));
const fr = await geoOf();
ok(fr.length === 1, `the new course's map saved – old copies made room (${fr.join(', ') || 'none'})`);
await p.getByRole('button', { name: 'Runde starten' }).click();
await p.waitForTimeout(4000);
await p.reload();
await p.waitForTimeout(1500);
const kept = await p.evaluate(() => ({
  rounds: JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]').map((r) => r.courseName),
  track: JSON.parse(localStorage.getItem('golfos.track.v1.old1') ?? '[]').length,
  dummies: Object.keys(localStorage).filter((k) => /osm:way\/9\d+$/.test(k)).length,
}));
ok(kept.rounds.length === 2 && /Frielinghausen/.test(kept.rounds[0]), `the new round saved, the old one kept (${kept.rounds.join(' · ')})`);
ok(kept.track === 3000, `the old round's GPS track untouched (${kept.track} points)`);
ok(kept.dummies < filled.maps, `only map copies made room (${filled.maps - kept.dummies} of ${filled.maps} old maps)`);
// a course whose map copy went: the map comes again when the course is picked
if (fr[0]) await p.evaluate((k) => localStorage.removeItem(k), fr[0]);
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  rs[0].finishedAt = new Date().toISOString(); // the round over – its course is not protected any more
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.goto(url);
await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Neue Runde' }).click();
// from "played last" – the usual way back to a course, and without the course search
await p.locator('button.list-item', { hasText: 'Frielinghausen' }).first().click();
await p.getByText('Runde starten').waitFor({ timeout: 45000 });
ok((await geoOf()).length === 1, 'the map copy gone: fetched again when the course is picked');
ok((await p.getByText(/Speicher auf dem Handy voll/).count()) === 0, 'no "storage full" note – there was room to make');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
