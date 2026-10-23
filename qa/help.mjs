// QA (Sascha 23.10.2026: "an introduction video – a kind of tutorial – and an FAQ, anchored in the profile"): Profile
// → "Hilfe": the videos (the whole tour and 7 chapters) with their pictures, one played; the frequent questions by
// topic, an answer opened shows its chapter and plays it; back to the profile. Edge (plays H.264 like the iPhone).
// Usage: node qa/help.mjs [url]
import { chromium, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
await p.goto(url);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); sessionStorage.setItem('golfos.module', 'rounds'); });
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.waitForTimeout(500);
const card = p.locator('section.card').filter({ has: p.getByRole('heading', { name: 'Hilfe' }) });
ok(await card.isVisible(), 'profile: a section "Hilfe"');
const order = await p.locator('main h2').allInnerTexts();
ok(order.indexOf('Hilfe') > order.indexOf('Mitteilungen') && order.indexOf('Hilfe') < order.indexOf('Deine Daten'), `between "Mitteilungen" and "Deine Daten" (${order.join(' · ')})`);
await card.getByRole('button', { name: /^Videos/ }).click();
await p.waitForTimeout(1500);
ok(await p.getByRole('heading', { name: 'Hilfe' }).isVisible(), 'the help page opens');
const vids = p.locator('.help-video');
ok((await vids.count()) === 8, `the whole tour and 7 chapters (${await vids.count()})`);
const titles = await p.locator('.help-video strong').allInnerTexts();
ok(titles[0] === 'Der ganze Rundgang' && titles[1] === 'Runde starten' && titles[7] === 'Profil & Konto', `in order: ${titles.join(' · ')}`);
const posters = await p.locator('.help-video img').evaluateAll((imgs) => imgs.map((i) => i.complete && i.naturalWidth > 100));
ok(posters.every(Boolean), `every video with its picture (${posters.filter(Boolean).length}/8)`);
ok((await p.locator('.help-video .help-play').count()) === 8, 'the round play symbol at the bottom right of each picture');
// play chapter 3
await p.getByRole('button', { name: 'Video abspielen: Der Caddie' }).click();
await p.waitForTimeout(2500);
const v = await p.locator('.help-player video').evaluate((el) => ({ src: el.currentSrc, dur: el.duration, w: el.videoWidth, h: el.videoHeight, t: el.currentTime }));
ok(/help\/caddie\.mp4$/.test(v.src) && v.dur > 30 && v.w === 780, `the video plays: ${v.src.split('/').pop()}, ${Math.round(v.dur)} s, ${v.w}×${v.h}`);
await p.getByRole('dialog', { name: 'Der Caddie' }).getByRole('button', { name: 'Schließen' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.help-player').count()) === 0, 'closed again');
// the questions
await p.getByRole('button', { name: 'Häufige Fragen' }).click();
await p.waitForTimeout(500);
const topics = await p.locator('.help-faq h2').allInnerTexts();
ok(topics.join(' · ') === 'Vor der Runde · Auf dem Platz · Der Caddie · Nach der Runde · Konto & Daten', `the questions by topic: ${topics.join(' · ')}`);
const q = p.getByRole('button', { name: 'Warum prüfen und signieren?' });
await q.click();
await p.waitForTimeout(400);
ok((await q.getAttribute('aria-expanded')) === 'true' && /Nur signierte Runden zählen/.test(await p.locator('.faq-a').innerText()), 'a question opens its answer');
ok(/Im Video:\s*Prüfen & signieren/.test(await p.locator('.faq-a').innerText()), 'with the chapter that shows it');
await p.locator('.faq-a').getByRole('button', { name: /Video abspielen/ }).click();
await p.waitForTimeout(2000);
ok(/help\/review\.mp4$/.test(await p.locator('.help-player video').evaluate((el) => el.currentSrc)), 'and plays it');
await p.getByRole('button', { name: 'Schließen' }).click();
await p.getByRole('button', { name: /^Zurück/ }).first().click();
await p.waitForTimeout(500);
ok(await p.getByRole('heading', { name: 'Hilfe' }).isVisible() && (await p.locator('.help-faq').count()) === 0, 'back to the profile');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
