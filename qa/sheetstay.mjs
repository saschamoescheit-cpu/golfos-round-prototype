// QA (Sascha 17.11.2026, iPad: "Kontextmenüs bleiben nicht offen, sondern schließen sich automatisch"): a sheet opened
// in the profile stays open while a sync brings something from another device ("golfos:pulled" rebuilt the caddie's
// block, its sheets closed after 0.5–3 s while the iPhone synced). What came down still shows once the sheet is closed.
// iPad size, WebKit. Usage: node qa/sheetstay.mjs [url]
import { webkit } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '7', homeClub: 'Hetzenhof' }));
});
await p.reload();
await p.waitForTimeout(1500);
// the profile of the start page – as in the recording
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.waitForTimeout(600);

const SYNC = ['golfos:synced', 'golfos:rounds-changed', 'golfos:games-changed', 'golfos:pulled', 'golfos:friends-changed'];
const stays = async (label) => {
  const row = p.locator('.settings-row').filter({ hasText: label }).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await p.waitForTimeout(300);
  const open = (await p.getByRole('dialog').count()) === 1;
  // a sync every half second for three seconds, as while the iPhone plays a round
  for (let i = 0; i < 6; i++) {
    await p.evaluate((evs) => evs.forEach((e) => window.dispatchEvent(new Event(e))), SYNC);
    await p.waitForTimeout(500);
  }
  ok(open && (await p.getByRole('dialog').count()) === 1, `"${label}": the sheet stays open through six syncs`);
  await p.getByRole('dialog').getByRole('button', { name: 'Schließen' }).first().click().catch(() => {});
  await p.waitForTimeout(250);
};
for (const label of ['Höhe deiner Weiten', 'Wie der Caddie plant', 'Grün-Neigung auf dem Grün', 'Schlägerempfehlungen', 'Von selbst vorlesen', 'Strokes-Gained-Vergleich']) await stays(label);

// another device set "Sicher" while the sheet was open: the row shows it once closed – and the sheet stayed
const style = p.locator('.settings-row').filter({ hasText: 'Wie der Caddie plant' }).first();
await style.click();
await p.waitForTimeout(300);
await p.evaluate(() => {
  const c = JSON.parse(localStorage.getItem('golfos.caddie.v1') ?? '{}');
  localStorage.setItem('golfos.caddie.v1', JSON.stringify({ ...c, style: 'safe' }));
  window.dispatchEvent(new Event('golfos:pulled'));
});
await p.waitForTimeout(400);
ok((await p.getByRole('dialog').count()) === 1, 'a change from another device: the sheet still open');
const chosen = await p.getByRole('dialog').locator('.pick-option[aria-pressed="true"]').innerText().catch(() => '');
ok(/Sicher/.test(chosen), `… and it shows the new choice (${chosen.replace(/\s+/g, ' ')})`);
await p.getByRole('dialog').getByRole('button', { name: 'Schließen' }).first().click();
await p.waitForTimeout(250);
ok(/Sicher/.test(await style.innerText()), `the row: "Sicher" (${(await style.innerText()).replace(/\s+/g, ' ')})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
