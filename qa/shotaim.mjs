// QA (Sascha 16.11.2026: "Damit die Ellipse für die Streuung der Schläge genauer wird, brauchen wir bei der Nachbereitung
// … den Zielpunkt zu positionieren … Ich ziele ja nicht immer Mitte Bahn"): in "Schläge prüfen" a shot's sheet has
// "Wohin hast du gezielt?" – off the tee of a par 4 Bahn links / Bahnmitte / Bahn rechts, later Fahne / Grünmitte /
// Vorlegen – each saved at once; "Auf der Karte" opens the playing view with the crosshair, dragged it saves "auf der
// Karte gesetzt"; the tick goes back to the sheet; a chip tapped again takes the aim away. Usage: node qa/shotaim.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const CID = 'osm:relation/4053362';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const SHOTS = process.env.SHOTS;
const pars = [4, 3, 4, 5, 4, 5, 3, 4, 4, 5, 4, 4, 3, 4, 3, 4, 4, 3];
await p.goto(url);
await p.waitForTimeout(1000);
const geo = await p.evaluate(async (CID) => {
  const s = await import('/src/lib/storage.ts');
  const g = await import('/src/lib/geo.ts');
  const a = await import('/src/lib/aim.ts');
  await s.ensureGeometry(CID);
  const d = g.holeMapData(s.loadGeometry(CID), 'Main', 1);
  const mid = g.pointAt(d.line, 230);
  return { tee: d.tee, ball: a.besideLine(d.tee, mid, -14), green: d.greenCenter };
}, CID);
await p.evaluate(({ CID, pars, geo }) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  const holes = pars.map((par, i) => ({ par, loop: 'Main', index: i, label: String(i + 1), number: i + 1, strokeIndex: i + 1 }));
  const entries = pars.map((par) => ({ strokes: par, putts: 2 }));
  entries[0] = { strokes: 4, putts: 2, detail: { pin: geo.green, shots: [{ pos: geo.tee, lie: 'tee', club: 'Dr', penalty: false }, { pos: geo.ball, lie: 'fairway', club: '8i', penalty: false }], onGreen: geo.green, holedOut: false } };
  const r = {
    id: 'aim-qa', tee: 'Green', kind: 'social', mode: 'quick', format: { mode: 'single', scoring: 'net', allowance: 100, matchplay: false }, loopOrder: ['Main'], holes, capture: 'full', courseId: CID,
    courseName: 'Hawks Landing Golf Club', createdAt: '2026-11-15T12:00:00', finishedAt: '2026-11-15T17:00:00', currentHole: 0, signedAt: null,
    players: [{ id: 'me', isMe: true, name: 'Sascha', playingHandicap: 4 }], entries: { me: entries },
  };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
}, { CID, pars, geo });
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hawks/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(3000);
const shot = (n) => p.evaluate((n) => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries.me[0].detail.shots[n], n);
const title = () => p.locator('.shot-aim-text strong').innerText().catch(() => '');
const dev = () => p.locator('.shot-aim-text .muted').innerText().catch(() => '');
await p.locator('li[data-shot="0"] .shot-row').click();
await p.waitForTimeout(600);
ok((await p.locator('.shot-aim').count()) === 1, 'the sheet asks "Wohin hast du gezielt?"');
const chips = await p.locator('.shot-aim .chips-field button').allInnerTexts();
ok(chips.join('|') === 'Bahn links|Bahnmitte|Bahn rechts', `off the tee of a par 4: ${chips.join(' · ')}`);
ok(/Bahnmitte \(angenommen\)/.test(await title()), `before: ${await title()}`);
ok(/links der Bahnmitte/.test(await dev()), `the ball against the middle: ${await dev()}`);
if (SHOTS) await p.screenshot({ path: `${SHOTS}/shotaim-1.png` });
await p.locator('.shot-aim .chips-field button').filter({ hasText: 'Bahn links' }).click();
await p.waitForTimeout(500);
let s0 = await shot(0);
ok(s0.aimKind === 'left' && Array.isArray(s0.aim), 'Bahn links saved at once');
ok(/Ziel: Bahn links/.test(await title()), `the title: ${await title()}`);
ok(/vom Ziel/.test(await dev()), `the ball against the aim: ${await dev()}`);
if (SHOTS) await p.screenshot({ path: `${SHOTS}/shotaim-2.png` });
// on the map: the playing view with the crosshair
await p.locator('.shot-aim button').filter({ hasText: 'Auf der Karte' }).click();
await p.waitForTimeout(3500);
ok((await p.locator('.aim-layer').count()) === 1, 'the aim on the map opened');
const cross = p.locator('.aim-layer .map-crosshair').first();
ok((await cross.count()) === 1, 'the crosshair of the round');
ok(/Ziel für Schlag 1/.test(await p.locator('.aim-layer .map-hole-no').innerText()), 'titled "Ziel für Schlag 1"');
const bb = await cross.boundingBox();
await p.mouse.move(bb.x + bb.width / 2 + 19, bb.y + bb.height / 2); // the ring's edge – its middle may lie on the ball
await p.mouse.down();
await p.mouse.move(bb.x + bb.width / 2 + 50, bb.y + bb.height / 2 + 10, { steps: 6 });
await p.mouse.up();
await p.waitForTimeout(600);
s0 = await shot(0);
ok(s0.aimKind === 'map', `dragged: saved as set on the map (${s0.aimKind})`);
const card = await p.locator('.aim-card strong').innerText();
ok(/vom Ziel/.test(card), `the card: ${card}`);
if (SHOTS) await p.screenshot({ path: `${SHOTS}/shotaim-3.png` });
await p.getByTitle('Fertig').click();
await p.waitForTimeout(800);
ok((await p.locator('.aim-layer').count()) === 0 && (await p.locator('.shot-aim').count()) === 1, 'the tick: back in the sheet');
ok(/auf der Karte gesetzt/.test(await title()), `the title: ${await title()}`);
// a chip tapped twice: the aim goes
await p.locator('.shot-aim .chips-field button').filter({ hasText: 'Bahnmitte' }).click();
await p.waitForTimeout(400);
ok((await shot(0)).aimKind === 'middle', 'Bahnmitte chosen');
await p.locator('.shot-aim .chips-field button').filter({ hasText: 'Bahnmitte' }).click();
await p.waitForTimeout(400);
s0 = await shot(0);
ok(!s0.aim && !s0.aimKind && s0.club === 'Dr', 'tapped again: the aim taken away, the shot as it was');
await p.getByRole('button', { name: 'Schließen' }).first().click();
await p.waitForTimeout(500);
// the approach: Fahne / Grünmitte / Vorlegen – Vorlegen goes to the map at once
await p.locator('li[data-shot="1"] .shot-row').click();
await p.waitForTimeout(600);
const chips2 = await p.locator('.shot-aim .chips-field button').allInnerTexts();
ok(chips2.join('|') === 'Fahne|Grünmitte|Vorlegen', `the approach: ${chips2.join(' · ')}`);
await p.locator('.shot-aim .chips-field button').filter({ hasText: 'Vorlegen' }).click();
await p.waitForTimeout(3000);
ok((await p.locator('.aim-layer').count()) === 1 && (await shot(1)).aimKind === 'layup', 'Vorlegen: saved and the map at once');
await p.getByTitle('Fertig').click();
await p.waitForTimeout(600);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
