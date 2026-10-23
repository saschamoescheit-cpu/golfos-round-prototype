// QA (Pre-Final „Schläge prüfen“, Sascha 23.10.2026): once the last hole is confirmed and holes are still open, only
// those – the arrows and "Loch passt" go from open hole to open hole, the open ones as chips; "Alle Löcher" goes through
// every hole again; the last open hole signs the round.  Usage: node qa/openholes.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const HOLES = [4, 3, 5, 4, 4, 3, 4, 5, 4].map((par, i) => ({ index: i, label: `${i + 1}A`, loop: 'A', number: i + 1, par, strokeIndex: i + 1 }));
const entry = (par) => ({ strokes: par, pickedUp: false, putts: 2, fairway: null, penalties: 0, greensideBunker: false, upAndDown: null });
const round = {
  id: 'qa-open', createdAt: '2026-10-23T08:00:00.000Z', finishedAt: '2026-10-23T11:00:00.000Z', courseId: 'osm:relation/1326323', courseName: 'Golfclub Hetzenhof',
  loopOrder: ['A'], holes: HOLES, mode: 'quick', capture: 'full', currentHole: 8, signedAt: null,
  players: [{ id: 'me', name: 'Sascha', isMe: true, playingHandicap: 4 }], entries: { me: HOLES.map((h) => entry(h.par)) },
};
await p.goto(url);
await p.evaluate((r) => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
  sessionStorage.setItem('golfos.module', 'rounds');
}, round);
// the round's check opened afresh, as a tapped notification opens the app
await p.goto('about:blank');
await p.goto(`${url}#review=qa-open`);
// under load the course map takes a moment: wait for the check itself, not a fixed time
await p.locator('.review-nav strong').first().waitFor({ timeout: 90000 });
const holeNow = async () => (await p.locator('.review-nav strong').first().innerText()).replace('Loch ', '').trim();
/** Waits until the check shows this hole (at most 15 s) – then reads it. */
const at = async (label) => {
  await p.waitForFunction((l) => document.querySelector('.review-nav strong')?.textContent?.replace('Loch ', '').trim() === l, label, { timeout: 15000 }).catch(() => {});
  return holeNow();
};
ok((await at('1A')) === '1A', 'the check starts at 1A');
ok((await p.locator('.review-filter').count()) === 0, 'at the start: no choice yet – every hole in turn');
// to the last hole with the arrow, then confirm it: 8 holes open
for (let n = 0; n < 8; n++) {
  await p.getByRole('button', { name: 'Nächstes Loch' }).click();
  await p.waitForTimeout(150);
}
ok((await at('9A')) === '9A', 'on to 9A with the arrow (nothing confirmed)');
await p.getByRole('button', { name: /Loch 9A passt/ }).click();
await p.waitForTimeout(800);
ok((await at('1A')) === '1A', 'last hole confirmed with holes open: back to the first open one');
const filter = p.locator('.review-filter');
ok((await filter.getByRole('button', { name: 'Noch zu prüfen (8)' }).getAttribute('aria-pressed')) === 'true', 'from now on only the open holes: "Noch zu prüfen (8)" chosen');
const chips = await filter.getByRole('group', { name: 'Noch zu prüfende Löcher' }).getByRole('button').allInnerTexts();
ok(chips.join(' ') === '1A 2A 3A 4A 5A 6A 7A 8A', `the open holes as chips: ${chips.join(' ')} (9A is done)`);
// confirm 1A and 2A: on to the next open one
await p.getByRole('button', { name: /Loch 1A passt ✓ → nächstes offenes/ }).click();
await p.waitForTimeout(500);
ok((await at('2A')) === '2A', '"Loch passt" → the next open hole');
await p.getByRole('button', { name: /Loch 2A passt/ }).click();
await p.waitForTimeout(500);
// a chip jumps; the arrows skip the checked holes
await filter.getByRole('button', { name: '7A' }).click();
await p.waitForTimeout(400);
ok((await at('7A')) === '7A', 'a chip jumps to its hole');
await p.getByRole('button', { name: 'Nächstes Loch' }).click();
await p.waitForTimeout(400);
ok((await at('8A')) === '8A', '→ the next open hole');
ok(await p.getByRole('button', { name: 'Nächstes Loch' }).isDisabled(), 'after 8A no open hole further on (9A is done)');
await filter.getByRole('button', { name: '3A' }).click();
await p.waitForTimeout(300);
await p.getByRole('button', { name: 'Voriges Loch' }).isDisabled().then((d) => ok(d, 'before 3A no open hole (1A and 2A done): ← off'));
// all holes again
await filter.getByRole('button', { name: 'Alle Löcher' }).click();
await p.waitForTimeout(300);
ok((await filter.getByRole('group', { name: 'Noch zu prüfende Löcher' }).count()) === 0 && (await filter.getByRole('button', { name: /Noch zu prüfen/ }).count()) === 1, '"Alle Löcher": the chips go, the choice stays');
await p.getByRole('button', { name: 'Voriges Loch' }).click();
await p.waitForTimeout(400);
ok((await at('2A')) === '2A', '"Alle Löcher": the arrows go through every hole again (3A ← 2A, checked)');
await filter.getByRole('button', { name: /Noch zu prüfen/ }).click();
await p.waitForTimeout(300);
// confirm the remaining open holes; the last one asks: confirm the round or check the holes (Sascha 23.10.2026)
let guard = 0;
while ((await p.getByRole('button', { name: /passt ✓ → nächstes offenes/ }).count()) > 0 && guard++ < 12) {
  await p.getByRole('button', { name: /passt ✓ → nächstes offenes/ }).click();
  await p.waitForTimeout(400);
}
const lastHole = await holeNow();
const lastBtn = p.locator('.sticky-cta .btn-primary');
ok(/^Loch \w+ passt ✓$/.test((await lastBtn.innerText()).trim()), `the last open hole: "${(await lastBtn.innerText()).trim()}" – no signing on the button`);
await lastBtn.click();
await p.waitForTimeout(500);
const ask = p.getByRole('dialog', { name: 'Alle Löcher geprüft' });
ok(await ask.isVisible(), 'then the question: every hole checked');
ok((await ask.getByRole('button', { name: 'Runde bestätigen' }).count()) === 1 && (await ask.getByRole('button', { name: 'Löcher prüfen' }).count()) === 1, '"Runde bestätigen" or "Löcher prüfen"');
let r = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]);
ok(!r.signedAt && r.entries.me.every((e) => e.checked), `every hole checked (${lastHole} last), not signed yet`);
// "Löcher prüfen": back to the holes, nothing signed
await ask.getByRole('button', { name: 'Löcher prüfen' }).click();
await p.waitForTimeout(400);
ok((await ask.count()) === 0 && !(await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].signedAt)), '"Löcher prüfen": the holes again, nothing signed');
await p.getByRole('button', { name: 'Voriges Loch' }).click().catch(() => {});
await p.waitForTimeout(300);
// any hole confirmed again: the question again – "Runde bestätigen" signs
await p.locator('.sticky-cta .btn-primary').click();
await p.waitForTimeout(500);
await p.getByRole('dialog', { name: 'Alle Löcher geprüft' }).getByRole('button', { name: 'Runde bestätigen' }).click();
await p.waitForTimeout(1500);
const signed = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]);
ok(!!signed.signedAt && signed.entries.me.every((e) => e.checked), '"Runde bestätigen": the round signed');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
