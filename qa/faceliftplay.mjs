// QA Facelift 11.11.2026 – play (Sascha: the approved list, mockups "auswahl-facelift"): the hole without a map (score
// page) – the hole bar ‹ › with SVG chevrons, one action bar [Schlag | Karte | Scorekarte | Löschen], the putts as tiles,
// Grünbunker / Aufgehoben as An/Aus rows, Up & Down as chips, GIR with an SVG mark, "aufgehoben" of a partner as an icon
// (r1, r2, putts, updown); the shot sheet's Lage, Schlag and "Danach" as green chips (lage, schlagart, ob, wasser); the
// set-up of a hole as one bar + the floating tick (r6); the caddie's lie as a row with its sheet (r4) and the caddie
// talking: the speaker green, tap to stop – no "■" or emoji (r7; the bar SpeechBar is not mounted since 17.10.2026).
// Usage: node qa/faceliftplay.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
const shots = process.env.SHOTS;
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const errs = [];
const GLYPHS = /[✓✕←→↺■○]|🔇/;

// ---------- 1 · the score page of a hole without a map ----------
if (process.env.ONLY !== '2') {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
  await mockNet(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
  await p.goto(url);
  await p.waitForTimeout(800);
  await p.evaluate((exp) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    sessionStorage.setItem('golfos.module', 'rounds');
    // a round being played, shot by shot, with a partner, on a course the app has no map of
    const id = 'test:nomap';
    const me = exp.round.players.find((x) => x.isMe);
    const players = [me, { ...me, id: 'p-chris', name: 'Chris', isMe: false }];
    const entries = { [me.id]: exp.round.holes.map(() => ({ strokes: null, putts: null, fairway: null, penalties: 0, greensideBunker: false, upAndDown: null, pickedUp: false })) };
    entries['p-chris'] = entries[me.id].map((e) => ({ ...e }));
    const r = { ...exp.round, id: 'qa-facelift', courseId: id, courseName: 'Golfplatz ohne Karte', mode: 'detail', players, entries, finishedAt: null, signedAt: null, currentHole: 0, manualShots: [], createdAt: new Date().toISOString() };
    localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
    const holes = r.holes.map((h) => ({ loop: h.loop, number: h.number, label: h.label, par: h.par, strokeIndex: [h.strokeIndex] }));
    localStorage.setItem('golfos.course.v1.' + id, JSON.stringify({ id, source: 'osm', name: 'Golfplatz ohne Karte', lat: 48.7795, lon: 9.6835, holes, loops: [...new Set(holes.map((h) => h.loop))] }));
  }, exp);
  await p.reload();
  // the running round opens by itself – on its hole's set-up (no map)
  await p.locator('.setup-card').waitFor({ timeout: 20000 }).catch(() => {});
  // the set-up of the hole (r6): one bar of icons, no column of text buttons
  const card = p.locator('.setup-card');
  ok((await card.count()) === 1, 'no map: the set-up of the hole opens');
  const setupWords = await card.locator('.sc-actions .sc-action span').allInnerTexts();
  ok(setupWords.includes('Nur Score') && (await card.locator('.btn-ghost, .btn-secondary').count()) === 0, `the set-up: its actions in one bar (${setupWords.join(' · ')})`);
  if (shots) await p.screenshot({ path: `${shots}/fl-setup.png` });
  await p.getByRole('button', { name: 'Nur Score eintragen' }).click();
  await p.waitForTimeout(1500);

  // r2 – the top bar has only "back"; the hole bar ‹ › with SVG chevrons
  ok((await p.locator('.topbar button').count()) === 1, 'the top bar: only back, no map / scorecard tools');
  const nav = p.locator('.hole-nav');
  ok((await nav.locator('.hole-step svg').count()) === 2 && (await nav.locator('.hole-no').innerText()).trim() === exp.round.holes[0].label, `the hole bar: ‹ ${exp.round.holes[0].label} › with SVG chevrons`);
  ok(await nav.getByRole('button', { name: 'Voriges Loch' }).isDisabled(), 'the first hole: ‹ off');
  // one action bar: Schlag | Karte | Scorekarte (Löschen only with shots)
  const bar = p.getByRole('group', { name: 'Dieses Loch' });
  const words = async () => bar.locator('.sc-action span').allInnerTexts();
  ok((await words()).join(',') === 'Schlag,Karte,Scorekarte', `the actions in one bar: ${(await words()).join(' · ')}`);
  ok((await p.getByRole('button', { name: /Schlag hinzufügen|Weiter · Loch|Zurück/ }).filter({ hasText: /\+|Weiter|←/ }).count()) === 0, 'no "+ Schlag hinzufügen", no "← Zurück" / "Weiter · Loch" text buttons');

  // putts as tiles (5 columns, one row); a second tap clears
  const tiles = p.locator('.putt-tiles button');
  const ys = await tiles.evaluateAll((bs) => bs.map((x) => Math.round(x.getBoundingClientRect().top)));
  ok((await tiles.allInnerTexts()).join(' ') === '0 1 2 3 4+' && new Set(ys).size === 1 && (await p.locator('main .segmented').count()) === 0, 'putts: tiles 0 1 2 3 4+ in one row, no block of buttons');
  const mine = () => p.evaluate(() => { const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]; return r.entries[r.players.find((x) => x.isMe).id][0]; });
  // strokes for the GIR mark: par and two putts
  await p.getByRole('button', { name: 'Schläge plus eins' }).first().click();
  await tiles.nth(2).click();
  await p.waitForTimeout(300);
  ok((await tiles.nth(2).getAttribute('aria-pressed')) === 'true' && (await mine()).putts === 2, 'a tap on "2": two putts');
  const gir = p.locator('.gir-badge');
  ok((await gir.count()) === 1 && (await gir.locator('svg').count()) === 1 && (await gir.innerText()).trim() === 'GIR', `GIR with an SVG mark, no glyph ("${(await gir.innerText().catch(() => '')).trim()}")`);
  const girColor = await gir.evaluate((e) => getComputedStyle(e).color);
  ok(girColor === 'rgb(255, 255, 255)', `GIR: white on its colour (${girColor})`);
  await tiles.nth(2).click();
  await p.waitForTimeout(300);
  ok((await mine()).putts == null, 'a second tap on "2" clears the putts');
  await tiles.nth(2).click();

  // r1 – Grünbunker and Aufgehoben as An/Aus rows; Up & Down as chips
  const bunker = p.locator('.onoff-row').filter({ hasText: 'Bunker' });
  const pickedUp = p.locator('.onoff-row').filter({ hasText: 'Aufgehoben' });
  ok((await bunker.count()) === 1 && (await pickedUp.count()) === 1 && (await p.locator('main .toggle').count()) === 0, 'Grünbunker and Aufgehoben as An/Aus rows, no "○/✓" buttons');
  await bunker.click();
  await p.getByRole('dialog', { name: 'Bunker' }).locator('.pick-option').filter({ hasText: /^An/ }).click();
  await p.waitForTimeout(300);
  ok((await bunker.getAttribute('data-on')) === 'true' && (await mine()).greensideBunker === true, 'Grünbunker: An');
  const ud = p.getByRole('group', { name: 'Up & Down' });
  ok((await ud.count()) === 1 && (await ud.evaluate((e) => e.classList.contains('chips-field'))) && (await ud.getByRole('button').allInnerTexts()).join(',') === 'Ja,Nein', 'Up & Down: green chips Ja / Nein');
  await ud.getByRole('button', { name: 'Ja' }).click();
  await p.waitForTimeout(200);
  ok((await mine()).upAndDown === true && (await ud.getByRole('button', { name: 'Ja' }).getAttribute('aria-pressed')) === 'true', 'Up & Down "Ja" stored, the chip green');
  // the partner picked up: an icon (flag), undone with the arrow back
  const pu = p.getByRole('button', { name: 'Chris: aufgehoben' });
  ok((await pu.locator('svg').count()) === 1 && !/PU/.test(await pu.innerText()), 'the partner "aufgehoben": the flag icon, no "PU"');
  await pu.click();
  await p.waitForTimeout(200);
  ok((await p.getByRole('button', { name: 'Chris: Aufheben rückgängig' }).locator('svg').count()) === 1, 'undone with the arrow-back icon, no "↺"');
  await p.getByRole('button', { name: 'Chris: Aufheben rückgängig' }).click();
  ok(!GLYPHS.test(await p.locator('main').innerText()), 'no ✓ ✕ ← → ↺ ○ glyph on the score page');
  if (shots) await p.screenshot({ path: `${shots}/fl-score.png`, fullPage: true });

  // the shot sheet (lage, schlagart, ob, wasser): green chips, no block
  await bar.getByRole('button', { name: 'Schlag hinzufügen' }).click();
  await p.waitForTimeout(400);
  const sheet = p.locator('.sheet');
  ok((await sheet.locator('.segmented').count()) === 0, 'the shot sheet: no block of buttons');
  for (const g of ['Lage', 'Schlagart', 'Strafschlag']) ok(await sheet.getByRole('group', { name: g }).evaluate((e) => e.classList.contains('chips-field')).catch(() => false), `"${g}" as green chips`);
  const lies = sheet.getByRole('group', { name: 'Lage' });
  await lies.getByRole('button', { name: 'Rough', exact: true }).click();
  ok((await lies.getByRole('button', { name: 'Rough', exact: true }).getAttribute('aria-pressed')) === 'true', 'Lage "Rough" chosen – the chip green');
  const lieFits = await lies.evaluate((e) => [...e.querySelectorAll('button')].every((x) => x.scrollWidth <= x.clientWidth + 1 && x.getBoundingClientRect().right <= innerWidth + 1));
  ok(lieFits, 'the lies read in full, nothing beyond the screen');
  await sheet.getByRole('group', { name: 'Strafschlag' }).getByRole('button', { name: 'Aus', exact: true }).click();
  const then = sheet.getByRole('group', { name: 'Danach' });
  ok((await then.evaluate((e) => e.classList.contains('chips-field'))) && (await then.getByRole('button').allInnerTexts()).join(',') === 'Erneut von hier,Provisorischer Ball', 'Aus: "Danach" as chips Erneut von hier / Provisorischer Ball');
  await sheet.getByRole('group', { name: 'Strafschlag' }).getByRole('button', { name: 'Wasser', exact: true }).click();
  ok((await then.getByRole('button').allInnerTexts()).join(',') === 'Gedroppt,Erneut von hier', 'Wasser: "Danach" as chips Gedroppt / Erneut von hier');
  if (shots) await p.screenshot({ path: `${shots}/fl-shotsheet.png` });
  await sheet.getByRole('group', { name: 'Strafschlag' }).getByRole('button', { name: 'Keiner' }).click();
  await sheet.locator('.club-grid button').first().click(); // a tap on a club saves the new shot
  await p.waitForTimeout(600);
  ok((await words()).join(',') === 'Schlag,Karte,Scorekarte,Löschen' && (await bar.locator('.sc-action.danger').innerText()).trim() === 'Löschen', `with a shot: Löschen red, last (${(await words()).join(' · ')})`);
  await bar.getByRole('button', { name: 'Schläge löschen' }).click();
  const ask = p.getByRole('dialog', { name: /Schläge dieses Lochs löschen/ });
  ok((await ask.count()) === 1, 'Löschen asks first (the app\'s confirmation sheet)');
  await ask.getByRole('button', { name: 'Schläge löschen' }).click();
  await p.waitForTimeout(400);
  ok(!(await mine()).detail?.shots?.length && (await words()).join(',') === 'Schlag,Karte,Scorekarte', 'confirmed: the shots gone, Löschen with them');

  // › to the next hole, ‹ back
  await nav.getByRole('button', { name: /^Nächstes Loch/ }).click();
  await p.waitForTimeout(800);
  ok((await p.locator('.hole-nav .hole-no').innerText()).trim() === exp.round.holes[1].label, `› : hole ${exp.round.holes[1].label}`);
  await p.locator('.hole-nav').getByRole('button', { name: 'Voriges Loch' }).click();
  await p.waitForTimeout(800);
  ok((await p.locator('.hole-nav .hole-no').innerText()).trim() === exp.round.holes[0].label, '‹ : back');
  await bar.getByRole('button', { name: 'Scorekarte' }).click();
  await p.waitForTimeout(800);
  ok((await p.locator('.sc-hole').count()) > 0, '"Scorekarte" opens the scorecard');
  await ctx.close();
}

// ---------- 2 · the caddie: the lie as a row, talking with SVG stop / mute ----------
{
  const me = exp.round.players.find((x) => x.isMe).id;
  const second = exp.round.entries[me].map((e, k) => ({ k, s: e.detail?.shots?.[1] })).find((x) => x.s?.pos && exp.round.holes[x.k].par >= 4) ?? { k: 0, s: exp.round.entries[me][0].detail.shots[1] };
  const [lon, lat] = second.s.pos;
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: lat, longitude: lon, accuracy: 5 }, permissions: ['geolocation'] });
  await mockNet(ctx);
  await ctx.addInitScript(() => {
    const w = window;
    let cur = null;
    const fake = {
      speaking: false, pending: false, paused: false,
      getVoices: () => [{ lang: 'de-DE', name: 'Anna', default: true, localService: true }],
      speak(u) { cur = u; fake.speaking = true; setTimeout(() => u.onstart?.(), 50); setTimeout(() => { if (cur === u) { fake.speaking = false; u.onend?.(); } }, 6000); },
      cancel() { if (cur) { const u = cur; cur = null; fake.speaking = false; u.onend?.(); } },
      resume() {},
    };
    Object.defineProperty(w, 'speechSynthesis', { value: fake, configurable: true });
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
  await p.goto(url);
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    localStorage.setItem('golfos.caddie.v1', JSON.stringify({ voice: true }));
    sessionStorage.setItem('golfos.module', 'rounds');
  });
  await p.reload();
  await p.waitForTimeout(1000);
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().waitFor({ timeout: 30000 });
  await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().click();
  await p.getByText('Runde starten').waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: /C · 9 Löcher/ }).click().catch(() => {});
  await p.getByText('Runde starten').click();
  await p.locator('.map-hole-no').waitFor({ timeout: 30000 });
  await p.waitForTimeout(4000);
  // on the hole of the second shot, away from the tee
  for (let k = 0; k < 12 && (await p.locator('.map-hole-no').innerText()).trim() !== exp.round.holes[second.k].label; k++) {
    await p.getByRole('button', { name: /^Nächstes Loch/ }).last().click();
    await p.waitForTimeout(900);
    const close = p.getByRole('dialog', { name: 'Score an diesem Loch' }).getByRole('button', { name: 'Zurück zur Karte' });
    if (await close.count()) await close.click({ timeout: 3000 }).catch(() => {});
  }
  await p.waitForTimeout(2500);
  if (process.env.DBG) await p.screenshot({ path: process.env.DBG });
  const show = p.getByRole('button', { name: /Caddie zeigen/ });
  if (await show.count()) await show.click();
  await p.waitForTimeout(1200);
  const lieRow = p.locator('.caddie-card .caddie-lie-row .settings-row');
  ok((await lieRow.count()) === 1 && (await p.locator('.caddie-card select').count()) === 0, `the caddie's lie: a row "Lage · … ›", no select field (hole ${(await p.locator('.map-hole-no').innerText()).trim()})`);
  if (shots) await p.screenshot({ path: `${shots}/fl-caddie-card.png` });
  if (await lieRow.count()) {
    await lieRow.click();
    const ls = p.getByRole('dialog', { name: 'Lage des Balls' });
    const opts = await ls.locator('.pick-option').count();
    const lines = await ls.locator('.pick-option .muted').count();
    ok(opts === 8 && lines === 8, `its sheet: 8 lies, each with a line of meaning (${opts}/${lines})`);
    if (shots) await p.screenshot({ path: `${shots}/fl-caddie-lie.png` });
    await ls.locator('.pick-option').filter({ hasText: 'Tiefes Rough' }).click();
    await p.waitForTimeout(500);
    ok(/Tiefes Rough/.test(await lieRow.innerText()), 'picked: "Lage · Tiefes Rough"');
  }
  // the caddie reads aloud (r7): the floating bar with "■ Stopp" / "🔇 Stumm" is not shown since 17.10.2026 – the caddie's
  // speaker turns green while he reads and a tap stops him; nowhere a "■" or an emoji
  const speaker = p.locator('.caddie-card').getByRole('button', { name: 'Vorlesen oder stoppen' });
  if ((await speaker.getAttribute('aria-pressed')) !== 'true') await speaker.click();
  await p.waitForTimeout(400);
  ok((await speaker.getAttribute('aria-pressed')) === 'true' && (await speaker.locator('svg').count()) >= 1, 'reading aloud: the speaker (SVG) green – tap to stop');
  ok(!/■|🔇/.test(await p.locator('body').innerText()) && (await p.locator('.speech-bar').count()) === 0, 'no "■ Stopp" / "🔇 Stumm" anywhere');
  if (shots) await p.screenshot({ path: `${shots}/fl-speech.png` });
  await speaker.click();
  await p.waitForTimeout(300);
  await ctx.close();
}

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
