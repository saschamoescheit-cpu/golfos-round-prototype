// QA (Sascha 11.11.2026: "Reihenfolge: Alle, letzte 10, letzte 5. optisch passt es allerdings nicht zu den Facelift
// Änderungen in der App"): the statistics' rounds as the app's switch "‹ Runden ›" (pool, live view) – no block of three
// buttons; the order Alle → Letzte 10 → Letzte 5, "Letzte 5" at first; the numbers follow the pick.
// Usage: node qa/statsrange.mjs [url]
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
const ctx = await b.newContext({ ...devices['iPhone SE'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url);
// seven signed rounds
await p.evaluate((r16) => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  const rounds = Array.from({ length: 7 }, (_, k) => {
    const at = new Date(Date.UTC(2026, 9, 20 - k, 10)).toISOString();
    return { ...r16, id: `${r16.id}-${k}`, createdAt: at, finishedAt: at, signedAt: at };
  });
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rounds));
  sessionStorage.setItem('golfos.module', 'rounds');
}, r16);
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Statistik' }).click();
await p.waitForTimeout(600);
const sw = p.getByRole('group', { name: 'Runden' });
const basis = async () => (await p.locator('main p.muted.small').filter({ hasText: 'geprüften' }).first().innerText()).replace(/\s+/g, ' ');
ok((await sw.locator('.step-pick-now').count()) === 1 && (await p.locator('main .segmented').count()) === 0, 'the rounds as the switch "‹ Runden ›", no block of three buttons');
ok(/Letzte 5/.test(await sw.locator('.step-pick-now').innerText()) && (await sw.getByRole('button', { name: 'Nächste' }).isDisabled()), '"Letzte 5" at first, the last one');
ok(/Aus 5 geprüften/.test(await basis()), `the numbers from 5 rounds (${await basis()})`);
await sw.getByRole('button', { name: 'Vorherige' }).click();
await p.waitForTimeout(300);
ok(/Letzte 10/.test(await sw.locator('.step-pick-now').innerText()) && /Aus 7 geprüften/.test(await basis()), `‹ "Letzte 10" (${await basis()})`);
await sw.getByRole('button', { name: 'Vorherige' }).click();
await p.waitForTimeout(300);
const all = (await sw.locator('.step-pick-now').innerText()).replace(/\s+/g, ' ');
ok(/Alle/.test(all) && /7 Runden/.test(all) && !/von/.test(all) && (await sw.getByRole('button', { name: 'Vorherige' }).isDisabled()), `‹ "Alle · 7 Runden", the first one, no "1 von 3" (${all})`);
await sw.locator('.step-pick-now').click();
const dlg = p.getByRole('dialog', { name: 'Runden' });
await dlg.waitFor();
const names = await dlg.locator('.pick-option strong').allInnerTexts();
ok(names.join('|') === 'Alle|Letzte 10|Letzte 5', `the list: ${names.join(' · ')}`);
await dlg.locator('.pick-option').filter({ hasText: 'Letzte 5' }).click();
await p.waitForTimeout(300);
ok(/Letzte 5/.test(await sw.locator('.step-pick-now').innerText()) && /Aus 5 geprüften/.test(await basis()), 'picked from the list: "Letzte 5"');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
