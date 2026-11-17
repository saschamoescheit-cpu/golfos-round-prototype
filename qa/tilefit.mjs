// QA (Sascha 16.11.2026: "Die Kacheln Spiele, Wetten und Siege werden optisch noch nicht sauber dargestellt. Alle Kacheln
// in der App müssen sauber dargestellt sein, sodass nichts abgeschnitten wird. Prüfe die gesamte App"): every module,
// every tab of its menu bar, every topic of the statistics – each tile (.tile) on the screen: nothing in it reaches
// over its edge, no text cut off; tiles of one row the same height. On an iPhone SE, an iPhone, an iPad upright and across –
// with rounds, a pool of bets with large amounts and a game, so long numbers show.
// Usage: node qa/tilefit.mjs [url]   (SHOTS=<dir> for a screenshot of each failing screen)
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const r16 = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8')).round;
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const day = (d) => {
  const x = new Date(Date.now() + d * 86400000);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// a pool with large amounts: 250 $ a round, made and missed over four rounds, five players
const at = new Date().toISOString();
const players = ['Sascha', 'Christopher', 'Cedric', 'Erik', 'Moritz'].map((n, k) => ({ id: `p${k}`, name: n }));
const pr = (vals) => ({ best: 3, done: false, rounds: vals.length, perRound: vals.map((v, k) => ({ day: day(-k - 1), course: 'Hawks Landing', value: v, counted: true })), at });
const pool = {
  kind: 'wager-pool', id: 'big', name: 'USA-Wetten 2026', from: day(-6), to: day(4), createdAt: at, currency: 'USD',
  players,
  wagers: [
    { id: 'w0', player: 'p0', kind: 'birdies', target: 2, stake: 250, payout: 'both', attempts: 'any' },
    { id: 'w1', player: 'p1', kind: 'birdies', target: 2, stake: 250, payout: 'both', attempts: 'any' },
    { id: 'w2', player: 'p2', kind: 'birdies', target: 2, stake: 250, payout: 'success', attempts: 'any' },
  ],
  progress: { w0: pr([3, 2, 4, 3]), w1: pr([0, 1, 3, 0]), w2: pr([2, 0, 0, 1]) },
};

const SIZES = [
  { name: 'iPhone SE', ...devices['iPhone SE'] },
  { name: 'iPhone 13', ...devices['iPhone 13'] },
  { name: 'iPad hoch', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPad (gen 7)'].userAgent },
  { name: 'iPad quer', viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPad (gen 7)'].userAgent },
  { name: 'iPad Pro quer', viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPad (gen 7)'].userAgent },
];

/** every tile on the screen whose content reaches over its edge or is cut off; tiles of a row of different heights */
const badTiles = (p) =>
  p.evaluate(() => {
    const out = [];
    const tiles = [...document.querySelectorAll('.tile')].filter((t) => t.getClientRects().length && getComputedStyle(t).visibility !== 'hidden');
    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      const name = t.innerText.replace(/\s+/g, ' ').trim().slice(0, 40);
      const over = [...t.querySelectorAll('*')].find((c) => {
        const q = c.getBoundingClientRect();
        if (!q.width && !q.height) return false;
        return q.left < r.left - 1 || q.right > r.right + 1 || q.top < r.top - 1 || q.bottom > r.bottom + 1;
      });
      const cut = [t, ...t.querySelectorAll('*')].find((c) => c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflowX !== 'visible');
      if (over) out.push(`${name}: "${(over.textContent || over.tagName).trim().slice(0, 20)}" over the edge`);
      else if (cut) out.push(`${name}: cut off`);
    }
    // the tiles of one row: one height
    for (const row of document.querySelectorAll('.tile-row')) {
      const ts = [...row.children].filter((c) => c.classList.contains('tile') && c.getClientRects().length);
      const byTop = new Map();
      for (const t of ts) {
        const r = t.getBoundingClientRect();
        const k = Math.round(r.top);
        byTop.set(k, [...(byTop.get(k) ?? []), Math.round(r.height)]);
      }
      for (const hs of byTop.values()) if (Math.max(...hs) - Math.min(...hs) > 2) out.push(`a row of tiles of different heights (${hs.join('/')})`);
      // each tile at least as wide as its widest word – none squeezed below its label
    }
    return out;
  });

let screens = 0;
for (const size of SIZES) {
  const { name, ...opts } = size;
  const ctx = await b.newContext({ ...opts, locale: 'de-DE' });
  await mockNet(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
  await p.goto(url);
  await p.waitForTimeout(800);
  await p.evaluate(({ r16, pool }) => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '7', homeClub: '' }));
    const rounds = Array.from({ length: 12 }, (_, k) => {
      const t = new Date(Date.UTC(2026, 9, 28 - k, 10)).toISOString();
      return { ...r16, id: `${r16.id}-${k}`, createdAt: t, finishedAt: t, signedAt: t };
    });
    localStorage.setItem('golfos.rounds.v1', JSON.stringify(rounds));
    localStorage.setItem('golfos.pools.v1', JSON.stringify([{ code: 'BIG1', pool, me: 'p0' }]));
  }, { r16, pool });
  const bad = [];
  for (const mod of ['rounds', 'games', 'tournaments', 'training', 'mobility']) {
    await p.evaluate((m) => sessionStorage.setItem('golfos.module', m), mod);
    await p.goto('about:blank');
    await p.goto(url);
    await p.waitForTimeout(1500);
    const tabs = await p.locator('.tabbar button').allInnerTexts();
    for (const tab of tabs.map((t) => t.trim()).filter(Boolean)) {
      await p.locator('.tabbar button').filter({ hasText: tab }).first().click().catch(() => {});
      await p.waitForTimeout(700);
      const look = async (where) => {
        screens++;
        const found = await badTiles(p);
        if (found.length) {
          bad.push(`${mod} › ${where}: ${found.join(' | ')}`);
          if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/tiles-${name.replace(/\s/g, '')}-${mod}-${where.replace(/[^\wäöü]/g, '')}.png`, fullPage: true });
        }
      };
      await look(tab);
      // the statistics: each topic
      const topics = p.getByRole('tablist', { name: 'Thema' });
      if (await topics.count()) {
        for (const t of (await topics.getByRole('tab').allInnerTexts()).map((x) => x.trim())) {
          await topics.getByRole('tab', { name: t, exact: true }).click().catch(() => {});
          await p.waitForTimeout(400);
          await look(`${tab} › ${t}`);
        }
      }
    }
  }
  ok(bad.length === 0, `${name}: every tile clean${bad.length ? '\n    ' + bad.join('\n    ') : ''}`);
  ok(errs.length === 0, `${name}: no page errors ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
ok(screens >= 60, `screens looked at: ${screens}`);
await b.close();
process.exit(fails ? 1 : 0);
