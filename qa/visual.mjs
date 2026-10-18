// Visual check (night 18./19.10.2026): the views changed on 18.10. on a small iPhone (SE, 375 px) in sun mode and in
// the dark – tiles, scorecard with its action row and the pencil of an empty hole, the shot sheet, My bag, the
// statistics, the caddie and the tournament caddie. Screenshots only, plus checks that nothing runs off the screen.
// Usage: SHOTS=<dir> node qa/visual.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const S = process.env.SHOTS;
const r18 = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-18-golfclub-hetzenhof.json', import.meta.url), 'utf-8')).round;
const r16 = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8')).round;
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };

for (const theme of ['sun', 'dark']) {
  const ctx = await b.newContext({ ...devices['iPhone SE'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
  await mockNet(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
  const shot = async (name) => S && (await p.screenshot({ path: `${S}/${theme}-${name}.png`, fullPage: true }));
  // nothing wider than the screen
  const fits = async (what) => {
    const over = await p.evaluate(() => {
      // a row that scrolls sideways on purpose (score table, topic chips) may hold more than the screen
      const scrolls = (e) => { for (let x = e.parentElement; x; x = x.parentElement) { const o = getComputedStyle(x).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
      return [...document.querySelectorAll('main *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !scrolls(e); }).map((e) => `${e.tagName}.${e.className}`).slice(0, 3);
    });
    ok(over.length === 0, `${theme} · ${what}: nothing runs off the screen ${over.join(', ')}`);
  };
  await p.goto(url);
  await p.evaluate(({ r18, r16, theme }) => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    if (theme === 'sun') localStorage.setItem('golfos.sun.v1', '1');
    const me = r18.players.find((x) => x.isMe).id;
    const empty = { ...r16, id: r16.id + '-gap', signedAt: null, capture: 'score', createdAt: '2026-10-17T10:00:00Z' };
    empty.entries = { ...empty.entries, [me]: empty.entries[me].map((e, k) => (k === 8 ? { ...e, strokes: null } : e)) };
    localStorage.setItem('golfos.rounds.v1', JSON.stringify([r18, { ...r16, signedAt: '2026-10-16T20:00:00Z' }, empty]));
    localStorage.setItem('golfos.bag.v1', JSON.stringify([{ club: 'Dr', carry: 230 }, { club: '3W', carry: 210 }, { club: '5W', carry: 205 }, { club: '4i', carry: 175 }, { club: '5i', carry: 165 }, { club: '6i', carry: 155 }, { club: '7i', carry: 145 }, { club: '8i', carry: 135 }, { club: '9i', carry: 125 }, { club: 'PW', carry: 115 }, { club: 'GW', carry: 105 }, { club: 'SW', carry: 75 }, { club: 'LW', carry: 60 }]));
    sessionStorage.setItem('golfos.module', 'rounds');
  }, { r18, r16, theme });
  await p.reload();
  await p.waitForTimeout(1200);
  const tab = (name) => p.locator('.tabbar button').filter({ hasText: name }).click();
  await tab('Runden');
  await p.waitForTimeout(500);
  await shot('rounds');
  await fits('rounds and tiles');
  ok((await p.locator('.tile').count()) === (await p.locator('.tile .tile-mark svg').count()), `${theme} · every tile with its symbol`);
  // every row's mark is on the screen, also when the course name is cut
  const marks = await p.locator('ul.list .list-item').evaluateAll((rows) => rows.map((r) => { const m = r.querySelector('.signed-mark, .paused-mark'); if (!m) return 'none'; const a = m.getBoundingClientRect(); const t = r.querySelector('.title').getBoundingClientRect(); return a.width > 0 && a.right <= t.right + 1 ? 'ok' : 'cut'; }));
  ok(marks.every((m) => m === 'ok'), `${theme} · every round's mark visible next to a cut name (${marks.join(' ')})`);
  // the round with a missing score: the pencil and the action row
  await p.locator('ul.list button.list-item').filter({ hasText: '17.10.' }).first().click();
  await p.waitForTimeout(900);
  await shot('scorecard-gap');
  await fits('scorecard');
  ok((await p.getByRole('img', { name: /Score für Loch .* eintragen/ }).count()) === 1, `${theme} · the pencil on the empty hole`);
  await p.locator('.topbar').getByRole('button').first().click();
  await p.waitForTimeout(400);
  // today's round: the action row, then the shot check with its sheet
  await p.locator('ul.list button.list-item').first().click();
  await p.waitForTimeout(900);
  await p.locator('.sc-actions').scrollIntoViewIfNeeded();
  await shot('scorecard-actions');
  const row = await p.locator('.sc-actions .sc-action').evaluateAll((bs) => bs.map((x) => Math.round(x.getBoundingClientRect().top)));
  ok(row.length === 4 && new Set(row).size === 1, `${theme} · Teilen · Prüfen · Export · Löschen in one row on 375 px`);
  await p.locator('.sc-actions').getByRole('button', { name: /Schläge prüfen/ }).click();
  await p.waitForTimeout(2500);
  await shot('review');
  await fits('shot check');
  await p.locator('.review-list .shot-row').first().click();
  await p.waitForTimeout(400);
  await shot('shot-sheet');
  ok(await p.locator('.sheet .segmented').first().evaluate((e) => [...e.querySelectorAll('button')].every((x) => x.scrollWidth <= x.clientWidth + 1)), `${theme} · the lies read in full on 375 px`);
  await p.locator('.sheet').getByRole('button', { name: 'Schließen' }).click();
  await p.getByRole('button', { name: 'Fertig' }).first().click().catch(() => {});
  await p.waitForTimeout(600);
  // My bag and the statistics
  await tab('Profil');
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: /Mein Bag/ }).click();
  await p.waitForTimeout(600);
  await shot('bag');
  await fits('My bag');
  await p.locator('.topbar').getByRole('button').first().click();
  await p.waitForTimeout(300);
  await tab('Statistik');
  await p.waitForTimeout(600);
  for (const [label, name] of [[/Abschlag/, 'stats-tee'], [/Grün|kurzes Spiel/, 'stats-green']]) {
    const t = p.locator('.section-chips button').filter({ hasText: label }).first();
    if (await t.count()) {
      await t.click();
      await p.waitForTimeout(400);
    }
    await shot(name);
  }
  await fits('statistics');
  // the caddie on the course: every button reads in full, the card never pushes the shot button into the distances
  await tab('Spielen');
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.waitForTimeout(800);
  await p.fill('#course-search', 'Hetzenhof');
  await p.waitForTimeout(2000);
  await p.locator('button.list-item').first().click();
  await p.getByText('Runde starten').waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
  await p.getByText('Runde starten').click();
  await p.waitForTimeout(5000);
  await p.getByRole('button', { name: /Caddie zeigen/ }).click();
  await p.waitForTimeout(900);
  await shot('caddie');
  const cad = await p.evaluate(() => {
    const shotBtn = document.querySelector('.map-shot-btn')?.getBoundingClientRect();
    const green = document.querySelector('.map-green')?.getBoundingClientRect();
    const bs = [...document.querySelectorAll('.caddie-actions button')];
    return { clear: !shotBtn || !green || shotBtn.top >= green.bottom, full: bs.length > 0 && bs.every((x) => x.scrollWidth <= x.clientWidth + 1) };
  });
  ok(cad.full, `${theme} · the caddie's buttons read in full`);
  ok(cad.clear, `${theme} · the shot button stays below the green's distances`);
  ok(errs.length === 0, `${theme} · no page errors ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
await b.close();
process.exit(fails ? 1 : 0);
