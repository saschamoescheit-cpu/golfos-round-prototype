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
ok(!!box && box.x + box.width <= vw && new Set(tops).size === 1, `on a small phone: sun and inbox in one line – no language button (in the profile, 13.11.2026), on the screen (${tops.join(',')})`);
{ const xs = await p.locator('.topbar .lang-btn').evaluateAll((els) => els.map((e) => ({ x: e.getBoundingClientRect().x, bell: e.classList.contains('bell-btn') }))); ok(xs.length === 2 && xs.reduce((m, a) => (a.x > m.x ? a : m)).bell, 'the inbox on the far right (Sascha 13.11.2026)'); }
await bell.click();
const sheet = p.getByRole('dialog', { name: 'Inbox' });
ok((await sheet.count()) === 1 && /Nichts Neues/.test(await sheet.innerText()), 'tapped: the inbox – "Nichts Neues für dich."');
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
ok((await sheet.locator('.bell-group > .eyebrow').allInnerTexts()).join('|').toLowerCase() === 'zu erledigen', 'the inbox in groups: "Zu erledigen" (nothing asked of you here)');
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/bell-sheet.png` });
await sheet.locator('.bell-row').first().click();
await p.waitForTimeout(1200);
ok((await sheet.count()) === 0 && /Runden|Rounds/.test(await p.locator('main').first().innerText()), 'a row: straight to Rounds');
// more in the inbox (Sascha 13.11.2026, Inbox-Mockups 8–10): the scorer signed – "Bitte deine Scorekarte unterschreiben";
// a new bet against you; a payment to you marked paid, with "Erhalten"
await p.evaluate(() => {
  const holes = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1, label: String(i + 1) }));
  const at = new Date().toISOString();
  const round = { id: 'r2', courseName: 'StoneGate – Cypress', createdAt: at, finishedAt: at, signedAt: at, holes, players: [{ id: 'me', name: 'Sascha', isMe: true, playingHandicap: 10 }, { id: 'e', name: 'Erik', isMe: false }], entries: { me: holes.map(() => ({ strokes: 4 })), e: holes.map(() => ({ strokes: 4 })) }, capture: 'full', loopOrder: ['A'], courseId: 'test-course', kind: 'social', shared: { code: 'SGNASK', flight: 'f1', phone: 'ph1', base: {} } };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([round]));
  localStorage.setItem('golfos.event.v1.SGNASK', JSON.stringify({ kind: 'round-event', id: 'r2', name: 'Cypress', tournament: false, course: { id: 'test-course', name: 'StoneGate – Cypress' }, loopOrder: ['A'], holes, createdAt: at, flights: { f1: { id: 'f1', players: [{ id: 'me', name: 'Sascha' }, { id: 'e', name: 'Erik' }], scorer: 'e', scores: {}, signed: { me: { marker: at }, e: { player: at } } } } }));
  const pool = { kind: 'wager-pool', id: 'pl', name: 'USA-Wetten', from: at.slice(0, 10), to: at.slice(0, 10), createdAt: at, currency: 'USD', players: [{ id: 's', name: 'Sascha' }, { id: 'm', name: 'Moritz' }, { id: 'c', name: 'Cedric' }], wagers: [{ id: 'w1', player: 'm', opponent: 's', kind: 'birdieRun', target: 3, stake: 20, payout: 'opponent', attempts: 'any' }], progress: {}, payments: [{ id: 'pay1', from: 'c', to: 's', amount: 40, paidAt: at }] };
  localStorage.setItem('golfos.pools.v1', JSON.stringify([{ code: 'POOL1', me: 's', pool }]));
  localStorage.setItem('golfos.inbox.betsseen.v1', '[]');
});
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.bell-btn').first().click();
const more = (await sheet.locator('.bell-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
ok(more.some((r) => /Bitte deine Scorekarte unterschreiben/.test(r) && /Erik hat als Schreiber unterschrieben/.test(r)), `the scorer signed: "Bitte deine Scorekarte unterschreiben" (${more.join(' | ')})`);
ok(more.some((r) => /Moritz hat eine Wette gegen dich angelegt/.test(r) && /USA-Wetten/.test(r)), 'a new bet against you: "Moritz hat eine Wette gegen dich angelegt"');
const paidRow = sheet.getByRole('group', { name: /Cedric hat dir 40 \$ bezahlt/ });
ok((await paidRow.count()) === 1 && (await paidRow.getByRole('button', { name: /40 \$ von Cedric erhalten/ }).count()) === 1, 'a payment to you: "Cedric hat dir 40 $ bezahlt" with "Erhalten"');
ok((await sheet.locator('.bell-group > .eyebrow').first().innerText()).toLowerCase() === 'anfragen an dich', 'asked of you: "Anfragen an dich" on top');
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/bell-more.png` });
// the bet tapped: the pool – and not again
await sheet.locator('.bell-row').filter({ hasText: 'Wette gegen dich' }).click();
await p.waitForTimeout(1200);
await p.locator('.bell-btn').first().click().catch(() => {});
await p.waitForTimeout(400);
ok((await p.getByRole('dialog', { name: 'Inbox' }).locator('.bell-row').filter({ hasText: 'Wette gegen dich' }).count()) === 0, 'the bet seen: not in the inbox again');

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
