// Screenshots of the Training module for a visual check. Usage: node training-shots.mjs <app url> <out dir> [de|en] [sun]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? '.';
const lang = process.argv[4] ?? 'de';
const sun = process.argv[5] === 'sun';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: lang === 'de' ? 'de-DE' : 'en-US' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// WebKit reports an aborted cross-origin load (the weather of the home screen, open-meteo) as a page error on
// navigation – the app catches it; not an error of the page
p.on('pageerror', (e) => !/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message) && errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(([l, s]) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', l);
  if (s) localStorage.setItem('golfos.sun.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Test', hcpIndex: '12,4', homeClub: '' }));
}, [lang, sun]);
await p.reload();
await p.waitForTimeout(800);
const shot = async (name, full = false) => p.screenshot({ path: `${out}/${lang}${sun ? '-sun' : ''}-${name}.png`, fullPage: full });
await shot('00-home');
await p.locator('.module-card').filter({ hasText: 'Training' }).click();
await p.waitForTimeout(800);
await shot('01-library', true);
await p.locator('.tr-cat').first().click();
await p.waitForTimeout(400);
await shot('02-category', true);
await p.locator('.tr-drill-row .list-item').first().click();
await p.waitForTimeout(400);
await shot('03-drill', true);
// a drill goes into the own session (plan builder), from there the session starts
await p.locator('.tr-actions .btn-secondary').first().click();
await p.waitForTimeout(600);
await shot('04-builder');
await p.getByRole('button', { name: /Save & start|Speichern & starten/ }).click();
await p.waitForTimeout(2500);
await shot('04-session', true);
await p.locator('.hole-bar .map-score').click();
await p.waitForTimeout(300);
await shot('05-session-drawer');
await p.keyboard.press('Escape');
await p.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } });
await p.locator('.tabbar').count();
await p.goBack().catch(() => {});
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
await b.close();
