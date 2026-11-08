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
export const isBig = (key: string): boolean => BIG_PREFIXES.some((p) => key.startsWith(p));

/** where the big data lies – IndexedDB in the app, a map in the tests */
export interface BigBackend {
  all(): Promise<[string, string][]>;
  put(entries: [string, string][]): Promise<void>;
  del(keys: string[]): Promise<void>;
}

const mem = new Map<string, string>();
let backend: BigBackend | null = null;
let on = false;
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

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => void flushBig(), 400);
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
  writing = writing
    .then(async () => {
      if (puts.length) await b.put(puts);
      if (dels.length) await b.del(dels);
    })
    .catch(() => {
      // not written (the database went away): kept in memory, tried again with the next change
      for (const [k, v] of puts) if (!dirty.has(k)) dirty.set(k, v);
      for (const k of dels) if (!dirty.has(k)) dirty.set(k, null);
    });
  return writing;
}

/** a GPS track found twice (in localStorage and in the big store): the one with more points – a session without the
 *  big store may have begun the track again */
function newer(key: string, fromLocal: string, fromBig: string): string {
  if (key.startsWith('golfos.track.v1.')) return fromLocal.length >= fromBig.length ? fromLocal : fromBig;
  return fromLocal;
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
    for (const [k, v] of moving) {
      mem.set(k, v);
      raw.removeItem.call(store, k);
    }
  }
  backend = b;
  on = true;
  const local = (s: Storage) => s === store;
  const bigKeys = () => [...mem.keys()];
  proto.getItem = function (this: Storage, k: string) {
    if (local(this) && isBig(k)) return mem.get(k) ?? null;
    return raw.getItem.call(this, k);
  };
  proto.setItem = function (this: Storage, k: string, v: string) {
    if (local(this) && isBig(k)) {
      const s = String(v);
      mem.set(k, s);
      dirty.set(k, s);
      schedule();
      return;
    }
    return raw.setItem.call(this, k, v);
  };
  proto.removeItem = function (this: Storage, k: string) {
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
  const db = () =>
    (opened ??= new Promise<IDBDatabase>((ok, fail) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => ok(r.result);
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
    put: async (entries) => {
      const d = await db();
      const t = d.transaction(STORE, 'readwrite');
      const s = t.objectStore(STORE);
      for (const [k, v] of entries) s.put(v, k);
      await done(t);
    },
    del: async (keys) => {
      const d = await db();
      const t = d.transaction(STORE, 'readwrite');
      const s = t.objectStore(STORE);
      for (const k of keys) s.delete(k);
      await done(t);
    },
  };
}

/** for the tests: back to the start */
export function resetBigStoreForTests(): void {
  mem.clear();
  dirty.clear();
  backend = null;
  on = false;
  if (timer) clearTimeout(timer);
  timer = null;
  writing = Promise.resolve();
}
