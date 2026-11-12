// QA (Facelift-Abnahme 11.11.2026, Sascha: "Passt"): the setups in one order and one look.
// r9  Neue Runde: Format (Rundenart, Modus, Scoring) → Platz (Platz ›, Löcher) → Spieler → Mitspieler einladen →
//     Score-Erfassung → Worum (Sidebet) → Einstellungen (HCP-Vorgabe …); the title "Neue Runde", the course a row.
// r10 a player removed by swiping left (no "✕"), "Spieler entfernt · Rückgängig" brings him back.
// r11 no friends yet: the row "Freunde · verknüpfen ›", its sheet titled "Freunde".
// g1  Neues Spiel: Spielform → Platz → Spieler → Score-Erfassung → Worum → Einstellungen.
// g2  5+5+10: Wertung first, the stakes under "Worum", the share of the handicap under "Einstellungen".
// g3  the sheets "Gegen wen" / "Long Drive": ✕ before the save button, as every sheet head.
// o3  an own value ("Anderer Betrag …", "Andere Anzahl …", "Eigener Einsatz") taken with the save button in the head.
// t4–t6 Neues Turnier: Was → Wo/Wann → Wer (Spieler, Flights, Wer erfasst) → Einstellungen → Sonderwertungen; a
//     round's page without "Fertig"; own classes saved in the head, "Vorlagen ›" a row.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/setuporder.mjs [url]   (SHOTS=dir for screenshots)
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.env.SHOTS;
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const sim = sharedServer(b, url);
const { p: P, errs } = await sim.phone('Sascha');
const shot = async (name) => shots && (await P.screenshot({ path: `${shots}/setuporder-${name}.png`, fullPage: true }));
const heads = async (sel = 'main .eyebrow') => (await P.locator(sel).allInnerTexts()).map((t) => t.trim().toUpperCase());
const rowsOf = async (eyebrow) =>
  (await P.locator('main section').filter({ has: P.locator(':scope > .eyebrow', { hasText: new RegExp(`^${eyebrow}$`) }) }).first().locator('.settings-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(' ›', '').trim());
// the buttons of a sheet's head, in their order
const headActs = async (sheet) => sheet.locator('.sheet-head .sheet-head-acts > button').evaluateAll((bs) => bs.map((x) => x.getAttribute('aria-label')));
const swipe = async (loc, frac) => {
  const box = await loc.boundingBox();
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width - 20; // on the playing handicap – not in a field
  await P.mouse.move(x0, y);
  await P.mouse.down();
  for (let k = 1; k <= 12; k++) await P.mouse.move(x0 - (box.width * frac * k) / 12, y);
  await P.mouse.up();
  await P.waitForTimeout(500);
};

// ---------- r9 / r10 / r11: Neue Runde ----------
await P.getByRole('button', { name: 'Neue Runde' }).click();
await P.fill('#course-search', 'Hetzenhof');
await P.waitForTimeout(1500);
await P.locator('button.list-item').first().click();
await P.getByText('Runde starten').waitFor({ timeout: 60000 });
await P.waitForTimeout(1500);
{
  const h = await heads();
  ok(h.join('|') === 'FORMAT|PLATZ|SPIELER|MITSPIELER EINLADEN|SCORE-ERFASSUNG|WORUM|EINSTELLUNGEN', `r9: Was → Wo → Wer (Spieler, Einladen, Score-Erfassung) → Worum → Einstellungen (${h.join(' · ')})`);
  ok((await P.locator('.topbar h1').innerText()).trim() === 'Neue Runde', 'r9: the title "Neue Runde" – the course a row below');
  const fmt = await rowsOf('Format');
  ok(fmt.map((t) => t.split(' ')[0]).join('|') === 'Rundenart|Modus|Scoring', `r9: Format – ${fmt.join(' | ')}`);
  const wo = await rowsOf('Platz');
  ok(/^Platz Golfclub Hetzenhof/.test(wo[0] ?? '') && (await P.getByRole('group', { name: 'Löcher' }).locator('.choice-loop').count()) > 0, `r9: Wo – "${wo[0]}", the holes below`);
  const set = await rowsOf('Einstellungen');
  ok(/^HCP-Vorgabe 100 %$/.test(set[0] ?? ''), `r9: Einstellungen – ${set.join(' | ')}`);
  ok(/^Wer erfasst/.test((await rowsOf('Score-Erfassung'))[0] ?? '') && /^Sidebet/.test((await rowsOf('Worum'))[0] ?? ''), 'r9: "Wer erfasst" after the invitation, the side bet under "Worum"');
}
// the course row leads back to the course search
await P.locator('.settings-row').filter({ hasText: /^Platz/ }).click();
await P.locator('#course-search').waitFor({ timeout: 10000 });
ok(await P.locator('#course-search').isVisible(), 'r9: "Platz ›" opens the course search');
await P.fill('#course-search', 'Hetzenhof');
await P.waitForTimeout(1500);
await P.locator('button.list-item').first().click();
await P.getByText('Runde starten').waitFor({ timeout: 60000 });
await P.getByRole('button', { name: /A · 9 Löcher/ }).click();

// r11: no friends – a row, its sheet titled "Freunde"
{
  const row = P.getByRole('button', { name: /^Freunde\s*verknüpfen/ });
  ok((await row.count()) === 1 && (await P.getByText(/Golffreunde verknüpfen/).count()) === 0, 'r11: the row "Freunde · verknüpfen ›" – no grey text link');
  await row.click();
  const sheet = P.getByRole('dialog', { name: 'Freunde' });
  await sheet.waitFor({ timeout: 5000 });
  ok((await sheet.locator('.sheet-head strong').innerText()).trim() === 'Freunde' && !(await sheet.locator('h1.tab-title').isVisible()), 'r11: the sheet titled "Freunde" – the title not twice');
  await shot('friends');
  await sheet.getByRole('button', { name: 'Schließen' }).first().click();
}

// r10: Ben removed by swiping, back with "Rückgängig"
await P.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await P.getByLabel('Spieler 2', { exact: true }).fill('Ben');
await P.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await P.getByLabel('Spieler 3', { exact: true }).fill('Chris');
await shot('round');
{
  const cards = P.locator('.player-row');
  const visibleX = await cards.evaluateAll((cs) => cs.flatMap((c) => [...c.querySelectorAll('button')]).filter((x) => x.textContent.trim() === '✕' && x.getBoundingClientRect().width > 2).length);
  ok(visibleX === 0 && (await P.locator('.player-remove').count()) === 0, 'r10: no "✕" on a player card');
  ok((await P.locator('.swipe').filter({ has: P.locator('.player-row') }).count()) === 2 && (await P.locator('.player-row').first().locator('xpath=..').getAttribute('class')) !== 'swipe-front player-swipe', 'r10: the other players swipeable, the own row not');
  // a little: the red bin shows
  const ben = P.locator('.player-row').filter({ has: P.locator('input[value="Ben"]') });
  await swipe(ben, 0.35);
  ok(await P.getByRole('button', { name: 'Ben löschen' }).isVisible(), 'r10: swiped a little – the red bin');
  await shot('swipe');
  {
    const bin = P.getByRole('button', { name: 'Ben löschen' });
    const bb = await bin.boundingBox();
    await bin.click({ position: { x: bb.width - 40, y: bb.height / 2 } }); // the bin's own part, right of the card
  }
  await P.waitForTimeout(500);
  const names = async () => P.locator('.player-row input[id^="name-"]').evaluateAll((is) => is.map((i) => i.value));
  ok(!(await names()).includes('Ben') && (await P.locator('.undo-toast').innerText()).includes('Spieler entfernt'), `r10: Ben removed – "Spieler entfernt · Ben" (${(await names()).join(', ')})`);
  await P.locator('.undo-toast').getByRole('button', { name: 'Rückgängig' }).click();
  await P.waitForTimeout(300);
  ok((await names()).join(',') === 'Sascha,Ben,Chris', `r10: "Rückgängig" – Ben back in his place (${(await names()).join(', ')})`);
  // all the way across: gone at once
  await swipe(P.locator('.player-row').filter({ has: P.locator('input[value="Chris"]') }), 0.9);
  await P.waitForTimeout(400);
  ok((await names()).join(',') === 'Sascha,Ben', `r10: swiped all the way – Chris gone (${(await names()).join(', ')})`);
  // VoiceOver and the keyboard keep a button
  ok((await P.getByRole('button', { name: 'Ben entfernen' }).count()) === 1, 'r10: "Ben entfernen" for VoiceOver');
}

// ---------- g1 / g2 / g3 / o3: Neues Spiel ----------
await P.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await P.reload();
await P.waitForTimeout(1500);
await P.getByRole('button', { name: 'Neues Spiel', exact: true }).click();
await P.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
await P.locator('.sheet .pick-option').filter({ has: P.locator('strong', { hasText: /^Skins$/ }) }).first().click();
await P.waitForTimeout(400);
{
  const h = (await heads()).map((t) => t.split(' · ')[0]);
  ok(h.join('|') === 'SPIELFORM|PLATZ|SPIELER|SCORE-ERFASSUNG|WORUM|EINSTELLUNGEN', `g1: Spielform → Platz → Spieler → Score-Erfassung → Worum → Einstellungen (${h.join(' · ')})`);
}
// o3: "Eigener Einsatz" – "Weiter" in the head
await P.locator('.settings-row').filter({ hasText: /^Worum wird gespielt/ }).click();
await P.locator('.sheet .pick-option').filter({ hasText: /^Eigener Einsatz/ }).first().click();
{
  const s = P.getByRole('dialog', { name: 'Eigener Einsatz' });
  ok(JSON.stringify(await headActs(s)) === '["Schließen","Weiter"]' && (await s.locator('.cap-input button').count()) === 0, `o3: "Eigener Einsatz" – ✕, then the save button "Weiter" in the head (${(await headActs(s)).join(', ')})`);
  await s.getByRole('button', { name: 'Weiter' }).click();
  ok((await s.getByRole('alert').innerText()).includes('Gib ein, worum gespielt wird') && (await s.getByRole('alert').evaluate((e) => e.classList.contains('good-text'))), 'o3: nothing typed – said in green');
  await s.getByRole('textbox').fill('Bier');
  await s.getByRole('button', { name: 'Weiter' }).click();
  await P.getByRole('dialog', { name: 'Wer gibt wem aus' }).locator('.pick-option').first().click();
  ok(/Bier/.test(await P.locator('.settings-row').filter({ hasText: /^Worum wird gespielt/ }).innerText()), 'o3: "Weiter" in the head takes the own stake');
}
// money, then a stake of one's own
await P.locator('.settings-row').filter({ hasText: /^Worum wird gespielt/ }).click();
await P.locator('.sheet .pick-option').filter({ hasText: /^Geld/ }).first().click();
await P.locator('.sheet .pick-option').filter({ hasText: /^Euro/ }).first().click();
{
  const row = P.locator('main section').filter({ has: P.locator(':scope > .eyebrow', { hasText: /^Worum$/ }) }).locator('.settings-row').nth(1);
  const label = (await row.locator('span').first().innerText()).trim();
  await row.click();
  const s = P.getByRole('dialog', { name: label });
  await s.locator('.pick-option').filter({ hasText: /^Anderer Betrag/ }).click();
  ok(JSON.stringify(await headActs(s)) === '["Schließen","Übernehmen"]' && (await s.locator('.cap-input button').count()) === 0, `o3: "Anderer Betrag …" – ✕, then "Übernehmen" in the head (${label})`);
  await shot('stake');
  await s.getByRole('textbox').fill('3');
  await s.getByRole('button', { name: 'Übernehmen' }).click();
  ok((await s.count()) === 0 && /3,00 €|3 €/.test(await row.innerText()), `o3: 3 € taken (${(await row.innerText()).replace(/\s+/g, ' ')})`);
}
await shot('game');
// g2 / g3: 5+5+10
await P.locator('.settings-row').filter({ hasText: 'Spielform' }).first().click();
await P.locator('.sheet .pick-option').filter({ has: P.locator('strong', { hasText: /^5\+5\+10$/ }) }).first().click();
await P.waitForTimeout(400);
{
  const h = await heads();
  ok(h.join('|') === 'SPIELFORM|WERTUNG|WETTEN|TAG|GEGEN WEN|WORUM', `g2: Wertung first, the stakes under "Worum" (${h.join(' · ')})`);
  await P.locator('.settings-row').filter({ hasText: /^Wertung/ }).click();
  await P.getByRole('dialog', { name: 'Wertung' }).locator('.pick-option').filter({ hasText: /^Netto/ }).first().click();
  const h2 = await heads();
  ok(h2[h2.length - 1] === 'EINSTELLUNGEN' && /^Vorgabe 100 %$/.test((await rowsOf('Einstellungen'))[0] ?? ''), `g2: net – "Vorgabe" under "Einstellungen" (${h2.join(' · ')})`);
  ok(await P.getByRole('button', { name: 'Herausfordern' }).isVisible(), 'g2: "Herausfordern" at the end');
  await shot('duel');
  await P.locator('.settings-row').filter({ hasText: /^Gegner/ }).click();
  const s = P.getByRole('dialog', { name: 'Gegner' });
  ok(JSON.stringify(await headActs(s)) === '["Schließen","Fertig"]', `g3: "Gegen wen" – ✕ before the save button (${(await headActs(s)).join(', ')})`);
  await s.getByRole('button', { name: 'Schließen' }).click();
}

// ---------- t4 / t5 / t6 / g3 / o3: Neues Turnier ----------
await P.evaluate(() => sessionStorage.setItem('golfos.module', 'tournaments'));
await P.reload();
await P.waitForTimeout(1500);
await P.getByRole('button', { name: 'Neues Turnier', exact: true }).click();
await P.waitForTimeout(500);
await P.fill('#tour-name', 'Facelift-Cup');
await P.getByRole('button', { name: /Platz wählen/ }).click();
await P.fill('#course-search', 'Hetzenhof');
await P.waitForTimeout(2000);
await P.locator('button.list-item').first().click();
await P.locator('#tour-name').waitFor({ timeout: 30000 });
{
  const h = await heads('main.screen > .setup-part > .eyebrow');
  ok(h.join('|') === 'TURNIER|FORMAT|PLATZ|DATUM|SPIELER|FLIGHTS UND STARTZEITEN|SCORE-ERFASSUNG|EINSTELLUNGEN|SONDERWERTUNGEN (OPTIONAL)', `t5: Was → Wo/Wann → Wer → Einstellungen → Sonderwertungen (${h.join(' · ')})`);
  const fmt = (await rowsOf('Format')).map((t) => t.split(' ')[0]);
  const set = (await rowsOf('Einstellungen')).map((t) => t.split(' ')[0]);
  ok(fmt.join('|') === 'Rundenart|Modus|Scoring|Runden' && set[0] === 'HCP-Vorgabe', `t5: Format ${fmt.join(' | ')} – Einstellungen ${set.join(' | ')}`);
}
await shot('tour');
// g3: Long Drive – ✕ first
await P.locator('.settings-row').filter({ hasText: 'Long Drive' }).click();
{
  const s = P.getByRole('dialog', { name: 'Long Drive' });
  ok(JSON.stringify(await headActs(s)) === '["Schließen","Fertig"]', `g3: "Long Drive" – ✕ before the save button (${(await headActs(s)).join(', ')})`);
  await s.getByRole('button', { name: 'Schließen' }).click();
}
// t6: own classes – the save button in the head, "Vorlagen ›" a row
await P.locator('.settings-row').filter({ hasText: /^HCP-Vorgabe/ }).click();
await P.locator('.sheet .pick-option').filter({ hasText: /^100 %/ }).first().click();
await P.locator('.settings-row').filter({ hasText: 'Netto-Klassen' }).click();
{
  const s = P.getByRole('dialog', { name: 'Netto-Klassen' });
  await s.getByRole('button', { name: /^Eigene/ }).click();
  ok(JSON.stringify(await headActs(s)) === '["Schließen","4 Klassen übernehmen"]' && (await s.locator('.btn-primary').count()) === 0 && (await s.getByText('Zurück zu den Vorlagen').count()) === 0, `t6: "Eigene Klassen" – ✕, the save button in the head, no button below (${(await headActs(s)).join(', ')})`);
  await shot('classes');
  await s.locator('.settings-row').filter({ hasText: /^Vorlagen/ }).click();
  ok((await s.getByRole('button', { name: /^Eigene/ }).count()) === 1, 't6: "Vorlagen ›" – back to the presets');
  await s.getByRole('button', { name: /^Eigene/ }).click();
  await s.getByRole('button', { name: '4 Klassen übernehmen' }).click();
  ok((await s.count()) === 0 && /4 Klassen/.test(await P.locator('.settings-row').filter({ hasText: 'Netto-Klassen' }).innerText()), 't6: the own classes taken');
}
// o3: "Andere Anzahl …" rounds – "Übernehmen" in the head
await P.getByRole('button', { name: /^Runden 1 Runde/ }).click();
{
  const s = P.getByRole('dialog', { name: 'Wie viele Runden' });
  await s.locator('.pick-option').filter({ hasText: /^Andere Anzahl/ }).click();
  ok(JSON.stringify(await headActs(s)) === '["Schließen","Übernehmen"]' && (await s.locator('.cap-input button').count()) === 0, 'o3: "Andere Anzahl …" – "Übernehmen" in the head');
  await s.getByRole('textbox').fill('2');
  await s.getByRole('textbox').press('Enter');
}
ok((await P.getByRole('group', { name: 'Die Runden' }).locator('.settings-row').count()) === 2, 'o3: 2 rounds typed – Enter takes it');
// t4: a round's page – no "Fertig", the quiet line, back with ‹
await P.getByRole('group', { name: 'Die Runden' }).locator('.settings-row').nth(1).click();
await P.waitForTimeout(300);
ok((await P.locator('.topbar h1').innerText()).includes('Runde 2') && (await P.getByRole('button', { name: 'Fertig' }).count()) === 0 && /Änderungen werden übernommen/.test(await P.locator('.autosave-note').innerText()), 't4: "Runde 2" – no "Fertig", "Änderungen werden übernommen"');
await shot('round2');
await P.locator('.topbar .icon-btn').first().click();
ok((await P.locator('#tour-name').inputValue()) === 'Facelift-Cup', 't4: back with ‹ – the tournament');

ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
