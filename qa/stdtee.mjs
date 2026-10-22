// QA: gender and standard tee in the profile (Sascha 22.10.2026: "I play yellow as a rule, white now and then"). Every
// round starts with the profile's tee where the course has it, a round from another tee does not change the next start;
// a lady gets red to start with and no men's course rating.
// Usage: node qa/stdtee.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '7', homeClub: '' }));
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1000);

// the profile: gender and standard tee
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.waitForTimeout(500);
// gender as a menu left of the handicap index (Sascha 22.10.2026): männlich, weiblich, divers
const opts = await p.locator('#pf-gender option').allInnerTexts();
ok(opts.join(',') === '–,männlich,weiblich,divers', `gender menu: ${opts.join(', ')}`);
const gBox = await p.locator('#pf-gender').boundingBox();
const hBox = await p.locator('#pf-hcp').boundingBox();
ok(gBox && hBox && gBox.x < hBox.x && Math.abs(gBox.y - hBox.y) < 4, 'gender left of the handicap index, in one row');
await p.selectOption('#pf-gender', 'm');
// the standard tee below "Mein Bag", above "Distanzen in"
const bagY = (await p.locator('.list-item').filter({ hasText: 'Mein Bag' }).boundingBox()).y;
const teeY = (await p.locator('.std-tee').boundingBox()).y;
const distY = (await p.getByText('Distanzen in', { exact: true }).boundingBox()).y;
ok(bagY < teeY && teeY < distY, 'standard tee between "Mein Bag" and "Distanzen in"');
await p.locator('.std-tee').click();
await p.getByRole('dialog', { name: 'Standard-Tee' }).locator('.pick-option').filter({ hasText: 'Weiß' }).click();
const prof = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.profile.v1')));
ok(prof.gender === 'm' && prof.tee === 'White', `profile: gender and standard tee kept (${prof.gender}, ${prof.tee})`);
ok(/Weiß/.test(await p.locator('.std-tee').innerText()), 'the standard tee shown in the profile');

const setup = async (name) => {
  await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', name);
  await p.waitForTimeout(2500);
  await p.locator('button.list-item').first().click();
  await p.getByText('Runde starten').waitFor({ timeout: 60000 });
};
const myTee = async () => (await p.locator('.player-row').first().locator('.tee-pick').getAttribute('aria-label')) ?? '';
const ratingLine = async () => (await p.locator('.rating-line').innerText().catch(() => '')).replace(/\s+/g, ' ');

// Hetzenhof: white from the profile, with white's course rating
await setup('Hetzenhof');
ok(/Weiß/.test(await myTee()), `the round starts with the profile's tee (${await myTee()})`);
ok(/74,2/.test(await ratingLine()), `white's course rating (${await ratingLine()})`);
// once from yellow – the next round starts with white again
await p.locator('.player-row').first().locator('.tee-pick').click();
await p.getByRole('dialog', { name: 'Tee' }).locator('.pick-option').filter({ hasText: 'Gelb' }).click();
await p.getByRole('button', { name: 'Runde starten' }).click();
await p.waitForTimeout(2500);
// the round over (else the app opens it again on the next start)
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  rs[0].finishedAt = new Date().toISOString();
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
  sessionStorage.clear();
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.goto(url);
await p.waitForTimeout(1200);
await setup('Hetzenhof');
ok(/Weiß/.test(await myTee()), `a round from yellow does not change the next start: white again (${await myTee()})`);
await p.getByRole('button', { name: 'Zurück' }).first().click();
await p.getByRole('button', { name: 'Zurück' }).first().click().catch(() => {});

// a lady without a standard tee: red to start with, no men's course rating
await p.evaluate(() => {
  const pr = JSON.parse(localStorage.getItem('golfos.profile.v1'));
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ ...pr, gender: 'f', tee: undefined }));
  localStorage.removeItem('golfos.me.v1'); // nothing remembered from the rounds before
  sessionStorage.clear();
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.goto(url);
await p.waitForTimeout(1200);
await setup('Hetzenhof');
ok(/Rot/.test(await myTee()), `a lady starts from red (${await myTee()})`);
ok(/eintragen/.test(await ratingLine()), `no men's course rating for a lady – her own to enter (${await ratingLine()})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
