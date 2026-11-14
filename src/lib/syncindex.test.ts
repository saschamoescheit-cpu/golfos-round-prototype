import { describe, expect, it } from 'vitest';
import type { LocalStore } from './sync';
import { FULL_EVERY_MS, INDEX_KEY, OVERLAP_MS, listRows, type IndexRow, type Pager } from './syncindex';

// The incremental list (14.11.2026, for after 01.12.2026): the rows written since the last sync, the whole list once a day,
// the whole list each time while the server has no column server_at.
const mem = (): LocalStore & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k), keys: () => [...m.keys()] };
};
const T0 = Date.parse('2026-12-02T10:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function server(rows: IndexRow[]) {
  const calls: string[] = [];
  const pager: Pager = {
    full: async () => {
      calls.push('full');
      return rows.map((r) => ({ ...r }));
    },
    since: async (t) => {
      calls.push('since ' + t);
      return rows.filter((r) => r.server_at && Date.parse(r.server_at) > Date.parse(t)).map((r) => ({ ...r }));
    },
  };
  return { rows, calls, pager };
}

describe('listRows', () => {
  it('the whole list first, then only what was written since – with the overlap', async () => {
    const st = mem();
    const s = server([
      { kind: 'round', id: 'a', updated_at: 'u1', server_at: iso(T0 - 3600e3) },
      { kind: 'round', id: 'b', updated_at: 'u1', server_at: iso(T0 - 60e3) },
    ]);
    expect((await listRows(st, 'p1', s.pager, T0)).map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(s.calls).toEqual(['full']);
    // b edited on another device, c new
    s.rows[1] = { kind: 'round', id: 'b', updated_at: 'u2', server_at: iso(T0 + 30e3) };
    s.rows.push({ kind: 'game', id: 'c', updated_at: 'u1', server_at: iso(T0 + 40e3) });
    const got = await listRows(st, 'p1', s.pager, T0 + 120e3);
    expect(s.calls[1]).toBe('since ' + iso(T0 - 60e3 - OVERLAP_MS));
    expect(got.map((r) => `${r.kind}:${r.id}:${r.updated_at}`).sort()).toEqual(['game:c:u1', 'round:a:u1', 'round:b:u2']);
    expect(got.every((r) => !('server_at' in r))).toBe(true);
  });

  it('a row deleted elsewhere comes as deleted', async () => {
    const st = mem();
    const s = server([{ kind: 'round', id: 'a', updated_at: 'u1', server_at: iso(T0) }]);
    await listRows(st, 'p1', s.pager, T0);
    s.rows[0] = { kind: 'round', id: 'a', updated_at: 'u2', deleted: true, server_at: iso(T0 + 10e3) };
    expect(await listRows(st, 'p1', s.pager, T0 + 20e3)).toEqual([{ kind: 'round', id: 'a', updated_at: 'u2', deleted: true }]);
  });

  it('without the column (the SQL not run): the whole list every time, nothing kept', async () => {
    const st = mem();
    const s = server([{ kind: 'round', id: 'a', updated_at: 'u1' }]);
    await listRows(st, 'p1', s.pager, T0);
    await listRows(st, 'p1', s.pager, T0 + 1000);
    expect(s.calls).toEqual(['full', 'full']);
    expect(st.get(INDEX_KEY)).toBeNull();
  });

  it('the whole list once a day, and for another player', async () => {
    const st = mem();
    const s = server([{ kind: 'round', id: 'a', updated_at: 'u1', server_at: iso(T0) }]);
    await listRows(st, 'p1', s.pager, T0);
    await listRows(st, 'p2', s.pager, T0 + 1000);
    await listRows(st, 'p2', s.pager, T0 + 2000);
    await listRows(st, 'p2', s.pager, T0 + 1000 + FULL_EVERY_MS + 1);
    expect(s.calls.map((c) => c.split(' ')[0])).toEqual(['full', 'full', 'since', 'full']);
  });

  it('a hard-deleted row is gone after the daily whole list', async () => {
    const st = mem();
    const s = server([
      { kind: 'round', id: 'a', updated_at: 'u1', server_at: iso(T0) },
      { kind: 'round', id: 'b', updated_at: 'u1', server_at: iso(T0) },
    ]);
    await listRows(st, 'p1', s.pager, T0);
    s.rows.pop();
    expect((await listRows(st, 'p1', s.pager, T0 + FULL_EVERY_MS + 1)).map((r) => r.id)).toEqual(['a']);
  });

  it('a device too full to keep the list: the whole list next time, no error', async () => {
    const st = mem();
    st.set = () => {
      throw new Error('QuotaExceededError');
    };
    const s = server([{ kind: 'round', id: 'a', updated_at: 'u1', server_at: iso(T0) }]);
    expect(await listRows(st, 'p1', s.pager, T0)).toHaveLength(1);
    await listRows(st, 'p1', s.pager, T0 + 1000);
    expect(s.calls).toEqual(['full', 'full']);
  });

  it('a server error is thrown – the sync says so, as before', async () => {
    const st = mem();
    const s = server([{ kind: 'round', id: 'a', updated_at: 'u1', server_at: iso(T0) }]);
    await listRows(st, 'p1', s.pager, T0);
    s.pager.since = async () => {
      throw new Error('sync 402');
    };
    await expect(listRows(st, 'p1', s.pager, T0 + 1000)).rejects.toThrow('sync 402');
  });
});
