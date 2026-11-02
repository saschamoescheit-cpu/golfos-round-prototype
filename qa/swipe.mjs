// QA (Sascha 02.11.2026: "delete rounds, games or bets by wiping them away as with e-mails, then a bin comes – in the
// whole app"): the games list – a tap still opens the game, a scroll-like move down opens nothing, swiped a little the
// bin shows ("… löschen"), a tap on the open row only closes it, the bin deletes; swiped all the way across it deletes
// at once; "Rückgängig" brings it back. The bets: the host's pool swiped away is marked deleted for everyone, "Undo"
// restores it; a pool someone else set up does not swipe. Supabase is simulated (qa/sharesim.mjs).
// Usage: node qa/swipe.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const p = host.p;

// two finished games (a paused one opens by itself on start – its row is the same SwipeRow, as the paused rounds')
await p.evaluate(() => {
  const holes = Array.from({ length: 9 }, (_, i) => ({ label: String(i + 1), par: 4, si: i + 1 }));
  const game = (id, course, finished) => ({
    id, createdAt: new Date(Date.now() - (id === 'g1' ? 0 : 864e5)).toISOString(), finishedAt: finished ? new Date().toISOString() : null, signedAt: null,
    courseName: course, holes, players: [{ id: 'a', name: 'Sascha', hcp: 0 }, { id: 'b', name: 'Chris', hcp: 0 }], form: 'skins', settings: { stake: 1 },
    scores: { a: holes.map(() => (finished ? 4 : null)), b: holes.map(() => (finished ? 5 : null)) }, extra: holes.map(() => ({})), current: 0,
  });
  localStorage.setItem('golfos.games.v1', JSON.stringify([game('g1', 'Hetzenhof', true), game('g2', 'Schönbuch', true)]));
  sessionStorage.setItem('golfos.module', 'games');
});
await p.reload();
await p.waitForTimeout(1500);
const toGames = async () => {
  await p.locator('.tabbar').getByRole('button', { name: 'Spiele', exact: true }).click();
  await p.waitForTimeout(400);
};
await toGames();
const row = (course) => p.locator('.swipe').filter({ hasText: course });
const swipe = async (course, dx, dy = 0) => {
  const box = await row(course).boundingBox();
  const x = box.x + box.width * 0.7;
  const y = box.y + box.height / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
  await p.mouse.up();
  await p.waitForTimeout(450);
};
// the bin shows at the right edge, under the row slid aside – tapped there, as a finger does
const tapBin = async (b) => {
  const box = await b.boundingBox();
  await b.click({ position: { x: box.width - 40, y: box.height / 2 } });
};
const games = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.games.v1')).map((g) => g.courseName).sort().join(','));
ok((await p.locator('.swipe').count()) === 2, 'the games list: every game a row that swipes');

// a scroll-like move: nothing
await swipe('Hetzenhof', -14, 60);
ok((await p.locator('.swipe-bin').count()) === 0 && (await p.locator('.tabbar').count()) === 1, 'moved down more than across: no bin, nothing opened – the list scrolls as before');
// swiped a little: the bin shows, a tap on the row closes it and opens nothing
await swipe('Hetzenhof', -90);
const bin = p.getByRole('button', { name: /Skins Hetzenhof löschen/ });
ok((await bin.count()) === 1, 'swiped a little: the red bin "… löschen" shows');
await row('Hetzenhof').locator('.list-item').click({ position: { x: 150, y: 20 } });
await p.waitForTimeout(400);
ok((await p.locator('.swipe-bin').count()) === 0 && (await p.locator('.tabbar').count()) === 1, 'a tap on the open row closes it – the game is not opened');
// the bin deletes – into the bin, "Undo" brings it back
await swipe('Hetzenhof', -90);
await tapBin(bin);
await p.waitForTimeout(600);
ok((await games()) === 'Schönbuch' && (await row('Hetzenhof').count()) === 0, `the bin tapped: the game deleted (${await games()})`);
const toast = p.locator('.undo-toast');
ok((await toast.innerText()).includes('Spiel gelöscht'), 'the toast "Spiel gelöscht · Rückgängig"');
await toast.getByRole('button', { name: 'Rückgängig' }).click();
await p.waitForTimeout(500);
await toGames();
ok((await games()) === 'Hetzenhof,Schönbuch', 'Rückgängig: the game is back');
// all the way across: deleted at once
const w = (await row('Schönbuch').boundingBox()).width;
await swipe('Schönbuch', -w * 0.65);
await p.waitForTimeout(400);
ok((await games()) === 'Hetzenhof' && (await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.games.trash.v1') ?? '[]').length)) >= 1, `swiped all the way across: deleted at once, into the bin (${await games()})`);
// a tap still opens a game
await row('Hetzenhof').locator('.list-item').click();
await p.waitForTimeout(600);
ok((await p.locator('.tabbar').count()) === 0, 'a plain tap still opens the game');

// the bets: the host's pool swipes, marked deleted for everyone; "Undo" restores it
const code = await p.evaluate(async () => {
  const ws = await import('/src/lib/wagerstore.ts');
  const { dayOf } = await import('/src/lib/wagers.ts');
  const day = dayOf(new Date());
  const pool = { kind: 'wager-pool', id: 'sw', name: 'Wischtest', from: day, to: day, createdAt: new Date().toISOString(), currency: 'EUR', players: [{ id: 'ps', name: 'Sascha' }, { id: 'pc', name: 'Chris' }], wagers: [], progress: {} };
  return (await ws.createPool(pool, 'ps'))?.code ?? null;
});
await p.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await p.waitForTimeout(500);
await swipe('Wischtest', -90);
await tapBin(p.getByRole('button', { name: 'Wischtest löschen' }));
await p.waitForTimeout(1500);
ok(!!sim.shared.get(code).game.deletedAt, 'the host swiped the pool away: marked deleted on the server');
ok((await toast.innerText()).includes('Wette gelöscht'), 'the toast "Wette gelöscht · Rückgängig"');
await toast.getByRole('button', { name: 'Rückgängig' }).click();
await p.waitForTimeout(1500);
ok(!sim.shared.get(code).game.deletedAt, 'Rückgängig: the pool restored for everyone');
// Chris's phone: the pool is not his – no swipe
const chris = await sim.phone('Chris');
await chris.p.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await chris.p.goto('about:blank');
await chris.p.goto(url + '#join=' + code);
await chris.p.waitForTimeout(2000);
await chris.p.getByRole('dialog', { name: 'Spiel beitreten' }).getByRole('button', { name: 'Chris', exact: true }).click();
await chris.p.waitForTimeout(2500);
await chris.p.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await chris.p.goto(url);
await chris.p.waitForTimeout(1500);
await chris.p.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await chris.p.waitForTimeout(500);
ok((await chris.p.locator('.list-item').filter({ hasText: 'Wischtest' }).count()) === 1 && (await chris.p.locator('.swipe').count()) === 0, "another's pool: listed, but no swipe – only the host deletes");
ok(host.errs.length === 0 && chris.errs.length === 0, `no page errors ${[...host.errs, ...chris.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
