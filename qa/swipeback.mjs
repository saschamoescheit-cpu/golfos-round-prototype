// QA (Sascha 10.11.2026: "beside the arrow for back, swipe to get one level back"): a swipe from the left edge to the
// right closes an open sheet first, then goes one level back; a swipe starting away from the edge does nothing.
// Usage: node qa/swipeback.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
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
await p.waitForTimeout(1200);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '7', homeClub: '' }));
  sessionStorage.setItem('golfos.module', 'games');
});
await p.reload();
await p.waitForTimeout(1500);
// a finger as Safari sends it: start, moves, end – the end with its changed touches
const swipe = (x0, x1, y = 400) =>
  p.evaluate(
    async ([x0, x1, y]) => {
      const fire = (type, x) => {
        const el = document.elementFromPoint(Math.max(1, x), y) ?? document.body;
        const ev = new Event(type, { bubbles: true, cancelable: true });
        const t = [{ identifier: 1, clientX: x, clientY: y, target: el }];
        Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : t });
        Object.defineProperty(ev, 'changedTouches', { value: t });
        el.dispatchEvent(ev);
      };
      fire('touchstart', x0);
      for (let k = 1; k <= 5; k++) fire('touchmove', x0 + ((x1 - x0) * k) / 5);
      fire('touchend', x1);
      await new Promise((r) => setTimeout(r, 400));
    },
    [x0, x1, y],
  );
await p.getByRole('button', { name: 'Neues Spiel', exact: true }).click();
await p.waitForTimeout(500);
await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
await p.waitForTimeout(300);
ok((await p.getByRole('dialog', { name: 'Spielform wählen' }).count()) === 1, 'the game form sheet open');
await swipe(150, 330);
ok((await p.getByRole('dialog', { name: 'Spielform wählen' }).count()) === 1, 'a swipe away from the edge: nothing');
await swipe(6, 220);
ok((await p.getByRole('dialog', { name: 'Spielform wählen' }).count()) === 0 && (await p.locator('.topbar h1').innerText()).includes('Neues Spiel'), 'from the edge: the sheet closed first, the screen stays');
await swipe(6, 220);
ok((await p.getByRole('button', { name: 'Neues Spiel', exact: true }).count()) === 1, 'from the edge again: one level back – Games');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
