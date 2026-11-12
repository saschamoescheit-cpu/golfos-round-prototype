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
await P.getByRole('button', { name: 'Spieler hinzufügen' }).click();
await P.getByLabel('Spieler 2', { exact: true }).fill('Ben');
const eyebrows = (await P.locator('main .eyebrow').allInnerTexts()).map((t) => t.trim().toUpperCase());
const at = (x) => eyebrows.indexOf(x);
// Facelift 11.11.2026 (r9): Wer (Spieler → Mitspieler einladen → Score-Erfassung) → Worum (the side bet) → Einstellungen
const wer = Math.max(at('SPIELER'), at('MITSPIELER EINLADEN'), at('SCORE-ERFASSUNG'));
ok(at('WORUM') === wer + 1 && at('EINSTELLUNGEN') === at('WORUM') + 1 && at('SPIELER') < at('WORUM'), `the setup: the side bet under "Worum", after the players and the invitation (${eyebrows.join(' · ')})`);
const row = P.locator('.settings-row').filter({ hasText: /^Sidebet/ });
ok(/Hinzufügen/.test(await row.innerText()), 'its row: "Sidebet · Hinzufügen"');
await row.click();
const sheet = P.getByRole('dialog', { name: 'Sidebet' });
// the game form first (Sascha 10.11.2026: "choose the game forms – the list fits")
await sheet.locator('.settings-row').filter({ hasText: /^Spielform/ }).click();
const forms = (await P.getByRole('dialog', { name: 'Spielform wählen' }).locator('.pick-option strong').allInnerTexts()).join('|');
ok(forms === '5+5+10|Skins|Nassau|Lochspiel|Stableford-Duell', `the side bet's forms: ${forms}`);
await P.getByRole('dialog', { name: 'Spielform wählen' }).locator('.pick-option').filter({ hasText: /^5\+5\+10/ }).first().click();
await sheet.locator('.settings-row').filter({ hasText: 'Gegner' }).click();
const who = P.getByRole('dialog', { name: 'Gegner' });
ok((await who.getByText('In deiner Runde').count()) === 1 && (await who.getByRole('checkbox', { name: /^Ben/ }).count()) === 1, 'the opponents: Ben "In deiner Runde"');
await who.getByRole('checkbox', { name: /^Ben/ }).click();
await who.getByRole('button', { name: 'Fertig' }).click();
await sheet.getByRole('button', { name: 'Herausfordern' }).click();
await P.waitForTimeout(2500);
const pool = [...sim.shared.values()].find((r) => r.game.kind === 'wager-pool')?.game;
const ben = pool?.players.find((p) => p.name === 'Ben');
const w = pool?.wagers.find((x) => x.opponent === ben?.id);
ok(!!pool && /^5\+5\+10 · /.test(pool.name) && w?.challenge?.state === 'accepted' && w.scorer === 'by', `a new pool of the day, the duel against Ben counts at once (${pool?.name})`);
ok((await sheet.count()) === 0 && /1 Duell 5\+5\+10/.test(await row.innerText()), `the sheet closed, the row: "${(await row.innerText()).replace(/\s+/g, ' ')}"`);
// a second side bet: Skins with Ben – judged from the round's strokes
await row.click();
await sheet.locator('.settings-row').filter({ hasText: /^Spielform/ }).click();
await P.getByRole('dialog', { name: 'Spielform wählen' }).locator('.pick-option').filter({ hasText: /^Skins/ }).first().click();
ok((await sheet.getByRole('checkbox', { name: /^Sascha/ }).getAttribute('aria-checked')) === 'true' && (await sheet.getByRole('checkbox', { name: /^Ben/ }).getAttribute('aria-checked')) === 'true', 'Skins: the round\'s players chosen, the own one too');
await sheet.getByRole('button', { name: 'Skins starten' }).click();
ok((await sheet.count()) === 0 && /Skins/.test(await row.innerText()), `Skins kept with the round: "${(await row.innerText()).replace(/\s+/g, ' ')}"`);

// in the round: the menu with "Sidebet · 5+5+10"
await P.getByText('Runde starten').click();
await P.waitForTimeout(4000);
await P.locator('.hole-bar-handle').click();
const item = P.locator('.hole-drawer').getByRole('button', { name: /^Sidebet/ });
ok((await item.count()) === 1, 'the round\'s menu: "Sidebet"');
await item.click();
ok((await P.getByRole('dialog', { name: 'Sidebet' }).count()) === 1, 'its sheet opens in the round');
await P.getByRole('dialog', { name: 'Sidebet' }).getByRole('button', { name: 'Schließen' }).first().click();
const bound = await P.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((x) => !x.finishedAt);
  return (JSON.parse(localStorage.getItem('golfos.sidegames.v1') ?? '[]')).map((s) => s.round === r.id);
});
ok(bound.length === 1 && bound[0], 'Skins bound to the round started');
// the leaderboard of the round with a tab "Wetten" (Sascha 10.11.2026): the bets of the day, the duel against Ben
await P.locator('.hole-bar-handle').click();
await P.locator('.hole-drawer').getByRole('button', { name: /^Leaderboard/ }).click();
const board = P.getByRole('dialog', { name: 'Leaderboard' });
const tabs = (await board.getByRole('group', { name: 'Anzeigen' }).getByRole('button').allInnerTexts()).join('|');
ok(tabs === 'Leaderboard|Wetten', `the round's leaderboard: tabs ${tabs}`);
await board.getByRole('button', { name: 'Wetten' }).click();
await P.waitForTimeout(1500);
const bets = (await board.locator('.pool-standings').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/5\+5\+10/.test(bets) && /Ben/.test(bets), `"Wetten": the standing with the duel against Ben (${bets.slice(0, 120)})`);
const skins = (await board.locator('.game-standing').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Sascha/.test(skins) && /Ben/.test(skins), `"Wetten": the Skins' standing too (${skins.slice(0, 120)})`);
ok(me.errs.length === 0, `no page errors ${me.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
