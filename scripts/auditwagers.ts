// Every bet of a pool judged anew from the tournament cards on the server (Sascha 14.11.2026: "Alle Auswertungen müssen
// richtig sein – immer!" – Moritz's two birdies, corrected at once, stayed in the standing; Chris's par run). For the
// days after the Supabase project is released again (01.12.2026), before anything is settled: reads the pool and the
// tournament series by their spectator links (public, read only – the same as the live page shows), builds each
// player's rounds from the signed cards as the app does (eventCard → playedRounds → judge) and lists every bet whose
// standing in the pool differs from what the cards say.
//
// Usage:  npx tsx scripts/auditwagers.ts --pool <live code> --series <live code> [--series <live code> …]
//         npx tsx scripts/auditwagers.ts --file dump.json        (a saved answer: { pool: …, series: [ … ] })
//         add --save dump.json to keep what was read
// Only the tournament rounds are on the server: a bet that also counts a player's private rounds is marked "own
// rounds?" – there his phone knows more than the cards.
import { readFileSync, writeFileSync } from 'node:fs';
import { SUPABASE_KEY, SUPABASE_URL } from '../src/lib/sync';
import { isSigned, markerOf, type Cell, type RoundEvent } from '../src/lib/sharedround';
import { fromCards, judge, playedRounds, type PlayedRound, type PoolPlayer, type Progress, type Wager, type WagerPool } from '../src/lib/wagers';
import { tourRoundOf } from '../src/lib/wagerstore';
import type { Round } from '../src/types';

const args = process.argv.slice(2);
const all = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const one = (flag: string) => all(flag)[0];

async function live(code: string): Promise<{ kind: string; pool?: WagerPool; events?: RoundEvent[]; event?: RoundEvent }> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/golfos_live`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ live_code: code }),
  });
  if (!r.ok) throw new Error(`golfos_live ${code}: ${r.status} ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  if (!j) throw new Error(`golfos_live ${code}: no such live link (or turned off)`);
  return j;
}

/** One player's rounds from the tournament cards – the app's own way (tourRoundOf, as the host's phone counts a flight
 *  for the bets): counted when entered by the host or signed by player and marker (countedRound), the marker's count
 *  for bets "with marker" (markerCount). */
export function roundsFromEvents(events: { code: string; ev: RoundEvent }[], player: Pick<PoolPlayer, 'name' | 'joined' | 'invited'>, today?: string): PlayedRound[] {
  const out: PlayedRound[] = [];
  for (const { code, ev } of events) {
    if (!ev.date) continue;
    const r = tourRoundOf(ev, code, ev.date, player, today);
    if (!r) continue;
    const f = (_: Round, pid: string) => Object.values(ev.flights).find((x) => x.players.some((p) => p.id === pid));
    const counted = (round: Round, pid: string) => {
      const fl = f(round, pid);
      return !!fl && (!!fl.entered?.[pid] || (!!markerOf(fl, pid) && isSigned(fl, pid)));
    };
    const marks = (round: Round, pid: string): Cell[] | null => {
      const fl = f(round, pid);
      return !fl ? null : fl.scorer && fl.scorer !== pid ? (fl.scores?.[pid] ?? null) : (fl.marks?.[pid] ?? null);
    };
    out.push(...playedRounds([r], counted, marks));
  }
  return out;
}

export interface AuditRow {
  player: string;
  wager: string;
  stored: Progress | undefined;
  cards: Progress;
  differs: boolean;
}

const brief = (p: Progress | undefined) =>
  p ? `${p.done ? 'geschafft' : 'offen'} · bestes ${p.best ?? '–'} · ${p.rounds} Rd. · [${(p.perRound ?? []).map((r) => `${r.day.slice(5)} ${r.course.slice(0, 10)}: ${r.unknown ? '?' : (r.value ?? '–')}${r.counted ? '' : '*'}`).join(', ')}]` : '(noch nichts)';

/** Each judged bet of the pool: as the pool has it and as the cards say. */
export function audit(pool: WagerPool, events: { code: string; ev: RoundEvent }[], now = new Date().toISOString()): AuditRow[] {
  const rows: AuditRow[] = [];
  for (const w of pool.wagers as Wager[]) {
    if (w.kind === 'free' || fromCards(w)) continue;
    const player = pool.players.find((x) => x.id === w.player);
    if (!player) continue;
    const cards = judge(w, pool, roundsFromEvents(events, player, now.slice(0, 10)), now);
    const stored = pool.progress?.[w.id];
    const differs =
      !stored ||
      !!stored.done !== !!cards.done ||
      stored.best !== cards.best ||
      JSON.stringify((stored.perRound ?? []).map((r) => [r.day, r.course, r.value, !!r.unknown])) !== JSON.stringify((cards.perRound ?? []).map((r) => [r.day, r.course, r.value, !!r.unknown]));
    rows.push({ player: player.name, wager: w.id, stored, cards, differs: differs && !stored?.manual });
  }
  return rows;
}

async function main() {
  let pool: WagerPool;
  let events: { code: string; ev: RoundEvent }[] = [];
  const withCode = (evs: RoundEvent[]) => evs.map((ev) => ({ code: (ev as RoundEvent & { code?: string }).code ?? ev.id, ev }));
  const file = one('--file');
  if (file) {
    const d = JSON.parse(readFileSync(file, 'utf8'));
    pool = d.pool;
    events = withCode(d.series.flatMap((s: { events?: RoundEvent[]; event?: RoundEvent }) => s.events ?? (s.event ? [s.event] : [])));
  } else {
    const p = one('--pool');
    if (!p) throw new Error('--pool <live code> (or --file) missing');
    const pl = await live(p);
    if (pl.kind !== 'pool' || !pl.pool) throw new Error(`${p} is no pool (${pl.kind})`);
    pool = pl.pool;
    const series = [];
    for (const s of all('--series')) series.push(await live(s));
    events = withCode(series.flatMap((s) => s.events ?? (s.event ? [s.event] : [])));
    const save = one('--save');
    if (save) writeFileSync(save, JSON.stringify({ pool, series }, null, 1));
  }
  const rows = audit(pool, events);
  const bad = rows.filter((r) => r.differs);
  console.log(`${pool.name ?? 'Pool'}: ${rows.length} Wetten geprüft, ${events.length} Turnierrunden, ${bad.length} mit Abweichung\n`);
  for (const r of rows) {
    const w = (pool.wagers as Wager[]).find((x) => x.id === r.wager)!;
    console.log(`${r.differs ? '✗' : '✓'} ${r.player} – ${w.kind}${w.target != null ? ' ' + w.target : ''}${r.stored?.manual ? ' (von Hand entschieden)' : ''}`);
    if (r.differs) {
      console.log(`    im Pool:  ${brief(r.stored)}`);
      console.log(`    Karten:   ${brief(r.cards)}`);
    }
  }
  console.log('\n* = Karte nicht unterschrieben. Zählt eine Wette auch private Runden, kennt das Handy des Spielers mehr als die Karten.');
}

if (process.argv[1] && /auditwagers/.test(process.argv[1])) main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
