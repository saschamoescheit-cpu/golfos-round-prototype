// QA (Sascha 06.11.2026, USA trip): "invite Erik Hausotter right at Erik?" and "Chris I made by hand – now we are
// friends he is in twice; good if I could edit Chris without making the bets for Christopher anew". Sascha's pool with
// Chris (made by hand, his bet) and Erik. Christopher joins on his phone as a new player "Christopher": Sascha, at Chris,
// "Christopher ist Chris" – Christopher's phone is Chris with his bet, the second player gone. At Erik, "Einladen" his
// linked friend Erik: Erik's phone opens the pool as Erik – no "who are you?", no second player.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/poolwhois.mjs [url]
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
const { cards, links, shared, pushes } = sim;
const card = (uid, first, hcp) => ({ user_id: uid, code: String(318400 + cards.size), first_name: first, last_name: '', hcp_index: hcp, home_club: '', photo: null });
cards.set('Sascha', card('Sascha', 'Sascha', '10'));
cards.set('Erik', card('Erik', 'Erik', '4,6'));
cards.set('Christopher', card('Christopher', 'Christopher', '0'));
links.add('Sascha|Erik').add('Erik|Sascha').add('Sascha|Christopher').add('Christopher|Sascha');

const host = await sim.phone('Sascha');
const H = host.p;
const code = await H.evaluate(async () => {
  const ws = await import('/src/lib/wagerstore.ts');
  const { dayOf } = await import('/src/lib/wagers.ts');
  const day = dayOf(new Date());
  const base = { stake: 20, payout: 'success', attempts: 'any', by: 'Sascha' };
  const pool = {
    kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from: day, to: day, createdAt: new Date().toISOString(), currency: 'USD',
    players: [{ id: 'ps', name: 'Sascha', joined: { name: 'Sascha', at: new Date().toISOString(), uid: 'Sascha' } }, { id: 'pc', name: 'Chris' }, { id: 'pe', name: 'Erik' }],
    wagers: [
      { ...base, id: 'w-c', player: 'pc', kind: 'parRun', target: 12 },
      { ...base, id: 'w-e', player: 'pe', kind: 'parRun', target: 9 },
    ],
    progress: {},
  };
  return (await ws.createPool(pool, 'ps'))?.code ?? null;
});
ok(/^[A-Z0-9]{6}$/.test(code ?? ''), `Sascha's pool: ${code}`);

// Christopher joins on his phone as a new player – the second one (a member of the row, as after the pool's invitation)
shared.get(code).members.push('Christopher');
const chris = await sim.phone('Christopher');
const C = chris.p;
await C.evaluate(async (c) => {
  const ws = await import('/src/lib/wagerstore.ts');
  await ws.joinPool(c, { name: 'Christopher' }, 'Christopher');
}, code);
const players = () => shared.get(code).game.players;
ok(players().map((p) => p.name).join(',') === 'Sascha,Chris,Erik,Christopher', `Christopher joined as a new player: in twice (${players().map((p) => p.name).join(', ')})`);

// Sascha's linked friends from the server, then the pool
await H.evaluate(() => sessionStorage.removeItem('golfos.module'));
await H.reload();
await H.waitForTimeout(1200);
await H.getByRole('navigation', { name: 'Menü' }).getByRole('button', { name: 'Freunde' }).click();
await H.locator('.friend-linked').filter({ hasText: 'Erik' }).waitFor({ timeout: 10000 }).catch(() => {});
const openPool = async (P) => {
  await P.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
  await P.goto('about:blank');
  await P.goto(url);
  await P.waitForTimeout(1500);
  await P.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
  await P.locator('.list-item').filter({ hasText: 'USA-Wetten' }).first().click({ timeout: 15000 });
  await P.waitForTimeout(2000);
};
await openPool(H);
const cardOf = (P, n) => P.locator('section.pool-player').filter({ has: P.locator('h2', { hasText: new RegExp(`^${n}$`) }) });
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/pool-host.png', fullPage: true });
ok((await cardOf(H, 'Chris').getByRole('button', { name: 'Chris einladen' }).count()) === 1 && (await cardOf(H, 'Sascha').getByRole('button', { name: /einladen/ }).count()) === 0, 'at Chris (made by hand): "Chris einladen" – not at Sascha himself');
await cardOf(H, 'Chris').getByRole('button', { name: 'Chris einladen' }).click();
const who = H.getByRole('dialog', { name: 'Wer ist Chris?' });
ok((await who.getByRole('button', { name: 'Christopher ist Chris' }).count()) === 1 && (await who.getByRole('button', { name: 'Sascha ist Chris' }).count()) === 0, 'the sheet "Wer ist Chris?": Christopher, joined without bets, offered – not Sascha himself (no bets either)');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/pool-whois.png' });
await who.getByRole('button', { name: 'Christopher ist Chris' }).click();
await H.waitForTimeout(2000);
{
  const ps = players();
  const c = ps.find((p) => p.id === 'pc');
  ok(ps.length === 3 && !ps.some((p) => p.name === 'Christopher') && c?.joined?.uid === 'Christopher' && shared.get(code).game.wagers.find((w) => w.id === 'w-c')?.player === 'pc', `linked: Chris has Christopher's phone, his bet kept, the second player gone (${ps.map((p) => p.name).join(', ')})`);
}
// Christopher's phone: Chris now
await openPool(C);
ok((await C.getByText('Wer bist du?').count()) === 0 && (await cardOf(C, 'Chris').getByRole('img', { name: /angenommen – auf seinem Handy/ }).count()) === 1, "Christopher's phone: Chris, \"du\" – no \"who are you?\"");
ok(await C.evaluate((c) => JSON.parse(localStorage.getItem('golfos.pools.v1')).find((e) => e.code === c)?.me === 'pc', code), "Christopher's phone reports as Chris (pc)");

// Erik invited right at Erik
await openPool(H);
await cardOf(H, 'Erik').getByRole('button', { name: 'Erik einladen' }).click();
const whoE = H.getByRole('dialog', { name: 'Wer ist Erik?' });
await whoE.getByRole('button', { name: 'Erik als Erik einladen' }).click();
await H.waitForTimeout(2000);
ok(players().find((p) => p.id === 'pe')?.invited?.uid === 'Erik' && pushes.some((x) => x.action === 'invite' && x.friend === 'Erik' && x.code === code), 'Erik invited right at Erik: kept on the player, the invitation pushed');
await whoE.getByRole('button', { name: 'Schließen' }).click();
await H.waitForTimeout(800);
ok(/Eingeladen: Erik/.test(await cardOf(H, 'Erik').innerText()), 'the card: "Eingeladen: Erik"');
// the invitation's state as an icon (Sascha 09.11.2026): open – a clock in the button, nothing "accepted" yet
ok((await cardOf(H, 'Erik').locator('.pool-whois .person-mark.muted').count()) === 1 && (await cardOf(H, 'Erik').getByText(/^Angenommen/).count()) === 0, 'Erik invited, not in yet: the grey figure with the arrow at "Eingeladen: Erik"');
const erik = await sim.phone('Erik');
const E = erik.p;
await E.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await E.reload();
// his app, open: the invitation asked at once (as for every invitation) – "Beitreten" opens the pool
const askE = E.getByRole('dialog').filter({ hasText: /lädt dich/ });
await askE.waitFor({ timeout: 15000 }).catch(() => {});
ok(/Sascha lädt dich zu seinen Wetten/.test(await askE.innerText().catch(() => '')), `Erik: "Sascha lädt dich zu seinen Wetten … ein" (${(await askE.innerText().catch(() => '–')).replace(/\s+/g, ' ').slice(0, 80)})`);
await askE.getByRole('button', { name: 'Beitreten' }).click().catch(() => {});
await E.waitForTimeout(3000);
if (process.env.SHOTS) await E.screenshot({ path: process.env.SHOTS + '/pool-erik.png', fullPage: true });
ok((await E.getByText('Wer bist du?').count()) === 0 && (await cardOf(E, 'Erik').getByRole('img', { name: /angenommen – auf seinem Handy/ }).count()) === 1, "Erik's phone: Erik, \"du\" – no \"who are you?\"");
ok(players().find((p) => p.id === 'pe')?.joined?.uid === 'Erik' && players().length === 3, `Erik's phone took Erik by his account – no second player (${players().map((p) => p.name).join(', ')})`);

// Sascha's phone: Erik accepted – the tick and "Angenommen", the button gone; Chris (linked) as well
await openPool(H);
ok((await cardOf(H, 'Erik').locator('.pool-invite-state .person-mark.good-text').count()) === 1 && /Angenommen: Erik/.test(await cardOf(H, 'Erik').innerText()) && (await cardOf(H, 'Erik').locator('.pool-whois').count()) === 0, 'Erik accepted: a green tick, "Angenommen: Erik", no invite button');
ok(/Angenommen: Christopher/.test(await cardOf(H, 'Chris').innerText()), 'Chris: "Angenommen: Christopher"');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/pool-accepted.png', fullPage: true });

// Sascha 09.11.2026 "Christopher is still in twice": Moritz made by hand and invited, but Moritz had joined as a new
// player before – Sascha's phone links them on its own when it opens the pools
cards.set('Moritz', card('Moritz', 'Moritz', '0'));
{
  const g = shared.get(code).game;
  shared.get(code).game = { ...g, players: [...g.players, { id: 'pm', name: 'Moritz', invited: { uid: 'Moritz', name: 'Moritz Kopp', at: new Date().toISOString() } }], wagers: [...g.wagers, { stake: 20, payout: 'success', attempts: 'any', by: 'Sascha', id: 'w-m', player: 'pm', kind: 'parRun', target: 8 }] };
  shared.get(code).members.push('Moritz');
}
const moritz = await sim.phone('Moritz');
await moritz.p.evaluate(async (c) => {
  const ws = await import('/src/lib/wagerstore.ts');
  await ws.joinPool(c, { name: 'Moritz K' }, 'Moritz');
}, code);
ok(players().some((p) => p.name === 'Moritz K'), `Moritz joined as a new player: in twice (${players().map((p) => p.name).join(', ')})`);
await openPool(H);
await H.waitForTimeout(2000);
{
  const ps = players();
  ok(!ps.some((p) => p.name === 'Moritz K') && ps.find((p) => p.id === 'pm')?.joined?.uid === 'Moritz' && shared.get(code).game.wagers.find((w) => w.id === 'w-m')?.player === 'pm', `linked by Sascha's phone on its own: Moritz has his phone and his bet, the second one gone (${ps.map((p) => p.name).join(', ')})`);
}
await openPool(moritz.p);
ok(await moritz.p.evaluate((c) => JSON.parse(localStorage.getItem('golfos.pools.v1')).find((e) => e.code === c)?.me === 'pm', code), "Moritz's phone reports as Moritz (pm)");

ok([host, chris, erik, moritz].every((x) => x.errs.length === 0), `no page errors ${[host, chris, erik, moritz].flatMap((x) => x.errs).slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
