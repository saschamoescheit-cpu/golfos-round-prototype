// QA (Sascha 22.10.2026, round check, part 1): strike, intent and stance per shot; lost ball with a provisional ball;
// "Loch passt" with the progress and signing only when every hole is checked; two points at one spot merged; a score
// that does not add up set with one tap; strokes gained per shot; how the first putt missed.
// Usage: node qa/postround1.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
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
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate((exp) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  const r = { ...exp.round, signedAt: null, capture: 'full' };
  const me = r.players.find((x) => x.isMe).id;
  const es = r.entries[me];
  // hole 2C: the tee shot twice at one spot (one point twice)
  const s0 = es[1].detail.shots[0];
  es[1] = { ...es[1], detail: { ...es[1].detail, shots: [{ ...s0, club: null }, { ...s0, pos: [s0.pos[0] + 0.00001, s0.pos[1]] }, ...es[1].detail.shots.slice(1)] } };
  // hole 3C: a score that does not add up with its shots
  es[2] = { ...es[2], strokes: 6 };
  // hole 4C: putts not placed on the green – the first putt is told after the round
  delete es[3].puttsAt;
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
}, exp);
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(3000);
const round = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]);
const mine = async (i) => { const r = await round(); return r.entries[r.players.find((x) => x.isMe).id][i]; };

ok(/0\/9 geprüft/.test(await p.locator('.review-progress').innerText()), 'the progress: "0/9 geprüft"');

// 1 · strike, intent, stance on shot 1
await p.locator('.review-list li[data-shot="0"] .shot-row').click();
await p.waitForTimeout(300);
for (const [g, v] of [['Treffer', 'Gut'], ['Absicht', 'Angegriffen'], ['Stand', 'Eben']]) await p.getByRole('group', { name: g }).getByRole('button', { name: v }).click();
await p.getByRole('button', { name: /^Speichern/ }).last().click();
await p.waitForTimeout(400);
let e = await mine(0);
ok(e.detail.shots[0].strike === 'good' && e.detail.shots[0].intent === 'attack' && e.detail.shots[0].slope === 'flat', 'strike, intent and stance kept with the shot');
ok(/Gut/.test(await p.locator('.review-list li[data-shot="0"]').innerText()) && /Angegriffen/.test(await p.locator('.review-list li[data-shot="0"]').innerText()), 'the row shows "Gut · Angegriffen"');

// 2 · shot 2 lost, a provisional ball played
await p.locator('.review-list li[data-shot="1"] .shot-row').click();
await p.waitForTimeout(300);
const pen = p.getByRole('group', { name: 'Strafschlag' });
ok((await pen.getByRole('button', { name: 'Verloren' }).count()) === 1 && (await pen.getByRole('button', { name: 'Unspielbar' }).count()) === 1, 'penalties: water, out of bounds, lost, unplayable');
await pen.getByRole('button', { name: 'Verloren' }).click();
await p.getByRole('group', { name: 'Danach' }).getByRole('button', { name: 'Provisorischer Ball' }).click();
await p.getByRole('button', { name: /^Speichern/ }).last().click();
await p.waitForTimeout(600);
ok(/verloren ging/.test(await p.locator('main').innerText()), 'then: tap where it was lost');
const map = await p.locator('.maplibregl-canvas').first().boundingBox();
await p.mouse.click(map.x + map.width * 0.4, map.y + map.height * 0.3);
await p.waitForTimeout(800);
e = await mine(0);
ok(e.detail.shots.length === 3 && e.detail.shots[1].penaltyKind === 'lost' && e.detail.shots[1].provisional === true, `lost + provisional: the next ball from the same spot (${e.detail.shots.length} shots)`);
const rows = (await p.locator('.review-list li').allInnerTexts()).join(' | ');
ok(/Ball verloren/.test(rows) && /provisorischer Ball/.test(rows), 'the list says "Ball verloren" and "provisorischer Ball"');

// 3 · "Loch passt", then the next hole: one point twice
await p.locator('.sticky-cta .btn-primary').click();
await p.waitForTimeout(800);
ok((await mine(0)).checked === true, '"Loch 1C passt" marks the hole as checked');
ok(/1\/9 geprüft/.test(await p.locator('.review-progress').innerText()), 'the progress: "1/9 geprüft"');
const same = p.locator('.review-check').filter({ hasText: 'vom selben Ort' });
ok((await same.count()) === 1, 'hole 2C: "Schlag 2 vom selben Ort wie Schlag 1 …" asks');
await same.getByRole('button', { name: /zusammenlegen/ }).click();
await p.waitForTimeout(500);
e = await mine(1);
ok(e.detail.shots.length === 2 && e.detail.shots[0].club === '4i' && e.detail.shots[0].lie === 'tee', 'merged: one tee shot, the club kept');

// 4 · the score that does not add up: one tap
await p.locator('.sticky-cta .btn-primary').click();
await p.waitForTimeout(800);
const fix = p.getByRole('button', { name: /Score auf 5 setzen/ });
ok((await fix.count()) === 1, 'hole 3C: "Score auf 5 setzen" offered');
await fix.click();
await p.waitForTimeout(400);
ok((await mine(2)).strokes === 5, 'the score set to 5');

// 5 · strokes gained per shot on a complete hole
await p.getByRole('button', { name: 'Nächstes Loch' }).click();
await p.waitForTimeout(600);
ok((await p.locator('.shot-sg').count()) >= 2, `strokes gained per shot (${(await p.locator('.shot-sg').allInnerTexts()).join(' ')})`);

// 6 · how the first putt missed (putts not placed)
const len = p.getByRole('group', { name: 'Erster Putt Länge' });
if (await len.count()) {
  await len.getByRole('button', { name: 'Zu kurz' }).click();
  await p.waitForTimeout(300);
  ok((await mine(3)).firstPuttMiss?.length === 'short', 'first putt "zu kurz" kept');
} else ok(false, 'the first putt choice is there');

// 7 · the last hole while holes are still open: no signing yet
for (let k = 0; k < 6; k++) { await p.getByRole('button', { name: 'Nächstes Loch' }).click().catch(() => {}); await p.waitForTimeout(250); }
ok(/offene prüfen/.test(await p.locator('.sticky-cta .btn-primary').innerText()), `last hole with open ones: "${(await p.locator('.sticky-cta .btn-primary').innerText()).trim()}"`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
