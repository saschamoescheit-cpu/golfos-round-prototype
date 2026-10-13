// How far the played tee moves the hole line against the line the terrain profiles were measured on.
// Usage: npx tsx scripts/teeshift.ts [courseId] [tee]
import { readFileSync } from 'node:fs';
import { holeMapData, lineLength } from '../src/lib/geo';
import { holeForTee } from '../src/lib/teeline';
import { heightAt } from '../src/lib/terrain';

const id = process.argv[2] ?? 'osm:relation/1326323';
const tee = process.argv[3] ?? 'Yellow';
const seed = JSON.parse(readFileSync('src/data/courses/hetzenhof.json', 'utf-8'));
const geo = seed.geometry ?? seed;
const refs = Object.keys(geo.fairwaySlopes ?? {});
for (const ref of refs) {
  const m = ref.match(/^(\d+)([A-Z]?)$/);
  if (!m) continue;
  const d = holeMapData(geo, m[2] || null, Number(m[1]));
  if (!d) continue;
  const t = holeForTee(d, id, ref, tee, geo.tee);
  if (!t) continue;
  const shift = lineLength(d.line) - lineLength(t.line);
  const s = geo.fairwaySlopes[ref];
  const hTeeWrong = heightAt(s, 0);
  const hTeeRight = heightAt(s, shift);
  console.log(ref, 'shift', Math.round(shift), 'm · tee height read', hTeeWrong?.toFixed(1), 'instead of', hTeeRight?.toFixed(1));
}
// after the fix: the played line knows where it starts on the mapped line
for (const ref of refs) {
  const m = ref.match(/^(\d+)([A-Z]?)$/);
  if (!m) continue;
  const d = holeMapData(geo, m[2] || null, Number(m[1]));
  const t = d && holeForTee(d, id, ref, tee, geo.tee);
  if (!d || !t) continue;
  const shift = lineLength(d.line) - lineLength(t.line);
  if (Math.abs(shift - (t.along0 ?? 0)) > 1) console.log('MISMATCH', ref, Math.round(shift), t.along0);
}
console.log('along0 check done');
