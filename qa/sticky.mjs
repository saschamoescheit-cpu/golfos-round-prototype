// Usability (Sascha 17.10.2026 evening: "you tap 'start' too quickly before checking the settings"): the main action
// of a long form is at the end of the page, after the settings – not floating. Rounds setup, Games setup, the round
// check: the button does not stay on screen while scrolling, it is the last thing on the page, and reachable there.
// Usage: node qa/sticky.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.env.SHOTS ?? '';
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone SE'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
let bad = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate((exp) => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '7', homeClub: 'Golfclub Hetzenhof' }));
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ ...exp.round, signedAt: null }]));
}, exp);
const inView = async (name, where) => {
  const btn = (name instanceof RegExp ? p.getByRole('button', { name }) : p.getByRole('button', { name, exact: true })).last();
  await btn.waitFor({ timeout: 30000 });
  const info = await btn.evaluate((el) => {
    let floating = false;
    for (let e = el; e && e !== document.body; e = e.parentElement) if (/sticky|fixed/.test(getComputedStyle(e).position)) floating = true;
    const main = el.closest('main');
    const r = el.getBoundingClientRect();
    const below = [...main.querySelectorAll('section, .card, .field, .settings-list')].filter((x) => !x.contains(el) && x.getBoundingClientRect().bottom > r.bottom + 1 && x.getBoundingClientRect().height > 0).length;
    return { floating, below };
  });
  ok(!info.floating && info.below === 0, `${where}: "${name}" at the end of the page, not floating (${info.floating ? 'floating' : 'static'}, ${info.below} settings below it)`);
  await btn.scrollIntoViewIfNeeded();
  const vh = p.viewportSize().height;
  const r = await btn.boundingBox();
  ok(r && r.y >= 0 && r.y + r.height <= vh, `${where}: reachable at the end`);
  if (shots) await p.screenshot({ path: `${shots}/sticky-${where}.png` });
};
const toModule = async (m) => { await p.evaluate((m) => sessionStorage.setItem('golfos.module', m), m); await p.reload(); await p.waitForTimeout(1500); };
await toModule('rounds');
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(1500);
await p.locator('button.list-item').first().click();
await inView('Runde starten', 'round-setup');
await toModule('rounds');
await p.locator('.tabbar button').nth(1).click();
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Schläge prüfen/ }).click();
await p.waitForTimeout(2500);
await inView(/^Loch .* bestätigen|Runde .*fertig|bestätigen/, 'round-check');
await toModule('games');
await p.getByRole('button', { name: 'Neues Spiel' }).click();
await p.waitForTimeout(600);
await inView('Spiel starten', 'games-setup');
ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
