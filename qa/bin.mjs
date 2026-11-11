// QA: the bin of deleted rounds and the hole preview's drawer (Sascha 15.10.2026).
// node qa/bin.mjs [url] – a deleted round shows under "Deleted rounds", comes back with "Restore", goes for good only
// after "Delete for good"; the preview ends from the drawer like a round.
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
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
ok(await p.getByRole('button', { name: 'Birdiebook', exact: true }).isVisible(), 'setup: "Birdiebook" and "Platzvorschau"');
// no friends yet: a link to link them, right in the setup (night 10./11.11.2026)
{
  const link = p.getByRole('button', { name: /Golffreunde verknüpfen/ });
  ok((await link.count()) === 1, 'setup without friends: "Golffreunde verknüpfen ›"');
  await link.click();
  await p.waitForTimeout(400);
  ok((await p.getByRole('dialog', { name: 'Freunde' }).count()) === 1, 'it opens the friends in a sheet – the setup stays');
  await p.getByRole('dialog', { name: 'Freunde' }).getByRole('button', { name: 'Schließen' }).first().click();
  await p.waitForTimeout(300);
}
// one bar of icons, not a column of text buttons (DESIGN – night 10./11.11.2026)
ok((await p.getByRole('group', { name: 'Vor der Runde' }).locator('.sc-action svg').count()) === 3, 'setup: Birdiebook, Platzvorschau, Runde planen as one bar of icons');
await p.getByRole('button', { name: 'Platzvorschau' }).click();
await p.waitForTimeout(3000);
// the preview opens with the map, the caddie closed (Sascha 21.10.2026) – its hole notes one tap away
ok(!(await p.getByRole('button', { name: 'Lochnotizen' }).isVisible().catch(() => false)), 'preview: the caddie closed at first');
await p.getByRole('button', { name: /^Caddie zeigen/ }).first().click();
await p.waitForTimeout(400);
ok(await p.getByRole('button', { name: 'Lochnotizen' }).isVisible(), 'preview: the caddie button opens it with its hole notes');
await p.getByRole('button', { name: 'Caddie ausblenden' }).last().click();
await p.waitForTimeout(300);
await p.locator('.hole-bar-handle').click();
await p.waitForTimeout(500);
const acts = (await p.locator('.hole-drawer .drawer-action').allInnerTexts()).map((t) => t.trim()).join(' | ');
ok(acts === 'Birdiebook | Pausieren | Beenden', `preview drawer: ${acts}`);
// the birdie book and back to the hole
await p.locator('.hole-drawer').getByRole('button', { name: 'Birdiebook' }).click();
await p.waitForTimeout(1500);
ok(/Birdiebook|1A/.test((await p.locator('main').allInnerTexts()).join(' ')), 'birdie book opens from the preview');
await p.locator('.topbar').getByRole('button').first().click();
await p.waitForTimeout(1500);
ok((await p.locator('.map-hole-no').count()) === 1, 'back from the birdie book on the hole');
// pause: the start page offers to continue
await p.locator('.hole-bar-handle').click();
await p.waitForTimeout(400);
await p.locator('.hole-drawer').getByRole('button', { name: /Vorschau pausieren/ }).click();
await p.waitForTimeout(800);
ok(await p.getByRole('button', { name: 'Vorschau fortsetzen' }).isVisible(), 'paused preview: "Vorschau fortsetzen" on the start page');
await p.getByRole('button', { name: 'Vorschau fortsetzen' }).click();
await p.waitForTimeout(2500);
await p.locator('.hole-bar-handle').click();
await p.waitForTimeout(400);
await p.locator('.hole-drawer').getByRole('button', { name: 'Vorschau beenden' }).click();
await p.waitForTimeout(800);
ok(await p.getByRole('button', { name: 'Runde starten' }).isVisible(), 'finished preview: back in the round setup');
await p.locator('.topbar').getByRole('button').first().click();
await p.waitForTimeout(500);
await p.locator('.topbar').getByRole('button').first().click();
await p.waitForTimeout(800);
ok(!(await p.getByRole('button', { name: 'Vorschau fortsetzen' }).isVisible().catch(() => false)), 'finished preview: gone from the start page');
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.trash.v1') ?? '[]').length)) === 0, 'an ended preview does not go to the bin');

// a round, ended and deleted
await pick();
await p.getByText('Runde starten').click();
await p.waitForTimeout(5000);
const id = await p.evaluate(async () => {
  const S = await import('/src/lib/storage.ts');
  const r0 = S.loadRounds()[0];
  // a played round has a result – one without is listed nowhere (Sascha 18.10.2026)
  const me = r0.players.find((x) => x.isMe).id;
  const r = { ...r0, entries: { ...r0.entries, [me]: r0.entries[me].map((e, k) => (k === 0 ? { ...e, strokes: 5 } : e)) } };
  localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify([[1, 2, 3, 4]]));
  S.saveRound({ ...r, finishedAt: new Date().toISOString() });
  S.saveRound({ ...r, id: r.id + '-kept', finishedAt: new Date().toISOString() }); // one that stays in the list
  S.deleteRound(r.id, true);
  return r.id;
});
await p.goto(url);
await p.waitForTimeout(1500);
await p.locator('.tabbar button', { hasText: 'Runden' }).click();
await p.waitForTimeout(600);
const toggle = p.locator('.tile').filter({ hasText: 'gelöscht' });
ok((await toggle.innerText()).replace(/\s+/g, ' ').trim() === '1 gelöscht', 'Rounds tab: fourth tile "1 gelöscht"');
await toggle.click();
await p.waitForTimeout(300);
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/bin.png' });
ok((await p.locator('ul.list button.list-item:not(.bin-item)').count()) === 0 && (await p.locator('.bin-item').count()) === 1, 'the bin tile shows only the deleted rounds, no others below');
// the row as a played one (03.11.2026), a tap opens its sheet
ok((await p.locator('.bin-item .bin-actions').count()) === 0 && (await p.locator('.bin-item [aria-label="gelöscht"]').count()) === 1, 'the deleted row as a round row: the bin mark, no buttons below it');
await p.locator('.bin-item').first().click();
await p.getByRole('button', { name: 'Wiederherstellen', exact: true }).click();
await p.waitForTimeout(600);
const back = await p.evaluate((rid) => ({ round: JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]').some((r) => r.id === rid), track: localStorage.getItem('golfos.track.v1.' + rid) != null, bin: JSON.parse(localStorage.getItem('golfos.trash.v1') ?? '[]').length }), id);
ok(back.round && back.track && back.bin === 0, 'restored with its GPS track, bin empty');
ok(await p.getByText('Hetzenhof').first().isVisible(), 'round listed again');

// delete for good: needs a second tap
await p.evaluate(async (rid) => (await import('/src/lib/storage.ts')).deleteRound(rid, true), id);
await p.goto(url);
await p.waitForTimeout(1500);
await p.locator('.tabbar button', { hasText: 'Runden' }).click();
await p.locator('.tile').filter({ hasText: 'gelöscht' }).click();
await p.locator('.bin-item').first().click();
await p.getByRole('dialog').getByRole('button', { name: 'Endgültig löschen' }).click();
await p.waitForTimeout(200);
// no question (Sascha 03.11.2026) – gone from the list at once, "Rückgängig" in the toast brings it back
const trashN = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.trash.v1') ?? '[]').length);
ok((await p.locator('.undo-toast').innerText()).includes('Endgültig gelöscht') && (await p.locator('.bin-item').count()) === 0, 'deleted for good: no question, the toast "Endgültig gelöscht · Rückgängig"');
await p.locator('.undo-toast').getByRole('button', { name: 'Rückgängig' }).click();
await p.waitForTimeout(9000);
ok((await trashN()) === 1 && (await p.locator('.bin-item').count()) === 1, '"Rückgängig": back in the bin, still there after the toast');
// swiped all the way: the same, without the sheet
await p.locator('.bin-item').first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  const y = r.top + r.height / 2;
  const fire = (type, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true }));
  fire('pointerdown', r.right - 10);
  for (let x = r.right - 20; x > r.left - 40; x -= 30) fire('pointermove', x);
  fire('pointerup', r.left - 40);
});
await p.waitForTimeout(600);
ok((await p.locator('.bin-item').count()) === 0 && (await p.locator('.undo-toast').innerText()).includes('Endgültig gelöscht'), 'swiped across: gone at once, with "Rückgängig"');
await p.waitForTimeout(9000);
ok((await trashN()) === 0, 'deleted for good once the toast is gone');
// the tile stays, 0 and disabled like 'pausiert' (Sascha 23.10.2026)
const empty = p.locator('.tile').filter({ hasText: 'gelöscht' });
ok((await empty.innerText()).replace(/\s+/g, ' ').trim() === '0 gelöscht' && (await empty.isDisabled()), 'bin tile stays when empty: "0 gelöscht", not tappable');

// several at once (Sascha 01.11.2026): select, tick, delete for good after a second tap; "Alle auswählen"
const binN = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.trash.v1') ?? '[]').length);
const fill = (n) =>
  p.evaluate(async ([rid, n]) => {
    const S = await import('/src/lib/storage.ts');
    const r0 = S.loadRounds().find((r) => r.id === rid + '-kept');
    for (let k = 0; k < n; k++) {
      const nid = `${rid}-many${k}-${Date.now()}`;
      S.saveRound({ ...r0, id: nid });
      S.deleteRound(nid, true);
    }
  }, [id, n]);
const openBin = async () => {
  await p.goto(url);
  await p.waitForTimeout(1500);
  await p.locator('.tabbar button', { hasText: 'Runden' }).click();
  await p.locator('.tile').filter({ hasText: 'gelöscht' }).click();
  await p.waitForTimeout(300);
};
await fill(3);
await openBin();
ok((await binN()) === 3 && (await p.locator('.bin-item').count()) === 3, 'three rounds in the bin');
await p.getByRole('button', { name: 'Auswählen', exact: true }).click();
ok((await p.locator('.bin-check').count()) === 3 && !(await p.getByRole('button', { name: 'Wiederherstellen', exact: true }).first().isVisible().catch(() => false)), 'select: a tick per row, no single buttons');
ok(await p.getByRole('button', { name: '0 löschen' }).isDisabled(), 'nothing ticked: "0 löschen" not tappable');
await p.locator('.bin-check').nth(0).check();
await p.locator('.bin-item').nth(1).locator('.grow').click(); // the row itself ticks it too
ok((await p.locator('.bin-check:checked').count()) === 2, 'ticked by box and by row');
await p.getByRole('button', { name: '2 löschen' }).click();
await p.waitForTimeout(200);
ok((await binN()) === 3 && (await p.getByText('2 endgültig löschen?').isVisible()), '"2 löschen" alone deletes nothing – it asks');
await p.getByRole('button', { name: 'Behalten' }).click();
ok((await binN()) === 3 && (await p.locator('.bin-check:checked').count()) === 2, '"Behalten": nothing gone, still ticked');
await p.getByRole('button', { name: '2 löschen' }).click();
await p.locator('.bin-bar').getByRole('button', { name: 'Endgültig löschen' }).click();
await p.waitForTimeout(400);
ok((await binN()) === 1 && (await p.locator('.bin-item').count()) === 1 && (await p.locator('.bin-check').count()) === 0, 'two deleted for good, one left with its own buttons');
ok((await p.locator('.bin-bar').count()) === 0, 'one left: no "Auswählen"');
await fill(3);
await openBin();
await p.getByRole('button', { name: 'Auswählen', exact: true }).click();
await p.getByRole('button', { name: 'Alle auswählen' }).click();
ok((await p.locator('.bin-check:checked').count()) === 4 && (await p.getByRole('button', { name: 'Keine auswählen' }).isVisible()), '"Alle auswählen" ticks all four');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/bin-many.png' });
await p.getByRole('button', { name: '4 löschen' }).click();
await p.locator('.bin-bar').getByRole('button', { name: 'Endgültig löschen' }).click();
await p.waitForTimeout(400);
ok((await binN()) === 0, 'all deleted for good');
const many = p.locator('.tile').filter({ hasText: 'gelöscht' });
ok((await many.innerText()).replace(/\s+/g, ' ').trim() === '0 gelöscht', 'bin tile back at 0');
ok(await p.evaluate((rid) => JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]').some((r) => r.id === rid + '-kept'), id), 'the round in the list untouched');

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
