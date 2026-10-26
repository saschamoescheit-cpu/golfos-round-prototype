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
ok((await vids.count()) === 10, `the whole tour and 9 videos (${await vids.count()})`);
const titles = await p.locator('.help-video strong').allInnerTexts();
ok(titles[0] === 'Der ganze Rundgang' && titles[1] === 'Runde starten' && titles[2] === 'Flight & Spielform' && titles[8] === 'Profil & Konto' && titles[9] === 'Games spielen', `in order: ${titles.join(' · ')}`);
// no chapter numbers (Sascha 23.10.2026 evening)
ok(!/Kapitel/.test(await p.locator('.help-videos').innerText()), 'no "Kapitel" in the list');
const posters = await p.locator('.help-video img').evaluateAll((imgs) => imgs.map((i) => i.complete && i.naturalWidth > 100));
ok(posters.every(Boolean), `every video with its picture (${posters.filter(Boolean).length}/10)`);
ok((await p.locator('.help-video .help-play').count()) === 10, 'the round play symbol at the bottom right of each picture');
// play chapter 3
await p.getByRole('button', { name: 'Video abspielen: Der Caddie' }).click();
await p.waitForTimeout(2500);
const v = await p.locator('.help-player video').evaluate((el) => ({ src: el.currentSrc, dur: el.duration, w: el.videoWidth, h: el.videoHeight, t: el.currentTime }));
ok(/help\/caddie\.mp4$/.test(v.src) && v.dur > 30 && v.w === 780, `the video plays: ${v.src.split('/').pop()}, ${Math.round(v.dur)} s, ${v.w}×${v.h}`);
// the subtitles: their own track, on at first – a tap switches them off, remembered (Sascha 23.10.2026 evening)
const track = () => p.locator('.help-player video').evaluate((el) => ({ n: el.textTracks.length, mode: el.textTracks[0]?.mode, cues: el.textTracks[0]?.cues?.length ?? 0 }));
const t1 = await track();
ok(t1.n === 1 && t1.mode === 'showing' && t1.cues > 3, `subtitles shown (${t1.cues} lines)`);
await p.getByRole('button', { name: 'Untertitel aus' }).click();
await p.waitForTimeout(300);
ok((await track()).mode === 'hidden' && (await p.getByRole('button', { name: 'Untertitel an' }).count()) === 1, 'subtitles off with one tap');
ok((await p.evaluate(() => localStorage.getItem('golfos.help.subs.v1'))) === '0', 'the choice is remembered');
await p.getByRole('button', { name: 'Untertitel an' }).click();
await p.getByRole('dialog', { name: 'Der Caddie' }).getByRole('button', { name: 'Schließen' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.help-player').count()) === 0, 'closed again');
// every subtitle fits in two lines and is placed by lines, not by percent – Chrome showed only the first line of a cue
// placed by percent (night 25./26.10.2026)
{
  const subs = await p.evaluate(async () => {
    const ids = ['tour', 'start', 'flight', 'map', 'caddie', 'score', 'review', 'stats', 'profile', 'games'];
    const out = [];
    for (const id of ids) {
      const txt = await (await fetch(`help/${id}.vtt`)).text();
      for (const m of txt.matchAll(/--> \S+([^\n]*)\n([^\n]+)/g)) out.push({ id, set: m[1], len: m[2].length });
    }
    return out;
  });
  const long = subs.filter((s) => s.len > 90);
  const pct = subs.filter((s) => /%/.test(s.set.replace(/size:\d+%|position:\d+%/g, '')));
  ok(subs.length > 150 && long.length === 0 && pct.length === 0, `subtitles: ${subs.length} cues, none longer than two lines (${long.map((s) => `${s.id} ${s.len}`).join(', ') || 'ok'}), none placed by percent (${pct.length})`);
}
// the Games video (night 25./26.10.2026)
await p.getByRole('button', { name: 'Video abspielen: Games spielen' }).click();
await p.waitForTimeout(2500);
const gv = await p.locator('.help-player video').evaluate((el) => ({ src: el.currentSrc, dur: el.duration }));
ok(/help\/games\.mp4$/.test(gv.src) && gv.dur > 60, `the Games video plays: ${gv.src.split('/').pop()}, ${Math.round(gv.dur)} s`);
await p.getByRole('dialog', { name: 'Games spielen' }).getByRole('button', { name: 'Schließen' }).click();
await p.waitForTimeout(300);
// the questions
await p.getByRole('button', { name: 'Häufige Fragen' }).click();
await p.waitForTimeout(500);
const topics = await p.locator('.help-faq h2').allInnerTexts();
ok(topics.join(' · ') === 'Vor der Runde · Auf dem Platz · Der Caddie · Nach der Runde · Games · Konto & Daten', `the questions by topic: ${topics.join(' · ')}`);
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
// opened in Games: its own video and questions first (night 25./26.10.2026)
await p.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.waitForTimeout(500);
await p.locator('section.card').filter({ has: p.getByRole('heading', { name: 'Hilfe' }) }).getByRole('button', { name: /^Videos/ }).click();
await p.waitForTimeout(1200);
const gTitles = await p.locator('.help-video strong').allInnerTexts();
ok(gTitles.length === 10 && gTitles[0] === 'Games spielen' && gTitles[1] === 'Der ganze Rundgang' && gTitles[9] === 'Profil & Konto', `in Games the Games video first: ${gTitles.slice(0, 3).join(' · ')} …`);
await p.getByRole('button', { name: 'Häufige Fragen' }).click();
await p.waitForTimeout(500);
const gTopics = await p.locator('.help-faq h2').allInnerTexts();
ok(gTopics.join(' · ') === 'Games · Vor der Runde · Auf dem Platz · Der Caddie · Nach der Runde · Konto & Daten', `in Games the Games questions first: ${gTopics.join(' · ')}`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
