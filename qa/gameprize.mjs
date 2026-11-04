// QA (Sascha 04.11.2026): "Neues Spiel" played for a thing – "drinks, food: 1×, not 5×; and 18 holes for one drink must be
// possible". Skins for drinks: 1 × Getränk a skin. 5+5+10 for drinks: front and back none, the 18 one drink – the front
// offers "Ohne". The game form changed afterwards keeps the rule. Back to money: the form's own stakes.
// Usage: node qa/gameprize.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
await p.goto(url);
await p.waitForTimeout(1000);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '10', homeClub: '' }));
  sessionStorage.setItem('golfos.module', 'games');
});
await p.reload();
await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Neues Spiel', exact: true }).first().click();
await p.waitForTimeout(400);
const row = (label) => p.locator('.settings-row').filter({ hasText: new RegExp(`^${label}`) }).first();
const value = async (label) => (await row(label).locator('.settings-value').innerText()).trim();
const form = async (name) => {
  await row('Spielform').click();
  await p.getByRole('dialog', { name: 'Spielform wählen' }).locator('.pick-option').filter({ hasText: name }).first().click();
  await p.waitForTimeout(300);
};
await form(/^Skins/);
await row('Worum wird gespielt').click();
await p.getByRole('dialog', { name: 'Worum wird gespielt' }).getByRole('button', { name: /^Getränke/ }).click();
await p.getByRole('dialog', { name: 'Wer gibt wem aus' }).locator('.pick-option').first().click();
await p.waitForTimeout(300);
ok((await value('Einsatz je Skin')) === '1 × Getränk', `Skins for drinks: 1 × Getränk a skin, not 5 (${await value('Einsatz je Skin')})`);
// 5+5+10: one drink on the 18, front and back none
await form(/^5\+5\+10/);
ok((await value('Vorne')) === 'ohne' && (await value('Hinten')) === 'ohne' && (await value('Gesamt')) === '1 × Getränk', `5+5+10 for drinks: vorne ohne, hinten ohne, gesamt 1 × Getränk (${await value('Vorne')} · ${await value('Hinten')} · ${await value('Gesamt')})`);
await row('Vorne').click();
{
  const opts = (await p.locator('.sheet .pick-option strong').allInnerTexts()).join('|');
  ok(/^Ohne\|1 × Getränk\|2 × Getränk/.test(opts), `the front offers "Ohne" (${opts})`);
  await p.locator('.sheet .pick-option').filter({ hasText: /^2 × Getränk/ }).first().click();
}
ok((await value('Vorne')) === '2 × Getränk', 'the front set to 2 × Getränk');
// back to money: the form's own stakes
await row('Worum wird gespielt').click();
await p.getByRole('dialog', { name: 'Worum wird gespielt' }).getByRole('button', { name: /^Geld/ }).click();
await p.getByRole('dialog', { name: 'Geld – die Währung' }).getByRole('button', { name: /^Euro/ }).click();
await p.waitForTimeout(300);
ok(/5/.test(await value('Vorne')) && /10/.test(await value('Gesamt')), `money again: the form's stakes (${await value('Vorne')} · ${await value('Gesamt')})`);
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
