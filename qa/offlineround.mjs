// A whole round without network (night run 22./23.10.2026, final list "USA: ganze Runde offline"): the app and the
// course kept by the service worker, then the network off – every hole scored, the round finished, the choice after
// it, the check of every hole ("Schläge prüfen" loads from the phone, not the net), signed, the scorecard and the
// stats. Back online nothing is lost.
// Usage: node qa/offlineround.mjs <built app url, e.g. http://localhost:4173/ (vite preview) or the live site>
//        [course to search] [lat] [lon] [loop choice]  – e.g. "Orange Lake" 28.336 -81.596 (night run 23./24.10.2026: the US test)
import { chromium, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const [search = 'Hetzenhof', lat = '48.7808', lon = '9.689', loop = 'A · 9 Löcher'] = process.argv.slice(3);
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: Number(lat), longitude: Number(lon), accuracy: 6 }, permissions: ['geolocation'], serviceWorkers: 'allow' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (c, what) => {
  if (!c) bad++;
  console.log(`${c ? '✓' : '✗'} ${what}`);
};
const round = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]);

await p.goto(url);
await p.waitForTimeout(2000);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30000 }).catch(() => {});
ok(await p.evaluate(() => navigator.serviceWorker?.controller != null), 'the service worker keeps the app');
// every part of the app in the phone's cache before the network goes (the precache is filled on install)
await p.waitForFunction(async () => (await caches.keys()).some((k) => /precache/.test(k)), null, { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(4000);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', search);
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByRole('button', { name: new RegExp(loop) }).click({ timeout: 5000 }).catch(() => {});
await p.getByText('Runde starten').click();
await p.waitForFunction(() => document.body.innerText.includes('offline gespeichert ✓'), null, { timeout: 240000 }).catch(() => {});
ok(await p.evaluate(() => JSON.stringify(Object.keys(localStorage)).includes('golfos.offline')), 'the course map kept for offline');

// —— the network goes ——
await ctx.setOffline(true);
await p.reload();
await p.waitForTimeout(4000);
const first = (await round()).holes[0].label;
ok((await p.locator('.map-hole-no').innerText().catch(() => '')).trim() === first, `offline: the round opens on hole ${first}`);
// nine holes: the score of each entered on the course (par + one), on to the next
const parts = { holes: 0, chip: 0, par3: 0, par3Target: 0 }; // the new parts offline too (night 24./25.10.2026)
for (let h = 0; h < 9; h++) {
  parts.holes++;
  if ((await p.locator('.map-spread-chip').count()) >= 1) parts.chip++;
  if (/Par 3/.test(await p.locator('.hole-bar').innerText().catch(() => ''))) {
    parts.par3++;
    if ((await p.locator('.map-crosshair').count()) >= 1) parts.par3Target++;
  }
  await p.locator('.map-score').first().click();
  await p.locator('.score-panel').getByRole('button', { name: 'Schläge plus eins', exact: true }).first().click();
  await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
  await p.waitForTimeout(300);
  if (h < 8) {
    await p.locator('.hole-bar').getByRole('button', { name: 'Nächstes Loch' }).click();
    await p.waitForTimeout(900);
  }
}
ok(parts.chip === parts.holes && parts.par3Target === parts.par3, `offline: the spread's club picker on every hole (${parts.chip}/${parts.holes}), a target on every par 3 (${parts.par3Target}/${parts.par3})`);
let r = await round();
const me = r.players.find((x) => x.isMe).id;
ok(r.entries[me].slice(0, 9).every((e) => e.strokes != null), `offline: 9 scores saved (${r.entries[me].slice(0, 9).map((e) => e.strokes).join(' ')})`);
// finish from the hole menu; the choice after it
await p.locator('.hole-bar-handle').click();
await p.locator('.hole-drawer').getByRole('button', { name: 'Runde beenden' }).click();
await p.getByRole('button', { name: 'Speichern & beenden' }).click();
await p.waitForTimeout(1200);
const choice = p.getByRole('dialog', { name: 'Status der Runde' });
ok((await choice.count()) === 1, 'offline: finished, "Wie geht es weiter?" opens');
await choice.getByRole('button', { name: /^Jetzt prüfen/ }).click();
await p.waitForTimeout(2500);
ok((await p.getByRole('heading', { name: 'Schläge prüfen' }).count()) + (await p.locator('.review-nav').count()) > 0, 'offline: "Schläge prüfen" opens (loaded from the phone)');
let last = '';
for (let k = 0; k < 24 && (await p.locator('.sc-wrap').count()) === 0; k++) {
  const btn = p.locator('.sticky-cta .btn-primary');
  last = (await btn.innerText().catch(() => '')).trim();
  await btn.click().catch(() => {});
  await p.waitForTimeout(600);
}
r = await round();
ok(/signieren/.test(last) && !!r.signedAt, `offline: every hole checked, the round signed ("${last}")`);
ok((await p.locator('.sc-wrap').count()) === 1, 'offline: the scorecard after signing');
// the stats offline
await p.locator('.tabbar button').filter({ hasText: 'Statistik' }).click().catch(() => {});
await p.waitForTimeout(1200);
ok(/Aus 1 geprüften Runde/.test(await p.locator('main').innerText().catch(() => '')), 'offline: the stats count the round');
await p.getByRole('group', { name: 'Thema' }).getByRole('button', { name: 'Schläger' }).click().catch(() => {});
await p.waitForTimeout(800);
ok((await p.locator('.putter-row').count()) === 1 && (await p.getByRole('heading', { name: 'Deine Streuung' }).count()) === 1, 'offline: the clubs with their spread and the putter');

// —— back online: nothing lost ——
await ctx.setOffline(false);
await p.reload();
await p.waitForTimeout(3000);
r = await round();
ok(!!r.signedAt && r.entries[me].slice(0, 9).every((e) => e.strokes != null), 'online again: the signed round with all scores is there');
ok(errs.filter((e) => !/Failed to fetch|NetworkError|Load failed|weather|open-meteo|ERR_INTERNET_DISCONNECTED/i.test(e)).length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
console.log(bad ? `${bad} FAILED` : 'all ok');
await b.close();
process.exit(bad ? 1 : 0);
