// QA (Sascha 14.11.2026, Variante B: "die Kopfzeile mit dem Modulblatt, der Inbox usw. immer oben" – "beim Scrollen wird
// nichts abgeschnitten, wie zum Beispiel die Notifications bei der Inbox" – "Runden, Profil, Statistik usw. brauchen wir
// in der Kopfzeile nicht"): on the start pages of every module the header stays on top when the page scrolls – the
// module pill, the sun mode and the inbox with its number whole on the screen, no page title in it, a line below once
// scrolled; on a page with a back arrow (the scorecard) it is not there.  Usage: node qa/stickytop.mjs [url]
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
// many rounds – the list longer than the screen – one of them still to sign: the inbox has a number
await p.evaluate((exp) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  const r0 = exp.round;
  const rounds = Array.from({ length: 14 }, (_, k) => ({ ...r0, id: 'r' + k, createdAt: new Date(Date.parse(r0.createdAt) - k * 86400000).toISOString(), finishedAt: new Date(Date.parse(r0.createdAt) - k * 86400000 + 3600e3).toISOString(), signedAt: k === 0 ? null : new Date().toISOString() }));
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rounds));
}, exp);

const check = async (label) => {
  await p.waitForTimeout(500);
  const top = p.locator('.topbar.module-top');
  ok((await top.count()) === 1, `${label}: the module header there`);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(200);
  const h0 = await top.boundingBox();
  const canScroll = await p.evaluate(() => document.documentElement.scrollHeight > innerHeight + 300);
  await p.evaluate(() => window.scrollTo(0, 600));
  await p.waitForTimeout(400);
  const h1 = await top.boundingBox();
  const stuck = /\bstuck\b/.test((await top.getAttribute('class')) ?? '');
  const vw = await p.evaluate(() => innerWidth);
  // every control of the header whole on the screen – the inbox's number too
  const parts = await top.evaluate((el) => [...el.querySelectorAll('button, .bell-count, .module-pill, .brand')].map((x) => { const r = x.getBoundingClientRect(); return { c: x.className, t: r.top, b: r.bottom, l: r.left, r: r.right }; }));
  const cut = parts.filter((x) => x.t < -0.5 || x.l < -0.5 || x.r > vw + 0.5);
  const behind = await top.evaluate((el) => { const r = el.getBoundingClientRect(); const badge = el.querySelector('.bell-count'); if (!badge) return true; const b = badge.getBoundingClientRect(); return b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5; });
  ok(!canScroll || (Math.abs(h1.y) < 1 && stuck), `${label}: scrolled 600 px – the header still on top (y ${Math.round(h1?.y ?? -1)}${stuck ? ', tighter with a line' : ''})${canScroll ? '' : ' – page too short to scroll'}`);
  ok(cut.length === 0 && behind, `${label}: nothing cut off – ${parts.length} controls whole, the inbox's number inside the header${cut.length ? ' (' + cut.map((x) => x.c).join(', ') + ')' : ''}`);
  ok((await top.locator('h1').count()) === 0, `${label}: no page title in the header`);
  return { h0, h1 };
};

// the start page (GOLFOS)
await p.reload();
await p.waitForTimeout(1500);
const bell = p.locator('.bell-count');
ok((await bell.count()) === 1, `the inbox has a number (${await bell.innerText().catch(() => '–')})`);
await check('start page');
// Rounds – the list of rounds
await p.locator('.module-card').filter({ hasText: 'Rounds' }).first().click().catch(() => {});
await p.waitForTimeout(800);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await check('Rounds · Runden');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/stickytop-rounds.png' });
await p.locator('.tabbar button').filter({ hasText: 'Statistik' }).click();
await check('Rounds · Statistik');
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await check('Rounds · Profil');
// a sheet opened while scrolled: over the header, not under it (the header's layer below the sheets')
{
  await p.evaluate(() => window.scrollTo(0, 600));
  await p.waitForTimeout(300);
  await p.locator('.topbar.module-top .module-pill').click();
  await p.waitForTimeout(500);
  const hit = await p.evaluate(() => { const el = document.elementFromPoint(20, 30); return el?.closest('.sheet-backdrop, .sheet') ? 'sheet' : el?.closest('.module-top') ? 'header' : el?.className ?? '?'; });
  ok(hit === 'sheet', `a sheet opened: it lies over the header (${hit})`);
  await p.keyboard.press('Escape');
  await p.locator('.sheet-backdrop').first().click({ position: { x: 5, y: 300 } }).catch(() => {});
  await p.waitForTimeout(400);
}
// the scorecard of a round – a back arrow, no module header
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(500);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(800);
ok((await p.locator('.topbar.module-top').count()) === 0, 'the scorecard (back arrow): no module header');
// the other modules
for (const [mod, tab] of [['games', 'Wetten'], ['tournaments', null], ['training', null], ['mobility', null]]) {
  await p.evaluate((m) => sessionStorage.setItem('golfos.module', m), mod);
  await p.reload();
  await p.waitForTimeout(1500);
  if (tab) await p.locator('.tabbar button').filter({ hasText: tab }).click().catch(() => {});
  await check(mod);
}
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
