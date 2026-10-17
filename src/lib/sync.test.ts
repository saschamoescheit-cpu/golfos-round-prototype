import { describe, expect, it } from 'vitest';
import { packets, syncOnce, type LocalStore, type Remote, type Row } from './sync';

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
  it('a change on a device whose clock is behind still reaches the other (Sascha 17.10.2026: handicap PC → iPhone)', async () => {
    const srv = server();
    const phone = device({ 'golfos.profile.v1': { firstName: 'Sascha', hcpIndex: '8.0' } });
    const pc = device();
    let sec = 0;
    const phoneClock = () => new Date(Date.UTC(2026, 9, 17, 14, 20, sec++)).toISOString();
    const pcClock = () => new Date(Date.UTC(2026, 9, 17, 14, 19, sec++)).toISOString(); // the PC a minute behind
    await syncOnce(phone, srv, phoneClock);
    await syncOnce(pc, srv, pcClock);
    phone.set('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', hcpIndex: '7.9' }));
    await syncOnce(phone, srv, phoneClock);
    await syncOnce(pc, srv, pcClock);
    expect(JSON.parse(pc.get('golfos.profile.v1')!).hcpIndex).toBe('7.9');
    pc.set('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', hcpIndex: '7.8' }));
    await syncOnce(pc, srv, pcClock);
    await syncOnce(phone, srv, phoneClock);
    expect(JSON.parse(phone.get('golfos.profile.v1')!).hcpIndex).toBe('7.8');
  });
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
  it('changed on both devices, the other wins: this device’s version is kept aside, never lost (night 18.10.2026)', async () => {
    const { conflictCopies } = await import('./sync');
    const srv = server();
    const a = device({ 'golfos.rounds.v1': [round('r1', [4, 5, null])] });
    const b = device();
    await syncOnce(a, srv, clock);
    await syncOnce(b, srv, clock);
    a.set('golfos.rounds.v1', JSON.stringify([round('r1', [4, 5, 3])]));
    b.set('golfos.rounds.v1', JSON.stringify([round('r1', [4, 6, null])]));
    await syncOnce(a, srv, clock);
    await syncOnce(b, srv, clock); // a's fuller round wins on b
    expect(rounds(b)[0].entries.me.map((e) => e.strokes)).toEqual([4, 5, 3]);
    const kept = conflictCopies(b);
    expect(kept).toHaveLength(1);
    expect((kept[0].data as { entries: { me: { strokes: number | null }[] } }).entries.me[1].strokes).toBe(6);
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
  it('training results logged on two devices before the first sync are all kept (Training, feature 022)', async () => {
    const srv = server();
    const log = (id: string, drill: string) => ({ id, drill, at: '2026-10-16T08:00:00Z', value: 12 });
    const phone = device({ 'golfos.training.log.v1': [log('l1', 'tiger-gate')], 'golfos.training.fav.v1': ['tiger-gate'] });
    const ipad = device({ 'golfos.training.log.v1': [log('l2', 'landing-ring')], 'golfos.training.fav.v1': ['clock'] });
    await syncOnce(phone, srv, clock);
    await syncOnce(ipad, srv, clock);
    await syncOnce(phone, srv, clock);
    const ids = (d: LocalStore) => (JSON.parse(d.get('golfos.training.log.v1')!) as { id: string }[]).map((x) => x.id).sort();
    expect(ids(phone)).toEqual(['l1', 'l2']);
    expect(ids(ipad)).toEqual(['l1', 'l2']);
    expect((JSON.parse(ipad.get('golfos.training.fav.v1')!) as string[]).sort()).toEqual(['clock', 'tiger-gate']);
  });
  it('friends added on two devices before the first sync are all kept', async () => {
    const srv = server();
    const a = device({ 'golfos.friends.v1': [{ id: 'f1', name: 'Ben', hcp: '12' }] });
    const b = device({ 'golfos.friends.v1': [{ id: 'f2', name: 'Chris', hcp: '3' }] });
    await syncOnce(a, srv, clock);
    await syncOnce(b, srv, clock);
    await syncOnce(a, srv, clock);
    const names = (d: LocalStore) => (JSON.parse(d.get('golfos.friends.v1')!) as { name: string }[]).map((f) => f.name).sort();
    expect(names(a)).toEqual(['Ben', 'Chris']);
    expect(names(b)).toEqual(['Ben', 'Chris']);
  });
});

describe('sync that never gets stuck (Sascha 16.10.2026: "the iPhone round is not on the PC")', () => {
  it('requests stay below the size limit: a few GPS tracks per packet, never 50 at once', () => {
    const sizes = [500_000, 400_000, 10, 10, 650_000, 10];
    const p = packets(sizes, (x) => x);
    expect(p.map((x) => x.length)).toEqual([1, 3, 2]);
    expect(p.every((x) => x.reduce((a, b) => a + b, 0) <= 700_000 || x.length === 1)).toBe(true);
    expect(packets(Array(120).fill(10), (x) => x).map((x) => x.length)).toEqual([50, 50, 20]);
  });
  it('one entry the server refuses does not block the others – it is sent again next time', async () => {
    const srv = server();
    let refuse = true;
    const picky: Remote = {
      ...srv,
      upsert: async (rs) => {
        const bad = rs.filter((r) => refuse && r.kind === 'track');
        await srv.upsert(rs.filter((r) => !bad.includes(r)));
        return bad.map((row) => ({ row, error: '413 Payload Too Large' }));
      },
    };
    const phone = device({ 'golfos.rounds.v1': [round('r1', [4, 5, 3], true)], 'golfos.track.v1.r1': [[1, 2, 3, 4]] });
    const first = await syncOnce(phone, picky, clock);
    expect(first.failed).toBe(1);
    expect(first.error).toMatch(/413/);
    expect(srv.rows.has('round|r1')).toBe(true); // the round is there anyway
    refuse = false;
    const second = await syncOnce(phone, picky, clock);
    expect(second.pushed).toBe(1); // the track again
    expect(second.failed).toBeUndefined();
    expect(second.server).toBe(2);
  });
});

describe('signed rounds (night 17.10.2026)', () => {
  const signed = (d: LocalStore) => (JSON.parse(d.get('golfos.rounds.v1') ?? '[]') as { signedAt?: string | null }[])[0]?.signedAt ?? null;
  it('signed on the iPhone: the round shows signed on the PC after the next sync', async () => {
    const srv = server();
    const phone = device({ 'golfos.rounds.v1': [round('r1', [4, 5, 3], true)] });
    const pc = device();
    await syncOnce(phone, srv, clock);
    await syncOnce(pc, srv, clock);
    phone.set('golfos.rounds.v1', JSON.stringify([{ ...round('r1', [4, 5, 3], true), signedAt: '2026-10-16T20:00:00Z' }]));
    await syncOnce(phone, srv, clock);
    await syncOnce(pc, srv, clock);
    expect(signed(pc)).toBe('2026-10-16T20:00:00Z');
  });
  it('signed on one device, a shot moved on the other: the signed round wins', async () => {
    const srv = server();
    const phone = device({ 'golfos.rounds.v1': [round('r1', [4, 5, 3], true)] });
    const pc = device();
    await syncOnce(phone, srv, clock);
    await syncOnce(pc, srv, clock);
    phone.set('golfos.rounds.v1', JSON.stringify([{ ...round('r1', [4, 5, 3], true), signedAt: '2026-10-16T20:00:00Z' }]));
    pc.set('golfos.rounds.v1', JSON.stringify([{ ...round('r1', [4, 5, 3], true), details: [{ shots: [{ pos: { lat: 50, lon: 8 } }] }] }]));
    await syncOnce(pc, srv, clock);
    await syncOnce(phone, srv, clock);
    await syncOnce(pc, srv, clock);
    expect(signed(phone)).toBe('2026-10-16T20:00:00Z');
    expect(signed(pc)).toBe('2026-10-16T20:00:00Z');
  });
});

describe('settings stored as plain text', () => {
  it('the language "de" (no JSON) no longer stops the sync – it reaches the other device as "de"', async () => {
    const srv = server();
    const phone = device({ 'golfos.rounds.v1': [round('r1', [4, 5, 3], true)] });
    phone.set('golfos.lang.v1', 'de'); // as the app writes it: plain text
    phone.set('golfos.course.v1.broken', '{not json'); // an odd value is skipped, not fatal
    const r = await syncOnce(phone, srv, clock);
    expect(r.pushed).toBe(2); // the round and the language
    const pc = device();
    await syncOnce(pc, srv, clock);
    expect(pc.get('golfos.lang.v1')).toBe('de');
    expect(rounds(pc).map((x) => x.id)).toEqual(['r1']);
    expect((await syncOnce(phone, srv, clock)).pushed).toBe(0); // nothing again and again
  });
});

describe('the main device synced last', () => {
  it('its bag replaced by the server\'s is kept aside – "keep this device\'s" brings it back to every device', async () => {
    const { replacedSettings, keepThisDevice } = await import('./sync');
    const srv = server();
    const pc = device({ 'golfos.bag.v1': [{ club: 'Dr', carry: 200 }] });
    await syncOnce(pc, srv, clock);
    const phone = device({ 'golfos.bag.v1': [{ club: 'Dr', carry: 235 }] });
    await syncOnce(phone, srv, clock);
    expect(JSON.parse(phone.get('golfos.bag.v1')!)[0].carry).toBe(200); // the server's, as the rule says …
    expect(replacedSettings(phone)).toEqual(['golfos.bag.v1']); // … but the phone's is not lost
    keepThisDevice(phone);
    expect(JSON.parse(phone.get('golfos.bag.v1')!)[0].carry).toBe(235);
    expect(replacedSettings(phone)).toEqual([]);
    await syncOnce(phone, srv, clock);
    await syncOnce(pc, srv, clock);
    expect(JSON.parse(pc.get('golfos.bag.v1')!)[0].carry).toBe(235);
  });
});
