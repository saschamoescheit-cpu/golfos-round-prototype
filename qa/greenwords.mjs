// QA (night 16./17.11.2026): the green's "Back · Center · Front" on the hole in the player's language – the back and
// front of the green, never the navigation's "Back" (Retour, Voltar, 返回) or the front nine (Aller, Primeiros, 前九).
// Words with more than one meaning go through trIn (lib/i18n.ts). Usage: node qa/greenwords.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const WANT = { de: ['HINTEN', 'MITTE', 'VORNE'], pt: ['FUNDO', 'CENTRO', 'FRENTE'], fr: ['ARRIÈRE', 'CENTRE', 'AVANT'], zh: ['后沿', '中心', '前沿'], it: ['RETRO', 'CENTRO', 'FRONTE'] };
const b = await webkit.launch();
for (const [lang, want] of Object.entries(WANT)) {
  const d = lang === 'de' ? null : JSON.parse(readFileSync(new URL(`../src/i18n/dict/${lang}.json`, import.meta.url), 'utf8'));
  const T = (en, de) => (d ? d[en] ?? en : de);
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.7, longitude: 9.6, accuracy: 5 }, permissions: ['geolocation'] });
  await mockNet(ctx);
  const p = await ctx.newPage();
  await p.goto(url);
  await p.evaluate((l) => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.lang.v1', l);
    sessionStorage.setItem('golfos.module', 'rounds');
  }, lang);
  await p.reload();
  await p.waitForTimeout(1000);
  await p.getByRole('button', { name: T('New round', 'Neue Runde') }).first().click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.waitForTimeout(1500);
  await p.locator('button.list-item').first().click();
  await p.getByText(T('Start round', 'Runde starten')).waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: /^C · 9/ }).first().click();
  await p.getByRole('button', { name: T('Course preview', 'Platzvorschau') }).click();
  await p.locator('.map-green').waitFor({ timeout: 30000 });
  const words = (await p.locator('.map-green .small').allInnerTexts()).map((w) => w.trim().toUpperCase());
  ok(words.join(' · ') === want.join(' · '), `${lang}: the green's ${words.join(' · ')}`);
  await ctx.close();
}
await b.close();
process.exit(fails ? 1 : 0);
