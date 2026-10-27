// A whole game played through on the map (night 18./19.10.2026, Sascha: "play all game forms through on a real round"):
// Chicago with four, for money with a press, and skins with three and carried-over holes – every hole of the loop
// scored in the score sheet, finished, then the stored game recomputed on its own: the scores are the ones typed, the
// winner and the payments on the result are the ones the rules give, and the money adds up to nothing.
// Usage: node qa/gameround.mjs [url]
import { webkit, devices } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
// the rules as the app has them, bundled for node
const out = join(mkdtempSync(join(tmpdir(), 'golfos-')), 'gameforms.mjs');
execFileSync(process.execPath, ['node_modules/esbuild/bin/esbuild', 'src/lib/gameforms.ts', '--bundle', '--platform=node', '--format=esm', `--outfile=${out}`, '--log-level=error']);
const { standingOf, transfers } = await import(pathToFileURL(out).href);

const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => { if (!cond) bad++; console.log(`${cond ? '✓' : '✗'} ${what}`); };
const euro = (v) => v.toFixed(2).replace('.', ',') + ' €';

await p.goto(url);
await p.waitForTimeout(1500);
await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); localStorage.setItem('golfos.tip.shots.v1', '1'); sessionStorage.setItem('golfos.module', 'games'); });
await p.reload();
await p.waitForTimeout(1200);

/** each player's strokes against par on a hole: 0 par, -1 birdie, 2 double */
const scores = async (deltas) => {
  await p.locator('.map-score').click();
  await p.waitForTimeout(250);
  const blocks = p.locator('.score-player');
  for (let k = 0; k < deltas.length; k++) {
    const blk = blocks.nth(k);
    await blk.getByRole('button', { name: /Schläge plus eins/ }).click(); // the first tap is par
    for (let j = 0; j < Math.abs(deltas[k]); j++) await blk.getByRole('button', { name: deltas[k] > 0 ? /Schläge plus eins/ : /Schläge minus eins/ }).click();
  }
  await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
};
const nextHole = async () => {
  await p.locator('.hole-bar').getByRole('button', { name: 'Nächstes Loch' }).click();
  await p.waitForTimeout(450);
};
const setup = async (form, names) => {
  await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();
  await p.getByRole('button', { name: 'Neues Spiel' }).click();
  await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
  await p.locator('.pick-option').filter({ has: p.locator('strong', { hasText: new RegExp(`^${form}$`) }) }).click();
  for (let k = 1; k < names.length; k++) {
    if ((await p.locator('.game-player-row').count()) <= k) await p.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
    await p.locator('.game-player-row').nth(k).locator('input').first().fill(names[k]);
  }
  await p.locator('.settings-row').filter({ hasText: 'Platz' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.waitForTimeout(2000);
  await p.locator('button.list-item').first().click();
  await p.waitForTimeout(800);
  // the A loop, nine holes
  const loop = p.locator('.choice-loop').filter({ hasText: /^A/ });
  if (await loop.count()) await loop.first().click();
};
const finish = async () => {
  await p.locator('.hole-bar-handle').click();
  await p.locator('.hole-drawer').getByRole('button', { name: 'Spiel beenden' }).click();
  await p.getByRole('button', { name: /Speichern & beenden/ }).click();
  await p.waitForTimeout(400);
};
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.games.v1')).find((g) => g.finishedAt && !g.checkedByTest));
const check = async (label, plan) => {
  const g = await stored();
  await p.evaluate((id) => {
    const gs = JSON.parse(localStorage.getItem('golfos.games.v1'));
    localStorage.setItem('golfos.games.v1', JSON.stringify(gs.map((x) => (x.id === id ? { ...x, checkedByTest: true } : x))));
  }, g.id);
  ok(g.holes.length === plan.length, `${label}: ${g.holes.length} holes played, ${plan.length} planned`);
  const typed = g.players.every((pl, k) => g.holes.every((h, i) => g.scores[pl.id][i] === h.par + plan[i][k]));
  ok(typed, `${label}: every score stored as typed on the map (${g.players.length} × ${g.holes.length})`);
  const st = standingOf(g);
  const top = st.rows[0];
  const winner = (await p.locator('.game-winner strong').innerText()).trim();
  ok(winner.includes(top.name), `${label}: the winner on the result is the rules' winner (${winner} · ${top.name})`);
  if (st.money) {
    const sum = Object.values(st.money).reduce((a, v) => a + v, 0);
    ok(Math.abs(sum) < 0.011, `${label}: the money adds up to nothing (${sum.toFixed(2)})`);
    const want = transfers(st.money).map((t) => `${st.rows.find((r) => r.id === t.from)?.name} → ${st.rows.find((r) => r.id === t.to)?.name} ${euro(t.amount)}`);
    const shown = (await p.locator('.game-pays li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
    // "12 €" or "8,60 €": compared as numbers
    const num = (t) => Number((t.match(/(\d+(?:,\d+)?)\s*€/)?.[1] ?? 'NaN').replace(',', '.'));
    const match = want.length === shown.length && want.every((w) => { const who = w.split(' '); return shown.some((s) => s.includes(who[0]) && s.includes(who[2]) && Math.abs(num(s) - num(w)) < 0.005); });
    ok(match, `${label}: the payments on the result are the rules' payments (${shown.join(' | ') || 'none'})`);
  }
  return { g, st };
};

// --- Chicago, four players, gross, for money with presses: Ich & partner by rotation against the other two
const CHI = [
  [0, 1, 0, 1], [1, 0, 2, -1], [0, 0, 1, 1], [2, 1, 0, 0], [-1, 1, 1, 2], [0, 2, 0, 1], [1, 1, 1, 0], [0, -1, 2, 1], [1, 0, 0, 0],
];
await setup('Chicago', ['Ich', 'Ben', 'Chris', 'Anna']);
await p.locator('.game-setting').filter({ hasText: 'Vorgabe (WHS)' }).getByRole('button', { name: 'Ohne (brutto)' }).click();
await p.locator('.game-setting').filter({ hasText: 'Höchsteinsatz' }).getByRole('button', { name: '1,60 €' }).click();
await p.getByRole('button', { name: 'Spiel starten' }).click();
await p.waitForTimeout(4500);
const nHoles = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.games.v1'))[0].holes.length);
const chi = Array.from({ length: nHoles }, (_, i) => CHI[i % CHI.length]);
let pressed = 0;
for (let i = 0; i < chi.length; i++) {
  // at the start of the fifth and the eighth hole, before the first score, the one behind presses
  if (i === 4 || i === 7) {
    await p.locator('.game-bar').click();
    await p.waitForTimeout(250);
    const press = p.locator('.game-sheet .chip').filter({ hasText: /presst \(×2\)/ });
    if (await press.count()) { await press.first().click(); pressed++; }
    await p.locator('.game-sheet').getByRole('button', { name: 'Schließen' }).click();
  }
  await scores(chi[i]);
  if (i < chi.length - 1) await nextHole();
}
await finish();
const c = await check(`Chicago · ${nHoles} holes`, chi);
ok((c.g.presses?.length ?? 0) === pressed && pressed > 0, `Chicago: ${pressed} press(es) made on the map and counted`);
await p.locator('.sign-card').getByRole('button', { name: 'Bestätigen' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.sign-card').innerText()).includes('Ergebnis bestätigt'), 'Chicago: the result confirmed');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/gameround-chicago.png', fullPage: true });
await p.getByRole('button', { name: 'Spiele' }).click();

// --- Skins, three players: ties carry the skin to the next hole
const SK = [[0, 0, 0], [0, 1, -1], [1, 1, 0], [0, 0, 0], [0, 0, 0], [-1, 0, 1], [2, 0, 0], [0, 0, 1], [1, 1, 1]];
await setup('Skins', ['Ich', 'Ben', 'Chris']);
await p.getByRole('button', { name: 'Spiel starten' }).click();
await p.waitForTimeout(4500);
const nSk = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.games.v1')).find((g) => !g.finishedAt).holes.length);
const sk = Array.from({ length: nSk }, (_, i) => SK[i % SK.length]);
for (let i = 0; i < sk.length; i++) {
  await scores(sk[i]);
  if (i < sk.length - 1) await nextHole();
}
await finish();
const s = await check(`Skins · ${nSk} holes`, sk);
const pts = s.st.rows.reduce((a, r) => a + r.points, 0);
ok(pts > 0 && pts <= nSk, `Skins: ${pts} skins won over ${nSk} holes, ties carried`);
await p.getByRole('button', { name: 'Spiele' }).click();
await p.waitForTimeout(300);
ok((await p.locator('ul.list .list-item').count()) === 2, 'both games in the list');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
