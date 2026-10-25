// The wind when checking the round (Sascha 25.10.2026): above the shots the hole's wind straight away – an arrow against
// the line of play, "Gegenwind 30 km/h · Böen 45", no heading; a full shot that played longer or shorter says
// "spielte sich wie …" in its line, without the wind again; the contact a line of its own – nothing runs out of the small
// iPhone. Data: the tutorial's example player, strong wind on three holes.
// Usage: node qa/reviewwind.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const demo = JSON.parse(readFileSync(new URL('../../tutorial/demo-state.json', import.meta.url), 'utf-8'));
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
await p.evaluate((demo) => {
  localStorage.clear();
  for (const [k, v] of Object.entries(demo)) localStorage.setItem(k, v);
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  // the newest round: strong wind from the north-west on its first three holes
  const rounds = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  const r = rounds.filter((x) => !x.preview).sort((a, c) => c.createdAt.localeCompare(a.createdAt))[0];
  const me = r.players.find((x) => x.isMe).id;
  r.entries[me] = r.entries[me].map((e, i) => (i < 3 ? { ...e, weather: { tempC: 12, windKmh: 30, gustKmh: 45, windFromDeg: 300 } } : e));
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rounds));
}, demo);
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(500);
await p.locator('button').filter({ hasText: /Hetzenhof|Son|Alcanada/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(2500);

const line = p.locator('.review-wind');
ok((await line.count()) === 1, 'the hole\'s wind above the shots');
const txt = (await line.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
ok(!/Wind an diesem Loch/.test(txt) && /^(Gegenwind|Rückenwind|Wind)( von (links|rechts))? 30 km\/h/.test(txt), `straight away, no heading: "${txt}"`);
ok(/Böen 45/.test(txt), 'the gusts when clearly stronger');
const turn = await line.locator('svg').first().evaluate((el) => el.style.transform).catch(() => '');
ok(/rotate\(\d+deg\)/.test(turn), `an arrow against the line of play (${turn})`);

// the shots of the first three holes
let likeRows = 0;
let crowded = 0;
let windOnShot = 0;
for (let h = 0; h < 3; h++) {
  if (h > 0) {
    await p.getByRole('button', { name: /Nächstes Loch|nächstes Loch|›/ }).first().click().catch(() => {});
    await p.waitForTimeout(1500);
  }
  const rows = p.locator('.review-list > li');
  for (let n = 0; n < (await rows.count()); n++) {
    const row = rows.nth(n);
    const t = (await row.innerText()).replace(/\s+/g, ' ');
    if (/spielte sich wie \d+ m/.test(t)) likeRows++;
    if (/spielte wie|km\/h/.test(t) || (await row.locator('.wind-tag').count())) windOnShot++;
    const wide = await row.evaluate((el) => [...el.querySelectorAll('*')].some((c) => c.getBoundingClientRect().right > window.innerWidth + 0.5));
    if (wide) crowded++;
  }
}
ok(likeRows >= 1, `shots that played longer or shorter: "spielte sich wie …" (${likeRows})`);
ok(windOnShot === 0, `no wind repeated on the shots (${windOnShot})`);
ok(crowded === 0, `nothing wider than the 320-px screen (${crowded} not)`);
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
