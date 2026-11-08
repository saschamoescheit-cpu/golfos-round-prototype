// The Apple Watch, simulated (Sascha 08.11.2026: "the shot detection by the watch – the phone often lies in the cart").
// The page believes it is the iOS app; a fake WatchLink plugin stands in for the watch:
// 1 · the round starts: the round goes to the watch with its holes, its workout is started once, "Apple Watch verbunden"
// 2 · a swing on the watch: a "shot here" of the round at the watch's place, said on the screen; sent twice: once
// 3 · a practice swing, then the shot at the same spot: one shot (the later one, the practice swing kept with it)
// 4 · a shot taken back on the watch: gone from the round
// 5 · the hole changed on the watch: the phone goes along, and tells the watch its hole
// Usage: node qa/watchsim.mjs [dev url]
const { chromium, devices } = await import('playwright');
const { mockNet } = await import('./netmock.mjs');

const url = process.argv[2] ?? 'http://localhost:5173/';
let bad = 0;
const ok = (c, what) => {
  if (!c) bad++;
  console.log(`${c ? '✓' : '✗'} ${what}`);
};
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.7808, longitude: 9.689, accuracy: 6 }, permissions: ['geolocation'], serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  // as the app: Capacitor finds its iOS bridge; the only plugin there is the watch's
  window.webkit = { messageHandlers: { bridge: { postMessage: () => {} } } };
  const w = (window.__watch = { rounds: [], holes: [], items: [], listeners: [], started: 0, ended: 0 });
  const methods = ['status', 'round', 'hole', 'end', 'take', 'forget', 'samples', 'removeListener'].map((name) => ({ name, rtype: 'promise' }));
  window.Capacitor = {
    PluginHeaders: [{ name: 'WatchLink', methods: [...methods, { name: 'addListener', rtype: 'callback' }] }],
    nativePromise: async (plugin, method, o) => {
      if (plugin !== 'WatchLink') throw Object.assign(new Error(`"${plugin}" plugin is not implemented on ios`), { code: 'UNIMPLEMENTED' });
      if (method === 'status') return { supported: true, paired: true, installed: true, reachable: true };
      if (method === 'round') {
        w.rounds.push({ ...JSON.parse(o.json), hole: o.hole });
        if (o.start) w.started++;
        return { started: !!o.start, why: '' };
      }
      if (method === 'hole') w.holes.push(o.hole);
      if (method === 'end') w.ended++;
      if (method === 'take') return { items: w.items };
      if (method === 'samples') return { count: 0, uri: '' };
      return undefined;
    },
    nativeCallback: async (plugin, method, o, cb) => {
      if (plugin === 'WatchLink' && method === 'addListener' && o.eventName === 'watch') w.listeners.push(cb);
      return `cb${w.listeners.length}`;
    },
  };
  window.__watchSend = (item) => {
    w.items.push(item);
    for (const cb of w.listeners) cb(item);
  };
});
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => /plugin is not implemented on ios/.test(e.message) || errs.push(e.message));
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(1500);
await p.locator('button.list-item').first().click();
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.waitForTimeout(4000);

// 1 · the round to the watch
const w = await p.evaluate(() => window.__watch);
const sent = w.rounds.at(-1);
ok(!!sent && sent.holes.length === 9 && !!sent.holes[0]?.tee && !!sent.holes[0]?.center, `the round to the watch: 9 holes with tee and green (${sent?.holes.length})`);
ok(w.started === 1, `its workout started once (${w.started})`);
ok((await p.getByText(/Apple Watch verbunden/).count()) > 0, '"Apple Watch verbunden" on the screen');
const roundId = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].id);
const tee = sent.holes[0].tee;
const green = sent.holes[0].center;
const along = (f) => [tee[0] + (green[0] - tee[0]) * f, tee[1] + (green[1] - tee[1]) * f];
const shot = (id, f, dt, hit, extra = {}) => ({ kind: 'shot', shot: { id, round: roundId, hole: 0, t: Date.now() + dt, lng: along(f)[0], lat: along(f)[1], acc: 4, peak: 24, jolt: hit ? 5 : 0, full: true, hit, manual: false, ...extra } });
const manual = () => p.evaluate(() => (JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].manualShots ?? []).map((x) => ({ watch: x.watch, hole: x.hole, also: x.also ?? [] })));

// 2 · a swing: a shot of the round, said on the screen – the same swing again: once
await p.evaluate((it) => window.__watchSend(it), shot('w1', 0.01, 0, true));
await p.waitForTimeout(800);
let m = await manual();
ok(m.length === 1 && m[0].watch === 'w1' && m[0].hole === 0, `the swing is a shot of the round on hole 1 (${JSON.stringify(m)})`);
ok((await p.getByText(/Schlag 1 an 1A? – von der Uhr/).count()) > 0, '"Schlag 1 an 1A – von der Uhr" on the screen');
await p.evaluate((it) => window.__watchSend(it), shot('w1', 0.01, 0, true));
await p.waitForTimeout(500);
ok((await manual()).length === 1, 'the same swing again: still one');

// 3 · a practice swing, then the shot 20 s later at the same spot: one shot
await p.evaluate((it) => window.__watchSend(it), shot('w2', 0.6, 60000, false));
await p.evaluate((it) => window.__watchSend(it), shot('w3', 0.6, 80000, true));
await p.waitForTimeout(800);
m = await manual();
ok(m.length === 2 && m[1].watch === 'w3' && m[1].also.includes('w2'), `practice swing + shot at one spot: one shot (${JSON.stringify(m)})`);

// 4 · taken back on the watch
await p.evaluate(() => window.__watchSend({ kind: 'remove', id: 'w3' }));
await p.waitForTimeout(600);
m = await manual();
ok(m.length === 1 && m[0].watch === 'w1', `taken back on the watch: gone (${m.length})`);

// 5 · the hole changed on the watch
await p.evaluate(() => window.__watchSend({ kind: 'hole', hole: 1, t: Date.now() }));
await p.waitForTimeout(1200);
const cur = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].currentHole);
ok(cur === 1, `the phone goes along to hole 2 (${cur})`);
const holes = await p.evaluate(() => window.__watch.holes);
ok(holes.at(-1) === 1, `and tells the watch its hole (${holes.join(',')})`);
// an old hole change (the app woke up later): left alone
await p.evaluate(() => window.__watchSend({ kind: 'hole', hole: 4, t: Date.now() - 10 * 60000 }));
await p.waitForTimeout(800);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].currentHole)) === 1, 'a hole change from 10 minutes ago: left alone');
ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' / ') : ''}`);
await b.close();
process.exit(bad ? 1 : 0);
