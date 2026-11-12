// QA (Sascha 12.11.2026: "Hier fehlen von Chris und Cedric die Putts in den Scorekarten. Es müssen immer alle
// Informationen angezeigt werden"): a round of three – Sascha's putts, Chris's on some holes, Cedric's none: on the
// scorecard a row "Putts" for each, "–" where a hole was played without them, the sums under "Out".
// Usage: node qa/puttsrows.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
let fails = 0;
const ok = (c, m) => (console.log(`${c ? '✓' : '✗'} ${m}`), c || fails++);
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
await mockNet(p);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  const holes = Array.from({ length: 9 }, (_, i) => ({ index: i, number: i + 1, label: String(i + 1), par: 4, strokeIndex: i + 1 }));
  const at = new Date().toISOString();
  const round = {
    id: 'r-putts', courseName: 'StoneGate – Oaks', createdAt: at, finishedAt: at, holes, loopOrder: ['A'], courseId: 'test-course', kind: 'social', capture: 'score',
    players: [{ id: 'me', name: 'Sascha', isMe: true, playingHandicap: 10 }, { id: 'c', name: 'Chris', isMe: false, playingHandicap: 8 }, { id: 'd', name: 'Cedric', isMe: false, playingHandicap: 14 }],
    entries: {
      me: holes.map(() => ({ strokes: 5, putts: 2 })),
      c: holes.map((_, i) => ({ strokes: 4, putts: i < 3 ? 1 : null })),
      d: holes.map(() => ({ strokes: 6, putts: null })),
    },
  };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([round]));
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(800);
await p.getByText('StoneGate – Oaks').first().click();
await p.waitForTimeout(1500);
const rows = await p.locator('table tr').filter({ has: p.locator('td.lab', { hasText: /^Putts$/ }) }).evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())));
ok(rows.length >= 3, `a row "Putts" for every player (${rows.length})`);
const [sascha, chris, cedric] = rows;
ok(sascha?.slice(1, 10).every((x) => x === '2') && sascha?.[10] === '18', `Sascha: 2 on every hole, 18 (${sascha?.join(' ')})`);
ok(chris?.slice(1, 4).every((x) => x === '1') && chris?.slice(4, 10).every((x) => x === '–') && chris?.[10] === '3', `Chris: 1 on three holes, "–" on the others, 3 (${chris?.join(' ')})`);
ok(cedric?.slice(1, 10).every((x) => x === '–'), `Cedric: none entered – "–" on every hole (${cedric?.join(' ')})`);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/puttsrows.png`, fullPage: true });
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
