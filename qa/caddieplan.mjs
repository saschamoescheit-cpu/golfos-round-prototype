// QA (Sascha 17.11.2026): the caddie in Training › Üben puts a session together – "30 Minuten Putten Richtungskontrolle"
// becomes Zeit 30 min · Thema Putten · Schwerpunkt Richtung and drills that fill 30 minutes; "Neue Übungen" other
// drills; a started session is remembered: the next time for the same wish other drills first, "Wie letztes Mal"
// brings it back. Usage: node qa/caddieplan.mjs [url]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await ctx.route(/youtube|ytimg|open-meteo|photon|arcgis|lgl-bw|supabase/, (r) => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => !/sw\.js|access control/.test(e.message) && errs.push(e.message));
const open = async () => {
  await p.goto(url);
  await p.locator('.tabbar button').first().waitFor({ timeout: 30000 });
  await p.locator('.tabbar button').filter({ hasText: 'Üben' }).click();
  await p.locator('.tr-caddie').waitFor();
};
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'training');
});
await open();
const caddie = p.locator('.tr-caddie');
const top = await p.evaluate(() => {
  const c = document.querySelector('.tr-caddie');
  const kinds = document.querySelector('main .chip-row');
  return !!c && !!kinds && c.getBoundingClientRect().top < kinds.getBoundingClientRect().top;
});
ok(top, 'the caddie at the top of Üben, before "Einzelne Einheit | Wochenplan"');
await caddie.locator('.tr-caddie-ask input').fill('Ich habe jetzt 30 Minuten Zeit und will Putten Richtungskontrolle üben');
await caddie.locator('.tr-caddie-ask input').press('Enter');
await p.waitForTimeout(400);
const rows = (await caddie.locator('.settings-row').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
ok(rows[0].includes('30 min') && rows[1].includes('Putten') && rows[2].includes('Richtung'), `read: ${rows.slice(0, 3).join(' | ')}`);
const mins = async () => (await caddie.locator('.tr-plan-row .muted').allInnerTexts()).reduce((s, x) => s + parseInt(x, 10), 0);
const names = () => caddie.locator('.tr-plan-row strong').allInnerTexts();
const first = await names();
ok(first.length >= 2 && (await mins()) === 30, `a session of ${first.length} drills, 30 minutes: ${first.join(' · ')}`);
ok(/Tor|Linie|Startlinie/.test(first[0]), `the first drill is about the start line: ${first[0]}`);
ok((await caddie.getByRole('button', { name: 'Wie letztes Mal' }).count()) === 0, 'no "Wie letztes Mal" before a session was started');
await caddie.getByRole('button', { name: 'Neue Übungen' }).click();
await p.waitForTimeout(300);
const second = await names();
ok(second.some((n) => !first.includes(n)) && (await mins()) === 30, `"Neue Übungen": other drills, still 30 minutes: ${second.join(' · ')}`);
// the time changed in its row: the session follows
await caddie.locator('.settings-row').filter({ hasText: 'Zeit' }).click();
await p.getByRole('dialog', { name: 'Zeit' }).locator('.pick-option').filter({ hasText: /^45 min/ }).click();
await p.waitForTimeout(300);
ok((await mins()) === 45, 'Zeit 45 min: the session fills 45 minutes');
await caddie.locator('.settings-row').filter({ hasText: 'Zeit' }).click();
await p.getByRole('dialog', { name: 'Zeit' }).locator('.pick-option').filter({ hasText: /^30 min/ }).click();
await p.waitForTimeout(300);
const started = await names();
await caddie.getByRole('button', { name: 'Einheit starten' }).click();
await p.waitForTimeout(1500);
ok((await p.locator('.tr-now-name').innerText()).length > 3, `the session runs: ${await p.locator('.tr-now-name').innerText()}`);
// the session done; the next day: the same wish
await p.evaluate(() => {
  const k = 'golfos.training.sessions.v1';
  const list = JSON.parse(localStorage.getItem(k) ?? '[]');
  localStorage.setItem(k, JSON.stringify(list.map((x) => ({ ...x, finishedAt: x.finishedAt ?? new Date().toISOString() }))));
});
await open();
ok((await caddie.locator('.settings-row').first().innerText()).includes('30 min'), 'the caddie remembers the last wish');
await caddie.locator('.tr-caddie-ask input').fill('30 Minuten Putten Richtung');
await caddie.locator('.tr-caddie-ask input').press('Enter');
await p.waitForTimeout(400);
const next = await names();
ok(next.filter((n) => started.includes(n)).length < started.length, `the next time other drills first: ${next.join(' · ')} (before: ${started.join(' · ')})`);
await caddie.getByRole('button', { name: 'Wie letztes Mal' }).click();
await p.waitForTimeout(300);
ok((await names()).join() === started.join(), '"Wie letztes Mal": the session started before');
// the buttons in the app's look: SVG symbols, no emoji
ok((await caddie.locator('.tr-caddie-acts button svg').count()) === 2 && !/[\u{1F300}-\u{1FAFF}]/u.test(await caddie.innerText()), 'buttons with SVG symbols, no emoji');
// an iPhone SE: nothing sideways
await p.setViewportSize({ width: 320, height: 640 });
await p.waitForTimeout(300);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'iPhone SE: no sideways scroll');
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
