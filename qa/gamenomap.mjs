// QA (Sascha 08.11.2026, Celebration, 5+5+10 in Games: "at some point we had to tap tee and greens by hand, later that
// did not work any more either – nor did 'Nur Score eintragen'"): a game on the map whose course map is gone (the
// phone's storage full) – "Nur Score eintragen" opens the score entry and stays there; a hole set up by hand stays set
// up, the storage full or not; the course map of a game being played never makes room.
// Usage: node qa/gamenomap.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
import { pickPrize } from './prize.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
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
await p.waitForTimeout(1000);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'games');
});
await p.reload();
await p.waitForTimeout(1000);
// Nassau on Hetzenhof (it was 5+5+10 – a duel in the pool of bets since 10.11.2026)
await p.locator('.tabbar').getByRole('button', { name: /(^|\s)Spielen$/ }).click();
await p.getByRole('button', { name: 'Neues Spiel' }).click();
await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
await p.locator('.pick-option').filter({ has: p.locator('strong', { hasText: /^Nassau$/ }) }).first().click();
await p.locator('.game-player-row').nth(1).locator('input').first().fill('Ben');
await p.locator('.settings-row').filter({ hasText: 'Platz' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().click();
await p.waitForTimeout(500);
await pickPrize(p);
await p.getByRole('button', { name: 'Spiel starten' }).click();
await p.locator('.map-hole-no').waitFor({ timeout: 30000 });
ok(true, 'the game runs on the map');

// the course map gone (as when the storage was full): the game's round on a course whose map copy is not there
await p.evaluate(() => {
  const gs = JSON.parse(localStorage.getItem('golfos.games.v1'));
  const g = gs.find((x) => !x.finishedAt);
  g.round.courseId = 'osm:way/424242';
  localStorage.setItem('golfos.games.v1', JSON.stringify(gs));
  // the page going away must not write its game back over it
  const proto = Object.getPrototypeOf(localStorage);
  const orig = proto.setItem;
  proto.setItem = function (k, v) {
    if (k === 'golfos.games.v1') return;
    return orig.call(this, k, v);
  };
});
await p.reload();
await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Spiel fortsetzen' }).click({ timeout: 10000 }).catch(() => {});
await p.waitForTimeout(1500);
const setup =p.getByRole('button', { name: 'Nur Score eintragen' });
await setup.waitFor({ timeout: 20000 }).catch(() => {});
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
ok((await setup.count()) === 1, 'no map for the hole: set it up – or "Nur Score eintragen"');
await setup.click();
await p.waitForTimeout(2500);
const scoreShown = async () => (await p.getByRole('button', { name: /Schläge plus eins/ }).count()) > 0;
ok(await scoreShown(), `"Nur Score eintragen": the score entry is open`);
ok((await p.getByRole('button', { name: 'Nur Score eintragen' }).count()) === 0, 'and stays open (not back to the set-up)');
await p.waitForTimeout(16000); // a GPS look or two
ok(await scoreShown(), 'still the score entry after a while');
// on to the next hole (no map either): straight to the score entry – not the set-up on every hole
for (const plus of await p.getByRole('button', { name: /Schläge plus eins/ }).all()) await plus.click();
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '3.png'), fullPage: true });
await p.getByRole('button', { name: /^Weiter · Loch 2A/ }).click();
await p.waitForTimeout(1500);
const hole2 = await p.locator('.score-hole-no, .map-hole-no, h1').first().innerText().catch(() => '');
ok((await p.getByText(/Wo ist der Abschlag/).count()) === 0 && (await scoreShown()), `next hole: the score entry at once, no set-up (${hole2.trim()})`);

// a hole set up by hand with the storage full: it stays set up
await p.evaluate(() => {
  const proto = Object.getPrototypeOf(localStorage);
  const orig = proto.setItem;
  proto.setItem = function (k, v) {
    if (String(k).startsWith('golfos.holelines')) throw new DOMException('full', 'QuotaExceededError');
    return orig.call(this, k, v);
  };
});
const back = p.getByRole('button', { name: 'Loch einrichten (Abschlag + Grün)' });
await back.click().catch(() => {});
await p.waitForTimeout(1000);
const onSetup = (await p.getByText(/Wo ist der Abschlag/).count()) > 0;
ok(onSetup, 'back to the hole: the set-up');
if (onSetup) {
  const box = await p.locator('.hole-map').boundingBox();
  await p.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await p.waitForTimeout(1200);
  await p.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.2);
  await p.waitForTimeout(400);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '2.png') });
  await p.getByRole('button', { name: 'Loch speichern' }).click();
  await p.waitForTimeout(1500);
  ok((await p.getByText(/Wo ist der Abschlag/).count()) === 0 && (await p.locator('.map-hole-no').count()) > 0 && !/Einrichten/.test(await p.locator('.map-hole-no').innerText()), 'saved with the storage full: the hole is on the map');
}

// the storage guard: the map of a course with a game being played never makes room – since 08.11.2026 the maps live in
// the big store (IndexedDB) and take no room in localStorage: none is removed (the 12-hour rule for localStorage without
// the big store: storageguard.test)
const kept = await p.evaluate(async () => {
  const G = await import('/src/lib/storageguard.ts');
  const B = await import('/src/lib/bigstore.ts');
  const gs = JSON.parse(localStorage.getItem('golfos.games.v1'));
  const g = gs.find((x) => !x.finishedAt);
  localStorage.setItem('golfos.geo.v1.' + g.round.courseId, '{"holes":[],"green":[],"tee":[],"bunker":[],"fairway":[],"water":[]}');
  localStorage.setItem('golfos.geo.v1.osm:way/1', '{}');
  while (G.makeRoom('x')) {}
  return { big: B.bigStoreOn(), game: localStorage.getItem('golfos.geo.v1.' + g.round.courseId) != null, other: localStorage.getItem('golfos.geo.v1.osm:way/1') != null };
});
// without the big store (it did not open in time – under the gate's load): the game's map stays, another goes
ok(kept.big ? kept.game && kept.other : kept.game && !kept.other, kept.big ? `storage full: the course maps in the big store – the game's map stays, none is removed (${JSON.stringify(kept)})` : `storage full (no big store this time): the game's course map stays, another goes (${JSON.stringify(kept)})`);

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
