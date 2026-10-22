// QA: rounds left open by accident are tidied up when the app starts – a round with a score is finished, a round
// without anything goes to the bin with its plan, never gone without the player (night check 22.10.2026).
// Usage: node qa/staletobin.mjs [url]
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
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  const old = new Date(Date.now() - 2 * 86400000).toISOString();
  const hole = { label: '1', loop: 'Main', number: 1, par: 4, strokeIndex: 1 };
  const base = { courseId: 'osm:relation/1326323', courseName: 'Golfclub Hetzenhof', holes: [hole], mode: 'quick', players: [{ id: 'me', name: 'Ich', playingHandicap: null, isMe: true }], currentHole: 0, finishedAt: null, createdAt: old };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([
    { ...base, id: 'empty1', entries: { me: [{ strokes: null, putts: null }] } },
    { ...base, id: 'scored1', entries: { me: [{ strokes: 5, putts: 2 }] } },
  ]));
  localStorage.setItem('golfos.live.v1.empty1', JSON.stringify({ plans: { '1': { targets: [[9.69, 48.78]] } }, shotStart: null, lastShot: null }));
});
await p.reload();
await p.waitForTimeout(1500);
const s = await p.evaluate(() => ({
  rounds: JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]').map((r) => `${r.id}:${r.finishedAt ? 'finished' : 'open'}`),
  bin: JSON.parse(localStorage.getItem('golfos.trash.v1') ?? '[]').map((t) => ({ id: t.round.id, keys: Object.keys(t.keys) })),
}));
ok(s.rounds.join() === 'scored1:finished', `a round with a score left open: finished (${s.rounds.join(', ')})`);
ok(s.bin.length === 1 && s.bin[0].id === 'empty1', `a round without anything: in the bin, not gone (${s.bin.map((x) => x.id).join(', ') || 'bin empty'})`);
ok(s.bin[0]?.keys.includes('golfos.live.v1.empty1'), 'its plan went to the bin with it');
ok((await p.locator('.undo-toast').count()) === 0, 'no "Round deleted · Undo" – the player did not delete it');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
