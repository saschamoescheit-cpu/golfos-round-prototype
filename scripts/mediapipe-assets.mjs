// Copies the MediaPipe WASM runtime from node_modules into public/mediapipe before dev and build (mobility screen,
// feature 030), so the app serves it itself – no CDN, works offline after the first use. Only the SIMD build
// (iOS 16.4+), as in the Coach prototype. The pose model itself is committed: public/models/pose_landmarker_full.task.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';

const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dest = 'public/mediapipe';
if (!existsSync(src)) {
  console.warn('mediapipe-assets: @mediapipe/tasks-vision is not installed – skipped');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src)) {
  if (f.includes('nosimd') || f.includes('module')) continue;
  const to = `${dest}/${f}`;
  if (existsSync(to) && statSync(to).size === statSync(`${src}/${f}`).size) continue;
  copyFileSync(`${src}/${f}`, to);
  console.log('mediapipe-assets:', f);
}
