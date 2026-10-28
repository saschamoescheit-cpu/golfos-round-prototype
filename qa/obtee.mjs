// QA (Sascha 28.10.2026): out of bounds off the tee in the round check – the next shot is a tee shot again (stroke and
// distance), to edit like any shot; also when the spot where the ball went out is skipped.
// Usage: node qa/obtee.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate((exp) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  const r = { ...exp.round, signedAt: null, capture: 'full' };
  const me = r.players.find((x) => x.isMe).id;
  // the first hole without any penalty
  const e0 = r.entries[me][0];
  r.entries[me][0] = { ...e0, penalties: 0, detail: { ...e0.detail, shots: e0.detail.shots.map((s) => ({ ...s, penalty: false, penaltyKind: undefined, replay: undefined, missPos: null })) } };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
  localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify(exp.track.map((x) => [x.t, x.p[0], x.p[1], x.acc, ...(x.open ? [1] : [])])));
}, exp);
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(3000);
const shots = () =>
  p.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
    const me = r.players.find((x) => x.isMe).id;
    return r.entries[me][0].detail.shots;
  });
const d = (a, b) => Math.hypot((a[0] - b[0]) * 70000, (a[1] - b[1]) * 111000);
const before = await shots();

// the tee shot: out of bounds, again from here – then the spot skipped
await p.locator('.review-list li[data-shot="0"] .shot-row').click();
await p.waitForTimeout(300);
await p.getByRole('group', { name: 'Strafschlag' }).getByRole('button', { name: 'Aus' }).click();
await p.getByRole('button', { name: /^Speichern/ }).last().click();
await p.waitForTimeout(600);
ok(/ins Aus ging/.test((await p.locator('main').allInnerTexts()).join(' ')), 'then: tap the map where it went out of bounds');
await p.getByRole('button', { name: 'Überspringen' }).click();
await p.waitForTimeout(500);
let sh = await shots();
ok(sh.length === before.length + 1, `skipped: one shot more (${before.length} → ${sh.length})`);
ok(sh[0].penalty && sh[0].penaltyKind === 'ob' && !sh[1].penalty && sh[1].lie === 'tee' && d(sh[1].pos, sh[0].pos) < 1, `shot 2 is a tee shot again from the same tee (lie ${sh[1].lie}, ${sh[1].pos && sh[0].pos ? Math.round(d(sh[1].pos, sh[0].pos)) : '?'} m)`);
ok(d(sh[2].pos, before[1].pos) < 1, 'the old shot 2 is shot 3 now');
// it opens and changes like any shot
await p.locator('.review-list li[data-shot="1"] .shot-row').click();
await p.waitForTimeout(300);
ok((await p.getByRole('group', { name: 'Lage' }).getByRole('button', { name: 'Tee' }).getAttribute('aria-pressed')) === 'true', 'its sheet opens: lie "Tee"');
const club = p.getByRole('group', { name: 'Schläger' }).getByRole('button').first();
const code = (await club.innerText()).split('\n')[0].trim();
await club.click();
await p.getByRole('button', { name: /^Speichern/ }).last().click();
await p.waitForTimeout(500);
sh = await shots();
ok(sh[1].club != null && sh.length === before.length + 1, `the new tee shot keeps its club (${code} → ${sh[1].club}), no shot added`);

// the spot placed afterwards: no second tee shot
await p.locator('.review-list li[data-shot="0"] .shot-row').click();
await p.waitForTimeout(300);
await p.getByRole('button', { name: /^Speichern/ }).last().click();
await p.waitForTimeout(600);
if (/ins Aus ging/.test((await p.locator('main').allInnerTexts()).join(' '))) {
  const map = await p.locator('.maplibregl-canvas').first().boundingBox();
  await p.mouse.click(map.x + map.width * 0.8, map.y + map.height * 0.3);
  await p.waitForTimeout(800);
}
sh = await shots();
ok(sh.length === before.length + 1 && sh.filter((s) => s.lie === 'tee').length === 2, `saved again and the spot placed: still one new tee shot (${sh.length} shots, ${sh.filter((s) => s.lie === 'tee').length} from the tee)`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
