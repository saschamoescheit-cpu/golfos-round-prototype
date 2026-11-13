// QA (Sascha 13.11.2026: "alle anderen Sprachen; beim ersten Start Englisch, außer die Sprache lässt sich erkennen; die
// Sprache ins Profil – oben nur Tag-/Nachtmodus und Inbox"): a Spanish phone starts in Spanish (texts from
// src/i18n/dict/es.json), a Korean one in English; no language button on top; the profile's "Idioma" row switches to
// German. Usage: node qa/langs.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
let fails = 0;
const ok = (c, m) => (console.log(`${c ? '✓' : '✗'} ${m}`), c || fails++);
const es = JSON.parse(readFileSync('src/i18n/dict/es.json', 'utf8'));
const b = await webkit.launch();
const start = async (locale) => {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale });
  const p = await ctx.newPage();
  await mockNet(p);
  const errs = [];
  // the service worker of the built preview (as in every QA): not the app's
  p.on('pageerror', (e) => { if (!/sw.js load failed|due to access control/.test(e.message)) errs.push(e.message); });
  await p.goto(url);
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
  });
  await p.reload();
  await p.waitForTimeout(1800);
  return { p, errs };
};

// a Spanish phone: Spanish
{
  const { p, errs } = await start('es-ES');
  const text = await p.locator('body').innerText();
  const want = es['Friends'];
  ok(!!want && text.includes(want), `es-ES: in Spanish ("${want}")`);
  ok((await p.locator('.topbar .lang-btn').count()) === 2 && !/\bDE\b|\bEN\b/.test(await p.locator('.topbar').innerText()), 'on top: sun and inbox only – no language button');
  ok((await p.evaluate(() => document.documentElement.lang)) === 'es', 'the page says lang="es"');
  // the profile: "Idioma" → Deutsch
  await p.evaluate(() => window.dispatchEvent(new Event('golfos:open-profile')));
  await p.waitForTimeout(1200);
  const label = es['Language'] ?? 'Language';
  const row = p.locator('.settings-row').filter({ hasText: label }).first();
  ok((await row.count()) === 1 && /Español/.test(await row.innerText()), `the profile: "${label} · Español"`);
  await row.click();
  await p.getByRole('dialog').locator('.pick-option').filter({ hasText: 'Deutsch' }).first().click();
  await p.waitForTimeout(2500);
  ok((await p.evaluate(() => localStorage.getItem('golfos.lang.v1'))) === 'de' && /Freunde/.test(await p.locator('body').innerText()), 'chosen "Deutsch": the app in German, kept on the phone');
  // click paths 13.11.2026: after the reload still on the profile (it landed on the start page)
  ok((await p.locator('.settings-row').filter({ hasText: 'Sprache' }).count()) === 1 && /Deutsch/.test(await p.locator('.settings-row').filter({ hasText: 'Sprache' }).first().innerText()), 'after the switch: still on the profile, "Sprache · Deutsch"');
  ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await p.context().close();
}
// a Korean phone: English
{
  const { p, errs } = await start('ko-KR');
  ok(/Rounds/.test(await p.locator('main').first().innerText()) && (await p.evaluate(() => document.documentElement.lang)) === 'en', 'ko-KR (not among them): English');
  ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
}
await b.close();
process.exit(fails ? 1 : 0);
