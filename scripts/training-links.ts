// Checks every outside link of the Training module: YouTube videos (oEmbed: still online and embeddable),
// product pictures and manufacturer pages, source links. Prints the broken ones.
// Usage: npx vite-node scripts/training-links.ts [videos|gear|sources|all]
import { CATEGORIES, DRILLS } from '../src/training/content';
import { GEAR } from '../src/training/content/gear';
import { DRILL_VIDEOS } from '../src/training/content/drill-videos';

const what = process.argv[2] ?? 'all';
const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };

async function status(url: string, method: 'HEAD' | 'GET' = 'HEAD'): Promise<number> {
  try {
    const r = await fetch(url, { method, headers: UA, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (method === 'HEAD' && (r.status === 405 || r.status === 403 || r.status === 404)) return status(url, 'GET');
    return r.status;
  } catch {
    return method === 'HEAD' ? status(url, 'GET') : 0;
  }
}
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    while (q.length) await fn(q.shift()!);
  }));
}

const bad: string[] = [];
if (what === 'videos' || what === 'all') {
  const ids = new Map<string, string>();
  for (const c of CATEGORIES) for (const v of c.videos ?? []) ids.set(v.id, `${c.id}: ${v.title}`);
  for (const d of DRILLS) for (const v of d.videos ?? []) ids.set(v.id, `${d.id}: ${v.title}`);
  for (const [d, list] of Object.entries(DRILL_VIDEOS)) for (const id of list) if (!ids.has(id)) bad.push(`video ${id} (${d}): not in the topic videos`);
  await pool([...ids], 8, async ([id, where]) => {
    const s = await status(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, 'GET');
    if (s !== 200) bad.push(`video ${id} → ${s} (${where})`);
  });
  console.log(`videos checked: ${ids.size}`);
}
if (what === 'gear' || what === 'all') {
  const urls: [string, string][] = [];
  for (const g of GEAR) {
    if (g.url) urls.push([g.url, `${g.id} page`]);
    if (g.image) urls.push([g.image, `${g.id} picture`]);
  }
  await pool(urls, 6, async ([u, where]) => {
    const s = await status(u);
    if (s < 200 || s >= 400) bad.push(`${where} → ${s} ${u}`);
  });
  console.log(`gear links checked: ${urls.length}`);
}
if (what === 'sources' || what === 'all') {
  const urls = new Map<string, string>();
  for (const c of CATEGORIES) for (const s of c.sources ?? []) urls.set(s.url, c.id);
  for (const d of DRILLS) for (const s of d.sources ?? []) urls.set(s.url, d.id);
  await pool([...urls], 6, async ([u, where]) => {
    const s = await status(u);
    if (s < 200 || s >= 400) bad.push(`source ${where} → ${s} ${u}`);
  });
  console.log(`sources checked: ${urls.size}`);
}
console.log(bad.length ? `\n${bad.length} problems:\n${bad.sort().join('\n')}` : '\nall links fine');
