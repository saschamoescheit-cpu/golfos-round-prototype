// QA (Sascha 11.11.2026: "Wenn was erstmalig neu angelegt wird, brauchen wir unten rechts einen schwebenden
// Speicherbutton. Aber wenn nachträglich was bearbeitet wird, haben wir die automatische Speicherung und brauchen keine
// Speicherbuttons mehr."): "Neue Wette" (the pool's setup) saves with the round green tick bottom right, no
// "Pool anlegen" button at the end; the pool page has no "Speichern" in its bar; the series renamed and the bag changed
// show no "Speichern" – a quiet line, the bag's tick only "Fertig".
// Usage: node qa/savebuttons.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const day = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const now = new Date().toISOString();
const me = 'acc-sascha';
const token = `h.${Buffer.from(JSON.stringify({ sub: me })).toString('base64url')}.s`;
const pool = {
  kind: 'wager-pool', id: 'pool-usa', name: 'USA-Wetten', from: day(-1), to: day(5), createdAt: now, currency: 'EUR',
  players: [{ id: 'p0', name: 'Sascha' }, { id: 'p1', name: 'Chris' }], wagers: [], progress: {},
};
const course = { id: 'c1', name: 'Celebration Golf Club' };
const series = { kind: 'tour-series', id: 's1', name: 'USA-Serie', createdAt: now, rounds: [{ code: 'TOURA', date: day(1), name: 'Tag 1', course }, { code: 'TOURB', date: day(2), name: 'Tag 2', course }] };
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(({ pl, se, me, token }) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '10', homeClub: '' }));
  localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: token, refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: 'sascha@test', name: 'Sascha' }));
  localStorage.setItem('golfos.pools.v1', JSON.stringify([{ code: 'USA1', pool: pl, me: 'p0', owner: me }]));
  localStorage.setItem('golfos.tourseries.v1', JSON.stringify([{ code: 'SER1', series: se, owner: me }]));
  sessionStorage.setItem('golfos.module', 'games');
}, { pl: pool, se: series, me, token });
await p.reload();
await p.waitForTimeout(1500);
const tab = async (name) => {
  await p.locator('.tabbar button').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).click();
  await p.waitForTimeout(500);
};

// 1 · new: the pool's setup – the round green tick bottom right, no "Pool anlegen" at the end
await tab('Wetten');
await p.locator('.fab-stack').getByRole('button', { name: 'Neue Wette', exact: true }).click();
await p.waitForTimeout(500);
const save = p.locator('.fab-stack .fab-save').and(p.getByRole('button', { name: 'Pool anlegen', exact: true }));
ok((await save.count()) === 1 && (await save.isDisabled()), 'new pool: the floating tick "Pool anlegen" – locked until "Worum" is chosen');
ok((await p.locator('main .btn-primary').filter({ hasText: 'Pool anlegen' }).count()) === 0, 'new pool: no "Pool anlegen" button at the end of the page');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/savebuttons-poolsetup.png' });
await p.getByRole('button', { name: 'Zurück', exact: true }).first().click();
await p.waitForTimeout(500);

// 2 · edit: the pool page – no "Speichern" in its bar (every change is on the server at once)
await p.getByText('USA-Wetten').first().click();
await p.waitForTimeout(1500);
ok((await p.getByRole('button', { name: 'Speichern', exact: true }).count()) === 0, 'the pool page: no "Speichern"');
if (await p.locator('.fab-pen').count()) {
  ok((await p.getByRole('button', { name: 'Pool beenden' }).count()) === 1, 'the pool page: "Pool beenden" stays in the bar');
  await p.locator('.fab-pen').click();
  const edit = p.getByRole('dialog', { name: 'Pool bearbeiten' });
  await edit.waitFor({ timeout: 3000 }).catch(() => {});
  ok((await edit.getByRole('button', { name: 'Speichern', exact: true }).count()) === 0 && (await edit.locator('.autosave-note').count()) === 1, 'the pool changed: no "Speichern", the quiet line');
  await p.getByRole('button', { name: 'Fertig', exact: true }).click(); // saves by itself: "Fertig" (13.11.2026)
  await p.waitForTimeout(300);
} else console.log('· pool: this phone is not the host here – its bar not checked');

// 3 · edit: the series renamed – saved by itself
await p.evaluate(() => sessionStorage.setItem('golfos.module', 'tournaments'));
await p.reload();
await p.waitForTimeout(1500);
await tab('Turniere');
await p.locator('.list-item, .tour-series-row').filter({ hasText: 'USA-Serie' }).first().click();
await p.waitForTimeout(1200);
const pen = p.locator('.fab-stack').getByRole('button', { name: 'Serie umbenennen' });
if (await pen.count()) {
  await pen.click();
  const ren = p.getByRole('dialog', { name: 'Serie umbenennen' });
  await ren.waitFor({ timeout: 3000 }).catch(() => {});
  ok((await ren.count()) === 1 && (await ren.getByRole('button', { name: 'Speichern' }).count()) === 0 && (await p.locator('.fab-save').count()) === 0, 'the series renamed: no "Speichern" – no button at all');
  ok(/von selbst gespeichert/.test(await ren.locator('.autosave-note').innerText().catch(() => '')), 'the series renamed: "Änderungen werden von selbst gespeichert"');
  await ren.getByRole('button', { name: 'Schließen' }).click();
  await p.waitForTimeout(300);
} else ok(false, 'the series: the host\'s pencil "Serie umbenennen"');

// 4 · edit: the bag – saved at once, the floating tick only "Fertig"
await p.evaluate(() => sessionStorage.setItem('golfos.module', 'rounds'));
await p.reload();
await p.waitForTimeout(1500);
await tab('Profil');
await p.locator('.settings-row').filter({ hasText: 'Mein Bag' }).click();
await p.waitForTimeout(500);
await p.getByRole('button', { name: 'Bag bearbeiten' }).click();
await p.waitForTimeout(300);
ok((await p.getByRole('button', { name: /speichern/i }).count()) === 0, 'the bag changed: no save button');
ok((await p.locator('.fab-stack .fab-save').and(p.getByRole('button', { name: 'Fertig', exact: true })).count()) === 1, 'the bag changed: the floating tick "Fertig" ends the editing');

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
