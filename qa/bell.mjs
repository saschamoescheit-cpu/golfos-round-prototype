// QA (Sascha 13.11.2026: "neben der Sprache und dem Tag-/Nachtmodus noch eine Glocke für Notifications, wie Anfragen"):
// the bell beside DE and the sun – nothing waiting: no number, its sheet says so; a round to sign and a game to confirm:
// the number 2, both rows in the sheet, a row goes straight there. Fits a small phone beside the module switch.
// Usage: node qa/bell.mjs [url]   (SHOTS=<dir> for screenshots)
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
let fails = 0;
const ok = (c, m) => (console.log(`${c ? '✓' : '✗'} ${m}`), c || fails++);
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone SE'] });
const p = await ctx.newPage();
await mockNet(p);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
});
await p.reload();
await p.waitForTimeout(1200);
const bell = p.locator('.bell-btn').first();
ok((await bell.count()) === 1 && (await p.locator('.bell-count').count()) === 0, 'the start page: the bell, no number while nothing waits');
const box = await bell.boundingBox();
const vw = p.viewportSize().width;
const tops = await p.locator('.topbar .lang-btn').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
ok(!!box && box.x + box.width <= vw && new Set(tops).size === 1, `on a small phone: DE, bell and sun in one line, on the screen (${tops.join(',')})`);
await bell.click();
const sheet = p.getByRole('dialog', { name: 'Mitteilungen' });
ok((await sheet.count()) === 1 && /Nichts Neues/.test(await sheet.innerText()), 'tapped: the sheet "Mitteilungen" – "Nichts Neues für dich."');
await sheet.getByRole('button', { name: 'Schließen' }).click();

// a round finished, not signed
await p.evaluate(() => {
  const S = { strokes: 4, putts: 2 };
  const holes = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));
  const round = { id: 'r1', courseName: 'Golfclub Hetzenhof', createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(), holes, players: [{ id: 'me', name: 'Sascha', isMe: true, playingHandicap: 10 }], entries: { me: holes.map(() => ({ ...S })) }, capture: 'full', loopOrder: ['A'], courseId: 'test-course', kind: 'social' };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([round]));
});
await p.reload();
await p.waitForTimeout(1500);
const count = (await p.locator('.bell-count').first().innerText().catch(() => '')).trim();
ok(count === '1', `a round to sign: the number "${count}" on the bell, white on green`);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/bell-top.png` });
await p.locator('.bell-btn').first().click();
const rows = (await sheet.locator('.bell-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
ok(rows.length === 1 && /1 Runde prüfen & signieren/.test(rows[0]) && /Hetzenhof/.test(rows[0]), `the sheet: ${rows.join(' | ')}`);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/bell-sheet.png` });
await sheet.locator('.bell-row').first().click();
await p.waitForTimeout(1200);
ok((await sheet.count()) === 0 && /Runden|Rounds/.test(await p.locator('main').first().innerText()), 'a row: straight to Rounds');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
