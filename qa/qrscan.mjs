// QA (Sascha 03.11.2026: "scanning the QR code does not work" – on the phone the scanner said "no camera" while the
// camera ran: the built app packs jsQR as a module, the scanner looked for self.jsQR only). A real scan: Sascha's
// friend code as the QR code his phone shows, filmed by a fake camera (a Y4M video of that very QR code), Ben's phone
// scans it under Friends → "Freundschaftsanfrage" from Sascha. Run against the BUILT app (the dev server packs it
// differently): node qa/qrscan.mjs http://localhost:4174/
import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:4174/';
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
// one simulated server for two browsers: the first shows the code, the second films it
let current = await chromium.launch();
const browser = { newContext: (...a) => current.newContext(...a) };
const { phone } = sharedServer(browser, url);
const friendsTab = async (p) => {
  await p.evaluate(() => sessionStorage.removeItem('golfos.module'));
  await p.reload();
  await p.waitForTimeout(1200);
  await p.getByRole('navigation', { name: 'Menü' }).getByRole('button', { name: 'Freunde' }).click();
};

// Sascha's QR code as pixels
const S = (await phone('Sascha')).p;
await friendsTab(S);
await S.locator('.friend-code-text').waitFor({ timeout: 15000 });
const W = 640;
const H = 480;
const Q = 400; // the QR code's side in the picture
const gray = await S.evaluate(async ({ W, H, Q }) => {
  const svg = document.querySelector('.qr-box svg');
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  x.drawImage(img, (W - Q) / 2, (H - Q) / 2, Q, Q);
  const d = x.getImageData(0, 0, W, H).data;
  const out = new Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  return out;
}, { W, H, Q });
ok(gray.length === W * H && gray.some((v) => v < 60) && gray.some((v) => v > 200), "Sascha's friend code drawn as a picture");
// a Y4M video of it (4:2:0, the colour planes grey)
const frame = Buffer.concat([Buffer.from('FRAME\n'), Buffer.from(gray), Buffer.alloc((W / 2) * (H / 2) * 2, 128)]);
const y4m = path.join(os.tmpdir(), `golfos-qr-${Date.now()}.y4m`);
fs.writeFileSync(y4m, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...Array(20).fill(frame)]));

// the same QR code as a photo file – for the phone whose camera gives no picture (the iPhone app, 03.11.2026)
const png = await S.evaluate(async () => {
  const svg = document.querySelector('.qr-box svg');
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 1600;
  const x = c.getContext('2d');
  x.fillStyle = '#ddd';
  x.fillRect(0, 0, 1200, 1600);
  x.fillStyle = '#fff';
  x.fillRect(250, 450, 700, 700);
  x.drawImage(img, 300, 500, 600, 600);
  return c.toDataURL('image/png').split(',')[1];
});
const cedric = await phone('Cedric');
const Cd = cedric.p;
await friendsTab(Cd);
await Cd.getByRole('button', { name: 'QR-Code scannen' }).click();
const cscan = Cd.getByRole('dialog', { name: 'QR-Code scannen' });
await cscan.locator('.notice').waitFor({ timeout: 12000 }).catch(() => {});
ok(/Foto vom Code/.test(await cscan.locator('.notice').innerText().catch(() => '')), 'no camera: it says so – and offers the photo');
await cscan.locator('input[type="file"]').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
const cask = Cd.getByRole('dialog', { name: 'Freundschaftsanfrage' });
await cask.getByText('Sascha').first().waitFor({ timeout: 10000 }).catch(() => {});
ok(/Sascha/.test(await cask.innerText().catch(() => '')), 'a photo of the QR code: "Freundschaftsanfrage" from Sascha');

// Ben's phone, its camera filming that picture
current = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] });
const ben = await phone('Ben');
const B = ben.p;
await B.context().grantPermissions(['camera']);
await friendsTab(B);
await B.getByRole('button', { name: 'QR-Code scannen' }).click();
const scan = B.getByRole('dialog', { name: 'QR-Code scannen' });
const ask = B.getByRole('dialog', { name: 'Freundschaftsanfrage' });
await ask.waitFor({ timeout: 15000 }).catch(() => {});
const problem = await scan.locator('.notice').innerText().catch(() => '');
ok(!/Keine Kamera|startet nicht|startet hier nicht|kein Bild/.test(problem), `the scanner starts – no "no camera" (${problem || 'no notice'})`);
ok(await ask.isVisible(), 'Ben scanned Sascha\'s QR code: "Freundschaftsanfrage"');
await ask.getByText('Sascha').first().waitFor({ timeout: 8000 }).catch(() => {});
ok(/Sascha/.test(await ask.innerText().catch(() => '')), 'the request is from Sascha');
// the camera off again once read (the red camera mark on the iPhone stayed on)
ok((await B.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.srcObject).length)) === 0, 'the camera is off once the code is read');

// typing the code: the field takes the room, "Los" beside it (03.11.2026: the field was squeezed to a sliver)
await ask.getByRole('button', { name: 'Schließen' }).click().catch(() => {});
await B.getByRole('button', { name: 'Code eingeben' }).click();
const typeSheet = B.getByRole('dialog', { name: 'Code eingeben' });
const field = await typeSheet.locator('input').boundingBox();
const go = await typeSheet.getByRole('button', { name: 'Los' }).boundingBox();
ok(field && go && field.width > go.width * 2, `the code field takes the room (${Math.round(field?.width ?? 0)} px, "Los" ${Math.round(go?.width ?? 0)} px)`);

fs.unlinkSync(y4m);
await current.close();
process.exit(fails ? 1 : 0);
