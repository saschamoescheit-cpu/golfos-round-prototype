// The list of the server's rows without asking for all of them each time (14.11.2026: the Supabase project restricted
// for its traffic – "Kein Upgrade, App sparsamer"; prepared for after 01.12.2026). Each sync used to read kind, id and
// time of every row of the player – thousands, every two minutes, on every device. With the column server_at (set by
// the server on every write, supabase/golfos-sync-incremental.sql) a device keeps the list it last read and asks only
// for the rows written since – a few minutes' overlap, so a write committed a moment late is never missed – and reads
// the whole list once a day anyway. Without the column (the SQL not run yet) everything stays as before: the whole list.
import type { LocalStore, Row } from './sync';

export interface IndexRow extends Row {
  server_at?: string | null;
}
export interface Pager {
  /** Every row of the player (kind, id, updated_at, deleted – server_at when the server has the column). */
  full(): Promise<IndexRow[]>;
  /** The rows written on the server after this time (server_at > t). */
  since(t: string): Promise<IndexRow[]>;
}

export const INDEX_KEY = 'golfos.sync.index.v1';
/** A write takes its server_at when it starts, it is seen when it commits: rows from this long before are read again. */
export const OVERLAP_MS = 5 * 60 * 1000;
/** The whole list once a day – whatever the incremental reading might have missed (a row deleted for good) is put right. */
export const FULL_EVERY_MS = 24 * 60 * 60 * 1000;

interface Cache {
  user: string;
  full: number; // when the whole list was read (ms)
  since: string; // the latest server_at seen
  rows: Record<string, [kind: string, id: string, updatedAt: string, deleted: 0 | 1]>;
}

const keyOf = (r: { kind: string; id: string }) => `${r.kind}\u0000${r.id}`;
const later = (a: string, b: string) => (Date.parse(b) > Date.parse(a) ? b : a);

function read(store: LocalStore, user: string): Cache | null {
  try {
    const c = JSON.parse(store.get(INDEX_KEY) ?? 'null') as Cache | null;
    return c && c.user === user && typeof c.since === 'string' && c.rows && typeof c.rows === 'object' ? c : null;
  } catch {
    return null;
  }
}
function write(store: LocalStore, c: Cache | null): void {
  try {
    if (c) store.set(INDEX_KEY, JSON.stringify(c));
    else store.remove(INDEX_KEY);
  } catch {
    // the device full: no list kept – the next sync reads the whole list, as before
    try {
      store.remove(INDEX_KEY);
    } catch {
      /* nothing kept */
    }
  }
}
const rowsOf = (c: Cache): Row[] => Object.values(c.rows).map(([kind, id, updated_at, deleted]) => ({ kind, id, updated_at, deleted: !!deleted }));

/**
 * The player's rows on the server (kind, id, updated_at, deleted) – read incrementally where the server allows it.
 * `user`: whose list (a device signed in as another player starts anew).
 */
export async function listRows(store: LocalStore, user: string, pager: Pager, now = Date.now()): Promise<Row[]> {
  const c = read(store, user);
  if (!c || now - c.full > FULL_EVERY_MS || now < c.full) {
    const all = await pager.full();
    // the column there for every row: keep the list for next time – else (the SQL not run) the whole list each time
    if (all.length && all.every((r) => typeof r.server_at === 'string')) {
      const rows: Cache['rows'] = {};
      let since = all[0].server_at!;
      for (const r of all) {
        rows[keyOf(r)] = [r.kind, r.id, r.updated_at, r.deleted ? 1 : 0];
        since = later(since, r.server_at!);
      }
      write(store, { user, full: now, since, rows });
    } else write(store, null);
    return all.map(({ server_at: _s, ...r }) => r);
  }
  const changed = await pager.since(new Date(Date.parse(c.since) - OVERLAP_MS).toISOString());
  // a row with no server_at here: the column is gone or the answer odd – the whole list next time
  if (changed.some((r) => typeof r.server_at !== 'string')) {
    write(store, null);
    return listRows(store, user, pager, now);
  }
  let since = c.since;
  for (const r of changed) {
    c.rows[keyOf(r)] = [r.kind, r.id, r.updated_at, r.deleted ? 1 : 0];
    since = later(since, r.server_at!);
  }
  write(store, { ...c, since });
  return rowsOf(c);
}
