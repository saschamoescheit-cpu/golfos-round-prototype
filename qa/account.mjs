// QA: sign in with a user name and password besides Google (Sascha 22.10.2026, as in Schlaufuchs). The iPhone creates
// the account, the iPad signs in with the user name (a wrong password first), the password is changed, a third device
// meets a taken user name and signs in with the e-mail. Against a simulated Supabase (sign-in, functions, tables).
// Usage: node qa/account.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};

// ---- the simulated server ----
const users = new Map(); // email → { id, password }
const names = new Map(); // username → user id
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub) => `${b64({ alg: 'none' })}.${b64({ sub })}.x`;
const subOf = (req) => {
  const t = (req.headers()['authorization'] ?? '').replace('Bearer ', '');
  try {
    return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).sub;
  } catch {
    return null;
  }
};
const session = (u, email) => ({ access_token: jwt(u.id), refresh_token: `r-${u.id}`, expires_in: 3600, token_type: 'bearer', user: { id: u.id, email } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, prefer', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,OPTIONS' };
async function server(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const u = new URL(req.url());
  const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  if (u.pathname === '/auth/v1/signup') {
    if (users.has(body.email)) return json(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
    const name = body.data?.golfos_username;
    if (name && names.has(name)) return json(500, { code: 500, error_code: 'unexpected_failure', msg: 'Database error saving new user' });
    const user = { id: `u${users.size + 1}`, password: body.password };
    users.set(body.email, user);
    if (name) names.set(name, user.id);
    return json(200, session(user, body.email));
  }
  if (u.pathname === '/auth/v1/token') {
    const user = users.get(body?.email);
    if (!user || user.password !== body.password) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return json(200, session(user, body.email));
  }
  if (u.pathname === '/auth/v1/user' && req.method() === 'PUT') {
    const uid = subOf(req);
    const e = [...users].find(([, x]) => x.id === uid);
    if (body.password) e[1].password = body.password;
    return json(200, { id: uid, email: e[0] });
  }
  if (u.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = u.pathname.split('/').pop();
    if (fn === 'golfos_name_free') return json(200, !names.has(body.p_username));
    if (fn === 'golfos_login_email') {
      const uid = names.get(body.p_username);
      const e = [...users].find(([, x]) => x.id === uid && x.password === body.p_password);
      return json(200, e ? e[0] : null);
    }
    // delete the own account (final list, 22.10.2026): its rows, its name, the account
    if (fn === 'golfos_delete_me') {
      const uid = subOf(req);
      for (const [e, x] of users) if (x.id === uid) users.delete(e);
      for (const [n, id] of names) if (id === uid) names.delete(n);
      return route.fulfill({ status: 204, headers: cors, body: '' });
    }
    if (fn === 'golfos_set_username') {
      for (const [n, id] of names) if (id === subOf(req)) names.delete(n);
      names.set(body.p_username, subOf(req));
      return route.fulfill({ status: 204, headers: cors, body: '' });
    }
  }
  if (u.pathname === '/rest/v1/golfos_names') return json(200, [...names].filter(([, id]) => id === subOf(req)).map(([username]) => ({ username })));
  // the synced rows: nothing on the server, everything accepted
  if (req.method() === 'GET') return json(200, []);
  return route.fulfill({ status: 201, headers: cors, body: '' });
}

const errs = [];
const b = await webkit.launch();
async function device(name, dev) {
  const ctx = await b.newContext({ ...devices[dev], locale: 'de-DE' });
  await mockNet(ctx);
  await ctx.route(/supabase\.co\/(auth|rest)\//, server);
  await ctx.routeWebSocket(/supabase\.co\/realtime/, (ws) => ws.onMessage((m) => {
    const d = JSON.parse(String(m));
    if (d.event === 'phx_join') ws.send(JSON.stringify({ topic: d.topic, event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: d.ref }));
  }));
  const p = await ctx.newPage();
  // WebKit does not route the CORS preflight through the mock – reported as access control, not the app
  p.on('pageerror', (e) => !/(supabase\.co|localhost:\d+).*access control|sw\.js load failed/.test(e.message) && errs.push(`${name}: ${e.message}`));
  await p.goto(url);
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    sessionStorage.setItem('golfos.module', 'rounds');
  });
  await p.reload();
  await p.waitForTimeout(800);
  await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
  await p.waitForTimeout(400);
  return p;
}
const until = async (fn, ms = 10000) => {
  for (let t = 0; t < ms; t += 400) {
    if (await fn().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};
const signedAs = (p, n) => until(() => p.locator('.profile-account').getByText(`Angemeldet als ${n}`).isVisible());

// iPhone: create the account
const phone = await device('iPhone', 'iPhone 13');
ok(await phone.getByRole('button', { name: 'Mit Google anmelden' }).isVisible(), 'not signed in: Google stays');
// one form with its heading, the other way a green line under the button (Facelift 11.11.2026, "konto")
ok((await phone.locator('.segmented').count()) === 0 && (await phone.getByRole('form', { name: 'Anmelden' }).count()) === 1 && (await phone.locator('.account-title').innerText()) === 'Anmelden', 'the form "Anmelden" with its heading, no block of two buttons');
await phone.getByRole('button', { name: 'Noch kein Konto? Konto anlegen' }).click();
ok((await phone.locator('.account-title').innerText()) === 'Konto anlegen' && (await phone.getByRole('button', { name: 'Schon ein Konto? Anmelden' }).count()) === 1, 'the green line switches to "Konto anlegen" – and back with "Schon ein Konto? Anmelden"');
await phone.fill('#acc-name', 'Sascha.M');
await phone.fill('#acc-email', 'sascha@example.com');
await phone.fill('#acc-pw', 'kurz');
ok(await phone.locator('.account-form button[type=submit]').isDisabled(), 'a too short password: "Konto anlegen" locked');
await phone.fill('#acc-pw', 'geheim123');
await phone.locator('.account-form button[type=submit]').click();
ok(await signedAs(phone, 'sascha.m'), 'iPhone: signed in after creating the account ("Angemeldet als sascha.m")');
ok(names.get('sascha.m') === 'u1', 'the user name in lower case on the server');

// iPad: a wrong password first, then the right one
const ipad = await device('iPad', 'iPad Pro 11');
await ipad.fill('#acc-name', ' sascha.M ');
await ipad.fill('#acc-pw', 'falsch123');
await ipad.locator('.account-form button[type=submit]').click();
ok(await until(() => ipad.getByRole('alert').filter({ hasText: 'stimmt nicht' }).isVisible()), 'iPad: a wrong password is said');
ok(await ipad.getByRole('alert').evaluate((el) => el.classList.contains('notice') && !el.classList.contains('bad-text')), 'said as the green notice, not as a red error (Facelift O4)');
await ipad.fill('#acc-pw', 'geheim123');
await ipad.locator('.account-form button[type=submit]').click();
ok(await signedAs(ipad, 'sascha.m'), 'iPad: signed in with user name + password');

// signed in: the block "Konto" – the sign-in details as rows (Facelift 11.11.2026, P6: "Benutzername ›", "Passwort ändern ›",
// the password confirmed with the save button in the sheet's head), "Abmelden" and "Konto löschen" in one bar (P4)
{
  const acc = ipad.getByRole('region', { name: 'Konto', exact: true });
  const rows = (await acc.locator('.settings-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  ok(rows.length === 2 && /^Benutzername sascha\.m ›$/.test(rows[0]) && /^Passwort ändern ›$/.test(rows[1]), `iPad signed in: the rows ${rows.join(' | ')}`);
  const bar = (await acc.locator('.sc-actions .sc-action').allInnerTexts()).map((t) => t.trim());
  ok(bar.join('|') === 'Abmelden|Konto löschen' && (await acc.locator('.sc-action.danger').innerText()).trim() === 'Konto löschen' && (await ipad.locator('main .btn-ghost').count()) === 0, `one bar: ${bar.join(' | ')} – deleting red and last, no ghost buttons`);
  await acc.locator('.settings-row').filter({ hasText: 'Passwort' }).click();
  const sh = ipad.getByRole('dialog', { name: 'Passwort ändern' });
  await sh.waitFor();
  const save = sh.locator('.sheet-head').getByRole('button', { name: 'Speichern' });
  ok(await save.isDisabled(), 'the password sheet: the save button in its head, locked while too short');
  await sh.locator('#ed-pw').fill('neu12345');
  await save.click();
  ok((await until(async () => (await ipad.getByRole('dialog', { name: 'Passwort ändern' }).count()) === 0)) && users.get('sascha@example.com')?.password === 'neu12345', 'a tap on the save button: the new password on the server, the sheet closed');
  await acc.locator('.settings-row').filter({ hasText: 'Passwort' }).click();
  await ipad.getByRole('dialog', { name: 'Passwort ändern' }).locator('#ed-pw').fill('geheim123');
  await ipad.getByRole('dialog', { name: 'Passwort ändern' }).locator('#ed-pw').press('Enter');
  ok(await until(async () => users.get('sascha@example.com')?.password === 'geheim123'), 'Enter confirms as the save button does (back to the old password)');
}

// a third device: the user name is taken; then the e-mail with the new password
const pc = await device('PC', 'Desktop Chrome');
await pc.getByRole('button', { name: 'Noch kein Konto? Konto anlegen' }).click();
await pc.fill('#acc-name', 'sascha.m');
await pc.fill('#acc-email', 'andere@example.com');
await pc.fill('#acc-pw', 'geheim456');
await pc.locator('.account-form button[type=submit]').click();
ok(await until(() => pc.getByRole('alert').filter({ hasText: 'schon vergeben' }).isVisible()), 'a taken user name is said');
await pc.getByRole('button', { name: 'Schon ein Konto? Anmelden' }).click();
await pc.fill('#acc-name', 'sascha@example.com');
await pc.fill('#acc-pw', 'geheim123');
await pc.locator('.account-form button[type=submit]').click();
ok(await signedAs(pc, 'sascha.m'), 'PC: signed in with the e-mail and the new password');

// delete the account (final list, Sascha 22.10.2026): asked once more; the phone keeps its data – since the Facelift
// (11.11.2026, P4) the red last action of the account's bar, asked as everywhere (ConfirmSheet: head with ✕, "Zurück")
await pc.evaluate(() => localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ id: 'keep-me' }])));
await pc.getByRole('button', { name: 'Konto löschen' }).click();
const ask = pc.getByRole('dialog', { name: 'Konto löschen?' });
ok(/auf diesem Handy bleiben/.test(await ask.innerText()) && (await ask.getByRole('button', { name: 'Zurück' }).count()) === 1 && (await ask.getByRole('button', { name: 'Schließen' }).count()) === 1, 'deleting asks once more (ConfirmSheet): the data on this phone stay');
await ask.getByRole('button', { name: 'Zurück' }).click();
ok((await pc.getByRole('dialog', { name: 'Konto löschen?' }).count()) === 0 && (await pc.getByRole('button', { name: 'Konto löschen' }).count()) === 1, '"Zurück": nothing deleted');
await pc.getByRole('button', { name: 'Konto löschen' }).click();
await ask.getByRole('button', { name: 'Endgültig löschen' }).click();
ok(await until(() => pc.getByText('Dein Konto ist gelöscht').isVisible()), 'the account deleted, said so');
ok(!users.has('sascha@example.com') && ![...names.keys()].includes('sascha.m'), 'on the server: the account and its user name gone');
ok((await pc.evaluate(() => localStorage.getItem('golfos.rounds.v1'))).includes('keep-me'), 'the rounds on the phone kept');
ok((await pc.getByRole('button', { name: 'Konto löschen' }).count()) === 0, 'signed out: no "Konto löschen" any more');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
