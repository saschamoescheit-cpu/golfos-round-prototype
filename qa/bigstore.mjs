// The big store (Sascha 08.11.2026: "storage full" right after opening the app – Eric, Moritz, Sascha): the GPS tracks
// and course maps live in IndexedDB, far beyond the ~5 MB of localStorage; what was in localStorage moves there once,
// without loss; the app reads them as before, after a reload too; a round still fits beside 6 MB of tracks and maps.
// Usage: node bigstore.mjs <app url>
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
// a phone from before: its track and map in localStorage (written before the app's code runs, the first time only)
await ctx.addInitScript(() => {
  if (sessionStorage.getItem('qa.seeded')) return;
  sessionStorage.setItem('qa.seeded', '1');
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.track.v1.old', JSON.stringify([[1, 2, 3, 4]]) + ' '.repeat(1000));
  localStorage.setItem('golfos.geo.v1.osm:way/1', '{"g":1}');
  localStorage.setItem('golfos.rounds.v1', '[]');
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => { if (!cond) bad++; console.log(`${cond ? '✓' : '✗'} ${what}`); };
const inDb = (key) =>
  p.evaluate(
    (k) =>
      new Promise((done) => {
        const r = indexedDB.open('golfos-big', 1);
        r.onsuccess = () => {
          const t = r.result.transaction('kv', 'readonly').objectStore('kv').get(k);
          t.onsuccess = () => done(typeof t.result === 'string' ? t.result.length : null);
          t.onerror = () => done(null);
        };
        r.onerror = () => done(null);
      }),
    key,
  );

await p.goto(url);
await p.waitForTimeout(1500);
ok((await inDb('golfos.track.v1.old')) > 1000, 'the old track moved into the big store');
ok((await p.evaluate(() => localStorage.getItem('golfos.track.v1.old')?.length ?? 0)) > 1000, 'and the app reads it as before');
ok((await p.evaluate(() => localStorage.getItem('golfos.geo.v1.osm:way/1'))) === '{"g":1}', 'the old map copy too');

// 6 MB of tracks and maps – more than localStorage holds – then a round
const wrote = await p.evaluate(() => {
  try {
    localStorage.setItem('golfos.track.v1.big', 'x'.repeat(3_000_000));
    localStorage.setItem('golfos.geo.v1.osm:way/2', 'g'.repeat(3_000_000));
    localStorage.setItem('golfos.holenotes.v1.qa', JSON.stringify({ r1: 'n'.repeat(200_000) }));
    return 'ok';
  } catch (e) {
    return String(e);
  }
});
ok(wrote === 'ok', `6 MB of tracks and maps written, an entry of 200 KB beside them (${wrote})`);
await p.waitForTimeout(1500);
await p.reload();
await p.waitForTimeout(1500);
const back = await p.evaluate(() => ({
  track: localStorage.getItem('golfos.track.v1.big')?.length ?? 0,
  geo: localStorage.getItem('golfos.geo.v1.osm:way/2')?.length ?? 0,
  round: Object.keys(JSON.parse(localStorage.getItem('golfos.holenotes.v1.qa') ?? '{}'))[0] ?? null,
  listed: Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k) => k?.startsWith('golfos.track.v1.')).sort(),
}));
ok(back.track === 3_000_000 && back.geo === 3_000_000, `after a reload: track and map there (${back.track}, ${back.geo})`);
ok(back.round === 'r1', 'the entry beside them there (localStorage)');
ok(back.listed.join(',') === 'golfos.track.v1.big,golfos.track.v1.old', `the keys listed for the sync and the backup (${back.listed.join(',')})`);
// removed: gone after a reload too
await p.evaluate(() => localStorage.removeItem('golfos.track.v1.big'));
await p.waitForTimeout(800);
await p.reload();
await p.waitForTimeout(1500);
ok((await p.evaluate(() => localStorage.getItem('golfos.track.v1.big'))) === null, 'a removed track stays removed');
ok((await inDb('golfos.track.v1.big')) === null, 'also in the big store');
ok((await p.getByRole('button', { name: /Rounds|Runden/ }).count()) > 0, 'the app is there');
ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' / ') : ''}`);
await b.close();
process.exit(bad ? 1 : 0);
