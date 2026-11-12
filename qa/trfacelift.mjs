// QA – the Facelift of Training (Sascha 11.11.2026, Facelift-Abnahme tr1–tr10, o6): the parts of a topic and a drill as
// the switch "‹ Anleitung ›" (no block of tabs); AUFBAU / ABLAUF / TIPPS as eyebrows above plain blocks, no heading in a
// card, no intro paragraph; a new result saved with the round green tick (then in "Historie"); a history entry swiped
// away with "Rückgängig"; the own session: a card per drill (swiped out, the minutes' stepper, the arrow up), the drills
// ticked, "Speichern & starten" the last element; the leave sheet of a session = the round's ([Pausieren | Abbrechen]
// + "Einheit beenden"); a new own session with the round green "+"; the metronome's round play / stop symbol; SVG instead
// of "+ Warenkorb", "✓ im Korb", "Preis ↑", "↗", "▾/▸", "Putten ›"; white on green and red.
// Usage: node qa/trfacelift.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => !/due to access control|sw\.js load failed|Importing a module script failed/.test(e.message) && errs.push(e.message));
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const back = () => p.locator('.topbar .icon-btn').first().click();
const tab = (name) => p.locator('.tabbar button').filter({ hasText: name }).click();
const eyebrow = (text) => p.locator('main .eyebrow').filter({ hasText: new RegExp(`^${text}$`, 'i') });
const view = async (name) => {
  await p.getByRole('button', { name: /^Ansicht: / }).click();
  await p.getByRole('dialog', { name: 'Ansicht' }).locator('.pick-option').filter({ has: p.locator('strong', { hasText: new RegExp(`^${name}$`) }) }).click();
  await p.waitForTimeout(200);
};
const viewNow = async () => ((await p.getByRole('button', { name: /^Ansicht: / }).getAttribute('aria-label')) ?? '').replace('Ansicht: ', '');
// a screen of the module: no heading inside it (o6), no text sign as an icon (tr9, o5) – "›" only as the rows' chevron
const clean = async (where) => {
  const h2 = await p.locator('main h2').count();
  const text = await p.locator('main').innerText();
  const signs = text.match(/[✓✕↑↗▾▸′▶■]|\+ Warenkorb/g) ?? [];
  const chipGo = await p.locator('main .chip').evaluateAll((els) => els.filter((e) => /›/.test(e.textContent ?? '')).length);
  ok(h2 === 0 && signs.length === 0 && chipGo === 0, `${where}: no heading in it, no text signs (${h2} h2 · ${signs.join(' ') || '–'} · ${chipGo} chips with ›)`);
};
const white = async (loc, what) => {
  const c = await loc.first().evaluate((e) => getComputedStyle(e).color);
  ok(/^rgb\(255, 255, 255\)/.test(c), `${what}: white on the colour (${c})`);
};
const swipe = async (front, dx = -100) => {
  await front.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(200);
  const bb = await front.boundingBox();
  const y = bb.y + bb.height / 2;
  await p.mouse.move(bb.x + bb.width - 30, y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(bb.x + bb.width - 30 + (dx * i) / 8, y);
  await p.mouse.up();
  await p.waitForTimeout(300);
};
const tapBin = async () => {
  const bin = p.locator('.swipe-bin').first();
  const box = await bin.boundingBox();
  await bin.click({ position: { x: box.width - 40, y: box.height / 2 } });
  await p.waitForTimeout(400);
};

await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'M', hcpIndex: '12,4', homeClub: '' }));
  const day = (d) => new Date(Date.now() - d * 864e5).toISOString();
  // the ladder drill: four results – the goal of hcp 11–20 (6) reached
  localStorage.setItem('golfos.training.log.v1', JSON.stringify([11, 8, 9, 7].map((v, i) => ({ id: 'l' + i, drill: 'ladder', at: day(2 + i * 2), value: v }))));
  sessionStorage.setItem('golfos.module', 'training');
});
await p.reload();
await p.locator('.tr-cat').first().waitFor({ timeout: 30000 });
await clean('Wissen');
ok((await eyebrow('Themen').count()) === 1, 'Wissen: the blocks under eyebrows (THEMEN …)');

// tr1 – a topic's parts as the switch
await p.locator('.tr-cat').filter({ has: p.locator('strong', { hasText: /^Putten$/ }) }).first().click();
await p.waitForTimeout(300);
ok((await p.locator('main .segmented, main .tr-tabs, [role="tablist"]').count()) === 0 && (await p.locator('main .step-pick').count()) === 1, 'topic: the switch "‹ Übungen ›", no block of tabs (tr1)');
ok((await viewNow()) === 'Übungen' && /Übungen · 1 von 4/.test(await p.locator('.step-pick-now .small').innerText()), `topic: "Übungen", "… · 1 von 4" (${await p.locator('.step-pick-now .small').innerText()})`);
await p.getByRole('button', { name: 'Nächste' }).click();
ok((await viewNow()) === 'Grundlagen', '› steps to "Grundlagen"');
// tr2 – no intro paragraph
ok((await p.locator('.tr-intro-text').count()) === 0 && (await p.locator('.tr-coll').count()) > 0, 'Grundlagen: no intro paragraph above the sections (tr2)');
ok((await p.locator('.tr-coll-head .tr-coll-mark svg').count()) > 0, 'the sections open with an SVG chevron, not ▾/▸ (tr9)');
await clean('Thema › Grundlagen');
await view('Fehler');
await clean('Thema › Fehler');
await view('Übungen');
await p.locator('.tr-drill-row .list-item').filter({ hasText: 'Leiter-Übung' }).first().click();
await p.waitForTimeout(400);

// drill – tr1, tr2, tr8
ok((await p.locator('main .segmented, main .tr-tabs').count()) === 0 && (await viewNow()) === 'Anleitung', 'drill: the switch "‹ Anleitung ›" (tr1)');
const eb = await p.locator('main > .eyebrow').allInnerTexts();
ok(['AUFBAU', 'ABLAUF', 'TIPPS'].every((x) => eb.map((e) => e.toUpperCase()).includes(x)) && (await p.getByText('So geht’s').count()) === 0, `drill: eyebrows AUFBAU · ABLAUF · TIPPS above plain blocks (${eb.join(' · ')})`);
const go = p.locator('.tr-metro-go');
ok((await go.innerText()).trim() === '' && (await go.locator('svg').count()) === 1 && (await go.getAttribute('aria-label')) === 'Metronom starten', 'metronome: a round play symbol, no "▶ Start" (tr8)');
const gb = await go.boundingBox();
ok(gb && gb.width >= 44 && Math.abs(gb.width - gb.height) < 2, `metronome: the symbol round and big enough (${gb && Math.round(gb.width)}×${gb && Math.round(gb.height)})`);
await white(go, 'metronome symbol');
await go.click();
await p.waitForTimeout(500);
ok((await go.getAttribute('aria-pressed')) === 'true' && (await go.getAttribute('aria-label')) === 'Metronom stoppen', 'metronome runs – the stop symbol');
await go.click();
ok((await go.getAttribute('aria-pressed')) === 'false', 'metronome stops');
await clean('Übung › Anleitung');

// tr3 – a new result: the round green tick bottom right, then in the history
await view('Ergebnis');
ok((await p.locator('.tr-log .btn-primary').count()) === 0 && (await p.locator('.fab-save').count()) === 1, 'Ergebnis: no "Ergebnis speichern" button – the round green tick bottom right (tr3)');
await white(p.locator('.tr-targets .mine strong'), 'the target of my band');
await white(p.locator('.tr-goal-dot.ok'), 'the goal dot');
ok((await p.locator('.tr-goal-dot.ok svg').count()) >= 1, 'the goal dot: an SVG tick (tr10)');
ok((await p.locator('.tile.reached svg').count()) === 1, 'goal tile: "Ziel … erreicht" with an SVG tick');
const before = await p.locator('.tr-history li').count();
await p.locator('.tr-result button').nth(1).click();
await p.locator('.fab-save').click();
await p.waitForTimeout(300);
ok((await p.locator('.tr-history li').count()) === before + 1 && /Historie/.test(await p.locator('.tr-save-note').innerText()), `saved: the entry in "Historie" (${before} → ${await p.locator('.tr-history li').count()})`);
ok(await p.locator('.fab-save').isDisabled(), 'the tick rests after saving – no second entry by a double tap');
await p.locator('.tr-result button').nth(1).click();
ok(!(await p.locator('.fab-save').isDisabled()), 'a new value: the tick again');
// tr4 – swiped away, "Rückgängig"
ok((await p.locator('.tr-hist-remove').count()) === 0 && (await p.locator('.tr-history .swipe').count()) === before + 1, 'Historie: no ✕ – each row swipes (tr4)');
await swipe(p.locator('.tr-history .swipe-front').first());
ok((await p.locator('.swipe-bin').count()) === 1, 'swiped a little: the red bin');
await tapBin();
ok((await p.locator('.tr-history li').count()) === before && (await p.locator('.undo-toast').isVisible()), 'the bin tapped: the entry gone, "Rückgängig"');
await p.locator('.undo-toast button').click();
ok((await p.locator('.tr-history li').count()) === before + 1, '"Rückgängig" brings it back');
await clean('Übung › Ergebnis');
await view('Zubehör');
const gearChip = p.locator('.tr-gear-row .chip').first();
ok(/In den Korb/.test(await gearChip.innerText()) && (await gearChip.locator('svg').count()) === 1, 'Zubehör: "In den Korb" with the cart icon (tr9)');
await gearChip.click();
ok(/Im Korb/.test(await gearChip.innerText()) && (await gearChip.locator('svg').count()) === 1, '"Im Korb" with an SVG tick');
await white(gearChip, 'the chip "Im Korb"');
await clean('Übung › Zubehör');
await p.locator('.tr-gear-row-main').first().click();
await p.waitForTimeout(300);
ok((await p.locator('main a.btn-secondary svg').count()) >= 1 && (await eyebrow('Was es ist').count()) === 1, 'gear page: the external link as SVG, eyebrows above the blocks');
await clean('Produkt');
await setCart0();
async function setCart0() {
  await back();
  await back();
  await back();
}

// tr7 – a new own session: the round green "+"
await tab('Üben');
await p.waitForTimeout(300);
ok((await p.getByRole('button', { name: /Eigene Einheit zusammenstellen/ }).count()) === 0 && (await p.getByRole('button', { name: 'Eigene Einheit' }).count()) === 1, 'Üben: no text button – the round "+" "Eigene Einheit" (tr7)');
await clean('Üben');
await p.getByRole('button', { name: 'Eigene Einheit' }).click();
await p.waitForTimeout(300);
// tr5 – the own session
ok((await p.locator('main .tr-add').count()) === 0 && (await p.locator('main .tick-row').count()) > 10, 'Eigene Einheit: the drills to add as rows to tick, no "+"/"✓" (tr5)');
await p.locator('.tick-row').nth(0).click();
await p.locator('.tick-row').nth(1).click();
await p.locator('.tick-row').nth(2).click();
ok((await p.locator('.tick-row[aria-checked="true"]').count()) === 3 && (await p.locator('.tr-own-list li').count()) === 3, 'three ticked – three drills in the plan');
const own = () => p.locator('.tr-own-list li');
ok((await own().first().locator('.stepper').count()) === 1 && (await own().first().locator('.tr-own-up svg').count()) === 1 && (await own().first().locator('.swipe').count()) === 1, 'a drill: the minutes as the stepper, the arrow up as SVG, the card swipes');
const names = async () => (await own().locator('strong').allInnerTexts()).join('|');
const n0 = await names();
await own().nth(1).locator('.tr-own-up').click();
const n1 = await names();
ok(n1.split('|')[0] === n0.split('|')[1], 'the arrow moves the drill up');
const min0 = Number(await own().first().locator('.stepper .value').innerText());
await own().first().getByRole('button', { name: 'Minuten plus eins' }).click();
ok(Number(await own().first().locator('.stepper .value').innerText()) === min0 + 1, 'the stepper: a minute more');
await swipe(own().nth(2).locator('.swipe-front'));
await tapBin();
ok((await own().count()) === 2 && (await p.locator('.undo-toast').isVisible()) && (await p.locator('.tick-row[aria-checked="true"]').count()) === 2, 'swiped out: two left, the tick gone too, "Rückgängig"');
await p.locator('.undo-toast button').click();
ok((await own().count()) === 3, '"Rückgängig" brings the drill back');
const last = await p.locator('main').evaluate((m) => {
  const kids = [...m.children].filter((e) => e.getClientRects().length && !e.classList.contains('undo-toast'));
  return kids[kids.length - 1]?.textContent ?? '';
});
ok(/Speichern & starten/.test(last), `"Speichern & starten" the last element of the page (${last.slice(0, 40)})`);
ok((await p.locator('.fab-save').count()) === 1, 'new: the round green tick saves the plan');
ok((await p.locator('main h2').count()) === 0 && !/[✓✕↑′]/.test(await p.locator('main').innerText()), 'Eigene Einheit: no heading, no "−", "7′", "↑", "✕" signs');
await p.locator('main .btn-primary').last().click();
await p.waitForTimeout(1200);

// tr6 – the leave sheet = the round's
ok(await p.locator('.tr-now').isVisible(), 'the session runs');
ok((await p.locator('.tr-coll-head .tr-coll-mark svg').count()) === 1, 'session: the steps open with an SVG chevron');
await clean('Einheit');
await back();
const sheet = p.getByRole('dialog', { name: 'Einheit verlassen' });
await sheet.waitFor();
const acts = (await sheet.locator('.sc-action').allInnerTexts()).map((x) => x.trim()).join('|');
ok(acts === 'Pausieren|Abbrechen' && /danger/.test(await sheet.locator('.sc-action').last().getAttribute('class')), `leave sheet: the bar [Pausieren | Abbrechen (red, last)] as the round's (${acts})`);
ok((await sheet.locator('.btn-primary').innerText()) === 'Einheit beenden' && (await sheet.locator('.btn-secondary').count()) === 0, 'the one main button "Einheit beenden", no column of text buttons');
await sheet.locator('.btn-primary').click();
const acts2 = (await sheet.locator('.sc-action').allInnerTexts()).map((x) => x.trim()).join('|');
ok(acts2 === 'Zurück|Löschen' && (await sheet.locator('.btn-primary').innerText()) === 'Speichern & beenden', `"Einheit beenden": [Zurück | Löschen (red)] + "Speichern & beenden" (${acts2})`);
await sheet.getByRole('button', { name: 'Zurück' }).click();
ok((await sheet.count()) === 0, 'Zurück closes the sheet');
await back();
await sheet.getByRole('button', { name: 'Pausieren – später fortsetzen' }).click();
await p.waitForTimeout(300);
ok(await p.locator('.list-item').filter({ has: p.locator('.paused-mark') }).first().isVisible(), 'Pausieren: the paused row on "Üben"');

// shop – tr9
await tab('Shop');
await p.waitForTimeout(600);
const sort = p.getByRole('button', { name: 'Preis', exact: true });
ok((await sort.count()) === 1 && (await sort.locator('svg').count()) === 1, 'Shop: "Preis" with an SVG arrow, not "Preis ↑"');
await clean('Shop');
// review – o5
await tab('Wissen');
await p.locator('.tr-review-entry').click();
await p.waitForTimeout(300);
await clean('Inhalte prüfen');
ok((await p.locator('.tile svg').count()) >= 3, 'Inhalte prüfen: passt / ändern / streichen with SVG marks');
await back();
// progress
await tab('Verlauf');
await p.waitForTimeout(300);
await clean('Verlauf');
ok((await p.locator('.tr-goal-dot.ok svg').count()) >= 1, 'Verlauf: the goal dots with SVG ticks');

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
