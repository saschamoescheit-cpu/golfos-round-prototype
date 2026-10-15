import { describe, expect, it } from 'vitest';
import { syncOnce, type LocalStore, type Remote, type Row } from './sync';

// Two devices and one server, all in memory: what Sascha does with iPhone, iPad and PC.

function device(init: Record<string, unknown> = {}): LocalStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(init).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k), keys: () => [...data.keys()] };
}
function server(): Remote & { rows: Map<string, Row> } {
  const rows = new Map<string, Row>();
  return {
    rows,
    list: async () => [...rows.values()].map(({ kind, id, updated_at, deleted }) => ({ kind, id, updated_at, deleted })),
    fetch: async (keys) => keys.map((x) => rows.get(`${x.kind}|${x.id}`)!).filter(Boolean),
    upsert: async (rs) => rs.forEach((r) => rows.set(`${r.kind}|${r.id}`, { ...r, data: r.deleted ? {} : r.data })),
  };
}
let t = 0;
const clock = () => new Date(Date.UTC(2026, 9, 16, 8, 0, t++)).toISOString();
const round = (id: string, strokes: (number | null)[], finished = false) => ({ id, courseName: 'Hetzenhof', createdAt: '2026-10-16T08:00:00Z', finishedAt: finished ? '2026-10-16T10:00:00Z' : null, entries: { me: strokes.map((s) => ({ strokes: s })) } });
const rounds = (d: LocalStore) => JSON.parse(d.get('golfos.rounds.v1') ?? '[]') as { id: string; entries: { me: { strokes: number | null }[] } }[];

describe('sync between devices', () => {
  it('a round and the profile from the phone appear on the iPad; the iPad keeps the bag from the server', async () => {
    const srv = server();
    const phone = device({ 'golfos.rounds.v1': [round('r1', [4, 5, 3], true)], 'golfos.profile.v1': { firstName: 'Sascha' }, 'golfos.bag.v1': [{ club: 'Dr', carry: 230 }], 'golfos.track.v1.r1': [[1, 2, 3, 4]] });
    expect((await syncOnce(phone, srv, clock)).pushed).toBe(4);
    // the iPad is new: its default bag must not overwrite the phone's
    const ipad = device({ 'golfos.bag.v1': [{ club: 'Dr', carry: 200 }] });
    await syncOnce(ipad, srv, clock);
    expect(rounds(ipad).map((r) => r.id)).toEqual(['r1']);
    expect(JSON.parse(ipad.get('golfos.profile.v1')!).firstName).toBe('Sascha');
    expect(JSON.parse(ipad.get('golfos.bag.v1')!)[0].carry).toBe(230);
    expect(ipad.get('golfos.track.v1.r1')).toBe('[[1,2,3,4]]');
  });
  it('a score entered on one device reaches the other; nothing changes when nothing changed', async () => {
    const srv = server();
    const a = device({ 'golfos.rounds.v1': [round('r1', [4, null, null])] });
    const b = device();
    await syncOnce(a, srv, clock);
    await syncOnce(b, srv, clock);
    a.set('golfos.rounds.v1', JSON.stringify([round('r1', [4, 5, null])]));
    expect((await syncOnce(a, srv, clock)).pushed).toBe(1);
    const res = await syncOnce(b, srv, clock);
    expect(res.pulled).toBe(1);
    expect(rounds(b)[0].entries.me[1].strokes).toBe(5);
    expect(await syncOnce(b, srv, clock)).toMatchObject({ pushed: 0, pulled: 0 });
  });
  it('a round deleted on one device goes to the bin on the other – never lost', async () => {
    const srv = server();
    const a = device({ 'golfos.rounds.v1': [round('r1', [4, 5, 3], true)] });
    const b = device();
    await syncOnce(a, srv, clock);
    await syncOnce(b, srv, clock);
    // deleted on b: into b's bin (as the app does)
    b.set('golfos.trash.v1', JSON.stringify([{ round: rounds(b)[0], keys: {}, deletedAt: clock() }]));
    b.set('golfos.rounds.v1', '[]');
    await syncOnce(b, srv, clock);
    await syncOnce(a, srv, clock);
    expect(rounds(a)).toEqual([]);
    expect(JSON.parse(a.get('golfos.trash.v1')!).map((x: { round: { id: string } }) => x.round.id)).toEqual(['r1']);
  });
  it('changed on both devices: the round with more entered wins', async () => {
    const srv = server();
    const a = device({ 'golfos.rounds.v1': [round('r1', [4, null, null])] });
    const b = device();
    await syncOnce(a, srv, clock);
    await syncOnce(b, srv, clock);
    a.set('golfos.rounds.v1', JSON.stringify([round('r1', [4, 5, null])]));
    b.set('golfos.rounds.v1', JSON.stringify([round('r1', [4, 5, 3])]));
    await syncOnce(a, srv, clock);
    await syncOnce(b, srv, clock); // b's fuller round goes up
    await syncOnce(a, srv, clock);
    expect(rounds(a)[0].entries.me.map((e) => e.strokes)).toEqual([4, 5, 3]);
    expect(rounds(b)[0].entries.me.map((e) => e.strokes)).toEqual([4, 5, 3]);
  });
  it('a setting edited on this device since the last sync is kept', async () => {
    const srv = server();
    const a = device({ 'golfos.unit.v1': '"m"' });
    const b = device();
    await syncOnce(a, srv, clock);
    await syncOnce(b, srv, clock);
    b.set('golfos.unit.v1', '"yd"');
    await syncOnce(b, srv, clock);
    await syncOnce(a, srv, clock);
    expect(a.get('golfos.unit.v1')).toBe('"yd"');
  });
});
