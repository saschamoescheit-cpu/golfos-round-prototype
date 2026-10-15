// What the player keeps in Training, on this device (like rounds and games): favourite drills, logged results,
// practice sessions (running, paused, finished), own plans and the shopping cart. Nothing is deleted by itself
// (feedback 14.10.2026) – a session the player deletes goes to the bin and can be brought back.
// All keys are synced between the player's devices (src/lib/sync.ts, SETTINGS).
import { syncSoon } from '../lib/sync';

export interface LogEntry {
  id: string;
  drill: string;
  at: string; // ISO time
  value: number | null; // the result in the drill's scoring (null = done without a number)
  note?: string;
  session?: string;
}

export interface SessionItem {
  drill: string;
  minutes: number;
  done?: boolean;
  value?: number | null;
}

export interface Session {
  id: string;
  name: string;
  planId?: string;
  createdAt: string;
  finishedAt: string | null;
  current: number;
  items: SessionItem[];
  /** seconds spent per item, counted while the session screen is open and not paused */
  spent: number[];
  note?: string;
}

export interface OwnPlan {
  id: string;
  name: string;
  items: { drill: string; minutes: number }[];
  createdAt: string;
}

export interface CartLine {
  gear: string;
  qty: number;
  addedAt: string;
}

const K = {
  fav: 'golfos.training.fav.v1',
  log: 'golfos.training.log.v1',
  sessions: 'golfos.training.sessions.v1',
  trash: 'golfos.training.trash.v1',
  plans: 'golfos.training.plans.v1',
  cart: 'golfos.training.cart.v1',
  orders: 'golfos.training.orders.v1',
  seen: 'golfos.training.seen.v1',
};

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
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('golfos:training-changed'));
  if (key !== K.seen) syncSoon();
}

export const trainingId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- favourites ----------
export const loadFavs = (): string[] => read<string[]>(K.fav, []);
export function toggleFav(drill: string): void {
  const f = loadFavs();
  write(K.fav, f.includes(drill) ? f.filter((x) => x !== drill) : [drill, ...f]);
}

// ---------- results ----------
export const loadLog = (): LogEntry[] => read<LogEntry[]>(K.log, []);
export function addLog(e: Omit<LogEntry, 'id' | 'at'> & { at?: string }): LogEntry {
  const entry: LogEntry = { id: trainingId(), at: e.at ?? new Date().toISOString(), ...e } as LogEntry;
  write(K.log, [entry, ...loadLog()]);
  return entry;
}
/** Only on the player's tap (a wrong entry). */
export function removeLog(id: string): void {
  write(K.log, loadLog().filter((x) => x.id !== id));
}
export const logFor = (drill: string): LogEntry[] => loadLog().filter((x) => x.drill === drill);

// ---------- sessions ----------
export const loadSessions = (): Session[] => read<Session[]>(K.sessions, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export function saveSession(s: Session): void {
  write(K.sessions, [s, ...loadSessions().filter((x) => x.id !== s.id)]);
}
export interface TrashedSession {
  session: Session;
  deletedAt: string;
}
export const loadSessionTrash = (): TrashedSession[] => read<TrashedSession[]>(K.trash, []);
/** Into the bin, with "Undo" (as rounds and games). */
export function deleteSession(id: string): void {
  const s = loadSessions().find((x) => x.id === id);
  if (!s) return;
  write(K.trash, [{ session: s, deletedAt: new Date().toISOString() }, ...loadSessionTrash().filter((t) => t.session.id !== id)]);
  write(K.sessions, loadSessions().filter((x) => x.id !== id));
  window.dispatchEvent(new CustomEvent('golfos:deleted', { detail: { kind: 'training', id, label: s.name } }));
}
export function restoreSession(id: string): boolean {
  const t = loadSessionTrash().find((x) => x.session.id === id);
  if (!t) return false;
  saveSession(t.session);
  write(K.trash, loadSessionTrash().filter((x) => x.session.id !== id));
  return true;
}
export function purgeSession(id: string): void {
  write(K.trash, loadSessionTrash().filter((x) => x.session.id !== id));
}

// ---------- own plans ----------
export const loadOwnPlans = (): OwnPlan[] => read<OwnPlan[]>(K.plans, []);
export function saveOwnPlan(p: OwnPlan): void {
  write(K.plans, [p, ...loadOwnPlans().filter((x) => x.id !== p.id)]);
}
export function removeOwnPlan(id: string): void {
  write(K.plans, loadOwnPlans().filter((x) => x.id !== id));
}

// ---------- cart (Sascha 15.10.2026: up to "order", no real order in the prototype) ----------
export const loadCart = (): CartLine[] => read<CartLine[]>(K.cart, []);
export function setCartQty(gear: string, qty: number): void {
  const c = loadCart();
  const has = c.find((x) => x.gear === gear);
  const next = qty <= 0 ? c.filter((x) => x.gear !== gear) : has ? c.map((x) => (x.gear === gear ? { ...x, qty } : x)) : [...c, { gear, qty, addedAt: new Date().toISOString() }];
  write(K.cart, next);
}
export const cartCount = (): number => loadCart().reduce((t, x) => t + x.qty, 0);

export interface Order {
  id: string;
  at: string;
  lines: CartLine[];
  total: number;
}
/** The prototype keeps the "order" as a wish list – nothing is sent anywhere. */
export function placeOrder(total: number): Order {
  const o: Order = { id: trainingId(), at: new Date().toISOString(), lines: loadCart(), total };
  write(K.orders, [o, ...read<Order[]>(K.orders, [])]);
  write(K.cart, []);
  return o;
}
export const loadOrders = (): Order[] => read<Order[]>(K.orders, []);

// ---------- seen intro ----------
export const introSeen = (): boolean => read<boolean>(K.seen, false);
export const setIntroSeen = (): void => write(K.seen, true);
