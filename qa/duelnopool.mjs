// QA (Sascha 16.11.2026, Legends: "Daniel nimmt nicht an den USA-Wetten teil und ist auch nicht im Pool. Mit Daniel haben
// Erik und ich jeweils nur 5+5+10 als Sidebet gespielt" → "automatisch ohne Pool"): Sascha challenges Erik (in the pool)
// and Daniel (not in it) at once – Erik's duel goes into "USA-Wetten", Daniel's into the day's own settlement
// ("5+5+10 · dd.mm."), said before "Herausfordern"; Daniel never joins the trip's pool. A second one outside the pool the
// same day: the same own settlement, not a new one.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/duelnopool.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const sim = sharedServer(b, url);
const { shared } = sim;
const day = (k) => {
  const d = new Date(Date.now() + k * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const today = day(0);
const ownName = `5+5+10 · ${today.slice(8, 10)}.${today.slice(5, 7)}.`;

const host = await sim.phone('Sascha');
const S = host.p;
const code = await S.evaluate(
  async ({ from, to }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const at = new Date().toISOString();
    const pool = {
      kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from, to, createdAt: at, currency: 'USD',
      players: ['Sascha', 'Chris', 'Erik'].map((n) => ({ id: n[0].toLowerCase(), name: n, joined: { name: n, at, uid: n } })),
      wagers: [],
      progress: {},
    };
    return (await ws.createPool(pool, 's'))?.code ?? null;
  },
  { from: day(-2), to: day(5) },
);
ok(/^[A-Z0-9]{6}$/.test(code ?? ''), `Sascha's pool: ${code}`);
shared.get(code).members.push('Chris', 'Erik');

const toDuel = async () => {
  await S.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
  await S.goto('about:blank');
  await S.goto(url);
  await S.waitForTimeout(1500);
  await S.getByRole('button', { name: 'Neues Spiel', exact: true }).click();
  await S.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
  await S.locator('.sheet .pick-option').filter({ has: S.locator('strong', { hasText: /^5\+5\+10$/ }) }).first().click();
  await S.waitForTimeout(400);
};
const addName = async (name) => {
  const sheet = S.getByRole('dialog', { name: 'Gegner' });
  await sheet.getByLabel('Name des Spielers').fill(name);
  await sheet.getByRole('button', { name: 'Hinzufügen' }).click();
};
const pools = () => S.evaluate(() => import('/src/lib/wagerstore.ts').then((ws) => ws.loadPools().filter((e) => !e.pool.deletedAt).map((e) => ({ name: e.pool.name, currency: e.pool.currency, players: e.pool.players.map((p) => p.name), duels: e.pool.wagers.filter((w) => w.kind === 'nassau').map((w) => ({ vs: e.pool.players.find((p) => p.id === w.opponent)?.name, state: w.challenge?.state })) }))));

// Erik from the pool, Daniel typed in – one "Herausfordern"
await toDuel();
ok(/USA-Wetten/.test(await S.locator('.settings-row').filter({ hasText: /^Pool/ }).innerText()), 'the pool of the day chosen: USA-Wetten');
await S.locator('.settings-row').filter({ hasText: /^Gegner/ }).click();
await S.getByRole('dialog', { name: 'Gegner' }).getByRole('checkbox', { name: /Erik/ }).click();
await addName('Daniel');
await S.getByRole('dialog', { name: 'Gegner' }).getByRole('button', { name: 'Fertig' }).click();
await S.waitForTimeout(300);
const hint = (await S.locator('.duel-outside').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(hint.includes('Nicht im Pool „USA-Wetten“: Daniel') && hint.includes(ownName), `said before "Herausfordern": ${hint}`);
await S.getByRole('button', { name: '2 herausfordern' }).click();
await S.waitForTimeout(2500);
let ps = await pools();
const usa = ps.find((x) => x.name === 'USA-Wetten');
const own = ps.filter((x) => x.name === ownName);
ok(usa && usa.players.join(',') === 'Sascha,Chris,Erik', `USA-Wetten untouched – no Daniel (${usa?.players.join(', ')})`);
ok(usa && usa.duels.length === 1 && usa.duels[0].vs === 'Erik', `Erik's duel in USA-Wetten (${JSON.stringify(usa?.duels)})`);
ok(own.length === 1 && own[0].players.includes('Daniel') && own[0].duels.length === 1 && own[0].duels[0].vs === 'Daniel', `Daniel's duel in "${ownName}" (${JSON.stringify(own)})`);
ok(own[0]?.duels[0]?.state === 'accepted', 'Daniel without a phone: it counts at once');
ok(own[0]?.currency === 'USD', `in the pool's money ($) – ${own[0]?.currency}`);

// a second one outside the pool the same day: the same own settlement
await toDuel();
await S.locator('.settings-row').filter({ hasText: /^Gegner/ }).click();
await addName('Thomas');
await S.getByRole('dialog', { name: 'Gegner' }).getByRole('button', { name: 'Fertig' }).click();
await S.waitForTimeout(300);
await S.getByRole('button', { name: 'Herausfordern', exact: true }).click();
await S.waitForTimeout(2500);
ps = await pools();
const own2 = ps.filter((x) => x.name === ownName);
ok(own2.length === 1 && own2[0].duels.map((d) => d.vs).sort().join(',') === 'Daniel,Thomas', `Thomas too in the one "${ownName}" (${JSON.stringify(own2.map((x) => x.duels))})`);
ok(ps.find((x) => x.name === 'USA-Wetten')?.players.length === 3, 'USA-Wetten still the three of the trip');
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
