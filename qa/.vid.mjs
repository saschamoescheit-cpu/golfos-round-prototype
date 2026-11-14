import { webkit, chromium } from 'playwright';
const dir = process.argv[2];
for (const [name, eng] of [['webkit', webkit], ['chromium', chromium]]) {
  const b = await eng.launch();
  const p = await b.newPage({ viewport: { width: 3300, height: 1650 } });
  await p.goto(`file:///${dir}/p.html`);
  const info = await p.evaluate(() => new Promise((res) => { const v = document.getElementById('v'); if (v.readyState >= 1) res({ d: v.duration }); v.onloadedmetadata = () => res({ d: v.duration, w: v.videoWidth, h: v.videoHeight }); v.onerror = () => res({ err: v.error?.code }); setTimeout(() => res({ timeout: true }), 8000); }));
  console.log(name, JSON.stringify(info));
  if (info.d) {
    for (let k = 0; k < 23; k++) {
      const t = k + 0.5;
      await p.evaluate((t) => new Promise((res) => { const v = document.getElementById('v'); v.onseeked = () => res(); v.currentTime = t; }), t);
      await p.waitForTimeout(300);
      await p.locator('#v').screenshot({ path: `${dir}/f${String(k).padStart(2, '0')}.png` });
    }
    await b.close();
    break;
  }
  await b.close();
}
