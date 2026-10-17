// The player's screenings on this device (synced like rounds and Training: src/lib/sync.ts). A screening in play can
// be paused and continued; a deleted one goes to the bin with "Undo" – nothing is ever deleted by itself.
import { syncSoon } from '../lib/sync';
import { isLeftHanded } from '../lib/profile';
import type { Measurement, Screening, Side, TestId } from './types';

const KEY = 'golfos.mobility.v1';
const TRASH = 'golfos.mobility.trash.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked – keeps working for this visit */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('golfos:mobility-changed'));
  syncSoon();
}

const newId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** newest first */
export const loadScreenings = (): Screening[] => read<Screening[]>(KEY, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const screeningById = (id: string): Screening | undefined => loadScreenings().find((s) => s.id === id);
export function saveScreening(s: Screening): void {
  write(KEY, [s, ...loadScreenings().filter((x) => x.id !== s.id)]);
}
/** a screening that was started and not finished (paused) */
export const openScreening = (): Screening | undefined => loadScreenings().find((s) => !s.finishedAt && s.kind !== 'single');

export function newScreening(kind: Screening['kind'], tests: TestId[]): Screening {
  return { id: newId(), kind, tests, createdAt: new Date().toISOString(), finishedAt: null, current: 0, hand: isLeftHanded() ? 'left' : 'right', results: {} };
}

/** a result into the screening (a side or the whole test) */
export function withResult(s: Screening, test: TestId, side: Side | null, m: Measurement): Screening {
  const r = { ...s.results[test] };
  if (side) r[side] = m;
  else r.both = m;
  return { ...s, results: { ...s.results, [test]: r }, skipped: s.skipped?.filter((x) => x !== test) };
}

export interface TrashedScreening {
  screening: Screening;
  deletedAt: string;
}
export const loadScreeningTrash = (): TrashedScreening[] => read<TrashedScreening[]>(TRASH, []);
/** Into the bin with "Undo" (one tap, as rounds and sessions). */
export function deleteScreening(id: string, label: string): void {
  const s = loadScreenings().find((x) => x.id === id);
  if (!s) return;
  write(TRASH, [{ screening: s, deletedAt: new Date().toISOString() }, ...loadScreeningTrash().filter((t) => t.screening.id !== id)]);
  write(KEY, loadScreenings().filter((x) => x.id !== id));
  window.dispatchEvent(new CustomEvent('golfos:deleted', { detail: { kind: 'mobility', id, label } }));
}
export function restoreScreening(id: string): boolean {
  const t = loadScreeningTrash().find((x) => x.screening.id === id);
  if (!t) return false;
  saveScreening(t.screening);
  write(TRASH, loadScreeningTrash().filter((x) => x.screening.id !== id));
  return true;
}

/** A screening without any result (a single test left before it was done) – nothing of the player's is lost. */
export function discardEmpty(id: string): void {
  const s = loadScreenings().find((x) => x.id === id);
  if (!s || Object.keys(s.results).length) return;
  write(KEY, loadScreenings().filter((x) => x.id !== id));
}
