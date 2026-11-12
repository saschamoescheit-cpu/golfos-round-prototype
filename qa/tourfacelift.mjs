// QA (Facelift-Abnahme 11.11.2026, Sascha: "Passt") – the tournaments' pages in the one look of the app:
// T7 · a series' and a tournament's actions one bar of icons: Teilen · CSV · the red one last (Auflösen / Löschen); the CSV
//      the standing as a list, Teilen the leaderboard as text
// T8 · "Serie auflösen?" the one confirmation: head with ✕, the red-outlined action, "Zurück" – never a red fill, no "Abbrechen"
// O4 · no connection: a green line, never a red error (the user did nothing wrong)
// T10 · no green card "Am Turniertag" – over, the line is gone too
// Supabase simulated (qa/sharesim.mjs), the app real. Usage: node qa/tourfacelift.mjs [url]
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
const day = (n) =>
  H.evaluate((n) => {
    const d = new Date(Date.now() + n * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, n);
const flights = [{ teeTime: '09:00', players: [{ name: 'Sascha', playingHandicap: 4 }, { name: 'Erik', playingHandicap: 8 }] }];
const fmt = { mode: 'single', scoring: 'stroke', allowance: 0 };
const played = await sim.plan(H, { name: 'Celebration', date: await day(-1), flights, format: fmt });
const next = await sim.plan(H, { name: 'Orlando', date: await day(2), flights, format: fmt });
const code = sim.series('Sascha', 'USA-Serie', [played, next]);
// yesterday played out: Sascha one over on the first two holes, Erik level
const row = sim.shared.get(played);
const own = [...sim.shared.values()].filter((r) => r.event_code === played);
for (const f of [...Object.values(row.game.flights), ...own.map((r) => r.game.flight)]) {
  const n = row.game.holes.length;
  f.scores = Object.fromEntries(f.players.map((p) => [p.id, Array.from({ length: n }, (_, i) => ({ s: row.game.holes[i].par + (p.name === 'Sascha' && i < 2 ? 1 : 0) }))]));
}
for (const r of [row, ...own]) r.updated_at = new Date().toISOString();
// the share sheet caught: what would go to WhatsApp
await H.addInitScript(() => {
  window.__shared = null;
  navigator.share = async (d) => {
    window.__shared = d;
  };
  navigator.canShare = () => false; // the CSV as a download here
});

await H.evaluate(() => sessionStorage.setItem('golfos.module', 'tournaments'));
await H.reload();
await H.waitForTimeout(2500);
await H.getByRole('button', { name: 'Turniere' }).first().click();
await H.waitForTimeout(1500);
await H.locator('.tour-series-row').filter({ hasText: 'USA-Serie' }).first().click({ timeout: 8000 });
await H.waitForTimeout(3000);

// T7 · the series' bar
const bar = H.getByRole('group', { name: 'Diese Serie' });
const words = (await bar.locator('.sc-action').allInnerTexts()).map((t) => t.trim());
ok(words.join('|') === 'Teilen|CSV|Auflösen' && (await bar.locator('.sc-action svg').count()) === 3 && /danger/.test(await bar.locator('.sc-action').last().getAttribute('class')), `the series: one bar ${words.join(' · ')} – Auflösen red and last`);
ok((await H.locator('main .btn-secondary, main .btn-primary').filter({ hasText: /CSV|Auflösen|Löschen/ }).count()) === 0, 'no text buttons for these');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tourfacelift-series.png', fullPage: true });
const [dl] = await Promise.all([H.waitForEvent('download', { timeout: 8000 }).catch(() => null), bar.getByRole('button', { name: 'Ergebnisliste (CSV)' }).click()]);
const csv = dl ? await dl.createReadStream().then(async (st) => { let t = ''; for await (const c of st) t += c; return t; }) : '';
const lines = csv.replace(/^﻿/, '').split('\n');
ok(/"USA-Serie";"Gesamtwertung"/.test(lines[0] ?? '') && /"Platz";"Spieler";"R1";"R2";"Zu Par";"Runden"/.test(lines[1] ?? '') && /^"1";"Erik";"0";"";"0";"1"$/.test(lines[2] ?? '') && /^"2";"Sascha";"2";"";"2";"1"$/.test(lines[3] ?? ''), `CSV: the total by round (${lines.slice(0, 4).join(' / ') || 'no download'})`);
await bar.getByRole('button', { name: 'Ergebnis teilen' }).click();
await H.waitForTimeout(500);
const sent = await H.evaluate(() => window.__shared?.text ?? '');
ok(sent === 'USA-Serie · Gesamtwertung\n1. Erik Par · auf 1 Runde\n2. Sascha +2 · auf 1 Runde', `Teilen: the total as text (${sent.replace(/\n/g, ' / ')})`);

// T8 · "Serie auflösen?" – the one confirmation
await bar.getByRole('button', { name: 'Serie auflösen' }).click();
const ask = H.locator('.confirm-sheet');
await ask.waitFor({ timeout: 5000 }).catch(() => {});
const act = ask.getByRole('button', { name: 'Serie auflösen' });
const cls = await act.getAttribute('class').catch(() => '');
ok(
  (await ask.locator('.sheet-head strong').innerText().catch(() => '')) === '„USA-Serie“ auflösen?' && (await ask.locator('.sheet-head').getByRole('button', { name: 'Schließen' }).count()) === 1 && /btn-danger/.test(cls) && !/fill/.test(cls) && (await ask.getByRole('button', { name: 'Zurück' }).count()) === 1 && (await ask.getByRole('button', { name: 'Abbrechen' }).count()) === 0,
  `"„USA-Serie“ auflösen?": head with ✕, red outline (${cls}), "Zurück"`,
);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tourfacelift-confirm.png' });
await ask.getByRole('button', { name: 'Schließen' }).click();
ok((await H.locator('.confirm-sheet').count()) === 0 && !sim.shared.get(code).game.deletedAt, '✕: closed, nothing changed');

// O4 · no connection: green, not red
await H.context().route(/supabase\.co\/rest\//, (r) => r.abort());
await bar.getByRole('button', { name: 'Serie auflösen' }).click();
await H.locator('.confirm-sheet').getByRole('button', { name: 'Serie auflösen' }).click();
await H.waitForTimeout(1500);
const note = H.locator('main [role="status"]').filter({ hasText: 'Keine Verbindung' });
const color = await note.evaluate((e) => getComputedStyle(e).color).catch(() => '');
const brand = await H.evaluate(() => { const s = document.createElement('span'); s.className = 'good-text'; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; });
ok((await note.count()) === 1 && color === brand && (await H.locator('main .bad-text').count()) === 0 && (await H.getByRole('alert').count()) === 0 && !sim.shared.get(code).game.deletedAt, `offline: "Keine Verbindung …" green (${color}), no red alert, the series kept`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tourfacelift-offline.png', fullPage: true });
await H.context().unroute(/supabase\.co\/rest\//);

// online again: dissolved – back to the list, its rounds single tournaments
await bar.getByRole('button', { name: 'Serie auflösen' }).click();
await H.locator('.confirm-sheet').getByRole('button', { name: 'Serie auflösen' }).click();
await H.waitForTimeout(2500);
ok(!!sim.shared.get(code).game.deletedAt && (await H.locator('h1.tab-title').innerText().catch(() => '')) === 'Turniere', 'confirmed: the series dissolved, back to the list');

// T7 / T10 · the tournament played: Teilen · CSV · Löschen, no card "Am Turniertag" – over, no line either
await H.locator('.list-item').filter({ hasText: 'Celebration' }).first().click();
await H.waitForTimeout(2500);
const tbar = H.getByRole('group', { name: 'Dieses Turnier' });
const tw = (await tbar.locator('.sc-action').allInnerTexts()).map((t) => t.trim());
ok(tw.join('|') === 'Teilen|CSV|Löschen' && /danger/.test(await tbar.locator('.sc-action').last().getAttribute('class')), `the tournament: one bar ${tw.join(' · ')}`);
ok((await H.locator('section.key-hint').count()) === 0 && (await H.locator('.tour-howto').count()) === 0, 'played: no card, no line "Am Turniertag"');
// the planned one: the line, quiet
await H.getByRole('button', { name: 'Turniere' }).first().click();
await H.waitForTimeout(1000);
await H.locator('.list-item').filter({ hasText: 'Orlando' }).first().click();
await H.waitForTimeout(2500);
const pw = (await H.getByRole('group', { name: 'Dieses Turnier' }).locator('.sc-action').allInnerTexts()).map((t) => t.trim());
ok(pw.join('|') === 'Löschen' && (await H.locator('.tour-howto').count()) === 1 && (await H.locator('section.key-hint').count()) === 0, `planned: only "Löschen" (nothing to share yet), the line "Am Turniertag" (${pw.join(' · ')})`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tourfacelift-planned.png', fullPage: true });

ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
