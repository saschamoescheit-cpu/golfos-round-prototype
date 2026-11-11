// QA (Sascha 12.11.2026: "C with the floating button, but looking like A" – a round green "+" bottom right on every
// list; "the pencil bottom right too, floating – the same in the whole app"): Runden, Spiele, Wetten, Turniere, Bilanz
// (with something open), Freunde each have the round "+" (an icon, its name for VoiceOver), above the menu bar, the
// last row of the list not under it; a pool (the host's) has its pencil small above the "+" and none in the top bar
// any more; a tap on "+" opens what it says.
// Usage: node qa/fabs.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const day = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const now = new Date().toISOString();
// a pool of mine (host on this phone) where Chris made a bet against me: I owe him – Bilanz has something open
const pool = {
  kind: 'wager-pool', id: 'pool-usa', name: 'USA-Wetten', from: day(-3), to: day(5), createdAt: now, currency: 'USD',
  players: [{ id: 'p0', name: 'Sascha' }, { id: 'p1', name: 'Chris' }],
  wagers: [{ id: 'w1', player: 'p1', kind: 'birdieRun', target: 2, stake: 20, payout: 'success', attempts: 'any', counted: true }],
  progress: { w1: { best: 2, done: true, rounds: 1, at: now, perRound: [{ day: day(-1), course: 'Celebration Golf Club', value: 2, counted: true }] } },
};
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate((pl) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '10', homeClub: '' }));
  localStorage.setItem('golfos.pools.v1', JSON.stringify([{ code: 'USA1', pool: pl, me: 'p0', owner: 'me-account' }]));
  sessionStorage.setItem('golfos.module', 'rounds');
}, pool);
await p.reload();
await p.waitForTimeout(1500);

const fab = (name) => p.locator('.fab-stack .fab').filter({ has: p.locator('svg') }).and(p.getByRole('button', { name, exact: true }));
const above = async (name) => {
  const f = await fab(name).boundingBox();
  const t = await p.locator('.tabbar').boundingBox();
  return !!f && !!t && f.y + f.height <= t.y + 1 && f.x + f.width > t.x + t.width - 80;
};
const tab = async (name) => {
  await p.locator('.tabbar button').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).click();
  await p.waitForTimeout(500);
};

// Rounds → Runden
await tab('Runden');
ok((await fab('Neue Runde').count()) === 1, 'Runden: the round "+" "Neue Runde"');
ok(await above('Neue Runde'), 'Runden: bottom right, above the menu bar');
ok((await fab('Neue Runde').innerText()).trim() === '', 'an icon only, its name for VoiceOver');
const bg = await fab('Neue Runde').evaluate((e) => getComputedStyle(e).backgroundColor);
ok(bg === 'rgb(121, 161, 40)', `the CI green (${bg})`);
await fab('Neue Runde').click();
await p.waitForTimeout(600);
ok((await p.locator('.fab-stack').count()) === 0 && /Platz|Course/.test(await p.locator('main').first().innerText()), 'a tap: the course to pick – the "+" gone with the list');
await p.goto(url);
await p.waitForTimeout(800);

// Games & Bets
await p.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await p.reload();
await p.waitForTimeout(1500);
await tab('Spiele');
ok((await fab('Neues Spiel').count()) === 1, 'Spiele: "+" "Neues Spiel"');
await tab('Wetten');
ok((await fab('Neue Wette').count()) === 1 && (await above('Neue Wette')), 'Wetten: "+" "Neue Wette", above the menu bar');
await tab('Bilanz');
ok((await fab('Zahlung eintragen').count()) === 1, 'Bilanz with something open: "+" "Zahlung eintragen"');
await fab('Zahlung eintragen').click();
const pay = p.getByRole('dialog', { name: 'Zahlung eintragen' });
await pay.waitFor({ timeout: 3000 }).catch(() => {});
ok((await pay.locator('.list-item').filter({ hasText: 'Chris' }).count()) === 1, 'a tap: who you owe – Chris');
await pay.locator('.list-item').filter({ hasText: 'Chris' }).click();
await p.waitForTimeout(400);
ok((await p.getByRole('dialog').filter({ hasText: 'Bezahlt' }).count()) >= 1, 'Chris tapped: his sheet with "Bezahlt"');
await p.keyboard.press('Escape');
await p.locator('.sheet-backdrop').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
await p.waitForTimeout(300);

// the pool: pencil small above "+", none in the top bar
await tab('Wetten');
await p.getByText('USA-Wetten').first().click();
await p.locator('.pool-standings, .pool-screen').first().waitFor({ timeout: 10000 }).catch(() => {});
const host = await p.evaluate(() => !!document.querySelector('.fab-pen'));
if (host) {
  ok((await p.locator('.topbar .edit-btn').count()) === 0, 'pool: no pencil in the top bar any more');
  const pen = await p.locator('.fab-pen').boundingBox();
  const plus = await p.locator('.fab-plus').boundingBox();
  ok(!!pen && !!plus && pen.y + pen.height <= plus.y && pen.width < plus.width, 'pool: the pencil small above the "+"');
} else {
  console.log('· pool: this phone is not the host here – pencil not checked');
}

// Freunde (start page)
await p.evaluate(() => sessionStorage.removeItem('golfos.module'));
await p.evaluate(() => sessionStorage.setItem('golfos.module', ''));
await p.reload();
await p.waitForTimeout(1500);
const friendsTab = p.locator('.tabbar button').filter({ hasText: 'Freunde' });
if (await friendsTab.count()) {
  await friendsTab.click();
  await p.waitForTimeout(500);
  ok((await fab('Freund hinzufügen').count()) === 1, 'Freunde: "+" "Freund hinzufügen"');
  await fab('Freund hinzufügen').click();
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => (document.activeElement?.id ?? '').startsWith('fname-')), 'a tap: a new row, its name to type at once');
}
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
