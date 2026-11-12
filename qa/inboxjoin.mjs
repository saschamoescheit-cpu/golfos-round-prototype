// QA (Sascha 13.11.2026, Inbox-Mockups 7: "Beitrittsanfrage – zusätzlich in der Inbox mit Zulassen, falls du das Blatt
// weggetippt hast"): a round this phone hosts, Chris asks to join – the notice on the screen as ever, and in the inbox
// "Chris möchte deiner Runde beitreten" with "Zulassen" and "Ablehnen"; "Zulassen" there lets him in on the server and
// the notice goes too. Supabase simulated (qa/sharesim.mjs), the app real. Usage: node qa/inboxjoin.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;
const at = new Date().toISOString();
sim.shared.set('JOIN01', { game: { kind: 'round-event', id: 'ev1', name: 'Hetzenhof', tournament: false, course: { id: 'c', name: 'Golfclub Hetzenhof' }, loopOrder: ['A'], holes: [], createdAt: at, flights: {} }, updated_at: at, owner: 'Sascha', members: [], requests: { Chris: { name: 'Chris', hcp: '12,4', at, state: 'asked' } } });
await H.evaluate(() => localStorage.setItem('golfos.hosted.v1.JOIN01', String(Date.now() + 3600 * 1000)));
await H.reload();
const notice = H.getByRole('alertdialog', { name: 'Chris möchte beitreten' });
await notice.waitFor({ timeout: 15000 }).catch(() => {});
ok((await notice.count()) === 1, 'the notice on the screen, as before');
if (process.env.SHOTS) await H.screenshot({ path: `${process.env.SHOTS}/inboxjoin-before.png` });
// "Später": the notice gone – the request waits in the inbox (it covered the inbox at the top)
await notice.getByRole('button', { name: 'Später' }).click();
await H.waitForTimeout(300);
ok((await notice.count()) === 0, '"Später": the notice gone');
await H.locator('.bell-btn').first().click();
const inbox = H.getByRole('dialog', { name: 'Inbox' });
const row = inbox.getByRole('group', { name: 'Chris möchte deiner Runde beitreten' });
await row.waitFor({ timeout: 5000 }).catch(() => {});
ok((await row.count()) === 1 && /HCP 12,4/.test(await row.innerText()) && (await row.getByRole('button', { name: 'Chris ablehnen' }).count()) === 1, 'in the inbox: "Chris möchte deiner Runde beitreten" – HCP, "Ablehnen", "Zulassen"');
if (process.env.SHOTS) await H.screenshot({ path: `${process.env.SHOTS}/inboxjoin.png` });
await row.getByRole('button', { name: 'Chris zulassen' }).click();
await H.waitForTimeout(1200);
ok(sim.shared.get('JOIN01').requests.Chris.state === 'ok' && sim.shared.get('JOIN01').members.includes('Chris'), 'server: Chris let in');
ok((await inbox.getByRole('group', { name: 'Chris möchte deiner Runde beitreten' }).count()) === 0 && (await notice.count()) === 0, 'answered: gone from the inbox and the notice');
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
