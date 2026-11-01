// The offline aerial map in the iOS app (Sascha 01.11.2026): WKWebView has no service worker – the app keeps the tiles
// in its own store (src/lib/tilestore.ts). Here the page believes it is the app (Capacitor's iOS bridge faked, service
// workers blocked):
// 1 · a round on Hetzenhof: "Karte offline gespeichert ✓", the aerial tiles are in the app's store
// 2 · no reception: the tiles come from the store – not one request goes out
// 3 · a service answering "200 OK" with an error page: nothing of it is kept
// Usage: node qa/nativeoffline.mjs [dev url, default http://localhost:5173/]
const { chromium, devices } = await import('playwright');
const { mockNet } = await import('./netmock.mjs');

const url = process.argv[2] ?? 'http://localhost:5173/';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPwyjPBihiGlgQAE6E7AUXeDRsAAAAASUVORK5CYII=', 'base64');
const XML = '<?xml version="1.0"?><ServiceExceptionReport><ServiceException>Dataset not found</ServiceException></ServiceExceptionReport>';
let bad = 0;
const ok = (c, what) => {
  if (!c) bad++;
  console.log(`${c ? '✓' : '✗'} ${what}`);
};
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.7808, longitude: 9.689, accuracy: 6 }, permissions: ['geolocation'], serviceWorkers: 'block' });
// as the app: Capacitor finds its iOS bridge and says "native"
await ctx.addInitScript(() => {
  window.webkit = { messageHandlers: { bridge: { postMessage: () => {} } } };
});
await mockNet(ctx);
let online = true;
let asked = 0;
let lglXml = false;
const tile = (body, type) => async (r) => {
  asked++;
  if (!online) return r.abort('internetdisconnected');
  await r.fulfill({ status: 200, contentType: type, headers: { 'Access-Control-Allow-Origin': '*' }, body }).catch(() => {});
};
await ctx.route(/owsproxy\.lgl-bw\.de\/(?!owsproxy\/wcs)/, (r) => (lglXml ? tile(XML, 'text/xml;charset=UTF-8')(r) : tile(PNG, 'image/png')(r)));
await ctx.route(/server\.arcgisonline\.com\//, tile(PNG, 'image/png'));
const p = await ctx.newPage();
const errs = [];
// the faked bridge has no plugins (the sign-in link listener asks for one) – that is the fake, not the app
p.on('pageerror', (e) => /plugin is not implemented on ios/.test(e.message) || errs.push(e.message));
await p.goto(url);
await p.waitForTimeout(1500);
ok(await p.evaluate(() => typeof window.webkit === 'object' && !('serviceWorker' in navigator && navigator.serviceWorker.controller)), 'the page runs as the app: no service worker');
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
await p.getByText('Runde starten').click();

const stored = () =>
  p.evaluate(
    () =>
      new Promise((ok) => {
        const r = indexedDB.open('golfos-tiles');
        r.onsuccess = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('tiles')) return ok({ n: 0, urls: [], types: [] });
          const all = d.transaction('tiles').objectStore('tiles').getAll();
          all.onsuccess = () => ok({ n: all.result.length, urls: all.result.map((t) => t.url), types: [...new Set(all.result.map((t) => t.type))] });
        };
        r.onerror = () => ok({ n: -1, urls: [], types: [] });
      }),
  );

// 1 · saved for offline
const done = await p.waitForFunction(() => /Karte offline gespeichert ✓/.test(document.body.innerText), null, { timeout: 120000 }).then(() => true, () => false);
ok(done, '"Karte offline gespeichert ✓" in the app');
const s1 = await stored();
ok(s1.n > 50, `the aerial tiles are in the app's store (${s1.n})`);
ok(s1.types.every((t) => t.startsWith('image/')), `only pictures (${s1.types.join(', ')})`);

// 2 · no reception at the aerial services (the app itself still loads from the dev server): every tile from the store
online = false;
const before = asked;
const got = await p.evaluate(async (urls) => {
  let pics = 0;
  for (const u of urls) {
    try {
      const r = await fetch(u, { mode: 'cors' });
      if (r.ok && (r.headers.get('content-type') ?? '').startsWith('image/')) pics++;
    } catch {
      /* not there */
    }
  }
  return pics;
}, s1.urls.slice(0, 40));
ok(got === Math.min(40, s1.urls.length), `offline: ${got} of ${Math.min(40, s1.urls.length)} tiles from the store`);
ok(asked === before, `not one request went out (${asked - before})`);
await p.reload();
await p.waitForTimeout(4000);
ok(asked === before, `the hole map opened again without reception – its tiles from the store (${asked - before} requests out)`);
online = true;

// 3 · an error page as "200 OK" is not kept
lglXml = true;
const kept = await p.evaluate(async () => {
  const u = 'https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C?SERVICE=WMS&REQUEST=GetMap&qa=xml';
  const r = await fetch(u, { mode: 'cors' }).catch(() => null);
  await new Promise((res) => setTimeout(res, 500));
  return { status: r?.status ?? 0, u };
});
const s3 = await stored();
ok(kept.status === 200 && !s3.urls.includes(kept.u), 'an error page from the service: not kept');

ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await b.close();
process.exit(bad ? 1 : 0);
