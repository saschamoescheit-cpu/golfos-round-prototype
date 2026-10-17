// Stills of the 3D test videos (dev page anim3d-preview.html) for a visual check against the test texts.
// Usage: node mobility-3d.mjs <dev server url> <out dir> [clip id] [view] [stills]
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? '.';
const clip = process.argv[4] ?? '';
const view = process.argv[5] ?? '';
const n = process.argv[6] ?? '6';
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1460, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const q = new URLSearchParams({ ...(clip === 'lab' ? { lab: '1' } : clip ? { clip } : {}), ...(view ? { view } : {}), n });
await p.goto(`${url}anim3d-preview.html?${q}`);
await p.waitForFunction(() => document.body.dataset.done === '1', null, { timeout: 300000 });
const name = `3d-${clip || 'all'}${view ? '-' + view : ''}.png`;
await p.screenshot({ path: resolve(out, name), fullPage: true });
console.log(name, errs.length ? 'errors: ' + errs.slice(0, 3).join(' | ') : 'ok');
await b.close();
