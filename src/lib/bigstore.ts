import { decodeTrack, encodeTrack, type Row } from './trackcodec';

// The big data off the small device storage (Sascha 08.11.2026: "storage full" on Eric's, Moritz' and Sascha's phones
// right after opening the app – "such messages should not come at all"). Safari and the app's web view keep about
// 5 MB in localStorage, but far more in IndexedDB. The GPS tracks, the course map copies, the course details and the
// heights live there now; a copy in memory answers the app's reads, so every module still reads and writes
// localStorage as before – for these keys getItem, setItem, removeItem, key, length and clear are served from here.
//
// Moved once, without losing anything: each key is written to IndexedDB first and removed from localStorage only once
// that write is done. Without IndexedDB (a private window, a blocked database) nothing changes – localStorage as before.

/** the keys kept in the big store – data that is large and grows (all else stays in localStorage) */
export const BIG_PREFIXES = ['golfos.track.v1.', 'golfos.geo.v1.', 'golfos.course.v1.', 'golfos.elevation.v1'];
export const isBig = (key: string): boolean => typeof key === 'string' && BIG_PREFIXES.some((p) => key.startsWith(p));

/** where the big data lies – IndexedDB in the app, a map in the tests */
export interface BigBackend {
  all(): Promise<[string, string][]>;
  put(entries: [string, string][]): Promise<void>;
  del(keys: string[]): Promise<void>;
}

const mem = new Map<string, string>();
let backend: BigBackend | null = null;
let on = false;
let cancelled = false;
/** the app started without the big store (it did not answer in time): it is not switched in later this session */
export function cancelBigStore(): void {
  cancelled = true;
}
const dirty = new Map<string, string | null>(); // waiting to be written (null: to be removed)
let timer: ReturnType<typeof setTimeout> | null = null;
let writing: Promise<void> = Promise.resolve();

/** the big store is in use (IndexedDB opened, the keys moved) */
export const bigStoreOn = (): boolean => on;

/** the size of the big store, characters – for the storage report */
export function bigStoreSize(): number {
  let n = 0;
  for (const [k, v] of mem) n += k.length + v.length;
  return n;
}

/** written at once – each write starts its own transaction right inside setItem, in the order of the writes (IndexedDB
 *  keeps it). Started at once, the browser finishes it also when the page goes right after (a reload, iOS ending the
 *  app) – queued behind an await it would not even begin (QA storagefull, 08.11.2026: the track gone after a reload). */
function schedule(): void {
  void flushBig();
}

/** writes what changed to the big store now (the app goes to the background, a test waits for it) */
export function flushBig(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!backend || dirty.size === 0) return writing;
  const b = backend;
  const puts: [string, string][] = [];
  const dels: string[] = [];
  for (const [k, v] of dirty) {
    if (v == null) dels.push(k);
    else puts.push([k, v]);
  }
  dirty.clear();
  const started: Promise<void>[] = [];
  try {
    if (puts.length) started.push(b.put(puts));
    if (dels.length) started.push(b.del(dels));
  } catch (e) {
    started.push(Promise.reject(e));
  }
  const done = Promise.all(started)
    .then(() => undefined)
    .catch(() => {
      // not written (the database went away): kept in memory, tried again with the next change
      for (const [k, v] of puts) if (!dirty.has(k)) dirty.set(k, v);
      for (const k of dels) if (!dirty.has(k)) dirty.set(k, null);
    });
  writing = Promise.all([writing, done]).then(() => undefined);
  return writing;
}

/** a key found twice (in localStorage and in the big store – a session without the big store wrote it again): a GPS
 *  track is both put together, fix by fix (that session may have begun it again); anything else is the one written last
 *  – localStorage's */
function newer(key: string, fromLocal: string, fromBig: string): string {
  if (!key.startsWith('golfos.track.v1.')) return fromLocal;
  try {
    const byTime = new Map<number, Row>();
    for (const r of [...decodeTrack(fromBig), ...decodeTrack(fromLocal)]) byTime.set(r[0], r);
    return encodeTrack([...byTime.values()].sort((a, b) => a[0] - b[0]));
  } catch {
    return fromLocal.length >= fromBig.length ? fromLocal : fromBig;
  }
}

interface Raw {
  getItem: (this: Storage, k: string) => string | null;
  setItem: (this: Storage, k: string, v: string) => void;
  removeItem: (this: Storage, k: string) => void;
  key: (this: Storage, i: number) => string | null;
  clear: (this: Storage) => void;
  length: () => number;
}

/**
 * Opens the big store and moves the big keys into it; then serves them. Call once before the app reads anything.
 * Resolves false (and changes nothing) when the backend cannot be used.
 */
export async function openBigStore(b: BigBackend | null = indexedBackend(), store: Storage | null = localStore()): Promise<boolean> {
  if (on || !b || !store) return on;
  let loaded: [string, string][];
  try {
    loaded = await b.all();
  } catch {
    return false;
  }
  if (cancelled) return false;
  const proto = Object.getPrototypeOf(store) as Storage;
  const lengthDesc = Object.getOwnPropertyDescriptor(proto, 'length');
  const raw: Raw = {
    getItem: proto.getItem,
    setItem: proto.setItem,
    removeItem: proto.removeItem,
    key: proto.key,
    clear: proto.clear,
    length: () => (lengthDesc?.get ? (lengthDesc.get.call(store) as number) : store.length),
  };
  for (const [k, v] of loaded) mem.set(k, v);
  // the big keys still in localStorage: into the big store, then out of localStorage
  const moving: [string, string][] = [];
  for (let i = 0; i < raw.length(); i++) {
    const k = raw.key.call(store, i);
    if (!k || !isBig(k)) continue;
    const v = raw.getItem.call(store, k);
    if (v == null) continue;
    const kept = mem.get(k);
    moving.push([k, kept != null ? newer(k, v, kept) : v]);
  }
  if (moving.length) {
    try {
      await b.put(moving);
    } catch {
      mem.clear();
      return false; // nothing moved, localStorage as before
    }
    if (cancelled) {
      mem.clear();
      return false; // copied but still in localStorage – the next start takes the right one (newer)
    }
    for (const [k, v] of moving) {
      mem.set(k, v);
      raw.removeItem.call(store, k);
    }
  }
  backend = b;
  on = true;
  const local = (s: Storage) => s === store;
  const bigKeys = () => [...mem.keys()];
  // keys as the browser takes them: any value as text (getItem(null) reads "null")
  proto.getItem = function (this: Storage, key: string) {
    const k = String(key);
    if (local(this) && isBig(k)) return mem.get(k) ?? null;
    return raw.getItem.call(this, k);
  };
  proto.setItem = function (this: Storage, key: string, v: string) {
    const k = String(key);
    if (local(this) && isBig(k)) {
      const s = String(v);
      mem.set(k, s);
      dirty.set(k, s);
      schedule();
      return;
    }
    return raw.setItem.call(this, k, v);
  };
  proto.removeItem = function (this: Storage, key: string) {
    const k = String(key);
    if (local(this) && isBig(k)) {
      if (mem.delete(k)) {
        dirty.set(k, null);
        schedule();
      }
      return;
    }
    return raw.removeItem.call(this, k);
  };
  proto.key = function (this: Storage, i: number) {
    if (!local(this)) return raw.key.call(this, i);
    const n = raw.length();
    return i < n ? raw.key.call(this, i) : (bigKeys()[i - n] ?? null);
  };
  proto.clear = function (this: Storage) {
    if (local(this)) {
      for (const k of mem.keys()) dirty.set(k, null);
      mem.clear();
      schedule();
    }
    return raw.clear.call(this);
  };
  if (lengthDesc?.get) {
    const get = lengthDesc.get;
    Object.defineProperty(proto, 'length', {
      configurable: true,
      get(this: Storage) {
        const n = get.call(this) as number;
        return local(this) ? n + mem.size : n;
      },
    });
  }
  // the app to the background or closed: what is still waiting is written
  try {
    addEventListener('pagehide', () => void flushBig());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flushBig();
    });
  } catch {
    // no window (tests)
  }
  return true;
}

function localStore(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const DB = 'golfos-big';
const STORE = 'kv';

/** IndexedDB as the big store – null where there is none */
export function indexedBackend(): BigBackend | null {
  if (typeof indexedDB === 'undefined') return null;
  let opened: Promise<IDBDatabase> | null = null;
  let ready: IDBDatabase | null = null;
  const db = () =>
    (opened ??= new Promise<IDBDatabase>((ok, fail) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => {
        ready = r.result;
        ok(r.result);
      };
      r.onerror = () => fail(r.error);
      r.onblocked = () => fail(new Error('blocked'));
    }));
  const done = (t: IDBTransaction) =>
    new Promise<void>((ok, fail) => {
      t.oncomplete = () => ok();
      t.onerror = () => fail(t.error);
      t.onabort = () => fail(t.error ?? new Error('aborted'));
    });
  return {
    all: async () => {
      const d = await db();
      return new Promise<[string, string][]>((ok, fail) => {
        const out: [string, string][] = [];
        const t = d.transaction(STORE, 'readonly');
        const c = t.objectStore(STORE).openCursor();
        c.onsuccess = () => {
          const cur = c.result;
          if (!cur) return;
          if (typeof cur.value === 'string') out.push([String(cur.key), cur.value]);
          cur.continue();
        };
        t.oncomplete = () => ok(out);
        t.onerror = () => fail(t.error);
      });
    },
    // the transaction begun right away once the database is open (no await before it – see schedule)
    put: (entries) => write((s) => entries.forEach(([k, v]) => s.put(v, k))),
    del: (keys) => write((s) => keys.forEach((k) => s.delete(k))),
  };
  function write(fill: (s: IDBObjectStore) => void): Promise<void> {
    const run = (d: IDBDatabase) => {
      const t = d.transaction(STORE, 'readwrite');
      fill(t.objectStore(STORE));
      return done(t);
    };
    return ready ? run(ready) : db().then(run);
  }
}

/** for the tests: back to the start */
export function resetBigStoreForTests(): void {
  cancelled = false;
  mem.clear();
  dirty.clear();
  backend = null;
  on = false;
  if (timer) clearTimeout(timer);
  timer = null;
  writing = Promise.resolve();
}
