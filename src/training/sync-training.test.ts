import { describe, expect, it } from 'vitest';
import { syncOnce, type LocalStore, type Remote, type Row } from '../lib/sync';

// Training data between two devices (night 17./18.10.2026): results, sessions, plans and favourites travel; a result
// removed on one device is gone on the other; results entered on both devices are all kept.

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
const clock = () => new Date(Date.UTC(2026, 9, 17, 20, 0, t++)).toISOString();
const LOG = 'golfos.training.log.v1';
const entry = (id: string, value: number) => ({ id, drill: 'tiger-gate', at: '2026-10-17T18:00:00Z', value });
const log = (d: LocalStore) => (JSON.parse(d.get(LOG) ?? '[]') as { id: string }[]).map((e) => e.id).sort();

describe('Training between devices', () => {
  it('a result from the phone appears on the iPad, a removed one is gone on both', async () => {
    const srv = server();
    const phone = device({ [LOG]: [entry('a', 12), entry('b', 14)] });
    const ipad = device();
    await syncOnce(phone, srv, clock);
    await syncOnce(ipad, srv, clock);
    expect(log(ipad)).toEqual(['a', 'b']);
    // removed on the iPad
    ipad.set(LOG, JSON.stringify([entry('b', 14)]));
    await syncOnce(ipad, srv, clock);
    await syncOnce(phone, srv, clock);
    expect(log(phone)).toEqual(['b']);
  });
  it('results entered on both devices are all kept', async () => {
    const srv = server();
    const phone = device({ [LOG]: [entry('p1', 10)] });
    const ipad = device({ [LOG]: [entry('i1', 11)] });
    await syncOnce(phone, srv, clock);
    await syncOnce(ipad, srv, clock);
    await syncOnce(phone, srv, clock);
    expect(log(phone)).toEqual(['i1', 'p1']);
    expect(log(ipad)).toEqual(['i1', 'p1']);
  });
  it('favourites, own plans and a paused session travel too', async () => {
    const srv = server();
    const phone = device({
      'golfos.training.fav.v1': ['tiger-gate'],
      'golfos.training.plans.v1': [{ id: 'pl1', name: 'Meine Einheit', items: [{ drill: 'clock', minutes: 10 }], createdAt: '2026-10-17T18:00:00Z' }],
      'golfos.training.sessions.v1': [{ id: 's1', name: 'Putten', createdAt: '2026-10-17T18:00:00Z', finishedAt: null, current: 1, items: [], spent: [] }],
    });
    const ipad = device();
    await syncOnce(phone, srv, clock);
    await syncOnce(ipad, srv, clock);
    expect(JSON.parse(ipad.get('golfos.training.fav.v1')!)).toEqual(['tiger-gate']);
    expect(JSON.parse(ipad.get('golfos.training.plans.v1')!)[0].name).toBe('Meine Einheit');
    expect(JSON.parse(ipad.get('golfos.training.sessions.v1')!)[0].current).toBe(1);
    // the session goes on to drill 3 on the iPad – the phone gets it
    ipad.set('golfos.training.sessions.v1', JSON.stringify([{ id: 's1', name: 'Putten', createdAt: '2026-10-17T18:00:00Z', finishedAt: null, current: 2, items: [], spent: [] }]));
    await syncOnce(ipad, srv, clock);
    await syncOnce(phone, srv, clock);
    expect(JSON.parse(phone.get('golfos.training.sessions.v1')!)[0].current).toBe(2);
  });
});
