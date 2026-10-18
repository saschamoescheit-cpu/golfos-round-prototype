// QA: profile and bag as Sascha wants them (15.10.2026) – home club searched like a course, the caddie's settings
// under the unit (no language, no sun mode), the bag with tabs, short codes, the putter, the pencil, wedges by loft.
// Usage: node qa/profile.mjs [url]   (SHOTS=<dir> for screenshots)
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
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
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ id: 'qa1', createdAt: '2026-10-10T10:00:00Z', finishedAt: '2026-10-10T14:00:00Z', signedAt: '2026-10-10T14:05:00Z', courseId: 'c', courseName: 'QA', loopOrder: ['Main'], holes, mode: 'detail', players: [{ id: 'me', name: 'Sascha', playingHandicap: 7, isMe: true }], entries: { me: holes.map(entry) }, currentHole: 17 }]));
});
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.waitForTimeout(300);
const prof = await p.locator('main').innerText();
ok(!/Sprache/.test(prof) && !/Sonnenmodus/.test(prof), 'no language and no sun mode in the profile');
ok(!/Sicherung/.test(prof) && prof.indexOf('Auf allen Geräten') >= 0 && prof.indexOf('Auf allen Geräten') < prof.indexOf('Persönliche Daten'), 'Google sign-in above "Persönliche Daten", no backup section');
const heads = (await p.locator('main h2').allInnerTexts()).map((t) => t.trim());
ok(heads.join(' | ').includes('Persönliche Daten | Golf | Caddie') && !heads.includes('Einstellungen'), `sections: ${heads.join(' | ')}`);
ok(/Mein Bag[\s\S]*Distanzen in/.test(await p.locator('section').filter({ has: p.locator('h2', { hasText: /^Golf$/ }) }).innerText()), 'distances under Golf, below "Mein Bag"');
ok(/Von selbst vorlesen/.test(prof) && /Wie der Caddie plant/.test(prof) && !/verfehlen darf/.test(prof), 'caddie settings in the profile, no miss map');
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
ok((await p.locator('.home-club:not(.sg-row)').innerText()).includes('Hetzenhof'), 'home club picked from the course search');

// the bag
await p.locator('.list-item').filter({ hasText: 'Mein Bag' }).click();
await p.waitForTimeout(300);
const full = await p.locator('main').innerText();
ok(full.includes('14 Schläger inkl. Putter') && full.includes('Putter') && !full.includes('Eisen 7'), `bag: 13 clubs + putter, short codes only`);
ok((await p.locator('.bag-foot .bag-count').innerText()).startsWith('14 Schläger') && (await p.getByRole('button', { name: 'Meine Werte speichern' }).count()) === 0, 'count under the table, no save button (saves by itself)');
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
ok(!/216 m\s*$/m.test((await p.locator('.bag-row.full').filter({ hasText: /^D/ }).first().innerText())) && (await p.locator('.bag-row.full').first().locator('.bag-tracked').count()) === 0, 'driver taken over: the tracked hint is gone');
await p.getByRole('textbox', { name: 'D Carry in Metern' }).fill('221');
await p.waitForTimeout(200);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.bag.v1')).find((b) => b.club === 'Dr').carry)) === 221, 'a typed carry is saved at once (no blur, no button)');
ok((await p.locator('.bag-row.full').filter({ hasText: 'Putter' }).locator('input').inputValue()) === '–', 'putter: same box with "–"');
await shot('bag-tracked');
// yards (Sascha 15.10.2026): the same bag in the player's unit – 216 m are 236 yd; typed yards are stored in metres
await p.evaluate(() => localStorage.setItem('golfos.unit.v1', JSON.stringify('yd')));
await p.locator('.topbar').getByRole('button').first().click();
await p.locator('.list-item').filter({ hasText: 'Mein Bag' }).click();
await p.waitForTimeout(300);
const dY = p.getByRole('textbox', { name: 'D Carry in Yards' });
ok((await dY.inputValue()) === '242' && (await p.locator('.bag-row.full').filter({ hasText: 'Putter' }).innerText()).includes('yd'), 'yards: driver 242 yd (221 m)');
await dY.fill('250');
await dY.blur();
await p.waitForTimeout(200);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.carry.v1') ?? localStorage.getItem('golfos.bag.v1') ?? '[]').find((b) => b.club === 'Dr')?.carry)) === 229, '250 yd stored as 229 m');
await shot('bag-yards');
// sync (feature 013): "Sign in with Google" goes to Google through Sascha's Supabase project
await p.locator('.topbar').getByRole('button').first().click();
await p.waitForTimeout(300);
ok(await p.getByText('Auf allen Geräten').isVisible(), 'profile: "Auf allen Geräten" with the Google sign-in');
// what the sync brings from another device shows at once (golfos:pulled), the open profile included
await p.evaluate(() => {
  const pr = JSON.parse(localStorage.getItem('golfos.profile.v1'));
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ ...pr, firstName: 'Ben' }));
  document.activeElement?.blur();
  window.dispatchEvent(new Event('golfos:pulled'));
});
await p.waitForTimeout(300);
ok((await p.locator('#pf-first').inputValue()) === 'Ben', 'profile: a name synced from another device shows at once');
// no "Test" card any more; Golf → strokes gained comparison (Sascha 17.10.2026)
const main = await p.locator('main').innerText();
ok(!/Runden exportieren/.test(main) && (await p.getByRole('heading', { name: 'Test', exact: true }).count()) === 0, 'profile: no "Test" card');
const sgRow = p.locator('.field').filter({ hasText: 'Strokes-Gained-Vergleich' }).locator('.settings-row');
ok((await sgRow.count()) === 1 && /Nächstbessere Gruppe \(Hcp 5\)/.test(await sgRow.innerText()), `Golf: "Strokes-Gained-Vergleich" as a row like the home club (${(await sgRow.innerText()).replace(/\s+/g, ' ')})`);
await sgRow.click();
await p.waitForTimeout(300);
const sheet = p.getByRole('dialog', { name: 'Strokes-Gained-Vergleich' });
ok((await sheet.locator('.pick-option').count()) === 8, 'the choice in a sheet: next better group and the seven groups');
await sheet.locator('.pick-option').filter({ hasText: /^Scratch/ }).click();
await p.waitForTimeout(200);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.profile.v1')).sgGroup)) === 'scratch' && /Scratch/.test(await sgRow.innerText()), 'choosing Scratch keeps it in the profile (synced with it)');
await sgRow.click();
await p.waitForTimeout(300);
await sheet.locator('.pick-option').first().click();
await p.waitForTimeout(200);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.profile.v1')).sgGroup)) == null, 'back to the next better group');
// how the caddie plans: a row in the switch list, the choice in a sheet (Sascha 17.10.2026); no hint under the index
ok(!/Daraus rechnet die App/.test(await p.locator('main').innerText()), 'no hint text under the handicap index');
const planRow = p.locator('.drawer-row').filter({ hasText: 'Wie der Caddie plant' });
ok((await planRow.count()) === 1 && /Normal/.test(await planRow.innerText()), `the caddie's plan as a row of the switch list (${(await planRow.innerText()).replace(/\s+/g, ' ')})`);
await planRow.click();
await p.waitForTimeout(300);
const planSheet = p.getByRole('dialog', { name: 'Wie der Caddie plant' });
ok((await planSheet.locator('.pick-option').count()) === 3, 'the choice in a sheet: Sicher, Normal, Offensiv');
await planSheet.locator('.pick-option').filter({ hasText: /^Sicher/ }).click();
await p.waitForTimeout(200);
ok(/Sicher/.test(await planRow.innerText()) && (await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.caddie.v1')).style)) === 'safe', 'Sicher chosen and kept');
// a new photo: placed and zoomed by hand before it is used (Sascha 17.10.2026)
{
  // a 400 × 300 test picture: left half green, right half white
  const png = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    const g = c.getContext('2d');
    g.fillStyle = '#2e7d32'; g.fillRect(0, 0, 200, 300);
    g.fillStyle = '#ffffff'; g.fillRect(200, 0, 200, 300);
    return c.toDataURL('image/png').split(',')[1];
  });
  await p.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const crop = p.getByRole('dialog', { name: 'Profilbild anpassen' });
  await crop.waitFor({ timeout: 5000 });
  ok(await crop.isVisible(), 'a new photo opens the cropper');
  await crop.getByRole('slider', { name: 'Zoom' }).fill('2');
  const fb = await crop.locator('.crop-frame').boundingBox();
  await p.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await p.mouse.down();
  await p.mouse.move(fb.x + fb.width / 2 + 200, fb.y + fb.height / 2, { steps: 6 }); // the left (green) half into the frame
  await p.mouse.up();
  await crop.getByRole('button', { name: 'Bild übernehmen' }).click();
  await p.waitForTimeout(300);
  const centre = await p.evaluate(async () => {
    const src = JSON.parse(localStorage.getItem('golfos.profile.v1')).photo;
    const i = new Image();
    await new Promise((r) => { i.onload = r; i.src = src; });
    const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
    const g = c.getContext('2d'); g.drawImage(i, 0, 0);
    return { w: i.width, px: [...g.getImageData(i.width / 2, i.height / 2, 1, 1).data] };
  });
  ok(centre.w === 160 && centre.px[1] > 100 && centre.px[0] < 120, `the photo saved as placed: 160 px, the green half in the middle (${centre.px.slice(0, 3).join(',')})`);
}
ok(errs.length === 0, `no page errors in the app ${errs.slice(0, 2).join(' | ')}`); // Google's own page may log its own
await p.getByRole('button', { name: 'Mit Google anmelden' }).click();
await p.waitForURL(/accounts\.google\.com/, { timeout: 20000 }).catch(() => {});
ok(/accounts\.google\.com/.test(p.url()) && p.url().includes('rgisfnilwehnqpmbrxmp'), `sign-in reaches Google (${p.url().slice(0, 60)}…)`);

await b.close();
process.exit(fails ? 1 : 0);
