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
  // a finished round with tracked shots: driver 232 m and 9-iron 113 m on every hole (→ tracked 216 m and 105 m)
  const M = 1 / 111195;
  const at = (e, n) => [9.69 + (e * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + n * M];
  const holes = Array.from({ length: 18 }, (_, k) => ({ index: k, label: String(k + 1), loop: 'Main', number: k + 1, par: 4, strokeIndex: k + 1 }));
  const entry = () => ({ strokes: 4, putts: 2, pickedUp: false, fairway: null, penalties: 0, detail: { shots: [{ pos: at(0, 0), lie: 'tee', club: 'Dr', penalty: false }, { pos: at(0, 232), lie: 'fairway', club: '9i', penalty: false }], onGreen: at(0, 345), pin: at(0, 350), holedOut: false } });
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ id: 'qa1', createdAt: '2026-10-10T10:00:00Z', finishedAt: '2026-10-10T14:00:00Z', courseId: 'c', courseName: 'QA', loopOrder: ['Main'], holes, mode: 'detail', players: [{ id: 'me', name: 'Sascha', playingHandicap: 7, isMe: true }], entries: { me: holes.map(entry) }, currentHole: 17 }]));
});
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.waitForTimeout(300);
const prof = await p.locator('main').innerText();
ok(!/Sprache/.test(prof) && !/Sonnenmodus/.test(prof), 'no language and no sun mode in the profile');
ok(/Von selbst vorlesen/.test(prof) && /Wie soll der Caddie planen/.test(prof) && !/verfehlen darf/.test(prof), 'caddie settings in the profile, no miss map');
ok(!/Grüns heute/.test(prof), 'no green speed setting');
const voice = p.getByRole('switch', { name: /Von selbst vorlesen/ });
ok((await voice.getAttribute('aria-checked')) === 'false', 'voice switch off by default');
await voice.click();
ok((await voice.getAttribute('aria-checked')) === 'true' && (await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.caddie.v1')).voice)) === true, 'switch turns reading aloud on');
await voice.click();
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
ok((await p.locator('.bag-foot .bag-count').innerText()).startsWith('14 Schläger') && (await p.getByRole('button', { name: 'Meine Werte speichern' }).innerText()).trim() === '', 'count under the table, saving as a disc icon');
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
// tracked carry: shown next to the club, "use" as an icon (Sascha 15.10.2026)
ok((await p.locator('.use-btn').count()) >= 2 && /18 Schläge gemessen/i.test(await p.locator('main').innerText()), `tracked: "18 Schläge gemessen" with the icon button (${await p.locator('.use-btn').count()})`);
ok((await p.locator('.bag-grid ~ .use-all').count()) === 1, '"use all" under the table');
await p.getByRole('button', { name: 'Gemessene 216 m für D übernehmen' }).click();
ok((await p.getByRole('textbox', { name: 'D Carry in Metern' }).inputValue()) === '216', 'icon takes over the tracked 216 m for the driver');
ok((await p.locator('.bag-row.full').filter({ hasText: 'Putter' }).locator('input').inputValue()) === '–', 'putter: same box with "–"');
await shot('bag-tracked');
// yards (Sascha 15.10.2026): the same bag in the player's unit – 216 m are 236 yd; typed yards are stored in metres
await p.evaluate(() => localStorage.setItem('golfos.unit.v1', JSON.stringify('yd')));
await p.locator('.topbar').getByRole('button').first().click();
await p.locator('.list-item').filter({ hasText: 'Mein Bag' }).click();
await p.waitForTimeout(300);
const dY = p.getByRole('textbox', { name: 'D Carry in Yards' });
ok((await dY.inputValue()) === '236' && (await p.locator('.bag-row.full').filter({ hasText: 'Putter' }).innerText()).includes('yd'), 'yards: driver 236 yd');
await dY.fill('250');
await dY.blur();
await p.waitForTimeout(200);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.carry.v1') ?? localStorage.getItem('golfos.bag.v1') ?? '[]').find((b) => b.club === 'Dr')?.carry)) === 229, '250 yd stored as 229 m');
await shot('bag-yards');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
