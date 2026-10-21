// QA: an HCP other than the profile's in the round setup – the app asks whether it is the new one (Sascha 21.10.2026):
// "Yes" saves it in the profile, "No" keeps the profile's and plays this round with the typed one.
// Usage: node qa/hcpask.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|photon\.komoot\.io)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const profileHcp = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.profile.v1') ?? '{}').hcpIndex ?? '');
const setup = async () => {
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.waitForTimeout(2000);
  await p.locator('button.list-item').first().click();
  await p.getByText('Runde starten').waitFor({ timeout: 30000 });
};
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', hcpIndex: '8,4' }));
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1200);
await setup();
ok((await p.locator('input[id="hcp-me"]').inputValue()) === '8,4', 'the setup starts with the profile HCP');
// another one: asked – "No" keeps the profile
await p.fill('#hcp-me', '7,0');
await p.getByRole('button', { name: 'Runde starten' }).click();
const ask = p.getByRole('dialog', { name: 'HCP aktualisieren?' });
await ask.waitFor({ timeout: 5000 }).catch(() => {});
ok(await ask.isVisible(), 'another HCP than the profile: the app asks');
ok(/Im Profil steht 8,4 – heute hast du 7,0 eingetragen/.test(await ask.innerText()), 'it names both values');
await ask.getByRole('button', { name: /Nein – nur für diese Runde/ }).click();
await p.waitForTimeout(3000);
ok((await p.locator('.map-hole-no').count()) === 1 && (await profileHcp()) === '8,4', `"No": the round starts, the profile keeps 8,4 (${await profileHcp()})`);
const played = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].players[0].playingHandicap);
// A+B yellow 71,6 / 130, par 71: 7,0 gives 9 – the profile's 8,4 would give 10
ok(played === 9, `the round plays with the typed 7,0 (playing handicap ${played}, 8,4 would be 10)`);
// "Yes" saves it
await p.evaluate(() => localStorage.removeItem('golfos.rounds.v1')); // the round of the first part goes – back to the start page
await p.goto(url);
await p.waitForTimeout(1500);
await setup();
await p.fill('#hcp-me', '7,0');
await p.getByRole('button', { name: 'Platzvorschau', exact: true }).click();
await ask.waitFor({ timeout: 5000 }).catch(() => {});
await ask.getByRole('button', { name: /Ja – HCP 7,0 im Profil speichern/ }).click();
await p.waitForTimeout(2500);
ok((await profileHcp()) === '7,0', `"Yes": the profile has 7,0 now (${await profileHcp()})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
