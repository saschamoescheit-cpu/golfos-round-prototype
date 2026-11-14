// QA (Sascha 14.11.2026, Entwurf E – a tab per player on the scorecard): four players with long names on the smallest
// iPhone (SE, 320 px) – the page stays as wide as the screen, the tabs one line each and scrolled sideways, the last
// player's tab reached and his figures shown.  Usage: node qa/sctabs.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone SE'], locale: 'de-DE' });
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
  sessionStorage.setItem('golfos.module', 'rounds');
  const r = exp.round;
  const me = r.players.find((x) => x.isMe);
  const others = ['Christopher Langname', 'Erik Hausotter', 'Moritz Beispielmann'].map((name, k) => ({ id: 'o' + k, name, isMe: false, playingHandicap: 10 + k }));
  const entries = { ...r.entries };
  for (const o of others) entries[o.id] = r.entries[me.id].map((e) => ({ ...e, detail: undefined }));
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ ...r, signedAt: null, players: [me, ...others], entries }]));
}, exp);
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1200);
const tabs = p.getByRole('tablist', { name: 'Scorekarte von' }).getByRole('tab');
ok((await tabs.count()) === 5, `the tabs: overview and four players (${(await tabs.allInnerTexts()).join(' | ')})`);
const heights = await tabs.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
ok(heights.every((h) => h === heights[0] && h < 50), `every tab one line (${heights.join(', ')} px)`);
const width = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
ok(width[0] === width[1], `the page as wide as the screen (${width.join(' / ')})`);
const last = p.getByRole('tab', { name: 'Moritz Beispielmann' });
await last.click();
await p.waitForTimeout(600);
const box = await last.boundingBox();
ok(!!box && box.x >= 0 && box.x + box.width <= width[1] + 1, `the last tab scrolled into the screen (${Math.round(box?.x ?? -1)}–${Math.round((box?.x ?? 0) + (box?.width ?? 0))})`);
ok(/^Moritz Beispielmann/.test((await p.locator('.sc-hero-player').innerText()).trim()), 'his figures shown');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
