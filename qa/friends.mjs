// QA (Sascha 02.11.2026: "friends linked to their accounts – the handicap from their own profile"; "a QR code of one's
// own as with PayPal, an invitation by WhatsApp"; "typing friends by hand stays – a symbol tells linked and typed
// apart"): Sascha's friend code, Chris accepts by the link, Ben by the typed code, a guest is asked to sign in first;
// Sascha's handicap changed in his profile reaches Chris; Chris typed by hand on Sascha's phone becomes the linked one;
// removing ends it for both. Supabase is simulated (qa/sharesim.mjs), the app is real.
// Usage: node qa/friends.mjs [url]
import { webkit } from 'playwright';
import { sharedServer, tokenOf } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const { phone, cards, links } = sharedServer(b, url);

/** The start page's friends tab (out of the module the phone opened in). */
async function friendsTab(p) {
  await p.evaluate(() => sessionStorage.removeItem('golfos.module'));
  await p.reload();
  await p.waitForTimeout(1200);
  await p.getByRole('navigation', { name: 'Menü' }).getByRole('button', { name: 'Freunde' }).click();
  await p.waitForTimeout(1500);
}
const row = (p, name) => p.locator('.card').filter({ has: p.getByText(name, { exact: true }) });
const linkedMark = '[aria-label="Verknüpft – aus seinem Profil"]';
const typedMark = '[aria-label="Von Hand angelegt"]';

// Sascha: Chris typed by hand already (HCP 20), then his own friend code
const sascha = await phone('Sascha');
const S = sascha.p;
await friendsTab(S);
await S.getByRole('button', { name: '+ Freund hinzufügen' }).click();
await S.locator('input[id^="fname-"]').last().fill('Chris');
await S.locator('input[id^="fhcp-"]').last().fill('20');
await S.locator('.friend-code-text').waitFor({ timeout: 10000 });
const shown = (await S.locator('.friend-code-text').innerText()).trim();
const code = shown.replace(/-/g, '');
// 6 digits, shown 123-456 (Sascha 03.11.2026: "12 characters are a lot, only digits")
ok(/^\d{3}-\d{3}$/.test(shown) && (await S.getByLabel('Mein Freundes-Code als QR-Code').isVisible()), `Sascha: his friend code with its QR code (${code})`);
ok(cards.get('Sascha')?.hcp_index === '10', 'server: his card from his profile (HCP 10)');
ok((await S.locator(typedMark).count()) >= 1 && (await S.locator('.friend-typed').count()) === 1, 'Sascha: Chris typed by hand, with the pen');
ok((await S.getByRole('button', { name: 'Einladung senden' }).isEnabled()) && (await S.getByRole('button', { name: 'QR-Code scannen' }).isVisible()), 'Sascha: "Einladung senden" and "QR-Code scannen"');

// Chris opens the link (as from WhatsApp): asked, accepts
const chris = await phone('Chris');
const C = chris.p;
await C.goto('about:blank');
await C.goto(`${url}#friend=${code}`);
const ask = C.getByRole('dialog', { name: 'Freundschaftsanfrage' });
await ask.waitFor({ timeout: 15000 });
await ask.getByText('Sascha möchte mit dir befreundet sein', { exact: false }).waitFor({ timeout: 10000 }).catch(() => null);
ok(/Sascha möchte mit dir befreundet sein/.test(await ask.innerText()), 'Chris: "Sascha möchte mit dir befreundet sein"');
await ask.getByRole('button', { name: 'Annehmen' }).click();
await ask.getByText('Du und Sascha seid befreundet ✓').waitFor({ timeout: 10000 });
ok(links.has('Chris|Sascha') && links.has('Sascha|Chris'), 'server: friends both ways');
await ask.getByRole('button', { name: 'Schließen' }).click();
await C.waitForTimeout(500);
ok(/HCP 10/.test(await row(C, 'Sascha').innerText()) && (await row(C, 'Sascha').locator(linkedMark).count()) === 1, "Chris: Sascha linked – HCP 10 from Sascha's profile, with the chain");

// Sascha: his Chris typed by hand is the linked one now – one Chris, HCP from Chris's profile
await friendsTab(S);
ok((await S.locator('.friend-typed').count()) === 0 && (await row(S, 'Chris').count()) === 1 && /HCP 10/.test(await row(S, 'Chris').innerText()), 'Sascha: Chris typed by hand became the linked one (HCP 10 from his profile, not 20)');

// Sascha changes his handicap in his profile: Chris sees it
await S.getByRole('navigation', { name: 'Menü' }).getByRole('button', { name: 'Profil' }).click();
await S.waitForTimeout(600);
await S.fill('#pf-hcp', '9,5');
await S.waitForTimeout(6000);
ok(cards.get('Sascha')?.hcp_index === '9,5', `server: Sascha's card follows his profile (${cards.get('Sascha')?.hcp_index})`);
await friendsTab(C);
ok(/HCP 9,5/.test(await row(C, 'Sascha').innerText()), "Chris: Sascha's new handicap 9,5");
const kept = await C.evaluate(() => JSON.parse(localStorage.getItem('golfos.friends.v1')).find((f) => f.name === 'Sascha'));
ok(kept?.hcp === '9,5' && !!kept.uid, 'Chris: the friend for the flight with HCP 9,5 (the chips in the round setup)');

// Ben types the code
const ben = await phone('Ben');
const B = ben.p;
await friendsTab(B);
await B.getByRole('button', { name: 'Code eingeben' }).click(); // an icon, the field in its sheet (03.11.2026)
await B.getByLabel('Code deines Freundes').fill(`${code.slice(0, 3)} ${code.slice(3)}`);
ok((await B.getByLabel('Code deines Freundes').inputValue()) === shown, `typed with a space: shown ${shown} as he types`);
await B.getByRole('button', { name: 'Los' }).click();
const bask = B.getByRole('dialog', { name: 'Freundschaftsanfrage' });
await bask.waitFor({ timeout: 10000 });
await bask.getByRole('button', { name: 'Annehmen' }).click();
await bask.getByText(/seid befreundet/).waitFor({ timeout: 10000 });
ok(links.has('Ben|Sascha'), 'Ben: the typed code – friends');
await bask.getByRole('button', { name: 'Schließen' }).click();
// the scanner opens (no camera in the test browser: it says so)
await B.getByRole('button', { name: 'QR-Code scannen' }).click();
const scan = B.getByRole('dialog', { name: 'QR-Code scannen' });
await scan.waitFor({ timeout: 5000 });
await B.waitForTimeout(1500);
ok(await scan.isVisible(), `Ben: the scanner (${(await scan.innerText()).replace(/\s+/g, ' ').slice(0, 90)})`);
await scan.getByRole('button', { name: 'Schließen' }).click();

// a guest (not signed in) opens the link: sign in first, the request waits
const guest = await phone('Gast', { guest: true });
const G = guest.p;
await G.goto('about:blank');
await G.goto(`${url}#friend=${code}`);
const gask = G.getByRole('dialog', { name: 'Freundschaftsanfrage' });
await gask.waitFor({ timeout: 15000 });
await gask.getByText(/melde dich zuerst an/).waitFor({ timeout: 10000 }).catch(() => null);
ok(/melde dich zuerst an/.test(await gask.innerText()) && (await gask.getByRole('button', { name: 'Annehmen' }).count()) === 0, 'guest: "sign in first" – no accepting without an account');
ok((await G.evaluate(() => localStorage.getItem('golfos.friendask.v1'))) === code, 'guest: the request waits for the sign-in');
// Chris's way (03.11.2026: "he opened the invitation, signed in – then nothing happened"): "Anmelden" leads to the profile;
// signed in, the app starts anew on the start page – the request is there again, on any screen, and he accepts
await gask.getByRole('button', { name: 'Anmelden' }).click();
await G.waitForTimeout(400);
ok((await G.getByRole('navigation', { name: 'Menü' }).getByRole('button', { name: 'Profil' }).getAttribute('aria-current')) === 'page' || (await G.getByText('Auf allen Geräten').count()) > 0, 'guest: "Anmelden" opens the profile');
await G.evaluate((token) => {
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Gast', lastName: '', hcpIndex: '30', homeClub: '' }));
  localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: token, refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: 'gast@test', name: 'Gast' }));
  sessionStorage.setItem('golfos.module', 'rounds');
}, tokenOf('Gast'));
await G.goto('about:blank');
await G.goto(url);
const gask2 = G.getByRole('dialog', { name: 'Freundschaftsanfrage' });
await gask2.getByRole('button', { name: 'Annehmen' }).waitFor({ timeout: 15000 }).catch(() => null);
ok((await gask2.getByRole('button', { name: 'Annehmen' }).count()) === 1, 'signed in, in Rounds: the request is there again, "Annehmen"');
await gask2.getByRole('button', { name: 'Annehmen' }).click();
await gask2.getByText(/seid befreundet/).waitFor({ timeout: 10000 }).catch(() => null);
ok(/du stehst jetzt auch in der Liste von Sascha/.test(await gask2.innerText()), 'accepted: friends both ways, said so');
await gask2.getByRole('button', { name: 'Schließen' }).click();

// own code: no request to oneself
await S.goto('about:blank');
await S.goto(`${url}#friend=${code}`);
const sask = S.getByRole('dialog', { name: 'Freundschaftsanfrage' });
await sask.waitFor({ timeout: 15000 });
await sask.getByText(/dein eigener Code/).waitFor({ timeout: 10000 }).catch(() => null);
ok(/dein eigener Code/.test(await sask.innerText()), 'Sascha: his own code – "Das ist dein eigener Code"');
await sask.getByRole('button', { name: 'Schließen' }).click();

// Chris swipes Sascha away, as everything in the app (03.11.2026): gone at once, "Rückgängig" brings him back; swiped
// again and the toast over, the link ends for both – on Sascha's phone Chris stays, typed by hand
const swipeAway = (p, name) =>
  p.locator('.swipe').filter({ hasText: name }).first().evaluate((el) => {
    const f = el.querySelector('.swipe-front');
    const r = f.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const fire = (type, x) => f.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true }));
    fire('pointerdown', r.right - 10);
    for (let x = r.right - 20; x > r.left - 40; x -= 30) fire('pointermove', x);
    fire('pointerup', r.left - 40);
  });
await friendsTab(C);
ok((await row(C, 'Sascha').getByRole('button', { name: /entfernen/ }).count()) === 0, 'Chris: no ✕ on the friend – swiped instead');
await swipeAway(C, 'Sascha');
await C.waitForTimeout(600);
ok((await row(C, 'Sascha').count()) === 0 && /Freund entfernt/.test(await C.locator('.undo-toast').innerText()) && links.has('Chris|Sascha'), 'swiped: gone from the list, "Freund entfernt · Rückgängig", still linked meanwhile');
await C.locator('.undo-toast').getByRole('button', { name: 'Rückgängig' }).click();
await C.waitForTimeout(9000);
ok((await row(C, 'Sascha').count()) === 1 && links.has('Chris|Sascha'), '"Rückgängig": Sascha back, still friends after the toast');
await swipeAway(C, 'Sascha');
await C.waitForTimeout(9500);
ok(!links.has('Chris|Sascha') && !links.has('Sascha|Chris') && (await row(C, 'Sascha').count()) === 0, 'Chris: Sascha removed – for both');
await friendsTab(S);
ok((await S.locator('.friend-typed').count()) === 1 && (await S.locator('input[id^="fname-"]').first().inputValue()) === 'Chris', 'Sascha: Chris stays, typed by hand (the pen)');
// typed by hand: swiped away too, "Rückgängig" brings him back
await S.locator('.swipe').filter({ has: S.locator('.friend-typed') }).first().evaluate((el) => {
  const f = el.querySelector('.swipe-front');
  const r = f.getBoundingClientRect();
  const y = r.top + 12;
  const fire = (type, x) => f.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true }));
  fire('pointerdown', r.right - 10);
  for (let x = r.right - 20; x > r.left - 40; x -= 30) fire('pointermove', x);
  fire('pointerup', r.left - 40);
});
await S.waitForTimeout(600);
ok((await S.locator('.friend-typed').count()) === 0 && /Freund entfernt/.test(await S.locator('.undo-toast').innerText()), 'Sascha swipes Chris (typed by hand) away: "Freund entfernt"');
await S.locator('.undo-toast').getByRole('button', { name: 'Rückgängig' }).click();
await S.waitForTimeout(400);
ok((await S.locator('input[id^="fname-"]').first().inputValue().catch(() => '')) === 'Chris', '"Rückgängig": Chris back');

ok([sascha, chris, ben, guest].every((x) => x.errs.length === 0), `no page errors ${[sascha, chris, ben, guest].flatMap((x) => x.errs).slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
