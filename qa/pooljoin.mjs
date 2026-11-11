// QA (Sascha 09.11.2026, USA: "Erik accepted the invitation to the bets, also by the QR code – 'Der Pool ließ sich nicht
// laden – keine Verbindung, oder dieses Konto ist nicht dabei'"): Erik's phone opens the pool (the invitation tapped)
// before the server let him in – it joins by the code at once and shows the pool, as Erik; without signing in it says
// to sign in. And the host takes the invitation back ("Einladung zurücknehmen") and unlinks one who accepted.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/pooljoin.mjs [url]
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
const host = await sim.phone('Sascha');
const H = host.p;
const code = await H.evaluate(async () => {
  const ws = await import('/src/lib/wagerstore.ts');
  const { dayOf } = await import('/src/lib/wagers.ts');
  const day = dayOf(new Date());
  const at = new Date().toISOString();
  return (
    await ws.createPool(
      {
        kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from: day, to: day, createdAt: at, currency: 'USD',
        players: [{ id: 'ps', name: 'Sascha', joined: { name: 'Sascha', at, uid: 'Sascha' } }, { id: 'pe', name: 'Erik', invited: { uid: 'Erik', name: 'Erik Hausotter', at } }],
        wagers: [{ id: 'w-e', player: 'pe', kind: 'parRun', target: 9, stake: 20, payout: 'success', attempts: 'any' }],
        progress: {},
      },
      'ps',
    )
  )?.code ?? null;
});
ok(/^[A-Z0-9]{6}$/.test(code ?? ''), `Sascha's pool, Erik invited at his player: ${code}`);
ok(!shared.get(code).members.includes('Erik'), 'the server has not let Erik in yet');

// Erik's phone: the pool opened from the invitation – not a member yet
const erik = await sim.phone('Erik');
const E = erik.p;
// as a tapped invitation or push opens it: Games, then the pool by its code
const openPool = async (P) => {
  await P.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
  await P.goto('about:blank');
  await P.goto(url);
  await P.waitForTimeout(1500);
  await P.evaluate((c) => {
    sessionStorage.setItem('golfos.openPool', c);
    window.dispatchEvent(new Event('golfos:open-pool'));
  }, code);
};
await openPool(E);
await E.locator('section.pool-player').first().waitFor({ timeout: 20000 }).catch(() => {});
ok((await E.getByText(/Der Pool ließ sich nicht laden/).count()) === 0 && (await E.locator('section.pool-player').count()) === 2, "Erik's phone: the pool shows – in by its code, no \"could not be loaded\"");
ok(shared.get(code).members.includes('Erik'), 'the server let Erik in (by the code)');
await E.waitForTimeout(2000);
ok(shared.get(code).game.players.find((p) => p.id === 'pe')?.joined?.uid === 'Erik', 'Erik is Erik – his phone took the player he was invited as');

// not signed in: said so
const guest = await sim.phone('Gast', { guest: true });
await openPool(guest.p);
await guest.p.waitForTimeout(2500);
ok((await guest.p.getByText(/Bitte zuerst anmelden/).count()) === 1, 'not signed in: "Bitte zuerst anmelden …"');

// the host: "Angenommen: Erik" → "Verknüpfung mit Erik lösen" – Erik without a phone, his bet kept; invited anew
await openPool(H);
const card = H.locator('section.pool-player').filter({ has: H.locator('.pool-player-name', { hasText: /^Erik$/ }) });
await card.locator('.pool-invite-edit').waitFor({ timeout: 15000 });
await card.locator('.pool-invite-edit').click();
const who = H.getByRole('dialog', { name: 'Wer ist Erik?' });
await who.getByRole('button', { name: /^Verknüpfung mit Erik.* lösen$/ }).click();
await H.waitForTimeout(1500);
{
  const pe = shared.get(code).game.players.find((p) => p.id === 'pe');
  ok(!!pe && !pe.joined && !pe.invited && shared.get(code).game.wagers.some((w) => w.player === 'pe'), `unlinked: Erik without a phone, his bet kept (${JSON.stringify(pe)})`);
}
// an invitation still open taken back
await H.evaluate(async (c) => (await import('/src/lib/wagerstore.ts')).invitePlayer(c, 'pe', { uid: 'Erik', name: 'Erik Hausotter' }), code);
await openPool(H);
await card.locator('.pool-whois').click();
await who.getByRole('button', { name: 'Einladung zurücknehmen' }).click();
await H.waitForTimeout(1500);
ok(!shared.get(code).game.players.find((p) => p.id === 'pe')?.invited, 'an invitation still open: taken back');

ok([host, erik].every((x) => x.errs.length === 0), `no page errors ${[host, erik].flatMap((x) => x.errs).slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
