// QA (Sascha 16.11.2026: "GIR sollten wir auch immer in allen Scorekarten und je Spieler darstellen … visuell, wenn GIR
// erfüllt wurde. Wenn nicht, dann ein -"): under every player's putts a row GIR – a green tick for a green in regulation,
// "–" missed or picked up, empty where the putts are not known; on the right "hit/known" per nine.
// Usage: node qa/scoregir.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const pars = [4, 3, 4, 5, 4, 5, 3, 4, 4, 5, 4, 4, 3, 4, 3, 4, 4, 3];
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate((pars) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  const holes = pars.map((par, i) => ({ par, loop: 'Main', index: i, label: String(i + 1), number: i + 1, strokeIndex: i + 1 }));
  const r = {
    id: 'gir-qa', kind: 'social', mode: 'quick', format: { mode: 'single', scoring: 'net', allowance: 100, matchplay: false }, loopOrder: ['Main'], holes, capture: 'score', courseId: 'osm:relation/4053362', courseName: 'Hawks Landing Golf Club',
    createdAt: '2026-11-15T12:00:00', finishedAt: '2026-11-15T17:00:00', currentHole: 0, signedAt: null,
    players: [{ id: 'me', isMe: true, name: 'Sascha', playingHandicap: 4 }, { id: 'c', name: 'Cedric', playingHandicap: 10 }],
    entries: {
      // all greens hit but hole 2 (par 3, 3 strokes with 1 putt: green in 2)
      me: pars.map((par, i) => ({ strokes: par, putts: i === 1 ? 1 : 2, pickedUp: false, penalties: 0, fairway: null, greensideBunker: false })),
      // the front nine with putts, all missed; the back nine without putts; hole 10 picked up
      c: pars.map((par, i) => ({ strokes: i === 9 ? null : par + 1, putts: i < 9 ? 2 : null, pickedUp: i === 9, penalties: 0, fairway: null, greensideBunker: false })),
    },
  };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
}, pars);
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hawks/ }).first().click();
await p.waitForTimeout(1500);
const rows = await p.locator('table.sc tr.gir-row').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => (td.querySelector('.gir-hit') ? '✓' : td.textContent.trim()))));
console.log('·', JSON.stringify(rows));
ok(rows.length === 4, `a GIR row per player and nine (${rows.length})`);
const [meOut, cOut, meIn, cIn] = rows;
ok(meOut?.[0] === 'GIR', 'labelled GIR');
ok(meOut && meOut.slice(1, 10).filter((x) => x === '✓').length === 8 && meOut[2] === '–', 'Sascha front nine: 8 ticks, "–" on hole 2');
ok(meOut?.[10] === '8/9', `the sum 8/9 (${meOut?.[10]})`);
ok(cOut && cOut.slice(1, 10).every((x) => x === '–') && cOut[10] === '0/9', 'Cedric front nine: missed everywhere, 0/9');
ok(cIn && cIn[1] === '–' && cIn.slice(2, 10).every((x) => x === '') && cIn[10] === '0/1', 'Cedric back nine: picked up "–", without putts empty, 0/1');
ok(meIn && meIn.slice(1, 10).every((x) => x === '✓') && meIn[10] === '9/9', 'Sascha back nine 9/9');
const color = await p.locator('table.sc .gir-hit').first().evaluate((el) => getComputedStyle(el).color);
ok(!/rgb\(2[0-9]{2}, 2[0-9]{2}, 0\)/.test(color) && color !== 'rgb(0, 0, 0)', `the tick in the app's green (${color})`);
ok((await p.locator('.sc-legend .gir-key').count()) === 1, 'GIR in the legend');
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/scoregir.png`, fullPage: true });
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
