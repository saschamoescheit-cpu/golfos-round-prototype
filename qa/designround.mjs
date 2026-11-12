// QA (Sascha 11.11.2026, design rounds 2–4 – "Heute" with the small changes): no slider anywhere – a yes/no is a row
// with "An"/"Aus" and its sheet, a list of several is ticked; the profile's golf settings as rows ("Tee", "Distanzen in",
// "Du spielst", "Währung"); the chosen option of a sheet exactly as big as the others; "Startseite" first and green in the
// module sheet; a deleted round back with its round green button.
// Usage: node qa/designround.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
import { onOff, isOn, flip } from './onoff.mjs';

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
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '12,4', homeClub: '' }));
  // a deleted round in the bin
  const holes = Array.from({ length: 9 }, (_, k) => ({ index: k, label: String(k + 1), loop: 'Main', number: k + 1, par: 4, strokeIndex: k + 1 }));
  const r = { id: 'del1', createdAt: '2026-11-06T10:00:00Z', finishedAt: '2026-11-06T13:00:00Z', courseId: 'c', courseName: 'Celebration Golf Club', loopOrder: ['Main'], holes, mode: 'simple', players: [{ id: 'me', name: 'Sascha', playingHandicap: 12, isMe: true }], entries: { me: holes.map(() => ({ strokes: 5, putts: 2, pickedUp: false, fairway: null, penalties: 0 })) }, currentHole: 8 };
  localStorage.setItem('golfos.trash.v1', JSON.stringify([{ round: r, deletedAt: '2026-11-07T09:00:00Z' }]));
});
await p.reload();
await p.waitForTimeout(1500);

// the profile: no slider anywhere, the golf settings as rows
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.waitForTimeout(600);
ok((await p.locator('.drawer-switch, [role="switch"]').count()) === 0, 'the profile: no slider anywhere');
const golf = p.getByRole('region', { name: 'Golf', exact: true }); // the block with its eyebrow since the Facelift (11.11.2026)
for (const [l, v] of [['Tee', 'keins'], ['Distanzen in', 'Meter'], ['Du spielst', 'Rechtshänder'], ['Währung', 'Keine']]) {
  const row = golf.locator('.settings-row').filter({ hasText: new RegExp(`^\\s*${l}`) });
  ok((await row.count()) === 1 && new RegExp(v).test(await row.innerText()), `Golf: the row "${l} · ${v}"`);
}
ok(!/Standard-Tee|Standardwährung/.test(await golf.innerText()), 'renamed: "Tee" and "Währung" – no "Standard-"');
// "Distanzen in" as a row with its sheet – Yards chosen, back to Meter
await golf.locator('.settings-row').filter({ hasText: /^\s*Distanzen in/ }).click();
const dist = p.getByRole('dialog', { name: 'Distanzen in' });
const hs = await dist.locator('.pick-option').evaluateAll((els) => els.map((e) => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]));
ok(hs.length === 2 && hs[0][0] === hs[1][0] && hs[0][1] === hs[1][1], `the chosen option exactly as big as the other (${JSON.stringify(hs)})`);
await dist.locator('.pick-option').filter({ hasText: 'Yards' }).click();
await p.waitForTimeout(300);
ok(/Yards/.test(await golf.locator('.settings-row').filter({ hasText: /^\s*Distanzen in/ }).innerText()) && (await p.evaluate(() => localStorage.getItem('golfos.unit.v1') ?? '')).includes('yd'), '"Distanzen in" → Yards, kept');
await golf.locator('.settings-row').filter({ hasText: /^\s*Distanzen in/ }).click();
await p.getByRole('dialog', { name: 'Distanzen in' }).locator('.pick-option').filter({ hasText: 'Meter' }).click();
// the caddie: An/Aus rows – a tap opens the sheet with both, a pick saves at once
const voice = onOff(p, 'Von selbst vorlesen');
ok((await voice.count()) === 1 && !(await isOn(voice)) && /Aus/.test(await voice.innerText()), 'Caddie: "Von selbst vorlesen · Aus" – a row, no slider');
await voice.click();
const sheet = p.getByRole('dialog', { name: 'Von selbst vorlesen' });
ok((await sheet.locator('.pick-option').allInnerTexts()).map((t) => t.split('\n')[0].trim()).join('|') === 'An|Aus', 'its sheet: An and Aus');
await sheet.locator('.pick-option').filter({ hasText: /^\s*An/ }).click();
await p.waitForTimeout(300);
ok((await isOn(voice)) && (await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.caddie.v1')).voice)) === true, '"An" picked: on and saved');
await flip(voice);
ok(!(await isOn(voice)), 'and off again');

// the module sheet: "Startseite" first and green, without a line under it
await p.locator('.tabbar button').filter({ hasText: 'Start' }).first().click();
await p.locator('.home-hero .module-card').filter({ hasText: 'Rounds' }).click();
await p.waitForTimeout(800);
await p.locator('.module-switch').first().click();
const ms = p.getByRole('dialog', { name: 'Modul wechseln' });
const home = ms.locator('.module-home');
const look = await home.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el.querySelector('strong')).color]);
const brand = await p.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--brand-text)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
ok(look[1] === brand && !/rgba\(0, 0, 0, 0\)|transparent/.test(look[0]), `"Startseite" set off in green (${look.join(' · ')})`);
ok((await home.locator('.small').count()) === 0, '"Startseite" without a line under it');
await ms.getByRole('button', { name: 'Schließen' }).click();

// the bin: a round green "restore" right in the row – one tap brings it back
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(500);
await p.locator('.tile').filter({ hasText: 'gelöscht' }).click();
await p.waitForTimeout(400);
const restore = p.getByRole('button', { name: 'Celebration Golf Club wiederherstellen' });
ok((await restore.count()) === 1, 'the deleted round: a round green "restore" in its row');
const bg = await restore.evaluate((el) => getComputedStyle(el).backgroundColor);
ok(!/rgba\(0, 0, 0, 0\)|transparent/.test(bg), `filled green (${bg})`);
await restore.click();
await p.waitForTimeout(800);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.trash.v1') ?? '[]').length)) === 0 && (await p.locator('.list-item').filter({ hasText: 'Celebration Golf Club' }).count()) >= 1, 'one tap: back in the list');

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
