// QA (Sascha 13.11.2026, the round check on the iPad): "Auch sollten die Putts, welche im Editor sind, auch vorne schon
// angezeigt werden – immer und auf allen Bahnen"; "Wenn Texas Wedge gewählt wird, muss der Schlag immer Chip sein";
// "Abschlag muss auch immer Tee sein". A finished round with putts but none placed: the map shows P1 P2 and the putts'
// row their lengths before the editor was opened; a ball moved on the map keeps all of them; the putter picked in a
// shot's sheet makes it a chip; shot 1 dragged away from the drawn tee stays "Tee".
// Usage: node qa/shotsuggest.mjs [url]
import { readFileSync } from 'node:fs';
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const sim = JSON.parse(readFileSync(new URL('./simtrack.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => (console.log(`${c ? '✓' : '✗'} ${m}`), c || fails++);

await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  localStorage.setItem('golfos.tip.shots.v1', '1');
});
await p.reload();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1500);
await p.fill('#course-search', 'Hetzenhof');
await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().waitFor({ timeout: 30000 });
await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.waitForTimeout(3000);
// the round as played: score and 2 putts, nothing placed
for (let pass = 0; pass < 2; pass++) {
  if (pass) await p.waitForTimeout(800);
  await p.evaluate(
    ([track, truth]) => {
      const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
      const r = rs[0];
      const id = Object.keys(r.entries)[0];
      r.entries[id] = r.entries[id].map((e, k) => ({ ...e, strokes: truth[k].shots.length + 2, putts: 2, puttsAt: undefined }));
      r.finishedAt = new Date().toISOString();
      localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
      localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify(track));
      sessionStorage.setItem('golfos.paused', r.id);
    },
    [sim.track, sim.truth],
  );
}
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click({ timeout: 60000 });
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: /Schläge prüfen/ }).click();
// under load (the gate runs three at once) the check takes its time: wait for the putts' row and the map
await p.locator('.review-list li.putt-row').waitFor({ timeout: 60000 });
await p.waitForFunction(() => /1: [d,]+ m/.test(document.querySelector('.review-list li.putt-row')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});
const entry = (i = 0) => p.evaluate((n) => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][n], i);

// the putts before the editor was opened: on the map and in the row
const row = p.locator('.review-list li.putt-row');
const rowText = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/2 Putts/.test(rowText) && /1: [\d,]+ m · 2: [\d,]+ m/.test(rowText), `the putts' row: their lengths at once ("${rowText.trim()}")`);
await p.locator('.review-map').scrollIntoViewIfNeeded();
await p.locator('.review-map .map-shot-dot.green').first().waitFor({ timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1500);
const dots = async () => (await p.locator('.review-map .map-shot-dot.green').allInnerTexts()).map((t) => t.trim());
ok((await dots()).includes('P1') && (await dots()).includes('P2'), `the map: P1 and P2 (${(await dots()).join(' ')})`);
ok(!(await entry()).puttsAt, 'shown only – nothing saved until a ball is moved');
// a ball moved on the map: the putts of the hole from now on, both of them
{
  const dot = p.locator('.review-map .map-shot-dot.green').filter({ hasText: /^P2$/ }).first();
  const bb = await dot.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.down();
  await p.mouse.move(bb.x + bb.width / 2 + 30, bb.y + bb.height / 2 + 30, { steps: 10 });
  await p.mouse.up();
  await p.waitForTimeout(900);
  const e = await entry();
  ok(e.puttsAt?.balls?.length === 2 && !!e.puttsAt?.pin && e.putts === 2, `P2 moved: the hole keeps two balls and the flag (${e.puttsAt?.balls?.length})`);
}

// the putter picked in a shot's sheet: a chip
await p.locator('.review-list').scrollIntoViewIfNeeded();
const shotRows = p.locator('.review-list li[data-shot] button.shot-row');
const nShots = await shotRows.count();
await shotRows.nth(nShots - 1).click();
await p.waitForTimeout(500);
const sheet = p.locator('.sheet').first();
await sheet.getByRole('button', { name: /Texas Wedge/ }).click();
await p.waitForTimeout(200);
const kindGroup = sheet.getByRole('group', { name: 'Schlagart' });
ok((await kindGroup.getByRole('button', { name: 'Chip', exact: true }).getAttribute('aria-pressed')) === 'true', 'the putter (Texas wedge) picked: "Chip" chosen');
// Sascha 14.11.2026: "Wenn der Ball im Bunker ist, sollte Bunker und Bunker die Standardauswahl sein"
{
  const lieGroup = sheet.getByRole('group', { name: 'Lage' });
  const pressed = async (g, n) => (await g.getByRole('button', { name: n, exact: true }).getAttribute('aria-pressed')) === 'true';
  await sheet.getByRole('button', { name: /Wedge|^SW|^PW/ }).first().click().catch(() => {});
  await kindGroup.getByRole('button', { name: 'Voll', exact: true }).click();
  await lieGroup.getByRole('button', { name: 'Bunker', exact: true }).click();
  await p.waitForTimeout(150);
  ok(await pressed(kindGroup, 'Bunker'), 'the lie "Bunker" chosen: the shot type "Bunker" too – even after "Voll"');
  await lieGroup.getByRole('button', { name: 'Fairway', exact: true }).click();
  await p.waitForTimeout(150);
  ok(!(await pressed(kindGroup, 'Bunker')), 'out of the bunker again: the type follows the suggestion, no longer "Bunker"');
  await sheet.getByRole('button', { name: /Texas Wedge/ }).click();
  await p.waitForTimeout(150);
}
await p.getByRole('button', { name: /Fertig|Speichern|Übernehmen/ }).last().click();
await p.waitForTimeout(600);
{
  const s = (await entry()).detail.shots[nShots - 1];
  ok(s.club === 'Pt' && s.kind === 'chip', `saved: putter and chip (${s.club} · ${s.kind})`);
}
// Sascha 14.11.2026: "Wie trage ich Chip-In oder Hole-out ein? … bei 0 Putts muss 'eingelocht' kommen" – one way: 0
// putts in the score; the putts' row says "Eingelocht – Chip-in", the last shot "eingelocht"; no extra button
{
  await shotRows.nth(nShots - 1).click();
  await p.waitForTimeout(500);
  ok((await p.locator('.sheet').first().getByRole('button', { name: /Eingelocht/ }).count()) === 0, "the last shot's sheet: no extra Eingelocht button");
  await p.locator('.sheet').first().getByRole('button', { name: 'Schließen' }).first().click();
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: /^Score an Loch .* bearbeiten$/ }).click();
  await p.waitForTimeout(300);
  const panel = p.locator('.score-panel');
  // down to 0 – one more would be "not entered"
  const putts0 = (await entry()).putts ?? 0;
  for (let n = 0; n < putts0; n++) await panel.getByRole('button', { name: /^Putts minus eins/ }).first().click();
  await panel.getByRole('button', { name: 'Zurück zu Schläge prüfen' }).click();
  await p.waitForTimeout(600);
  const e = await entry();
  ok(e.putts === 0 && e.detail.holedOut === true, `0 putts: holed out (${e.putts} · ${e.detail.holedOut})`);
  const lastRow = (await shotRows.nth(nShots - 1).innerText()).replace(/\s+/g, ' ');
  ok(/eingelocht/.test(lastRow), `the last shot: "${lastRow.trim()}"`);
  const row = (await p.locator('.review-list li.putt-row').innerText()).replace(/\s+/g, ' ');
  ok(/Eingelocht – Chip-in/.test(row) && /keine Putts/.test(row), `the putts' row: "${row.trim()}"`);
}

// shot 1 dragged 40 m away from the drawn tee (a back tee): still "Tee"
{
  const m1 = p.locator('.review-map .map-shot-dot').filter({ hasText: /^1( |$)/ }).first();
  await p.locator('.review-map').scrollIntoViewIfNeeded();
  await p.waitForTimeout(800);
  const bb = await m1.boundingBox();
  if (bb) {
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await p.mouse.down();
    await p.mouse.move(bb.x + bb.width / 2 - 40, bb.y + bb.height / 2 + 25, { steps: 10 });
    await p.mouse.up();
    await p.waitForTimeout(900);
  }
  const s = (await entry()).detail.shots[0];
  ok(!!bb && s.lie === 'tee', `shot 1 dragged off the drawn tee: its lie stays "Tee" (${s.lie})`);
}
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
