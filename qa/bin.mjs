// QA: the bin of deleted rounds and the hole preview's drawer (Sascha 15.10.2026).
// node qa/bin.mjs [url] – a deleted round shows under "Deleted rounds", comes back with "Restore", goes for good only
// after "Delete for good"; the preview ends from the drawer like a round.
import { webkit, devices } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1500);

const pick = async () => {
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.waitForTimeout(2000);
  await p.locator('button.list-item').first().click();
  await p.waitForTimeout(1200);
};

// preview: pull up the drawer, end the preview there
await pick();
await p.getByRole('button', { name: 'Löcher ansehen – ohne Runde' }).click();
await p.waitForTimeout(3000);
await p.locator('.hole-bar-handle').click();
await p.waitForTimeout(500);
ok(await p.getByRole('button', { name: 'Vorschau beenden' }).isVisible(), 'preview drawer has "Vorschau beenden"');
await p.getByRole('button', { name: 'Vorschau beenden' }).click();
await p.waitForTimeout(800);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.trash.v1') ?? '[]').length)) === 0, 'an ended preview does not go to the bin');

// a round, ended and deleted
await pick();
await p.getByText('Runde starten').click();
await p.waitForTimeout(5000);
const id = await p.evaluate(async () => {
  const S = await import('/src/lib/storage.ts');
  const r = S.loadRounds()[0];
  localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify([[1, 2, 3, 4]]));
  S.saveRound({ ...r, finishedAt: new Date().toISOString() });
  S.deleteRound(r.id, true);
  return r.id;
});
await p.goto(url);
await p.waitForTimeout(1500);
await p.locator('.tabbar button', { hasText: 'Runden' }).click();
await p.waitForTimeout(600);
const toggle = p.getByRole('button', { name: /Gelöschte Runden \(1\)/ });
ok(await toggle.isVisible(), 'Rounds tab shows "Gelöschte Runden (1)"');
await toggle.click();
await p.waitForTimeout(300);
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/bin.png' });
await p.getByRole('button', { name: 'Wiederherstellen' }).click();
await p.waitForTimeout(600);
const back = await p.evaluate((rid) => ({ round: JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]').some((r) => r.id === rid), track: localStorage.getItem('golfos.track.v1.' + rid) != null, bin: JSON.parse(localStorage.getItem('golfos.trash.v1') ?? '[]').length }), id);
ok(back.round && back.track && back.bin === 0, 'restored with its GPS track, bin empty');
ok(await p.getByText('Hetzenhof').first().isVisible(), 'round listed again');

// delete for good: needs a second tap
await p.evaluate(async (rid) => (await import('/src/lib/storage.ts')).deleteRound(rid, true), id);
await p.goto(url);
await p.waitForTimeout(1500);
await p.locator('.tabbar button', { hasText: 'Runden' }).click();
await p.getByRole('button', { name: /Gelöschte Runden/ }).click();
await p.getByRole('button', { name: 'Endgültig löschen' }).click();
await p.waitForTimeout(200);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.trash.v1') ?? '[]').length)) === 1, 'the ✕ alone deletes nothing');
await p.getByRole('button', { name: 'Endgültig löschen' }).last().click();
await p.waitForTimeout(400);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.trash.v1') ?? '[]').length)) === 0, 'deleted for good after confirming');
ok(!(await p.getByRole('button', { name: /Gelöschte Runden/ }).isVisible().catch(() => false)), 'bin row gone when empty');

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
