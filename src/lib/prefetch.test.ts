import { describe, expect, it, vi } from 'vitest';
import { holeTileUrls } from './prefetch';
import { holeMapData } from './geo';
import { IMAGERY } from './imagery';
import { SEED_GEOMETRY } from '../data/seedGeometry';

describe('offline tiles for a round', () => {
  const geo = SEED_GEOMETRY['osm:relation/1654444'];
  const holes = Array.from({ length: 18 }, (_, k) => holeMapData(geo, 'Main', k + 1)!);
  it('covers all 18 Son Quint holes with a reasonable number of tiles', () => {
    const urls = holeTileUrls(IMAGERY.pnoa, holes);
    expect(urls.length).toBeGreaterThan(100); // Son Quint: ~210 tiles ≈ 3 MB
    expect(urls.length).toBeLessThan(2500); // fits the service worker cache (5000 tiles)
    expect(new Set(urls).size).toBe(urls.length);
  });
  it('flips y for TMS sources (PNOA) and keeps it for XYZ (Esri)', () => {
    const one = [holes[0]];
    const pnoa = holeTileUrls(IMAGERY.pnoa, one).find((u) => u.includes('/18/'))!;
    const esri = holeTileUrls(IMAGERY.esri, one).find((u) => u.includes('/tile/18/'))!;
    const [, x, tmsY] = pnoa.match(/\/18\/(\d+)\/(\d+)\.jpeg$/)!.map(Number);
    const [, y, ex] = esri.match(/\/tile\/18\/(\d+)\/(\d+)$/)!.map(Number);
    expect(x).toBeGreaterThan(0);
    expect(ex).toBeGreaterThan(0);
    expect(2 ** 18 - 1 - tmsY).toBeGreaterThan(y - 20);
    expect(2 ** 18 - 1 - tmsY).toBeLessThan(y + 20);
  });
});

describe('saving tiles when the service is down or hangs (night check 22.10.2026)', () => {
  it('a service that answers none of the first dozen is not asked for the rest', async () => {
    const { prefetchTiles } = await import('./prefetch');
    let asked = 0;
    vi.stubGlobal('fetch', async () => {
      asked++;
      throw new Error('down');
    });
    const urls = Array.from({ length: 200 }, (_, k) => `https://tiles.example/${k}`);
    let last = 0;
    const failed = await prefetchTiles(urls, (d) => (last = d), new AbortController().signal);
    expect(failed).toBe(200);
    expect(asked).toBeLessThan(20);
    expect(last).toBe(200);
    vi.unstubAllGlobals();
  });
  it('a tile that never answers gives up after 15 s', async () => {
    vi.useFakeTimers();
    const { prefetchTiles } = await import('./prefetch');
    vi.stubGlobal('fetch', (_u: string, o: { signal: AbortSignal }) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted')))));
    const run = prefetchTiles(['https://tiles.example/a'], () => {}, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(15001);
    expect(await run).toBe(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe('a service that answers with an error page (LGL 23.–25.10.2026)', () => {
  it('counts it as failed, drops it from the offline store and tells only the pictures', async () => {
    const { prefetchTiles } = await import('./prefetch');
    const dropped: string[] = [];
    vi.stubGlobal('caches', { open: async () => ({ delete: async (u: string) => (dropped.push(u), true) }) });
    vi.stubGlobal('fetch', async (u: string) =>
      u.endsWith('xml')
        ? new Response('<ServiceExceptionReport/>', { status: 200, headers: { 'content-type': 'text/xml;charset=UTF-8' } })
        : new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );
    const got: string[] = [];
    const failed = await prefetchTiles(['https://t.example/1.jpg', 'https://t.example/2.xml', 'https://t.example/3.jpg'], () => {}, new AbortController().signal, (u) => got.push(u));
    await new Promise((r) => setTimeout(r, 0));
    expect(failed).toBe(1);
    expect(got.sort()).toEqual(['https://t.example/1.jpg', 'https://t.example/3.jpg']);
    expect(dropped).toContain('https://t.example/2.xml');
    vi.unstubAllGlobals();
  });
});
