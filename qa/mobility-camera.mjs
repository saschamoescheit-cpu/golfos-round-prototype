// The real camera chain of the mobility screen with real people (no synthetic player): the camera is replaced by a
// canvas stream that shows a photo (e.g. the preview picture of a test video), then getUserMedia → <video> →
// MediaPipe pose (WASM + model served by the app) → skeleton → framing check, in WebKit (the Safari engine).
// Usage: node mobility-camera.mjs <app url> <dir with .jpg photos> [test name] [out dir]
import { webkit, chromium, devices } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const dir = process.argv[3];
const testName = process.argv[4] ?? 'Einbeinstand';
const out = process.argv[5] ?? dir;
const photos = readdirSync(dir).filter((f) => f.endsWith('.jpg'));
const b = process.env.EDGE ? await chromium.launch({ channel: 'msedge', args: ['--use-fake-ui-for-media-stream'] }) : await webkit.launch();
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
for (const photo of photos) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
  const dataUrl = `data:image/jpeg;base64,${readFileSync(resolve(dir, photo)).toString('base64')}`;
  // the camera: a canvas that keeps drawing the photo (a stream needs new frames)
  await ctx.addInitScript((src) => {
    const fake = async () => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      const draw = () => {
        g.drawImage(img, 0, 0);
        requestAnimationFrame(draw);
      };
      draw();
      return c.captureStream(30);
    };
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    navigator.mediaDevices.getUserMedia = fake;
  }, dataUrl);
  const p = await ctx.newPage();
  // WebKit on Windows has no camera: the photo goes straight into the pose model (golfos.mobility.fakeImage)
  const still = !process.env.EDGE;
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url);
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.lang.v1', 'de');
  });
  if (still) await p.evaluate((d) => localStorage.setItem('golfos.mobility.fakeImage', d), dataUrl);
  await p.reload();
  await p.locator('.module-card').filter({ hasText: 'Beweglichkeits-Screening' }).click();
  await p.locator('.mob-test-row').filter({ hasText: testName }).first().click();
  await p.getByRole('button', { name: 'Test starten' }).click();
  await p.getByRole('button', { name: 'Kamera starten' }).click();
  const t0 = Date.now();
  // the model loads (≈ 22 MB the first time), then the status shows what the camera sees
  let status = '';
  let seen = false;
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(1000);
    status = (await p.locator('.mob-status').textContent().catch(() => '')) ?? '';
    const pixels = await p.evaluate(() => {
      const c = document.querySelector('.mob-stage canvas');
      if (!c || !c.width) return 0;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let k = 0; k < d.length; k += 16) if (d[k + 3] > 0) n++;
      return n;
    });
    if (pixels > 50) {
      seen = true;
      break;
    }
    if (await p.locator('.mob-error').isVisible().catch(() => false)) break;
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  const err = await p.locator('.mob-error').textContent().catch(() => null);
  await p.waitForTimeout(1500);
  status = (await p.locator('.mob-status').textContent().catch(() => '')) ?? '';
  await p.screenshot({ path: resolve(out, `cam-${photo.replace('.jpg', '')}.png`) });
  ok(seen && !err, `${photo}: skeleton after ${secs} s · status „${status}“${err ? ' · ' + err : ''}`);
  if (errs.length) console.log('   errors:', errs.slice(0, 3).join(' | '));
  await ctx.close();
}
await b.close();
console.log(bad ? `${bad} FAILED` : 'all green');
process.exit(bad ? 1 : 0);
