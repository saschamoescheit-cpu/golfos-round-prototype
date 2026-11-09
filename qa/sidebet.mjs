// QA (Sascha 10.11.2026, USA: "5+5+10 as a side game in Rounds – in the round's settings between the players and the
// invitation; in a tournament's round in the menu by the code, the bag and the caddie"). The round's setup: "Sidebet ·
// 5+5+10" after the players, before "Mitspieler einladen"; its sheet offers the round's players; a duel against one of
// them (without a phone) goes into a new pool of the day at once; the row says "1 Duell heute"; in the round the menu has
// "Sidebet · 5+5+10". Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/sidebet.mjs [url]
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
const me = await sim.phone('Sascha');
const P = me.p;
await P.getByRole('button', { name: 'Neue Runde' }).click();
await P.fill('#course-search', 'Hetzenhof');
await P.waitForTimeout(1500);
await P.locator('button.list-item').first().click();
await P.getByRole('button', { name: /A · 9 Löcher/ }).click();
await P.waitForTimeout(600);
await P.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await P.getByLabel('Spieler 2', { exact: true }).fill('Ben');
const eyebrows = (await P.locator('main .eyebrow').allInnerTexts()).map((t) => t.trim().toUpperCase());
const at = (x) => eyebrows.indexOf(x);
ok(at('SIDEBET') === at('SPIELER') + 1 && (at('MITSPIELER EINLADEN') < 0 || at('MITSPIELER EINLADEN') === at('SIDEBET') + 1), `the setup: the side bet between the players and the invitation (${eyebrows.join(' · ')})`);
const row = P.locator('.settings-row').filter({ hasText: /^5\+5\+10/ });
ok(/Hinzufügen/.test(await row.innerText()), 'its row: "5+5+10 · Hinzufügen"');
await row.click();
const sheet = P.getByRole('dialog', { name: 'Sidebet · 5+5+10' });
await sheet.locator('.settings-row').filter({ hasText: 'Gegner' }).click();
const who = P.getByRole('dialog', { name: 'Gegner' });
ok((await who.getByText('In deiner Runde').count()) === 1 && (await who.getByRole('switch', { name: /^Ben/ }).count()) === 1, 'the opponents: Ben "In deiner Runde"');
await who.getByRole('switch', { name: /^Ben/ }).click();
await who.getByRole('button', { name: 'Fertig' }).click();
await sheet.getByRole('button', { name: 'Herausfordern' }).click();
await P.waitForTimeout(2500);
const pool = [...sim.shared.values()].find((r) => r.game.kind === 'wager-pool')?.game;
const ben = pool?.players.find((p) => p.name === 'Ben');
const w = pool?.wagers.find((x) => x.opponent === ben?.id);
ok(!!pool && /^5\+5\+10 · /.test(pool.name) && w?.challenge?.state === 'accepted' && w.scorer === 'by', `a new pool of the day, the duel against Ben counts at once (${pool?.name})`);
ok((await sheet.count()) === 0 && /1 Duell heute/.test(await row.innerText()), `the sheet closed, the row: "${(await row.innerText()).replace(/\s+/g, ' ')}"`);

// in the round: the menu with "Sidebet · 5+5+10"
await P.getByText('Runde starten').click();
await P.waitForTimeout(4000);
await P.locator('.hole-bar-handle').click();
const item = P.locator('.hole-drawer').getByRole('button', { name: /Sidebet · 5\+5\+10/ });
ok((await item.count()) === 1, 'the round\'s menu: "Sidebet · 5+5+10"');
await item.click();
ok((await P.getByRole('dialog', { name: 'Sidebet · 5+5+10' }).count()) === 1, 'its sheet opens in the round');
ok(me.errs.length === 0, `no page errors ${me.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
