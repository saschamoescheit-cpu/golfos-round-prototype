// Launch monitor data (Sascha 25.10.2026, feature 037): Profil → Mein Bag → "Launch-Monitor-Daten importieren" – a Garmin R10
// export (yards, units row) shows per club the shots, the carry in metres and the bag's value so far; "Übernehmen" puts
// the carries into the bag and keeps the spread – the stats then show "Streuung aus n Launch-Monitor-Schlägen". A file
// without a unit asks for it; a file without a carry column says so.
// Usage: node qa/launchimport.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone SE'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (c, what) => {
  if (!c) bad++;
  console.log(`${c ? '✓' : '✗'} ${what}`);
};
// eight shots each of driver, 7-iron and pitching wedge, in yards – one topped 7-iron among them
const rows = [];
const add = (club, carry, side) => rows.push(`10/25/26 9:00 AM,Alex,${club},x,90,130,12,2500,${carry},0,${side},${carry + 10},0`);
[230, 222, 238, 226, 219, 241, 233, 228].forEach((c, k) => add('Driver', c, [-12, 5, 9, -3, -15, 11, 2, -6][k]));
[150, 147, 155, 149, 152, 146, 154, 60].forEach((c, k) => add('7 Iron', c, [-4, 2, 6, -1, 3, -6, 0, 15][k]));
[118, 112, 121, 109, 116, 124, 114, 119].forEach((c, k) => add('Pitching Wedge', c, [-2, 1, 3, -3, 0, 2, -1, 1][k]));
const GARMIN = `Date,Player,Club Name,Club Type,Club Speed,Ball Speed,Launch Angle,Backspin,Carry Distance,Carry Deviation Angle,Carry Deviation Distance,Total Distance,Total Deviation Distance
,,,,[mph],[mph],[deg],[rpm],[yds],[deg],[yds],[yds],[yds]
${rows.join('\n')}`;

await p.goto(url);
await p.waitForTimeout(1000);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.locator('.list-item').filter({ hasText: 'Mein Bag' }).click();
await p.waitForTimeout(400);
const card = p.getByRole('region', { name: 'Launch-Monitor' });
ok((await card.count()) === 1 && /Trackman, Foresight, Garmin R10, Rapsodo/.test(await card.innerText()), 'Mein Bag: the launch monitor card under the carries');
const btn = card.getByRole('button', { name: 'Launch-Monitor-Daten importieren' });
ok((await btn.getAttribute('class')).includes('btn-secondary') && (await btn.locator('svg').count()) === 1, 'the import button in the app\'s style, with a symbol');

// a file without a carry column: said so, nothing changed
await card.locator('input[type=file]').setInputFiles({ name: 'scores.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Score\nAlex,82') });
await p.waitForTimeout(300);
ok(/Keine Schläge gefunden/.test(await card.innerText()), 'a file without shots: "Keine Schläge gefunden …"');

// the Garmin export
await card.locator('input[type=file]').setInputFiles({ name: 'garmin-r10.csv', mimeType: 'text/csv', buffer: Buffer.from(GARMIN) });
await p.waitForTimeout(400);
const sheet = p.getByRole('dialog', { name: 'Launch-Monitor-Daten' });
ok((await sheet.count()) === 1 && /Garmin · 24 Schläge/.test(await sheet.innerText()), 'the preview: "Garmin · 24 Schläge"');
const text = (await sheet.innerText()).replace(/\s+/g, ' ');
// 7-iron: median of the seven good ones 150 yd = 137 m; the topped 60 yd one left out
ok(/7i 7× 137 m/.test(text), `7-iron: 7 shots (the topped one out), carry 137 m (${(/7i[^D]{0,40}/.exec(text) ?? [''])[0]})`);
ok(/D 8× 209 m/.test(text) && /PW 8× 107 m/.test(text), 'driver 209 m and pitching wedge 107 m from yards');
ok((await sheet.getByText('Die Datei nennt keine Einheit').count()) === 0, 'the unit from the file – not asked');
await sheet.getByRole('button', { name: 'Übernehmen' }).click();
await p.waitForTimeout(300);
const carry = (code) => p.getByLabel(`${code} Carry in Metern`).inputValue();
ok((await carry('D')) === '209' && (await carry('7i')) === '137' && (await carry('PW')) === '107', `the bag took the carries (D ${await carry('D')}, 7i ${await carry('7i')}, PW ${await carry('PW')})`);
ok(/Garmin · .* 3 Schläger, 23 Schläge/.test(await card.innerText()), 'the card says where the data comes from');
const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.launch.v1') ?? 'null'));
ok(kept?.clubs?.length === 3 && kept.clubs.every((c) => c.len && c.side), 'kept: per club carry, length and side spread');

// (which spread the ellipse takes – own shots, launch monitor, estimate – is checked in src/lib/spread.test.ts)

// a file without units asks for them
await p.getByRole('region', { name: 'Launch-Monitor' }).locator('input[type=file]').setInputFiles({ name: 'rapsodo.csv', mimeType: 'text/csv', buffer: Buffer.from('Rapsodo MLM2PRO Session Export\nClub Type,Carry Distance,Side Carry\n9 Iron,120,2\n9 Iron,118,-3\n9 Iron,124,1\n9 Iron,121,0\n9 Iron,119,4') });
await p.waitForTimeout(300);
const s2 = p.getByRole('dialog', { name: 'Launch-Monitor-Daten' });
ok((await s2.getByText('Die Datei nennt keine Einheit').count()) === 1, 'no unit in the file: asked');
await s2.getByRole('button', { name: 'Meter' }).click();
await p.waitForTimeout(200);
ok(/9i 5× 120 m/.test((await s2.innerText()).replace(/\s+/g, ' ')), 'metres chosen: 120 m as in the file');
await s2.getByRole('button', { name: 'Abbrechen' }).click();
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);
