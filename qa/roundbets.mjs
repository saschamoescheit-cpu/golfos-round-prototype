// QA (Sascha 01.11.2026: "start a normal round and make one or more bets for this round at the same time"): Rounds
// opens Games' sheet "Wetten für diese Runde" – in the round setup with the players typed there, and on the hole map
// from the hole menu. A new bet there makes a pool for exactly this round. Supabase is simulated (qa/sharesim.mjs).
// Usage: node qa/roundbets.mjs [url]
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
const H = host.p;
await H.getByRole('button', { name: 'Neue Runde' }).click();
await H.waitForTimeout(1200);
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.getByText('Runde starten').waitFor({ timeout: 30000 });
await H.getByRole('button', { name: /A · 9 Löcher/ }).click();
await H.locator('input[id^="name-"]').first().fill('Sascha');
await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await H.locator('input[id^="name-"]').last().fill('Chris');

// 1 · in the setup
const inSetup = H.getByRole('button', { name: 'Wetten für diese Runde' });
await inSetup.waitFor({ timeout: 10000 }).catch(() => {});
ok(await inSetup.isVisible(), 'setup: "Wetten für diese Runde"');
await inSetup.click();
const sheet = H.getByRole('dialog', { name: 'Wetten für diese Runde' });
await sheet.waitFor({ timeout: 8000 }).catch(() => {});
const st = (await sheet.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Golfclub Hetzenhof/.test(st) && /Neue Wette für diese Runde/.test(st), `setup: the sheet for this round – "${st.slice(0, 120)}"`);
await sheet.getByRole('button', { name: 'Schließen' }).first().click();
await H.getByRole('button', { name: 'Runde starten' }).click();
await H.locator('.map-hole-no').waitFor({ timeout: 30000 });

// 2 · on the hole map: from the hole menu, a new bet makes a pool for this round
await H.locator('.hole-bar-handle').click();
await H.locator('.hole-drawer').getByRole('button', { name: 'Wetten für diese Runde' }).click();
await sheet.waitFor({ timeout: 8000 });
await sheet.getByRole('button', { name: 'Neue Wette für diese Runde' }).click();
await H.waitForTimeout(3000);
const pool = [...sim.shared.values()].find((r) => r.game.kind === 'wager-pool');
const names = (pool?.game.players ?? []).map((p) => p.name ?? p).join(', ');
ok(!!pool && pool.owner === 'Sascha', `hole map: a pool for this round on the server, Sascha its host (${pool ? 'yes' : 'none'})`);
ok(/Sascha/.test(names) && /Chris/.test(names), `its players – this phone's first: ${names}`);

ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
