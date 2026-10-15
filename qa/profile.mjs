// QA: profile and bag as Sascha wants them (15.10.2026) – home club searched like a course, the caddie's settings
// under the unit (no language, no sun mode), the bag with tabs, short codes, the putter, the pencil, wedges by loft.
// Usage: node qa/profile.mjs [url]   (SHOTS=<dir> for screenshots)
import { webkit, devices } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const shot = async (name) => process.env.SHOTS && (await p.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }));
await p.goto(url);
await p.waitForTimeout(1500);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '7,0', homeClub: '' }));
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.waitForTimeout(300);
const prof = await p.locator('main').innerText();
ok(!/Sprache/.test(prof) && !/Sonnenmodus/.test(prof), 'no language and no sun mode in the profile');
ok(/Von selbst vorlesen/.test(prof) && /Wie soll der Caddie planen/.test(prof) && !/verfehlen darf/.test(prof), 'caddie settings in the profile, no miss map');
await shot('profile');
// home club: searched like a course
await p.getByRole('button', { name: /Platz suchen/ }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.waitForTimeout(400);
ok((await p.locator('.home-club').innerText()).includes('Hetzenhof'), 'home club picked from the course search');

// the bag
await p.locator('.list-item').filter({ hasText: 'Mein Bag' }).click();
await p.waitForTimeout(300);
const full = await p.locator('main').innerText();
ok(full.includes('14 Schläger inkl. Putter') && full.includes('Putter') && !full.includes('Eisen 7'), `bag: 13 clubs + putter, short codes only`);
ok(await p.getByRole('radio', { name: 'Voller Schwung' }).or(p.getByRole('button', { name: 'Voller Schwung' })).first().isVisible(), 'tab "Voller Schwung"');
await p.getByText('Pitches', { exact: true }).click();
await p.waitForTimeout(200);
const pitch = await p.locator('main').innerText();
ok(pitch.includes('Lieblingsdistanz') && pitch.includes('¾') && pitch.includes('½') && !pitch.includes('10:30') && !pitch.includes('9 Uhr'), 'pitches: favourite distance, ¾ and ½ without clock times');
await shot('bag-pitches');
// the pencil: add a 4-iron, remove the LW, the PW's loft right at the club
await p.getByRole('button', { name: 'Bag bearbeiten' }).click();
await p.getByRole('button', { name: 'Eisen 4 hinzufügen' }).click();
await p.getByRole('button', { name: 'LW aus dem Bag entfernen' }).click();
await p.getByRole('textbox', { name: 'Loft des PW' }).fill('43');
await p.waitForTimeout(200);
await shot('bag-edit');
await p.getByRole('button', { name: 'Fertig' }).click();
await p.getByText('Voller Schwung', { exact: true }).click();
const after = await p.locator('main').innerText();
ok(after.includes('4i') && after.includes('PW (43°)') && after.includes('SW') && !after.includes('SW (') && !after.includes('LW'), 'pencil: 4i added, LW removed, "PW (43°)" shown');
await shot('bag-full');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
