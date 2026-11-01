import { pictureType } from './tiletype';

// The offline aerial map in the iOS app (Sascha 01.11.2026: "everything" for the app – the map on a course without
// reception first). The website keeps the tiles in its service worker (vite.config.ts, runtime caches "imagery");
// the app's WKWebView has none. So here the app's fetch keeps them itself: the same services, the same rules – only
// pictures, first from the store, 60 days – in the phone's IndexedDB. The map and the course download (prefetchTiles)
// fetch as before and never know the difference.

const DB = 'golfos-tiles';
const STORE = 'tiles';
const MAX_AGE_MS = 60 * 24 * 3600 * 1000;
const MAX_TILES = 8000; // a dozen courses; the oldest go first
const patterns = (typeof __TILE_PATTERNS__ === 'undefined' ? [] : __TILE_PATTERNS__).map((p) => new RegExp(p));

interface Tile {
  url: string;
  type: string;
  data: ArrayBuffer;
  at: number;
}

/** A tile of an aerial service the offline map keeps. */
export const isTileUrl = (url: string): boolean => patterns.some((p) => p.test(url));

let opened: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  opened ??= new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'url' }).createIndex('at', 'at');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
  return opened;
}

function ask<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise((ok, fail) => {
        const tx = d.transaction(STORE, mode);
        const r = run(tx.objectStore(STORE));
        tx.oncomplete = () => ok(r ? r.result : undefined);
        tx.onerror = () => fail(tx.error);
        tx.onabort = () => fail(tx.error);
      }),
  );
}

export const readTile = (url: string): Promise<Tile | undefined> => ask<Tile>('readonly', (s) => s.get(url)).catch(() => undefined);
const keepTile = (t: Tile): Promise<unknown> => ask('readwrite', (s) => void s.put(t)).catch(() => undefined);
/** Out of the store (an error page that came as "200 OK", lib/prefetch forgetTile). */
export const dropTile = (url: string): Promise<unknown> => ask('readwrite', (s) => void s.delete(url)).catch(() => undefined);

/** The app's fetch: an aerial tile from the store when it is there (and not older than 60 days – offline even then),
 *  else from the net and kept when it is a picture. Everything else as before. */
export function withTileStore(net: typeof fetch): typeof fetch {
  return async (input, init) => {
    const req = input instanceof Request ? input : null;
    const url = req ? req.url : String(input);
    const method = (init?.method ?? req?.method ?? 'GET').toUpperCase();
    if (method !== 'GET' || !isTileUrl(url)) return net(input, init);
    const kept = await readTile(url);
    if (kept && (Date.now() - kept.at < MAX_AGE_MS || !navigator.onLine)) return answer(kept.data, kept.type);
    let res: Response;
    try {
      res = await net(input, init);
    } catch (e) {
      if (kept) return answer(kept.data, kept.type); // no reception: the old one is better than none
      throw e;
    }
    if (!res.ok) return res;
    const data = await res.arrayBuffer();
    const type = pictureType(res.headers.get('content-type'), data);
    if (type) void keepTile({ url, type, data, at: Date.now() });
    return new Response(data, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
}

const answer = (data: ArrayBuffer, type: string) => new Response(data, { status: 200, headers: { 'content-type': type } });

/** Tidies the store: tiles older than 60 days out, then the oldest beyond 8000. Once per start, a little later. */
export async function tidyTiles(now = Date.now()): Promise<void> {
  await ask('readwrite', (s) => {
    const old = s.index('at').openCursor(IDBKeyRange.upperBound(now - MAX_AGE_MS));
    old.onsuccess = () => {
      const c = old.result;
      if (!c) return;
      c.delete();
      c.continue();
    };
  }).catch(() => undefined);
  const count = (await ask<number>('readonly', (s) => s.count()).catch(() => 0)) ?? 0;
  if (count <= MAX_TILES) return;
  let over = count - MAX_TILES;
  await ask('readwrite', (s) => {
    const c = s.index('at').openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur || over-- <= 0) return;
      cur.delete();
      cur.continue();
    };
  }).catch(() => undefined);
}
