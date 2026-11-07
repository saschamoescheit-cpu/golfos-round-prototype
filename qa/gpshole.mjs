// QA (Sascha 07.11.2026, on the course: "automatic hole changes based on GPS would be good"): the app open the whole
// time (no pocket, no "visible" again) – walked from 1A's green to 2A's tee, the round moves to 2A by itself once the
// GPS finds it twice in a row; a hole chosen by hand is left alone for three minutes.
// Usage: node qa/gpshole.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.7808, longitude: 9.689, accuracy: 6 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(800);
// the tees and greens from the app's own course data (as qa/het9.mjs)
const holes = await p.evaluate(async () => {
  const G = await import('/src/lib/geo.ts');
  const T = await import('/src/lib/teeline.ts');
  const S = await import('/src/lib/storage.ts');
  const { SEED_COURSES } = await import('/src/data/seedCourses.ts');
  const C = await import('/src/lib/courses.ts');
  const id = 'osm:relation/1326323';
  await S.ensureGeometry(id);
  const geo = S.loadGeometry(id);
  return C.holesFromTags(SEED_COURSES[id].holeTags)
    .filter((h) => h.loop === 'A' && h.par)
    .map((h) => {
      const d = T.holeForTee(G.holeMapData(geo, h.loop, h.number), id, h.ref, 'Yellow', geo.tee);
      return { ref: h.ref, tee: d.tee, green: G.pointAt(d.line, G.lineLength(d.line) - 3) };
    });
});
const setPos = (pt) => ctx.setGeolocation({ latitude: pt[1], longitude: pt[0], accuracy: 6 });
const stand = async (pt, secs) => {
  for (let k = 0; k < secs; k += 2) {
    await setPos([pt[0] + (Math.random() - 0.5) * 0.00002, pt[1] + (Math.random() - 0.5) * 0.000015]);
    await p.waitForTimeout(2000);
  }
};
const hole = async () => (await p.locator('.map-hole-no').innerText().catch(() => '?')).trim();

await setPos(holes[0].tee);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.locator('.map-hole-no').waitFor({ timeout: 30000 });
await stand(holes[0].tee, 6);
ok((await hole()) === '1A', `on 1A's tee: 1A (${await hole()})`);
// 1A played: the score entered here, then on the green
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  const r = rs.find((x) => !x.finishedAt);
  for (const id of Object.keys(r.entries)) r.entries[id][0] = { ...r.entries[id][0], strokes: 4, putts: 2 };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
  localStorage.setItem('golfos.scoreseen.v1.' + r.id, JSON.stringify([0]));
});
await p.reload();
await p.locator('.map-hole-no').waitFor({ timeout: 30000 });
await stand(holes[0].green, 6);
ok((await hole()) === '1A', `on 1A's green: still 1A (${await hole()})`);

// walked on to 2A's tee – the app stays open: it moves by itself (two looks, 15 s apart)
await stand(holes[1].tee, 40);
ok((await hole()) === '2A', `walked to 2A's tee, the app open: on 2A by itself (${await hole()})`);
ok((await p.locator('.score-panel').count()) === 0, '1A had its score: no score entry in the way');

// chosen by hand back to 1A (to check something): left alone, though on 2A's tee
await p.getByRole('button', { name: 'Voriges Loch' }).first().click();
await p.waitForTimeout(500);
await stand(holes[1].tee, 40);
ok((await hole()) === '1A', `chosen by hand: 1A stays for a while (${await hole()})`);

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
