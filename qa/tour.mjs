// Screen tour for the uniformity check (night run 16./17.10.2026: "die gesamte Webversion hinsichtlich der
// Einheitlichkeit überprüfen"): every module, every tab and the main screens and sheets, with real data (Sascha's
// C round from 16.10. as a signed round), as full-page screenshots in <out>.
// Usage: node qa/tour.mjs <out dir> [url]
import { webkit, devices } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const out = process.argv[2] ?? '../_tour';
const url = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
// DEVICE="iPhone SE" and COLOR=light|dark for the night check of every screen (22.10.2026)
const ctx = await b.newContext({ ...devices[process.env.DEVICE ?? 'iPhone 13'], locale: 'de-DE', colorScheme: process.env.COLOR === 'light' ? 'light' : 'dark' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let n = 0;
const shot = async (name, full = true) => {
  await p.waitForTimeout(700);
  const path = `${out}/${String(++n).padStart(2, '0')}-${name}.png`;
  await p.screenshot({ path, fullPage: full, timeout: 15000 }).catch(() => p.screenshot({ path, timeout: 15000 }).catch(() => {}));
};
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(([exp, sun]) => {
  localStorage.clear();
  sessionStorage.clear();
  if (sun) localStorage.setItem('golfos.sun.v1', '1'); // SUN=1: the tour in sun mode (light screen)
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '12,4', homeClub: 'Golfclub Hetzenhof' }));
  const r = { ...exp.round, signedAt: '2026-10-16T20:00:00Z' };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
  localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify(exp.track.map((x) => [x.t, x.p[0], x.p[1], x.acc, ...(x.open ? [1] : [])])));
}, [exp, !!process.env.SUN]);
await p.reload();
await p.waitForTimeout(1500);
await shot('start-modules');
const tabs = async (prefix) => {
  const count = await p.locator('.tabbar button').count();
  for (let k = 0; k < count; k++) {
    await p.locator('.tabbar button').nth(k).click();
    await p.waitForTimeout(900);
    await shot(`${prefix}-tab${k + 1}`);
  }
};
const toModule = async (name) => {
  await p.evaluate((m) => {
    sessionStorage.setItem('golfos.module', m);
  }, name);
  await p.reload();
  await p.waitForTimeout(1500);
};
// ---- Rounds ----
await toModule('rounds');
await tabs('rounds');
await p.locator('.tabbar button').nth(1).click();
await p.waitForTimeout(600);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await shot('rounds-scorecard');
await p.getByRole('button', { name: /Schläge prüfen/ }).click();
await p.waitForTimeout(2500);
await shot('rounds-review');
await p.getByRole('button', { name: /Putts auf dem Grün/ }).first().click().catch(() => {});
await shot('rounds-review-putts', false);
await p.keyboard.press('Escape');
await p.locator('.putt-editor').getByRole('button', { name: /Abbrechen/ }).click().catch(() => {});
await p.locator('.review-list li button').first().click().catch(() => {});
await shot('rounds-review-shot-sheet', false);
await toModule('rounds');
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(800);
await shot('rounds-course-search');
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(1500);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await shot('rounds-setup');
await p.getByRole('button', { name: 'Platzvorschau' }).click();
await p.waitForTimeout(6000);
await shot('rounds-preview-hole', false);
await p.locator('.hole-bar-handle').click();
await shot('rounds-preview-drawer', false);
await toModule('rounds');
await p.locator('.tabbar button').nth(4).click();
await p.waitForTimeout(600);
await p.getByRole('button', { name: /Mein Bag/ }).click().catch(() => {});
await shot('rounds-mybag');
// ---- Games ----
await toModule('games');
await tabs('games');
await p.locator('.tabbar button').nth(0).click();
await p.getByRole('button', { name: 'Neues Spiel' }).click().catch(() => {});
await shot('games-setup');
// ---- Training ----
await toModule('training');
await tabs('training');
console.log(`${n} screenshots in ${out}${errs.length ? ' · page errors: ' + errs.slice(0, 3).join(' | ') : ''}`);
await b.close();
