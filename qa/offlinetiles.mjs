// The offline map really ends up on the phone (Sascha 25.10.2026: "Karte wird offline gespeichert bleibt öfters
// hängen"). Built app with its service worker:
// 1 · a round on Hetzenhof: the hint runs to "✓" and the aerial tiles are in the offline store (17.–25.10. none were:
//     the worker's tile rule threw on every request)
// 2 · the app goes to the background half way: the hint goes, back on screen it goes on from where it was, not from 0
// 3 · the state's service answers with error pages (LGL 25.10.: "Dataset not found" as XML): nothing of it is kept, Esri
//     is kept instead, and the hint ends – no percentage left standing
// Usage: node qa/offlinetiles.mjs [built app url, default http://localhost:4173/]
// the tiles go through the service worker: its requests are mocked too only with this switch (else they went to the
// real services – the LGL sent its error pages all morning)
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium, devices } = await import('playwright');
const { mockNet } = await import('./netmock.mjs');

const url = process.argv[2] ?? 'http://localhost:4173/';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPwyjPBihiGlgQAE6E7AUXeDRsAAAAASUVORK5CYII=', 'base64');
const XML = '<?xml version="1.0"?><ServiceExceptionReport><ServiceException code="LayerNotDefined">Dataset IMAGES_DOP_20_RGB not found</ServiceException></ServiceExceptionReport>';
let bad = 0;
const ok = (c, what) => {
  if (!c) bad++;
  console.log(`${c ? '✓' : '✗'} ${what}`);
};
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

/** A fresh phone with the app, its service worker in charge; lgl: 'png' | 'xml'; slow: ms per Esri/LGL tile. */
async function phone({ lgl, slow = 0 }) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.7808, longitude: 9.689, accuracy: 6 }, permissions: ['geolocation'], serviceWorkers: 'allow' });
  await mockNet(ctx);
  const tile = (body, type) => async (r) => {
    if (slow) await new Promise((res) => setTimeout(res, slow));
    await r.fulfill({ status: 200, contentType: type, headers: { 'Access-Control-Allow-Origin': '*' }, body }).catch(() => {});
  };
  await ctx.route(/owsproxy\.lgl-bw\.de\/(?!owsproxy\/wcs)/, lgl === 'xml' ? tile(XML, 'text/xml;charset=UTF-8') : tile(PNG, 'image/png'));
  await ctx.route(/server\.arcgisonline\.com\//, tile(PNG, 'image/png'));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url);
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    sessionStorage.setItem('golfos.module', 'rounds');
  });
  await p.reload();
  await p.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30000 }).catch(() => {});
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.waitForTimeout(1500);
  await p.locator('button.list-item').first().click();
  await p.getByText('Runde starten').click();
  return { ctx, p, errs };
}
const hint = (p) => p.locator('.map-shot').allInnerTexts().then((xs) => xs.find((x) => /offline/.test(x)) ?? '');
const pct = (s) => Number(/(\d+)\s*%/.exec(s)?.[1] ?? -1);
const store = (p) =>
  p.evaluate(async () => {
    const out = { lgl: 0, esri: 0, notPicture: 0 };
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      for (const k of await c.keys()) {
        if (!/lgl-bw|arcgisonline/.test(k.url)) continue;
        const r = await c.match(k);
        if (!(r?.headers.get('content-type') ?? '').startsWith('image/')) out.notPicture++;
        else if (k.url.includes('lgl-bw')) out.lgl++;
        else out.esri++;
      }
    }
    return out;
  });

// 1 + 2 · a normal round, sent to the background half way
{
  const { ctx, p, errs } = await phone({ lgl: 'png', slow: 120 });
  await p.waitForFunction(() => /offline gespeichert · ([2-9]\d|1\d)\s*%/.test(document.body.innerText), null, { timeout: 120000 }).catch(() => {});
  const before = pct(await hint(p));
  ok(before >= 10, `saving runs (${before} %)`);
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(800);
  ok(!/offline/.test(await hint(p)), 'in the background the hint goes (no frozen percentage)');
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(400);
  const after = pct(await hint(p));
  ok(after >= before, `back on screen it goes on from ${before} % (${after} %), not from 0`);
  await p.waitForFunction(() => document.body.innerText.includes('offline gespeichert ✓'), null, { timeout: 240000 }).catch(() => {});
  ok((await p.locator('body').innerText()).includes('offline gespeichert ✓'), 'the hint ends with "Karte offline gespeichert ✓"');
  await p.waitForTimeout(1500);
  const s = await store(p);
  ok(s.lgl >= 200, `the aerial tiles are in the offline store (${s.lgl} LGL tiles)`);
  ok(s.notPicture === 0, 'nothing but pictures in it');
  ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
  await ctx.close();
}

// 3 · the state's service sends error pages
{
  const { ctx, p, errs } = await phone({ lgl: 'xml' });
  const t0 = Date.now();
  let stuck = '';
  await p
    .waitForFunction(() => !/offline gespeichert ·/.test(document.body.innerText), null, { timeout: 180000, polling: 500 })
    .catch(async () => (stuck = await hint(p)));
  // a moment for the first percentages to come and go
  await p.waitForTimeout(500);
  await p.waitForFunction(() => !/offline gespeichert ·/.test(document.body.innerText), null, { timeout: 180000, polling: 500 }).catch(async () => (stuck = await hint(p)));
  ok(!stuck, `the hint ends (${Math.round((Date.now() - t0) / 1000)} s)${stuck ? ' – stood at ' + stuck : ''}`);
  await p.waitForTimeout(1500);
  const s = await store(p);
  ok(s.notPicture === 0, `no error page kept as a map tile (${s.notPicture})`);
  ok(s.esri >= 200, `Esri kept instead – the map the app shows then (${s.esri} tiles)`);
  ok(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.includes('golfos.offline') && localStorage.getItem(k)?.includes('lgl')))), 'not marked as saved: the next opening tries the state again');
  ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
  await ctx.close();
}

await b.close();
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);
