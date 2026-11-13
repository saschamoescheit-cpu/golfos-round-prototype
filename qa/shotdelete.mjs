// QA (Sascha 13.11.2026, iPad, Schläge prüfen: "Schlag löschen und bestätigen liegen übereinander – als ich soeben neben
// bestätigen geklickt habe, war der Schlag gelöscht … besser, man kann den Schlag in dieser Maske gar nicht löschen"):
// on the course a shot's sheet still has "Schlag löschen" (no other way there) – it asks first, "Zurück" keeps the shot;
// after the round (Schläge prüfen) the sheet has none – the bin in the row deletes.
// Usage: node qa/shotdelete.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
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
// two shots on hole 1, noted in detail
const shotsOf = () => p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][0].detail?.shots?.length ?? 0);
for (let pass = 0; pass < 2; pass++) {
  if (pass) await p.waitForTimeout(800);
  await p.evaluate(() => {
    const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
    const r = rs[0];
    r.mode = 'detail';
    const id = Object.keys(r.entries)[0];
    const at = (n) => [9.689329 + n * 0.0012, 48.781065 + n * 0.0004];
    r.entries[id][0] = { ...r.entries[id][0], detail: { shots: [{ pos: at(0), lie: 'tee', club: 'Dr', penalty: false }, { pos: at(1), lie: 'fairway', club: '7i', penalty: false }], onGreen: null, pin: null, holedOut: false } };
    localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
  });
}
await p.reload();
await p.waitForTimeout(2500);
// the hole with shots: its score view lists them (a tap on the hole bar)
await p.locator('button.map-score').first().click().catch(() => {});
await p.waitForTimeout(800);
const edit2 = p.getByRole('button', { name: 'Schlag 2 bearbeiten' });
await edit2.waitFor({ timeout: 15000 }).catch(() => {});
ok((await edit2.count()) === 1 && (await shotsOf()) === 2, `on the course: two shots, "Schlag 2 bearbeiten" (${await shotsOf()})`);
await edit2.click();
await p.waitForTimeout(500);
const del = p.locator('.sheet').getByRole('button', { name: 'Schlag löschen' });
ok((await del.count()) === 1, 'on the course: the sheet has "Schlag löschen"');
await del.click();
await p.waitForTimeout(400);
const ask = p.getByRole('dialog', { name: 'Diesen Schlag löschen?' });
ok((await ask.count()) === 1 && (await shotsOf()) === 2, 'a tap on it asks first – nothing deleted yet');
await ask.getByRole('button', { name: 'Zurück' }).click().catch(async () => ask.getByRole('button', { name: /Abbrechen|Schließen/ }).first().click());
await p.waitForTimeout(400);
ok((await ask.count()) === 0 && (await shotsOf()) === 2 && (await p.locator('.sheet').getByRole('button', { name: 'Schlag löschen' }).count()) === 1, '"Zurück": the shot kept, the sheet still open');
await del.click();
await p.waitForTimeout(300);
await p.getByRole('dialog', { name: 'Diesen Schlag löschen?' }).getByRole('button', { name: 'Schlag löschen' }).click();
await p.waitForTimeout(600);
ok((await shotsOf()) === 1 && (await p.getByRole('dialog', { name: 'Diesen Schlag löschen?' }).count()) === 0, `confirmed: the shot deleted (${await shotsOf()} left)`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
