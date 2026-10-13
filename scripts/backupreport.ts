// Report on a real round from a backup file (Sascha's Hetzenhof round, Friday 16.10.2026):
// the shot detection run again on the recorded GPS track, compared with the shots the player set in "Check shots",
// the stops and app-opens per hole, and the caddie advice with the player's verdict.
// Usage: npx tsx scripts/backupreport.ts <golfos-backup.json> [round index, 0 = newest]
import { readFileSync } from 'node:fs';

const [file, which = '0'] = process.argv.slice(2);
const backup = JSON.parse(readFileSync(file, 'utf-8'));
const store = new Map<string, string>(Object.entries(backup.data as Record<string, string>));
// the app's own loaders read localStorage: serve them the backup
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
};

const { loadRounds, loadGeometry } = await import('../src/lib/storage');
const { holeMapData, distanceM } = await import('../src/lib/geo');
const { holeForTee } = await import('../src/lib/teeline');
const { loadTrack, splitRound, detectHoleShots, findStops } = await import('../src/lib/track');
const { loadCaddieLog } = await import('../src/lib/caddielog');
const { playerBag } = await import('../src/lib/stats');

const rounds = loadRounds();
const round = rounds[Number(which)];
if (!round) throw new Error(`no round ${which} (backup has ${rounds.length})`);
const me = round.players.find((p) => p.isMe)!;
const { SEED_GEOMETRY } = await import('../src/data/seedGeometry');
// the bundled course map (outside Vite the app's seed lookup is empty), else what the device had cached
const geo = SEED_GEOMETRY[round.courseId] ?? loadGeometry(round.courseId);
const maps = round.holes.map((h) => holeForTee(holeMapData(geo, h.loop, h.number), round.courseId, h.label, round.tee, geo.tee));
const track = loadTrack(round.id);
const parts = splitRound(track, maps);
const bag = playerBag(rounds.filter((r) => r.finishedAt && r.id !== round.id));
const cad = loadCaddieLog(round.id);
const t0 = track[0]?.t ?? 0;
const mins = (t: number) => `${Math.round((t - t0) / 60000)}′`;

console.log(`# ${round.courseName} · ${round.createdAt.slice(0, 10)} · tee ${round.tee ?? '-'} · ${round.holes.length} holes`);
console.log(`track: ${track.length} fixes, ${track.filter((x) => x.open).length} app-opens, median accuracy ${median(track.map((x) => x.acc)).toFixed(0)} m`);
let exact = 0;
let compared = 0;
let found = 0;
let truthN = 0;
round.holes.forEach((h, i) => {
  const m = maps[i];
  const e = round.entries[me.id][i];
  const part = parts[i] ?? [];
  console.log(`\n## ${h.label} · par ${h.par} · score ${e.strokes ?? '-'} · putts ${e.putts ?? '-'} · pen ${e.penalties ?? 0} · ${part.length} fixes ${part.length ? `(${mins(part[0].t)}–${mins(part[part.length - 1].t)})` : ''}`);
  if (!m) return console.log('   no map');
  const toG = (p: [number, number]) => Math.round(distanceM(p, m.greenCenter));
  const count = e.strokes != null && e.putts != null && !e.pickedUp ? e.strokes - e.putts - (e.penalties ?? 0) : null;
  const det = detectHoleShots(part, m, h.par, bag, { shots: count != null && count >= 1 ? count : null });
  const got = (det?.shots ?? []).map((s) => s.pos!).filter(Boolean);
  console.log(`   stops: ${findStops(part).map((s) => `${toG(s.p)} m/${Math.round((s.to - s.from) / 1000)}s`).join(' · ') || '-'}`);
  console.log(`   app opened at: ${part.filter((x) => x.open).map((x) => `${toG(x.p)} m (±${x.acc})`).join(' · ') || '-'}`);
  console.log(`   detected now: ${got.map(toG).join(' → ') || '-'}${det?.onGreen ? ` → green ${toG(det.onGreen)} m` : ''}`);
  const saved = e.detail?.shots ?? [];
  const checked = saved.length > 0 && saved.every((s) => !s.review);
  console.log(`   player's shots${checked ? ' (checked)' : ' (not checked)'}: ${saved.map((s) => (s.pos ? `${toG(s.pos)} m ${s.club ?? ''}${s.penalty ? ' +1' : ''}` : '?')).join(' → ') || '-'}`);
  if (checked) {
    const truth = saved.map((s) => s.pos!).filter(Boolean);
    compared++;
    truthN += truth.length;
    const used = new Set<number>();
    let f = 0;
    for (const t of truth) {
      const k = got.findIndex((g, n) => !used.has(n) && distanceM(g, t) <= 12);
      if (k >= 0) {
        used.add(k);
        f++;
      }
    }
    found += f;
    const ok = f === truth.length && got.length === truth.length;
    if (ok) exact++;
    const off = truth.map((t) => Math.round(Math.min(...got.map((g) => distanceM(g, t)), 999)));
    console.log(`   → ${ok ? 'exact' : 'differs'}: ${f}/${truth.length} found, nearest detected per real shot: ${off.join(', ')} m`);
  }
  for (const c of cad[i] ?? []) {
    console.log(`   caddie ${c.toPin} m: ${c.club} (plays ${c.playsLike}) ${c.aim ?? ''} ${c.plan ? '| ' + c.plan : ''}${c.warning ? ' | ⚠ ' + c.warning : ''}`);
    if (c.verdict) console.log(`     verdict: ${c.verdict === 'ok' ? '👍 fits' : '✋ other'}${c.note ? ' – ' + c.note : ''}`);
  }
});
if (compared) console.log(`\nchecked holes: ${compared} · exact ${exact} (${Math.round((100 * exact) / compared)} %) · shots found ${found}/${truthN}`);

function median(a: number[]): number {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}
