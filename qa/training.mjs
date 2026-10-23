// The Training module (15.10.2026): module choice, library, category, drill with a result, favourite, plan →
// session (next, pause, continue, finish – no timer since 16.10.2026), progress, search, own plan, shop → cart → checkout (simulated),
// delete a session with undo, English. Usage: node training.mjs <app url> [shots dir]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// WebKit reports an aborted cross-origin load (the weather of the home screen, open-meteo) as a page error on
// navigation – the app catches it; not an error of the page
p.on('pageerror', (e) => !/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message) && errs.push(e.message));
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const shot = async (n) => shots && p.screenshot({ path: `${shots}/flow-${n}.png`, fullPage: true });
const tab = (name) => p.locator('.tabbar button').filter({ hasText: name }).click();
const back = () => p.locator('.topbar .icon-btn').first().click();

await p.goto(url);
await p.waitForTimeout(1500);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '12,4', homeClub: '' }));
});
await p.reload();
await p.waitForTimeout(800);
ok((await p.locator('.module-card').count()) === 4, 'four modules on the start page');
await p.locator('.module-card').filter({ hasText: 'Training' }).click();
await p.waitForTimeout(800);
await p.getByRole('heading', { name: 'Wissen' }).waitFor({ timeout: 20000 }).catch(() => {});
ok(await p.getByRole('heading', { name: 'Wissen' }).isVisible(), 'Training opens on the library');
const tabs = await p.locator('.tabbar button').allInnerTexts();
ok(tabs.join('|') === 'Wissen|Üben|Verlauf|Shop|Profil', `menu: ${tabs.join(' · ')}`);
ok(await p.locator('.tr-today').isVisible(), 'drill of the day');
ok((await p.getByText('So funktioniert').count()) === 0, 'no intro card (Sascha 16.10.2026)');
const cats = await p.locator('.tr-cat').count();
ok(cats >= 17, `${cats} topics`);
await p.reload();
// (the app needs about a second to boot after a reload in the dev server – wait for the heading, not a fixed time)
await p.getByRole('heading', { name: 'Wissen' }).waitFor({ timeout: 10000 }).catch(() => {});
ok(await p.getByRole('heading', { name: 'Wissen' }).isVisible(), 'a reload stays in Training');

// category and drill
await p.locator('.tr-cat').filter({ hasText: 'Chippen' }).first().click();
await p.waitForTimeout(300);
ok((await p.locator('.topbar h1').innerText()) === 'Chippen', 'category page');
ok((await p.locator('.tr-drill-row').count()) >= 10, 'chipping has its drills');
await p.locator('button.chip').filter({ hasText: 'Könner' }).click();
const adv = await p.locator('.tr-drill-row').count();
await p.locator('button.chip').filter({ hasText: /^alle$/ }).first().click();
ok(adv > 0 && adv < (await p.locator('.tr-drill-row').count()), 'level filter works');
// the topic page is split into tabs, products are not listed there (Sascha 16.10.2026)
const topicTabs = await p.locator('.tr-tabs [role="tab"]').allInnerTexts();
ok(topicTabs.length === 4 && topicTabs[0].startsWith('Übungen') && topicTabs[1] === 'Grundlagen', `topic tabs: ${topicTabs.join(' · ')}`);
ok((await p.locator('.tr-gear-row, .tr-product').count()) === 0, 'no product list on the topic page');
await p.getByRole('tab', { name: 'Grundlagen' }).click();
ok((await p.locator('.tr-intro-text').isVisible()) && (await p.locator('.tr-drill-row').count()) === 0, 'basics tab shows only the knowledge');
const firstSection = p.locator('.tr-coll').first();
ok((await firstSection.locator('.tr-sketch svg').count()) >= 1 && (await firstSection.locator('.tr-section-drill').count()) === 1, 'a basics section has a picture and its drill');
ok((await p.locator('.tr-video-thumb img').count()) >= 1, 'video with a preview picture in the basics');
// moving pictures (Sascha 17.10.2026): the chip stroke as a 3D video (the golfer of Agility), the still picture stays
const stroke = p.locator('.tr-coll').filter({ hasText: 'Die Bewegung' }).first();
if (!(await stroke.locator('.tr-coll-body').count())) await stroke.locator('.tr-coll-head').click();
const btn3d = stroke.locator('.tr-motion-btn');
ok((await btn3d.getAttribute('aria-label')) === '3D-Video abspielen' && (await btn3d.innerText()).trim() === '', 'the chip stroke has a 3D video – a symbol in the picture, no text button (Sascha 17.10.2026)');
const pic = await stroke.locator('.tr-sketch-pic').boundingBox();
const bb = await btn3d.boundingBox();
ok(pic && bb && bb.x + bb.width > pic.x + pic.width - 20 && bb.y + bb.height > pic.y + pic.height - 20, 'the play symbol sits in the bottom right corner of the picture');
const box = await btn3d.boundingBox();
ok(box && box.height >= 44, 'the 3D button is big enough to tap');
await btn3d.click();
await stroke.locator('.tr-3d canvas').waitFor({ timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1500);
ok((await stroke.locator('.tr-3d canvas').count()) === 1 && (await stroke.locator('.tr-3d-step').innerText()).length > 3, '3D video plays and names the step');
ok((await stroke.locator('.tr-3d-views .chip').allInnerTexts()).join('|') === 'Vorne|Hinten|Schräg|Oben', 'views: Vorne · Hinten · Schräg · Oben');
await btn3d.click();
ok((await stroke.locator('.tr-3d').count()) === 0 && (await stroke.locator('.tr-sketch-pic > svg').count()) === 1, 'the close symbol brings back the still picture');
await p.getByRole('tab', { name: 'Fehler' }).click();
await p.locator('.list .list-item').first().click();
await p.waitForTimeout(200);
// the fault picture as a 3D video: the fault and the right way side by side
const faultFig = p.locator('figure.tr-sketch').first();
const faultBtn = faultFig.locator('.tr-motion-btn');
ok((await faultBtn.getAttribute('aria-label')) === '3D-Video abspielen', 'the fault picture has a 3D video');
await faultBtn.click();
await faultFig.locator('.tr-3d canvas').waitFor({ timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1200);
ok((await faultFig.locator('.tr-3d-views .chip').allInnerTexts()).join('|') === 'Vorne|Schräg|Oben', 'the fault pair: views Vorne · Schräg · Oben');
await faultBtn.click();
ok((await faultFig.locator('.tr-3d').count()) === 0, 'back to the fault picture');
ok((await p.locator('.tr-fault dt').count()) === 3 && (await p.locator('.tr-drill-row').count()) >= 1, 'a fault leads to cause, cure and drills');
await back();
ok((await p.getByRole('tab', { name: 'Fehler' }).getAttribute('aria-selected')) === 'true', 'back returns to the same tab');
await p.getByRole('tab', { name: /^Übungen/ }).click();
// (Landering plays its 3D video since 18.10.2026 – the moving top view is checked on a drill that keeps it)
await p.locator('.tr-drill-row .list-item').filter({ hasText: 'Chips in einen Korb' }).click();
await p.waitForTimeout(300);
ok(await p.locator('.tr-sketch svg').first().isVisible(), 'drill shows its sketch');
// the ball moves on the top view: it flies onto the ring and rolls to the hole
const topFig = p.locator('figure.tr-sketch').first();
const topStill = await topFig.locator('svg[role="img"]').innerHTML();
await topFig.locator('.tr-motion-btn').click();
await p.waitForTimeout(700);
ok((await topFig.locator('svg[role="img"]').innerHTML()) !== topStill, 'the ball flies and rolls on the top view');
await topFig.locator('.tr-motion-btn').click();
ok((await topFig.locator('svg[role="img"]').innerHTML()) === topStill, 'Stopp brings back the still top view');
ok(await p.locator('.tabbar').isVisible(), 'the menu stays at the bottom on the drill page (Sascha 16.10.2026)');
// Landering: its 3D video with the ring and the hole (18.10.2026); the checks below go on with it
await back();
await p.locator('.tr-drill-row .list-item').filter({ hasText: 'Landering' }).click();
await p.waitForTimeout(300);
ok((await p.locator('figure.tr-sketch').first().locator('.tr-motion-btn').getAttribute('aria-label')) === '3D-Video abspielen', 'Landering plays a 3D video');
// the drill page in tabs (Sascha 17.10.2026: no one-pager)
ok((await p.getByRole('tab').allInnerTexts()).join('|') === 'Anleitung|Ergebnis|Videos|Zubehör', 'drill page tabs: Anleitung · Ergebnis · Videos · Zubehör');
ok((await p.locator('.tr-steps li').count()) >= 2 && (await p.locator('.tr-log').count()) === 0, 'Anleitung shows the steps, not the result part');
await p.locator('.tr-fav').click();
await p.getByRole('tab', { name: 'Ergebnis' }).click();
ok((await p.locator('.tr-targets .mine').innerText()).includes('Hcp 11–20'), 'target of the player’s band is highlighted (hcp 12.4)');
for (let i = 0; i < 11; i++) await p.locator('.tr-result button').nth(1).click();
await p.getByRole('button', { name: 'Ergebnis speichern' }).click();
ok(await p.getByRole('button', { name: 'Gespeichert ✓' }).isVisible(), 'result saved');
ok((await p.locator('.tr-history li').count()) === 1, 'result in the list');
// removing a result can be undone (like deleting a round)
await p.locator('.tr-history .tr-hist-remove').first().click();
ok((await p.locator('.tr-history li').count()) === 0 && (await p.locator('.undo-toast').isVisible()), 'removing a result shows Undo');
await p.locator('.undo-toast button').click();
ok((await p.locator('.tr-history li').count()) === 1, 'Undo brings the result back');
await shot('drill');
await p.getByRole('tab', { name: 'Videos' }).click();
// video loads only on tap
ok((await p.locator('iframe').count()) === 0, 'no video before tapping');
await p.locator('.tr-video-cover').first().click();
ok((await p.locator('iframe[src*="youtube-nocookie.com"]').count()) === 1, 'video loads from youtube-nocookie on tap');
// gear belongs to the drill
await p.getByRole('tab', { name: 'Zubehör' }).click();
const gearRows = p.locator('.tr-gear-row');
ok((await gearRows.count()) >= 1 && (await gearRows.first().innerText()).includes('EyeLine'), 'the drill shows its own gear');
await gearRows.first().locator('.chip').click();
ok((await gearRows.first().locator('.chip').innerText()).includes('im Korb'), 'gear into the cart from the drill');
await gearRows.first().locator('.tr-gear-row-main').click();
await p.waitForTimeout(300);
ok(await p.getByText('Im Warenkorb').isVisible(), 'gear page knows it is in the cart');
await back();
ok((await p.getByRole('tab', { name: 'Zubehör' }).getAttribute('aria-selected')) === 'true', 'back from the gear page: the same tab of the drill');
await back();
await back();
await p.waitForTimeout(300);
ok(await p.getByRole('heading', { name: 'Deine Favoriten' }).isVisible(), 'favourite on the library page');
ok((await p.locator('.tr-block').filter({ has: p.getByRole('heading', { name: 'Zuletzt angesehen' }) }).locator('.tr-mini').first().innerText()).includes('Landering'), 'library: the drill opened last is offered again');

// fault finder
await p.locator('.chip').filter({ hasText: 'Slice' }).first().click();
ok((await p.locator('.tr-fault dt').count()) === 3 && (await p.locator('.tr-drill-row').count()) >= 3, 'fault finder: Slice shows cause, cure and drills');
await back();

// the built-in metronome on a distance drill (Sascha 16.10.2026)
await p.locator('.tr-search input').fill('Leiter-Übung');
await p.locator('.tr-search input').press('Enter');
await p.locator('.tr-drill-row .list-item').filter({ hasText: 'Leiter-Übung' }).first().click();
await p.waitForTimeout(300);
ok(await p.locator('.tr-metronome').isVisible(), 'the ladder drill has the metronome');
await p.locator('.tr-metronome').getByRole('button', { name: '+' }).click().catch(() => {});
await p.locator('.tr-metro-go').click();
await p.waitForTimeout(1600);
ok((await p.locator('.tr-metro-go').getAttribute('aria-pressed')) === 'true' && (await p.locator('.tr-metro-lights i.on').count()) <= 1, 'metronome runs');
let lit = 0;
for (let k = 0; k < 12; k++) {
  lit += await p.locator('.tr-metro-lights i.on').count();
  await p.waitForTimeout(100);
}
ok(lit > 0, 'metronome beat is shown');
await p.locator('.tr-metro-go').click();
ok((await p.locator('.tr-metro-go').getAttribute('aria-pressed')) === 'false', 'metronome stops');
await back();
await back();
// the full swing gets the tempo trainer 3 : 1 (Tour Tempo)
await p.locator('.tr-search input').fill('3:1-Rhythmus');
await p.locator('.tr-search input').press('Enter');
await p.locator('.tr-drill-row .list-item').filter({ hasText: '3:1-Rhythmus' }).first().click();
await p.waitForTimeout(300);
ok((await p.locator('.tr-metronome').innerText()).toLowerCase().includes('schwung-tempo 3 : 1') && (await p.locator('.tr-metro-lights i').count()) === 3, 'swing drill: tempo trainer 3 : 1 with three sounds');
await p.locator('.tr-metronome .chip').filter({ hasText: '21/7' }).click();
ok((await p.locator('.tr-metro-bpm').innerText()).includes('0,70'), 'tempo 21/7: back 0.70 s');
await back();
await back();

// search
await p.locator('.tr-search input').fill('Tiger');
await p.locator('.tr-search input').press('Enter');
await p.waitForTimeout(300);
ok((await p.locator('.tr-drill-row').filter({ hasText: 'Tiger' }).count()) >= 1, 'search finds the Tiger drill');
await back();

// plan → session
await tab('Üben');
await p.waitForTimeout(300);
ok((await p.locator('.tr-block .list-item').count()) >= 10, 'ready-made plans listed');
await p.locator('.list-item').filter({ hasText: 'Putten 30 Min: Startlinie' }).click();
ok((await p.locator('.tr-plan-row .tr-thumb > svg').count()) === 4, 'every drill of the plan has a small picture (Sascha 16.10.2026)');
await p.getByRole('button', { name: 'Einheit starten' }).click();
await p.waitForTimeout(2300);
ok(await p.locator('.tr-now').isVisible(), 'session runs');
ok((await p.locator('.tr-timer, .tr-timer-time').count()) === 0, 'no timer in the session (Sascha 16.10.2026)');
await shot('session');
for (let i = 0; i < 14; i++) await p.locator('.tr-result button').nth(1).click();
await p.getByRole('button', { name: 'Fertig – nächste Übung' }).click();
ok((await p.locator('.tr-now-name').innerText()).includes('Tiger'), 'next drill after done');
// the arrow without a result opens the result sheet – like the score sheet on a hole
await p.locator('.hole-bar-arrow').last().click();
ok(await p.getByRole('dialog', { name: 'Dein Ergebnis' }).isVisible(), 'drill bar: the arrow without a result opens the result sheet');
await p.getByRole('button', { name: 'Überspringen – nächste Übung' }).click();
ok((await p.locator('.map-hole-no').innerText()) === '3', 'result sheet: skip goes on to the next drill');
// pause through the overview
await p.locator('.hole-bar .map-score').click();
ok((await p.locator('.drawer-row').count()) === 4, 'overview lists the 4 drills');
await p.locator('.drawer-action').filter({ hasText: 'Pausieren' }).click();
await p.waitForTimeout(300);
ok(await p.locator('.list-item').filter({ has: p.locator('.paused-mark') }).first().isVisible(), 'paused session: a row with the pause mark (like a paused round)');
ok((await p.getByText(/^(Weiter|Continue) ›$/).count()) === 0, 'no text link to continue');
// leave to the start page: the module card says a session is paused
await p.locator('.module-switch').click();
ok(await p.getByText('Eine Einheit ist pausiert').isVisible(), 'start page shows the paused session');
await p.locator('.module-card').filter({ hasText: 'Training' }).click();
await p.waitForTimeout(400);
ok(await p.locator('.tr-now').isVisible(), 'opening Training again continues the session');
await back();
await p.getByRole('button', { name: 'Einheit beenden' }).click();
await p.getByRole('button', { name: 'Speichern & beenden' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.tile-num').first().innerText()).startsWith('1/4'), 'result page: 1 of 4 drills done');
await shot('result');
await back();
await p.waitForTimeout(200);
ok(await p.getByRole('heading', { name: 'Deine Übungen' }).isVisible(), 'progress shows the best results');
ok((await p.locator('.tr-goals').innerText()).includes('Ziele für Hcp 11–20'), 'progress: the goals of the player’s handicap band');
ok((await p.locator('.tr-thumb').count()) >= 1, 'progress: bests with the drill picture');
ok(await p.getByRole('heading', { name: 'Letzte Ergebnisse' }).isVisible(), 'progress: the latest results by day');
const sessionsBlock = () => p.locator('.tr-block').filter({ has: p.getByRole('heading', { name: 'Einheiten', exact: true }) });
ok((await sessionsBlock().locator('.list-item').count()) === 1, 'finished session in the list');
// delete with undo
await sessionsBlock().locator('.list-item').first().click();
await p.getByRole('button', { name: 'Einheit löschen' }).click();
await p.waitForTimeout(200);
ok(await p.getByText('Einheit gelöscht').isVisible(), 'undo toast after deleting');
await p.getByRole('button', { name: 'Rückgängig' }).click();
await p.waitForTimeout(300);
await tab('Üben');
await tab('Verlauf');
ok((await sessionsBlock().locator('.list-item').count()) === 1, 'session restored by undo');

// favourites as a session needs two favourites: add the Tiger drill too
await tab('Wissen');
await p.locator('.tr-search input').fill('Tiger');
await p.locator('.tr-search input').press('Enter');
await p.locator('.tr-drill-row .list-item').filter({ hasText: 'Tiger' }).first().click();
await p.locator('.tr-fav').click();
await p.getByRole('button', { name: '+ Zu meiner eigenen Einheit' }).click();
ok((await p.locator('.tr-plan-list li').count()) === 1, 'drill page adds the drill to an own session');
await tab('Üben');
ok(await p.getByRole('button', { name: /Favoriten üben/ }).isVisible(), 'favourites can be practised as a session');

// own plan
await tab('Üben');
await p.getByRole('button', { name: '+ Eigene Einheit zusammenstellen' }).click();
await p.locator('.tr-add').nth(0).click();
await p.locator('.tr-add').nth(3).click();
await p.getByRole('button', { name: 'Plan speichern' }).click();
await p.waitForTimeout(200);
ok((await p.locator('.tr-block').filter({ hasText: 'Meine Pläne' }).locator('.list-item').count()) === 1, 'own plan saved');

// shop
await tab('Shop');
await p.waitForTimeout(800);
const products = await p.locator('.tr-product').count();
ok(products >= 40, `${products} products`);
await p.locator('button.chip').filter({ hasText: 'Preis ↑' }).click();
const firstPrice = await p.locator('.tr-price').first().innerText();
ok(/≈ (8|9)/.test(firstPrice), `sorted by price: cheapest first (${firstPrice})`);
await p.locator('button.chip').filter({ hasText: 'Nach Thema' }).click();
await p.locator('.tr-product').nth(0).locator('.chip').click();
await shot('shop');
await p.locator('.tr-cart-btn').click();
ok((await p.locator('.tr-cart-line').count()) === 2, 'two products in the cart');
await p.getByRole('button', { name: 'Zur Kasse' }).click();
ok((await p.locator('#co-name').inputValue()) === 'Sascha Möscheit', 'checkout takes the name from the profile');
await p.getByRole('button', { name: 'Jetzt bestellen (simuliert)' }).click();
await p.waitForTimeout(300);
ok(await p.getByText('Bestellung aufgenommen – nur im Prototyp').isVisible(), 'order is only simulated');
await p.getByRole('button', { name: 'Zurück zum Shop' }).click();
ok((await p.locator('.tabbar button').filter({ hasText: 'Shop' }).innerText()) === 'Shop', 'cart is empty after the order');
await p.waitForTimeout(1500);
const imgs = await p.locator('img.tr-gear-img').count();
ok(imgs >= 30, `${imgs} manufacturer pictures loaded`);

// Rounds functions named in a drill open with a tap (Sascha 16.10.2026)
await tab('Wissen');
await p.locator('.tr-search input').fill('Gapping');
await p.locator('.tr-search input').press('Enter');
await p.locator('.tr-drill-row .list-item').first().click();
await p.waitForTimeout(300);
await p.locator('.tr-rounds-links .list-item').filter({ hasText: 'Mein Bag' }).click();
await p.waitForTimeout(500);
ok((await p.locator('.topbar h1').innerText()).includes('Mein Bag'), 'drill: "In Rounds öffnen · Mein Bag" opens My bag');
await back();
await p.waitForTimeout(500);
ok((await p.locator('.topbar h1').innerText()).includes('Gapping'), 'back from My bag returns to the drill');
await back();
await back();

// review mode for the golf pro (Sascha 16.10.2026)
await tab('Wissen');
await p.locator('.tr-review-entry').click();
ok((await p.locator('.tr-reviewbar').count()) === 0, 'no review bars while the review mode is off');
await p.getByRole('button', { name: 'Prüfmodus einschalten' }).click();
await p.getByRole('button', { name: 'Nächste ungeprüfte Übung prüfen' }).click();
await p.waitForTimeout(300);
const firstReview = await p.locator('.topbar h1').innerText();
await p.locator('.tr-reviewbar').getByRole('button', { name: '✎ Ändern' }).click();
await p.locator('.tr-reviewbar textarea').fill('Abstände in Metern angeben');
await p.locator('.tr-reviewbar textarea').blur();
await p.getByRole('button', { name: 'Nächste ungeprüfte Übung ›' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.topbar h1').innerText()) !== firstReview, 'review goes on to the next drill');
await p.locator('.tr-reviewbar').getByRole('button', { name: '✕ Streichen' }).click();
await back();
await back();
await p.waitForTimeout(300);
ok((await p.locator('.tile-num').first().innerText()).startsWith('2/'), 'review overview counts 2 marks');
ok((await p.locator('.tr-review-topics').last().innerText()).includes('Abstände in Metern angeben'), 'the change note is listed');
const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Als Datei speichern (.md)' }).click()]);
ok(/golfos-training-pruefung-.*\.md/.test(dl.suggestedFilename()), `review list saved as ${dl.suggestedFilename()}`);
await p.getByRole('button', { name: 'Prüfmodus ist an – ausschalten' }).click();
await back();

// the rules that belong to a topic: the rule book opens at the rule, back leads to Training again (18.10.2026)
await tab('Wissen');
await p.locator('.tr-cat').filter({ hasText: 'Bunker' }).first().click();
await p.getByRole('tab', { name: 'Grundlagen' }).click();
const ruleRow = p.locator('.tr-rules .list-item').first();
ok((await ruleRow.innerText().catch(() => '')).includes('12.2'), 'topic › Grundlagen: „Die Regeln dazu“ names rule 12.2');
await ruleRow.scrollIntoViewIfNeeded();
await ruleRow.click();
await p.waitForTimeout(500);
ok((await p.locator('.rules-book .rule-section.hit').first().innerText().catch(() => '')).includes('Ball im Bunker spielen'), 'the rule book opens at 12.2, marked');
await p.locator('.rules-book .topbar .icon-btn').first().click();
await p.waitForTimeout(300);
ok((await p.locator('.rules-book').count()) === 0 && (await p.locator('.tr-rules').count()) === 1, 'back from the rule: Training again');
await back();

// English
await p.evaluate(() => localStorage.setItem('golfos.lang.v1', 'en'));
await p.reload();
await p.waitForTimeout(800);
await tab('Library');
ok(await p.getByRole('heading', { name: 'Library' }).isVisible(), 'English library');
await p.locator('.tr-cat').filter({ hasText: 'Uneven lies' }).click();
ok((await p.locator('.topbar h1').innerText()) === 'Uneven lies', 'English category');

console.log(errs.length ? `✗ page errors:\n${errs.join('\n')}` : '✓ no page errors');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
