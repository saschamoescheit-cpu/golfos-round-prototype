// QA (Sascha 26.10.2026): launch monitor sessions – a German Garmin R10 export with every measurement, its day in the
// preview, a club the bag lacks added (iron 4: "if it says iron 4, it was an iron 4"), a second session (Trackman) with a
// club measured again – the newer proposed, the player keeps the old one –, both sessions listed; the session's own page
// with four tabs, the spread first every time; in the stats the range's shots as rings, off at first, remembered.
// Data: made up in the devices' formats (no real player's session). Usage: node qa/rangesession.mjs [url]  (SHOTS=<dir>)
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const demo = JSON.parse(readFileSync(new URL('../../tutorial/demo-state.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const shot = async (name) => process.env.SHOTS && p.screenshot({ path: `${process.env.SHOTS}/${name}.png` });

// ---------- the files ----------
const HEAD = 'Datum,Spieler,Schlägername,Marke/Modell,Schlägerart,Schl.gsch.,Anstellwinkel,Schwungbahn,Schlagfläche,Schlagflächenstellung,Ballgeschwindigkeit,Smash Factor,Abflugwinkel,Abflugrichtung,Backspin,Sidespin,Drehrate,Drehratentyp,Drehachse,Höhe des Scheitelpunkts,Carry-Distanz,Carry-Abweichungswinkel,Carry-Abweichungsdistanz,Gesamt​strecke,Gesamtabweichungswinkel,Gesamtabweichungsdistanz,Notiz,Markierung,Luftdichte,Temperatur,Luftdruck,Relative Luftfeuchtigkeit,Rückschw.zeit,Durchschw.zeit,Schwungtempo';
const UNITS = ',,,,,[mph],[deg],[deg],[deg],[deg],[mph],,[deg],[deg],[1/m.],[1/m.],[1/m.],,[deg],[m],[m],[deg],[m],[m],[deg],[m],,,[g/L],[deg C],[kPa],[%],[s],[s],';
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const R10 = [];
const add = (club, n, carry, cs, bs, la, spin, apex) => {
  for (let k = 0; k < n; k++) {
    const c = carry + (rnd() - 0.5) * 14;
    const dir = (rnd() - 0.5) * 8;
    const curve = (rnd() - 0.5) * 6;
    const ang = dir + curve;
    const side = Math.tan((ang * Math.PI) / 180) * c;
    const t = `15.11.25 22:${String(10 + R10.length).padStart(2, '0')}:00`;
    R10.push([t, 'Alex', '', '', club, cs, -1.2, 0.4, 1.1, 0.8, bs, (bs / cs).toFixed(2), la, dir.toFixed(2), spin, 300, spin + 10, 'Berechnet', 2, apex, c.toFixed(1), ang.toFixed(2), side.toFixed(1), (c + 8).toFixed(1), ang.toFixed(2), (side * 1.05).toFixed(1), '', '', 1.2, 9.4, 101, 0, '091', '013', 7.0].join(','));
  }
};
add('Eisen 4', 5, 170, 93, 128, 13.2, 4330, 22.7);
add('Eisen 7', 10, 159, 89, 120, 16.8, 4865, 26.9);
add('Pitching-Wedge', 8, 117, 86, 104, 27.5, 8000, 34.3);
const R10_CSV = [HEAD, UNITS, ...R10].join('\n');
const TRACKMAN_CSV = `Date,Club,Club Speed,Attack Angle,Club Path,Dyn. Loft,Face Angle,Spin Loft,Face To Path,Ball Speed,Smash Factor,Launch Angle,Launch Direction,Spin Rate,Spin Axis,Height,Carry,Carry Side,Total,Land. Angle
,,[mph],[deg],[deg],[deg],[deg],[deg],[deg],[mph],,[deg],[deg],[rpm],[deg],[ft],[yds],[yds],[yds],[deg]
${[178, 181, 176, 183, 179, 180].map((c, k) => `2026-10-28 18:0${k}:00,7 Iron,88.0,-4.1,1.2,20.1,2.0,24.2,0.8,119.0,1.35,16.0,${[1.9, -1.2, 0.4, 2.5, -0.6, 0.9][k]},6900,3.1,90.0,${c}.0,${[4, -3, 1, 6, -2, 2][k]}.0,${c + 8}.0,47.0`).join('\n')}`;

// ---------- start: the example player's rounds (for the stats), rounds module ----------
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate((d) => {
  localStorage.clear();
  sessionStorage.clear();
  for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v);
  localStorage.removeItem('golfos.launch.v1');
  localStorage.removeItem('golfos.stats.range.v1');
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
}, demo);
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.locator('.list-item').filter({ hasText: 'Mein Bag' }).click();
await p.waitForTimeout(500);
const card = p.getByRole('region', { name: 'Launch-Monitor' });
const had4i = (await p.getByLabel('4i Carry in Metern').count()) > 0;

// 1 · the R10 session: its day, iron 4 added
await card.locator('input[type=file]').setInputFiles({ name: 'Driving_Range.csv', mimeType: 'text/csv', buffer: Buffer.from(R10_CSV) });
await p.waitForTimeout(500);
const sheet = p.getByRole('dialog', { name: 'Launch-Monitor-Daten' });
const prev = (await sheet.innerText()).replace(/\s+/g, ' ');
ok(/Garmin · 23 Schläge/.test(prev) && /gemessen am 15\.11\.2025/.test(prev), `preview: Garmin, 23 shots, "gemessen am 15.11.2025"`);
const add4i = sheet.getByRole('switch', { name: /Eisen 4 zum Bag hinzufügen/ });
ok(had4i || (await add4i.getAttribute('aria-checked')) === 'true', had4i ? 'iron 4 already in the bag – nothing to add' : 'iron 4 not in the bag: "Eisen 4 zum Bag hinzufügen" – on');
const carry7 = Number((/7i \d+× (\d+) m/.exec(prev) ?? [])[1]);
await shot('01-vorschau');
await sheet.getByRole('button', { name: 'Übernehmen' }).click();
await p.waitForTimeout(500);
const inBag = async (code) => (await p.getByLabel(`${code} Carry in Metern`).count()) ? Number(await p.getByLabel(`${code} Carry in Metern`).inputValue()) : null;
ok((await inBag('4i')) != null && Math.abs((await inBag('4i')) - 170) <= 8, `iron 4 in the bag with its measured carry (${await inBag('4i')} m)`);
ok((await inBag('7i')) === carry7, `iron 7 as measured, 1:1 (${await inBag('7i')} m)`);
const five = await inBag('5i');
ok(five === 150 || five === Number(JSON.parse(demo['golfos.bag.v1'] ?? 'null')?.find?.((x) => x.club === '5i')?.carry ?? five), `iron 5 not in the file – stays as entered (${five} m)`);
ok(/Garmin · 15\.11\.2025 · 23 Schläge/.test(await card.innerText()), 'the card lists the session with the day it was measured');

// 2 · a Trackman session with iron 7 again: the newer proposed, the player keeps the old one
await card.locator('input[type=file]').setInputFiles({ name: 'trackman.csv', mimeType: 'text/csv', buffer: Buffer.from(TRACKMAN_CSV) });
await p.waitForTimeout(500);
const s2 = p.getByRole('dialog', { name: 'Launch-Monitor-Daten' });
ok(/Trackman · 6 Schläge/.test((await s2.innerText()).replace(/\s+/g, ' ')), 'a Trackman file recognised by its columns');
const choice = s2.getByRole('group', { name: 'Eisen 7 schon gemessen' });
ok((await choice.count()) === 1 && /Diese Sitzung ist neuer/.test(await choice.innerText()), 'iron 7 measured before: said so, "Diese Sitzung ist neuer"');
ok((await choice.getByRole('button', { name: /^Neu/ }).getAttribute('aria-pressed')) === 'true', 'the newer one proposed');
await shot('02-zweite-sitzung');
await choice.getByRole('button', { name: /^Bisher/ }).click();
await s2.getByRole('button', { name: 'Übernehmen' }).click();
await p.waitForTimeout(500);
ok((await inBag('7i')) === carry7, `the player kept the old iron 7 (${await inBag('7i')} m)`);
const rows = (await card.locator('.launch-sessions .list-item').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
ok(rows.length === 2 && /^Trackman · 28\.10\.2026/.test(rows[0]) && /^Garmin · 15\.11\.2025/.test(rows[1]), `both sessions, the newest first: ${rows.join(' | ')}`);
const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.launch.v1')));
ok(kept.sessions.length === 2 && kept.clubs.find((c) => c.club === '7i').measuredAt.startsWith('2025-11-15'), 'kept: both sessions, iron 7 from the first');

// 3 · the session's page: four tabs, the spread first
await card.locator('.launch-sessions .list-item').filter({ hasText: 'Garmin' }).click();
await p.waitForTimeout(600);
ok(await p.getByRole('heading', { name: 'Range-Sitzung' }).isVisible(), 'the session opens: "Range-Sitzung"');
// at its top – not scrolled down where the card stood in the bag (night run 27./28.10.2026)
ok((await p.evaluate(() => window.scrollY)) < 5, `the session's page opens at its top (scrollY ${await p.evaluate(() => window.scrollY)})`);
const tabs = p.getByRole('group', { name: 'Sitzung' });
const pressed = async () => (await tabs.locator('button[aria-pressed="true"]').innerText()).trim();
ok((await tabs.locator('button').allInnerTexts()).join('|') === 'Streuung|Abstände|Flugbahn|Schwung' && (await pressed()) === 'Streuung', 'four tabs, "Streuung" chosen');
const chips = await p.getByRole('group', { name: 'Schläger' }).locator('button').allInnerTexts();
ok(chips.join('|') === '4i · 5×|7i · 10×|PW · 8×' && /7i/.test(await p.getByRole('group', { name: 'Schläger' }).locator('button[aria-pressed="true"]').innerText()), `clubs in order, the one with the most shots first chosen: ${chips.join(' ')}`);
const dots = p.locator('.range-dots circle');
ok((await dots.count()) === 10 && (await p.locator('.range-dots ellipse').count()) === 1, `spread: 10 shots and the ellipse (${await dots.count()})`);
ok((await p.locator('.range-tiles .insight').count()) === 4, 'four tiles: carry, with roll, width, length');
await shot('03-streuung');
await tabs.getByRole('button', { name: 'Abstände' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.range-gap.measured').count()) === 3, 'gaps: the three measured clubs in green beside the bag');
ok(/Eisen 4 fliegt nur/.test(await p.locator('main').innerText()), 'what stands out: iron 4 only a little beyond iron 7');
await shot('04-abstaende');
await tabs.getByRole('button', { name: 'Flugbahn' }).click();
await p.waitForTimeout(300);
const counts = (await p.locator('.range-flight-n').allInnerTexts()).map(Number).reduce((s, n) => s + n, 0);
ok(counts === 10 && (await p.locator('.range-flight').count()) === 11, `flight: nine flights and draw/fade, counted (${counts} of 10)`);
await shot('05-flugbahn');
await tabs.getByRole('button', { name: 'Schwung' }).click();
await p.waitForTimeout(300);
const swing = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
ok(/Schlägerkopf 14\d km\/h 145 km\/h/.test(swing) && /Backspin/.test(swing) && /Tempo 7,0 : 1/.test(swing), 'swing: the measurements beside the tour, the rhythm');
await shot('06-schwung');
await p.getByRole('button', { name: 'Zurück zu Mein Bag' }).click();
await p.waitForTimeout(400);
const cardBox = await card.locator('.launch-sessions').boundingBox();
ok(cardBox && cardBox.y > 0 && cardBox.y < 844, `back in the bag at the launch monitor card (${cardBox ? Math.round(cardBox.y) : '–'})`);
await card.locator('.launch-sessions .list-item').filter({ hasText: 'Garmin' }).click();
await p.waitForTimeout(400);
ok((await pressed()) === 'Streuung', 'opened again: the spread first again');
await p.getByRole('button', { name: 'Zurück zu Mein Bag' }).click();
await p.waitForTimeout(300);
// a session deleted by the player (a test, a wrong file) – asked first, the bag stays
await card.locator('.launch-sessions .list-item').filter({ hasText: 'Trackman' }).click();
await p.waitForTimeout(400);
await p.getByRole('button', { name: 'Sitzung löschen' }).click();
const conf = p.getByRole('region', { name: 'Sitzung löschen' });
ok(/Sitzung vom 28\.10\.2026 löschen\? Die Weiten in deinem Bag bleiben/.test(await conf.innerText()), 'delete: asked first – "die Weiten in deinem Bag bleiben"');
await conf.getByRole('button', { name: 'Löschen' }).click();
await p.waitForTimeout(500);
const after = (await card.locator('.launch-sessions .list-item').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
ok(after.length === 1 && /^Garmin/.test(after[0]) && (await inBag('7i')) === carry7, `deleted: one session left (${after.join(' | ')}), iron 7 in the bag unchanged`);

// 4 · the stats: the range's shots as rings, off at first, remembered
await p.locator('.tabbar button').filter({ hasText: 'Statistik' }).click();
await p.waitForTimeout(600);
await p.getByRole('group', { name: 'Thema' }).getByRole('button', { name: 'Schläger' }).click();
await p.waitForTimeout(600);
const sw = p.getByRole('switch', { name: /Range-Schläge zeigen/ });
ok((await sw.count()) === 1 && (await sw.getAttribute('aria-checked')) === 'false' && (await p.locator('.spread-dot.range').count()) === 0, 'stats: "Range-Schläge zeigen" – off at first, no rings');
await sw.click();
await p.waitForTimeout(300);
const rings = await p.locator('.spread-dot.range').count();
ok(rings >= 20, `on: the range's shots as rings beside the course's (${rings})`);
await p.locator('.spread-dot.range').first().scrollIntoViewIfNeeded();
await shot('07-statistik');
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Statistik' }).click();
await p.waitForTimeout(500);
await p.getByRole('group', { name: 'Thema' }).getByRole('button', { name: 'Schläger' }).click();
await p.waitForTimeout(500);
ok((await p.getByRole('switch', { name: /Range-Schläge zeigen/ }).getAttribute('aria-checked')) === 'true', 'remembered after a reload');

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
